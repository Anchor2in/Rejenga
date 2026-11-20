import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { classifyImage, type Classification } from "./classifier";
import { authUser, db, id, notify, now, transaction, type AuthUser, type Role } from "./db";
import { sendVerificationEmail } from "./email";
import {
  EMAIL_CODE_MAX_ATTEMPTS, EMAIL_CODE_RESEND_DELAY_MS, EMAIL_CODE_TTL_MS,
  createEmailVerificationCode, hashEmailVerificationCode, matchesEmailVerificationCode,
} from "./emailVerification";
import { isPartEligibleForMatching, rankCandidates, type Candidate } from "./matching";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const sessionSecret = process.env.SESSION_SECRET ?? "";
if (sessionSecret.length < 32) {
  throw new Error("Set SESSION_SECRET to a random value of at least 32 characters before starting ReJenga.");
}

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function signSession(userId: string, expires: number): string {
  const payload = `${userId}.${expires}`;
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [userId, expiresText, signature, extra] = value.split(".");
  if (!userId || !expiresText || !signature || extra) return undefined;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Date.now()) return undefined;
  const expected = createHmac("sha256", sessionSecret).update(`${userId}.${expires}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return undefined;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  return userId;
}

async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = readSession(req.cookies.rejenga_session as string | undefined);
  req.user = userId ? await authUser(userId) : undefined;
  next();
}

app.use(authenticate);

function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new ApiError(401, "Sign in to continue."));
  next();
}

function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new ApiError(401, "Sign in to continue."));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, "You do not have permission to do that."));
    next();
  };
}

function user(req: Request): AuthUser {
  if (!req.user) throw new ApiError(401, "Sign in to continue.");
  return req.user;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, result.error.issues.map((issue) => issue.message).join(" "));
  return result.data;
}

function requireOne<T>(row: T | undefined, message: string): T {
  if (!row) throw new ApiError(404, message);
  return row;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) throw new ApiError(400, "Invalid route parameter.");
  return value;
}

const sessionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const emailCodeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  password: z.string().min(10).max(200),
  role: z.enum(["donor", "recipient"]),
  area: z.string().trim().min(2).max(120),
});
const emailCodeSchema = z.object({
  email: z.email().max(254),
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit code from your email."),
});

async function issueEmailVerificationCode(userId: string, email: string): Promise<void> {
  const sentAt = Date.now();
  const { code, hash } = await transaction(async () => {
    const previous = await db.prepare("SELECT sent_at FROM email_verification_codes WHERE user_id = ?")
      .get(userId) as { sent_at: number } | undefined;
    if (previous && sentAt - previous.sent_at < EMAIL_CODE_RESEND_DELAY_MS) {
      throw new ApiError(429, "Please wait a minute before requesting another verification code.");
    }

    const code = createEmailVerificationCode();
    const hash = hashEmailVerificationCode(userId, code, sessionSecret);
    await db.prepare(`INSERT INTO email_verification_codes (user_id, code_hash, attempts, sent_at, expires_at)
      VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0,
        sent_at = excluded.sent_at, expires_at = excluded.expires_at`)
      .run(userId, hash, sentAt, sentAt + EMAIL_CODE_TTL_MS);
    return { code, hash };
  });

  try {
    await sendVerificationEmail(email, code);
  } catch (error) {
    await db.prepare("DELETE FROM email_verification_codes WHERE user_id = ? AND code_hash = ?").run(userId, hash);
    console.error("Could not deliver a ReJenga verification email:", error);
    throw new ApiError(503, "Email delivery is temporarily unavailable. Please try again later.");
  }
}

app.get("/api/session", (req, res) => res.json({ user: req.user ?? null }));

app.post("/api/auth/register", authRateLimit, async (req, res, next) => {
  try {
    const data = parse(registrationSchema, req.body);
    const userId = id();
    const email = data.email.trim().toLowerCase();
    await db.prepare(`INSERT INTO users (id, name, email, password_hash, role, status, area, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .run(userId, data.name, email, bcrypt.hashSync(data.password, 12), data.role, data.area, now());
    await issueEmailVerificationCode(userId, email);
    res.status(201).json({ status: "verification_required", email, message: "Enter the verification code sent to your email." });
  } catch (error) {
    next(isUniqueViolation(error)
      ? new ApiError(409, "An account with that email already exists.")
      : error);
  }
});

app.post("/api/auth/verification/resend", emailCodeRateLimit, async (req, res, next) => {
  try {
    const { email } = parse(z.object({ email: z.email().max(254) }), req.body);
    const pending = await db.prepare("SELECT id, email FROM users WHERE email = ? AND status = 'pending'")
      .get(email.trim()) as { id: string; email: string } | undefined;
    if (pending) await issueEmailVerificationCode(pending.id, pending.email);
    res.json({ message: "If this email has an account awaiting verification, a new code has been sent." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/verify-email", emailCodeRateLimit, async (req, res, next) => {
  try {
    const data = parse(emailCodeSchema, req.body);
    const email = data.email.trim().toLowerCase();
    const outcome = await transaction(async () => {
      const record = await db.prepare("SELECT id, status FROM users WHERE email = ?")
        .get(email) as { id: string; status: string } | undefined;
      if (!record || record.status !== "pending") return { error: "invalid" as const };

      const verification = await db.prepare("SELECT code_hash, attempts, expires_at FROM email_verification_codes WHERE user_id = ?")
        .get(record.id) as { code_hash: string; attempts: number; expires_at: number } | undefined;
      if (!verification) return { error: "invalid" as const };
      if (verification.expires_at <= Date.now() || verification.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        await db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(record.id);
        return { error: "expired" as const };
      }

      if (!matchesEmailVerificationCode(record.id, data.code, verification.code_hash, sessionSecret)) {
        const attempts = verification.attempts + 1;
        if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
          await db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(record.id);
          return { error: "locked" as const };
        }
        await db.prepare("UPDATE email_verification_codes SET attempts = ? WHERE user_id = ?").run(attempts, record.id);
        return { error: "invalid" as const };
      }

      const updated = await db.prepare("UPDATE users SET status = 'approved' WHERE id = ? AND status = 'pending'").run(record.id);
      if (Number(updated.changes) !== 1) return { error: "invalid" as const };
      await db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(record.id);
      return { userId: record.id } as const;
    });

    if ("error" in outcome) {
      const message = outcome.error === "locked"
        ? "Too many incorrect codes. Request a new one."
        : outcome.error === "expired" ? "That code has expired. Request a new one." : "That code is invalid or expired.";
      throw new ApiError(400, message);
    }

    res.cookie("rejenga_session", signSession(outcome.userId, Date.now() + sessionCookie.maxAge), sessionCookie);
    res.json({ user: await authUser(outcome.userId) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", authRateLimit, async (req, res, next) => {
  try {
    const data = parse(z.object({ email: z.email().max(254), password: z.string().min(1).max(200) }), req.body);
    const record = await db.prepare("SELECT id, password_hash, status FROM users WHERE email = ?")
      .get(data.email.trim().toLowerCase()) as { id: string; password_hash: string; status: string } | undefined;
    if (!record || !bcrypt.compareSync(data.password, record.password_hash)) throw new ApiError(401, "Email or password is incorrect.");
    if (record.status !== "approved") {
      throw new ApiError(403, record.status === "pending" ? "Verify your email address with the code we sent before signing in." : "This account is not approved.");
    }
    res.cookie("rejenga_session", signSession(record.id, Date.now() + sessionCookie.maxAge), sessionCookie);
    res.json({ user: await authUser(record.id) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("rejenga_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
  res.status(204).end();
});

app.get("/api/catalog", requireUser, async (_req, res) => {
  const models = await db.prepare("SELECT id, brand, model_name AS modelName FROM device_models WHERE active = 1 ORDER BY brand, model_name").all();
  const parts = await db.prepare("SELECT id, part_name AS partName FROM part_types WHERE active = 1 ORDER BY part_name").all();
  res.json({ models, parts });
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new ApiError(400, "Upload a JPEG, PNG, or WebP image."));
      return;
    }
    callback(null, true);
  },
});

function validImage(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return mimeType === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

app.post("/api/listings", requireRole("donor"), imageUpload.single("image"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const data = parse(z.object({
      modelId: z.string().min(1),
      description: z.string().trim().min(3).max(1000),
      area: z.string().trim().min(2).max(120),
      parts: z.string().transform((text, context) => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          context.addIssue({ code: "custom", message: "Select at least one part." });
          return [];
        }
      }).pipe(z.array(z.object({ partTypeId: z.string().min(1), condition: z.string().trim().min(2).max(500) })).min(1).max(8)),
    }), req.body);
    const model = await db.prepare("SELECT id FROM device_models WHERE id = ? AND active = 1").get(data.modelId);
    if (!model) throw new ApiError(400, "Choose a supported device model.");
    const uniqueParts = new Set(data.parts.map((part) => part.partTypeId));
    if (uniqueParts.size !== data.parts.length) throw new ApiError(400, "Each part can only be listed once.");
    for (const part of data.parts) {
      if (!await db.prepare("SELECT id FROM part_types WHERE id = ? AND active = 1").get(part.partTypeId)) {
        throw new ApiError(400, "Choose an active catalogue part.");
      }
    }
    if (req.file && !validImage(req.file.buffer, req.file.mimetype)) throw new ApiError(400, "The uploaded file is not a valid image.");

    const listingId = id();
    let imageId: string | null = null;
    if (req.file) {
      imageId = id();
    }
    await transaction(async () => {
      if (req.file && imageId) {
        await db.prepare("INSERT INTO images (id, owner_id, mime_type, filename, image_data, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(imageId, currentUser.id, req.file.mimetype, req.file.originalname.slice(0, 200), req.file.buffer, now());
      }
      await db.prepare(`INSERT INTO device_listings (id, donor_id, model_id, image_id, description, area, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(listingId, currentUser.id, data.modelId, imageId, data.description, data.area, now());
      for (const part of data.parts) {
        await db.prepare(`INSERT INTO listing_parts
          (id, listing_id, part_type_id, donor_condition, created_at) VALUES (?, ?, ?, ?, ?)`)
          .run(id(), listingId, part.partTypeId, part.condition, now());
      }
    });

    for (const part of data.parts) {
      const partType = await db.prepare("SELECT part_name FROM part_types WHERE id = ?").get(part.partTypeId) as { part_name: string };
      if (/battery/i.test(partType.part_name)) continue;
      const recipients = await db.prepare(`SELECT DISTINCT r.recipient_id FROM repair_requests r
        JOIN compatibility_rules cr ON cr.recipient_model_id = r.model_id AND cr.part_type_id = r.part_type_id
        JOIN device_listings dl ON dl.id = ? AND cr.donor_model_id = dl.model_id
        WHERE r.status = 'open' AND cr.active = 1 AND r.part_type_id = ?`)
        .all(listingId, part.partTypeId) as { recipient_id: string }[];
      for (const recipient of recipients) {
        await notify(recipient.recipient_id, "A compatible part may be available", "A new donor listing may match your open request. Review its catalogue explanation and inspection status.");
      }
    }

    let classification: Classification | null = null;
    if (req.file && imageId) {
      try {
        const supportedModels = (await db.prepare("SELECT brand || ' ' || model_name AS name FROM device_models WHERE active = 1")
          .all()).map((row) => String(row.name));
        classification = await classifyImage(req.file.buffer, req.file.mimetype, supportedModels);
      } catch (error) {
        console.error("Local image classification failed:", error);
        classification = { status: "failed", predictionType: null, predictedClass: null, confidence: null };
      }
      await db.prepare(`INSERT INTO classifications (id, image_id, status, prediction_type, predicted_class, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id(), imageId, classification.status, classification.predictionType, classification.predictedClass, classification.confidence, now());
    }
    res.status(201).json({ id: listingId, classification });
  } catch (error) {
    next(error);
  }
});

app.get("/api/listings/mine", requireRole("donor", "admin"), async (req, res) => {
  const currentUser = user(req);
  const rows = currentUser.role === "admin"
    ? await db.prepare(`SELECT dl.id, dl.image_id AS imageId, dl.description, dl.area, dl.status, dl.created_at AS createdAt, dm.brand, dm.model_name AS modelName,
        u.name AS donorName, lp.id AS partId, pt.part_name AS partName, lp.donor_condition AS donorCondition,
        lp.safety_status AS safetyStatus, lp.availability, cl.status AS classificationStatus,
        cl.prediction_type AS predictionType, cl.predicted_class AS predictedClass, cl.confidence
      FROM device_listings dl JOIN users u ON u.id = dl.donor_id JOIN device_models dm ON dm.id = dl.model_id
      JOIN listing_parts lp ON lp.listing_id = dl.id JOIN part_types pt ON pt.id = lp.part_type_id
      LEFT JOIN classifications cl ON cl.image_id = dl.image_id
      ORDER BY dl.created_at DESC`).all()
    : await db.prepare(`SELECT dl.id, dl.image_id AS imageId, dl.description, dl.area, dl.status, dl.created_at AS createdAt, dm.brand, dm.model_name AS modelName,
        lp.id AS partId, pt.part_name AS partName, lp.donor_condition AS donorCondition,
        lp.safety_status AS safetyStatus, lp.availability, cl.status AS classificationStatus,
        cl.prediction_type AS predictionType, cl.predicted_class AS predictedClass, cl.confidence
      FROM device_listings dl JOIN device_models dm ON dm.id = dl.model_id
      JOIN listing_parts lp ON lp.listing_id = dl.id JOIN part_types pt ON pt.id = lp.part_type_id
      LEFT JOIN classifications cl ON cl.image_id = dl.image_id
      WHERE dl.donor_id = ? ORDER BY dl.created_at DESC`).all(currentUser.id);
  res.json({ listings: rows });
});

app.patch("/api/listings/:id/status", requireRole("donor", "admin"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const { status } = parse(z.object({ status: z.enum(["active", "removed"]) }), req.body);
    const listingId = routeParam(req, "id");
    const listing = requireOne(await db.prepare("SELECT donor_id, status FROM device_listings WHERE id = ?").get(listingId) as { donor_id: string; status: string } | undefined, "Listing not found.");
    if (currentUser.role !== "admin" && listing.donor_id !== currentUser.id) throw new ApiError(403, "You can only manage your own listings.");
    if (currentUser.role !== "admin" && status === "active" && listing.status !== "active") {
      throw new ApiError(403, "Only an administrator can restore a removed or moderated listing.");
    }
    if (status === "removed" && await db.prepare("SELECT 1 FROM listing_parts WHERE listing_id = ? AND availability = 'reserved'").get(listingId)) {
      throw new ApiError(409, "A reserved part cannot be removed until its match is resolved.");
    }
    await db.prepare("UPDATE device_listings SET status = ? WHERE id = ?").run(status, listingId);
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

app.post("/api/requests", requireRole("recipient"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const data = parse(z.object({
      modelId: z.string().min(1),
      partTypeId: z.string().min(1),
      description: z.string().trim().min(3).max(1000),
      area: z.string().trim().min(2).max(120),
    }), req.body);
    if (!await db.prepare("SELECT id FROM device_models WHERE id = ? AND active = 1").get(data.modelId)
      || !await db.prepare("SELECT id FROM part_types WHERE id = ? AND active = 1").get(data.partTypeId)) {
      throw new ApiError(400, "Choose an active supported device and part.");
    }
    const requestId = id();
    await db.prepare(`INSERT INTO repair_requests (id, recipient_id, model_id, part_type_id, description, area, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(requestId, currentUser.id, data.modelId, data.partTypeId, data.description, data.area, now());
    const donors = (await Promise.all((await candidatesFor({ id: requestId, model_id: data.modelId, part_type_id: data.partTypeId }))
      .map((candidate) => db.prepare(`SELECT dl.donor_id FROM listing_parts lp
        JOIN device_listings dl ON dl.id = lp.listing_id WHERE lp.id = ?`).get(candidate.id) as Promise<{ donor_id: string } | undefined>)))
      .filter((row): row is { donor_id: string } => Boolean(row));
    for (const donorId of new Set(donors.map((row) => row.donor_id))) {
      await notify(donorId, "A request may match your part", "A new open request is compatible with one of your available listings. A reservation still requires a technician check.");
    }
    res.status(201).json({ id: requestId });
  } catch (error) {
    next(error);
  }
});

app.get("/api/requests/mine", requireRole("recipient", "admin"), async (req, res) => {
  const currentUser = user(req);
  const rows = currentUser.role === "admin"
    ? await db.prepare(`SELECT r.id, r.description, r.area, r.status, r.created_at AS createdAt, dm.brand, dm.model_name AS modelName,
        pt.part_name AS partName, u.name AS recipientName
      FROM repair_requests r JOIN device_models dm ON dm.id = r.model_id JOIN part_types pt ON pt.id = r.part_type_id
      JOIN users u ON u.id = r.recipient_id ORDER BY r.created_at DESC`).all()
    : await db.prepare(`SELECT r.id, r.description, r.area, r.status, r.created_at AS createdAt, dm.brand, dm.model_name AS modelName,
        pt.part_name AS partName
      FROM repair_requests r JOIN device_models dm ON dm.id = r.model_id JOIN part_types pt ON pt.id = r.part_type_id
      WHERE r.recipient_id = ? ORDER BY r.created_at DESC`).all(currentUser.id);
  res.json({ requests: rows });
});

app.patch("/api/requests/:id/status", requireRole("recipient", "admin"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    parse(z.object({ status: z.literal("cancelled") }), req.body);
    const requestId = routeParam(req, "id");
    const request = requireOne(await db.prepare("SELECT id, recipient_id, status FROM repair_requests WHERE id = ?")
      .get(requestId) as { id: string; recipient_id: string; status: string } | undefined, "Request not found.");
    if (currentUser.role !== "admin" && request.recipient_id !== currentUser.id) {
      throw new ApiError(403, "You can only manage your own requests.");
    }
    if (request.status !== "open") throw new ApiError(409, "Only an open request can be cancelled.");
    const donors = await db.prepare(`SELECT DISTINCT dl.donor_id FROM matches m
      JOIN listing_parts lp ON lp.id = m.listing_part_id JOIN device_listings dl ON dl.id = lp.listing_id
      WHERE m.request_id = ? AND m.status IN ('reserved', 'accepted')`).all(requestId) as { donor_id: string }[];
    await transaction(async () => {
      const updated = await db.prepare("UPDATE repair_requests SET status = 'cancelled' WHERE id = ? AND status = 'open'").run(requestId);
      if (Number(updated.changes) !== 1) throw new ApiError(409, "This request is no longer open.");
      const activeMatches = await db.prepare("SELECT id, listing_part_id FROM matches WHERE request_id = ? AND status IN ('reserved', 'accepted')")
        .all(requestId) as { id: string; listing_part_id: string }[];
      for (const match of activeMatches) {
        await db.prepare("UPDATE matches SET status = 'expired', outcome = 'request_cancelled', updated_at = ? WHERE id = ?")
          .run(now(), match.id);
        await db.prepare("UPDATE listing_parts SET availability = 'available' WHERE id = ? AND safety_status NOT IN ('unsafe', 'rejected')")
          .run(match.listing_part_id);
      }
    });
    for (const donorId of new Set(donors.map((row) => row.donor_id))) {
      await notify(donorId, "Request cancelled", "The requester cancelled this request. A part is available again only if it remains eligible and safe.");
    }
    res.json({ status: "cancelled" });
  } catch (error) {
    next(error);
  }
});

async function requestForUser(requestId: string, currentUser: AuthUser): Promise<{ id: string; recipient_id: string; model_id: string; part_type_id: string; area: string; status: string }> {
  const request = requireOne(await db.prepare("SELECT id, recipient_id, model_id, part_type_id, area, status FROM repair_requests WHERE id = ?")
    .get(requestId) as { id: string; recipient_id: string; model_id: string; part_type_id: string; area: string; status: string } | undefined, "Request not found.");
  if (currentUser.role !== "admin" && request.recipient_id !== currentUser.id) throw new ApiError(403, "You can only view matches for your own request.");
  return request;
}

async function candidatesFor(request: { id: string; model_id: string; part_type_id: string }): Promise<Candidate[]> {
  const rows = await db.prepare(`SELECT lp.id, pt.part_name, dm.brand, dm.model_name, lp.donor_condition, dl.area,
      lp.safety_status,
      CASE WHEN EXISTS (
        SELECT 1 FROM matches accepted_match
        JOIN inspections accepted_inspection ON accepted_inspection.match_id = accepted_match.id
        WHERE accepted_match.listing_part_id = lp.id AND accepted_inspection.decision = 'accepted'
      ) THEN 'checked' ELSE 'not_inspected' END AS inspection_status,
      donor.name AS donor_name, dl.area AS donor_area, cr.source AS rule_source
      , cl.status AS classification_status, cl.prediction_type, cl.predicted_class, cl.confidence
    FROM listing_parts lp
    JOIN device_listings dl ON dl.id = lp.listing_id
    JOIN users donor ON donor.id = dl.donor_id AND donor.status = 'approved'
    JOIN device_models dm ON dm.id = dl.model_id AND dm.active = 1
    JOIN part_types pt ON pt.id = lp.part_type_id AND pt.active = 1
    JOIN compatibility_rules cr ON cr.donor_model_id = dl.model_id
      AND cr.recipient_model_id = ? AND cr.part_type_id = lp.part_type_id
      AND cr.part_type_id = ? AND cr.active = 1
    LEFT JOIN classifications cl ON cl.image_id = dl.image_id
    WHERE dl.status = 'active' AND lp.availability = 'available'
      AND lp.safety_status NOT IN ('rejected', 'unsafe')
      AND NOT EXISTS (SELECT 1 FROM matches prior_match
        WHERE prior_match.listing_part_id = lp.id AND prior_match.request_id = ?)
    ORDER BY lp.id`)
    .all(request.model_id, request.part_type_id, request.id);
  const candidates: Candidate[] = rows.map((row) => {
    const inspectionStatus: Candidate["inspection_status"] = row.inspection_status === "checked" ? "checked" : "not_inspected";
    const safetyStatus: Candidate["safety_status"] = row.safety_status === "cleared"
      || row.safety_status === "rejected" || row.safety_status === "unsafe" ? row.safety_status : "unverified";
    return {
      id: String(row.id),
      part_name: String(row.part_name),
      brand: String(row.brand),
      model_name: String(row.model_name),
      donor_condition: String(row.donor_condition),
      area: String(row.area),
      inspection_status: inspectionStatus,
      donor_name: String(row.donor_name),
      donor_area: String(row.donor_area),
      rule_source: String(row.rule_source),
      safety_status: safetyStatus,
      classification_status: row.classification_status === "classified" ? "classified"
        : row.classification_status === "unconfigured" ? "unconfigured" : row.classification_status === "failed" ? "failed" : null,
      prediction_type: row.prediction_type === "device_model" || row.prediction_type === "visible_damage" ? row.prediction_type : null,
      predicted_class: typeof row.predicted_class === "string" ? row.predicted_class : null,
      confidence: typeof row.confidence === "number" ? row.confidence : null,
    };
  });
  return candidates.filter((candidate) => isPartEligibleForMatching(candidate.part_name, candidate.safety_status));
}

app.get("/api/requests/:id/matches", requireRole("recipient", "admin"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const request = await requestForUser(routeParam(req, "id"), currentUser);
    if (request.status !== "open") {
      res.json({ candidates: [] });
      return;
    }
    res.json({ candidates: rankCandidates(await candidatesFor(request), request.area) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/matches/reserve", requireRole("recipient"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const data = parse(z.object({ requestId: z.string().min(1), listingPartId: z.string().min(1) }), req.body);
    const request = await requestForUser(data.requestId, currentUser);
    if (request.status !== "open") throw new ApiError(409, "This request is no longer open.");
    const candidate = (await candidatesFor(request)).find((item) => item.id === data.listingPartId);
    if (!candidate) throw new ApiError(409, "This part is no longer available or does not match the catalogue rule.");
    const rule = await db.prepare(`SELECT id FROM compatibility_rules WHERE donor_model_id = (
        SELECT dl.model_id FROM listing_parts lp JOIN device_listings dl ON dl.id = lp.listing_id WHERE lp.id = ?
      ) AND recipient_model_id = ? AND part_type_id = ? AND active = 1`)
      .get(data.listingPartId, request.model_id, request.part_type_id) as { id: string } | undefined;
    if (!rule) throw new ApiError(409, "The compatibility rule is no longer active.");
    const matchId = id();
    await transaction(async () => {
      const currentRequest = await db.prepare("SELECT status FROM repair_requests WHERE id = ?").get(data.requestId) as { status: string } | undefined;
      if (currentRequest?.status !== "open") throw new ApiError(409, "This request is no longer open.");
      if (await db.prepare("SELECT 1 FROM matches WHERE request_id = ? AND status IN ('reserved', 'accepted')").get(data.requestId)) {
        throw new ApiError(409, "This request already has a part reserved or accepted. Resolve that reservation first.");
      }
      const update = await db.prepare("UPDATE listing_parts SET availability = 'reserved' WHERE id = ? AND availability = 'available' AND safety_status NOT IN ('rejected', 'unsafe')")
        .run(data.listingPartId);
      if (Number(update.changes) !== 1) throw new ApiError(409, "This part was just reserved by someone else.");
      await db.prepare(`INSERT INTO matches (id, listing_part_id, request_id, rule_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'reserved', ?, ?)`).run(matchId, data.listingPartId, data.requestId, rule.id, now(), now());
    });
    const donor = await db.prepare(`SELECT dl.donor_id FROM listing_parts lp JOIN device_listings dl ON dl.id = lp.listing_id WHERE lp.id = ?`)
      .get(data.listingPartId) as { donor_id: string };
    await notify(donor.donor_id, "A part was reserved", "A requester selected your listed part. A technician must inspect it before handover.");
    await notify(currentUser.id, "Part reserved", "A technician must physically inspect the reserved part before any handover.");
    for (const technician of await db.prepare("SELECT id FROM users WHERE role = 'technician' AND status = 'approved'").all() as { id: string }[]) {
      await notify(technician.id, "Inspection requested", "A reserved part is waiting for a technician's physical check.");
    }
    res.status(201).json({ id: matchId, status: "reserved" });
  } catch (error) {
    next(error);
  }
});

async function accessibleMatch(matchId: string, currentUser: AuthUser) {
  const match = requireOne(await db.prepare(`SELECT m.id, m.status, m.request_id, m.listing_part_id, r.recipient_id,
      dl.donor_id, pt.part_name, dm.brand, dm.model_name, r.area AS request_area, dl.area AS donor_area
    FROM matches m
    JOIN repair_requests r ON r.id = m.request_id
    JOIN listing_parts lp ON lp.id = m.listing_part_id
    JOIN device_listings dl ON dl.id = lp.listing_id
    JOIN part_types pt ON pt.id = lp.part_type_id
    JOIN device_models dm ON dm.id = dl.model_id
    WHERE m.id = ?`).get(matchId) as {
      id: string; status: string; request_id: string; listing_part_id: string; recipient_id: string; donor_id: string;
      part_name: string; brand: string; model_name: string; request_area: string; donor_area: string;
    } | undefined, "Match not found.");
  const allowed = currentUser.role === "admin" || currentUser.role === "technician"
    || currentUser.id === match.recipient_id || currentUser.id === match.donor_id;
  if (!allowed) throw new ApiError(403, "You do not have access to this match.");
  return match;
}

app.get("/api/inspections", requireRole("technician", "admin"), async (_req, res) => {
  const inspections = await db.prepare(`SELECT m.id AS matchId, m.status, dl.image_id AS imageId, pt.part_name AS partName,
      dm.brand, dm.model_name AS modelName, lp.donor_condition AS donorCondition,
      r.description AS requestDescription, r.area AS requestArea, dl.area AS donorArea,
      donor.name AS donorName, recipient.name AS recipientName
    FROM matches m
    JOIN listing_parts lp ON lp.id = m.listing_part_id
    JOIN part_types pt ON pt.id = lp.part_type_id
    JOIN device_listings dl ON dl.id = lp.listing_id
    JOIN device_models dm ON dm.id = dl.model_id
    JOIN users donor ON donor.id = dl.donor_id
    JOIN repair_requests r ON r.id = m.request_id
    JOIN users recipient ON recipient.id = r.recipient_id
    WHERE m.status = 'reserved' ORDER BY m.created_at`).all();
  res.json({ inspections });
});

app.get("/api/technician/safety-queue", requireRole("technician", "admin"), async (_req, res) => {
  const parts = await db.prepare(`SELECT lp.id AS listingPartId, dl.image_id AS imageId, pt.part_name AS partName, dm.brand,
      dm.model_name AS modelName, lp.donor_condition AS donorCondition, dl.area, donor.name AS donorName
    FROM listing_parts lp JOIN part_types pt ON pt.id = lp.part_type_id
    JOIN device_listings dl ON dl.id = lp.listing_id JOIN device_models dm ON dm.id = dl.model_id
    JOIN users donor ON donor.id = dl.donor_id
    WHERE lower(pt.part_name) LIKE '%battery%' AND lp.safety_status = 'unverified'
      AND lp.availability = 'available' AND dl.status = 'active'
    ORDER BY lp.created_at`).all();
  res.json({ parts });
});

app.post("/api/listing-parts/:id/safety-check", requireRole("technician"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const listingPartId = routeParam(req, "id");
    const part = requireOne(await db.prepare(`SELECT lp.id, lp.availability, lp.safety_status, pt.part_name
      FROM listing_parts lp JOIN part_types pt ON pt.id = lp.part_type_id WHERE lp.id = ?`)
      .get(listingPartId) as { id: string; availability: string; safety_status: string; part_name: string } | undefined, "Part not found.");
    if (!/battery/i.test(part.part_name) || part.availability !== "available" || part.safety_status !== "unverified") {
      throw new ApiError(409, "This battery is not waiting for a safety check.");
    }
    const data = parse(z.object({
      observedCondition: z.string().trim().min(2).max(500),
      decision: z.enum(["cleared", "rejected", "unsafe"]),
      notes: z.string().trim().max(1000).default(""),
    }), req.body);
    await transaction(async () => {
      await db.prepare(`INSERT INTO part_safety_checks
        (id, listing_part_id, technician_id, observed_condition, decision, notes, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id(), listingPartId, currentUser.id, data.observedCondition, data.decision, data.notes, now());
      const availability = data.decision === "cleared" ? "available" : data.decision === "unsafe" ? "blocked" : "removed";
      const updated = await db.prepare("UPDATE listing_parts SET safety_status = ?, availability = ? WHERE id = ? AND safety_status = 'unverified'")
        .run(data.decision, availability, listingPartId);
      if (Number(updated.changes) !== 1) throw new ApiError(409, "This battery has already been checked.");
    });
    const donor = await db.prepare("SELECT dl.donor_id FROM listing_parts lp JOIN device_listings dl ON dl.id = lp.listing_id WHERE lp.id = ?")
      .get(listingPartId) as { donor_id: string };
    const message = data.decision === "cleared"
      ? "A technician safety-checked your battery listing. This does not guarantee that the battery will work."
      : data.decision === "unsafe"
        ? "A technician blocked this battery as unsafe. Do not handle it; seek qualified assistance."
        : "A technician rejected this battery listing; it is no longer available for matching.";
    await notify(donor.donor_id, "Battery safety check recorded", message);
    if (data.decision === "cleared") {
      const compatibleRequests = await db.prepare(`SELECT DISTINCT r.recipient_id FROM repair_requests r
        JOIN compatibility_rules cr ON cr.recipient_model_id = r.model_id AND cr.part_type_id = r.part_type_id
        JOIN listing_parts lp ON lp.id = ? AND lp.part_type_id = cr.part_type_id
        JOIN device_listings dl ON dl.id = lp.listing_id AND dl.model_id = cr.donor_model_id
        WHERE r.status = 'open' AND cr.active = 1`)
        .all(listingPartId) as { recipient_id: string }[];
      for (const recipientId of new Set(compatibleRequests.map((row) => row.recipient_id))) {
        await notify(recipientId, "A battery may now match your request", "A technician cleared a listed battery for candidate matching. Another physical check is still required after reservation.");
      }
    }
    res.json({ status: data.decision });
  } catch (error) {
    next(error);
  }
});

app.post("/api/matches/:id/inspection", requireRole("technician"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const match = await accessibleMatch(routeParam(req, "id"), currentUser);
    if (match.status !== "reserved") throw new ApiError(409, "Only a reserved part can be inspected.");
    const data = parse(z.object({
      observedCondition: z.string().trim().min(2).max(500),
      fit: z.enum(["fits", "does_not_fit", "uncertain"]),
      decision: z.enum(["accepted", "rejected", "unsafe"]),
      notes: z.string().trim().max(1000).default(""),
    }), req.body);
    if (data.decision === "accepted" && data.fit !== "fits") {
      throw new ApiError(400, "An accepted part must be recorded as fitting the request.");
    }
    if (data.decision === "unsafe" && data.fit === "fits") {
      throw new ApiError(400, "An unsafe part cannot be recorded as a fit.");
    }
    await transaction(async () => {
      const updated = await db.prepare("UPDATE matches SET status = ?, updated_at = ? WHERE id = ? AND status = 'reserved'")
        .run(data.decision, now(), match.id);
      if (Number(updated.changes) !== 1) throw new ApiError(409, "This reservation has already been inspected.");
      await db.prepare(`INSERT INTO inspections (id, match_id, technician_id, observed_condition, fit, decision, notes, inspected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id(), match.id, currentUser.id, data.observedCondition, data.fit, data.decision, data.notes, now());
      if (data.decision === "unsafe") {
        await db.prepare("UPDATE listing_parts SET safety_status = 'unsafe', availability = 'blocked' WHERE id = ?")
          .run(match.listing_part_id);
      } else if (data.decision === "accepted") {
        await db.prepare("UPDATE listing_parts SET safety_status = 'cleared' WHERE id = ?")
          .run(match.listing_part_id);
      } else {
        await db.prepare("UPDATE listing_parts SET safety_status = 'rejected', availability = 'removed' WHERE id = ?")
          .run(match.listing_part_id);
      }
    });
    const notice = data.decision === "accepted"
      ? "A technician checked this part and recorded it as accepted. This is not a warranty."
      : data.decision === "unsafe"
        ? "A technician blocked this part as unsafe. Do not attempt to handle it; seek qualified assistance."
        : "A technician rejected this part. It will not be offered for matching.";
    await notify(match.recipient_id, "Inspection recorded", notice);
    await notify(match.donor_id, "Inspection recorded", notice);
    res.json({ status: data.decision });
  } catch (error) {
    next(error);
  }
});

app.post("/api/matches/:id/outcome", requireRole("recipient"), async (req, res, next) => {
  try {
    const currentUser = user(req);
    const match = await accessibleMatch(routeParam(req, "id"), currentUser);
    if (match.recipient_id !== currentUser.id) throw new ApiError(403, "Only the requester can record the handover outcome.");
    if (!["reserved", "accepted"].includes(match.status)) {
      throw new ApiError(409, "This reservation can no longer be changed.");
    }
    const { outcome } = parse(z.object({ outcome: z.enum(["completed", "declined", "expired"]) }), req.body);
    if (outcome === "completed" && match.status !== "accepted") {
      throw new ApiError(409, "A technician must accept the inspection before a handover can be recorded.");
    }
    await transaction(async () => {
      const expectedStatus = match.status;
      const updated = await db.prepare("UPDATE matches SET status = ?, outcome = ?, updated_at = ? WHERE id = ? AND status = ?")
        .run(outcome, outcome, now(), match.id, expectedStatus);
      if (Number(updated.changes) !== 1) throw new ApiError(409, "This reservation has already been updated.");
      if (outcome === "completed" && match.status === "accepted") {
        await db.prepare("UPDATE listing_parts SET availability = 'given' WHERE id = ?").run(match.listing_part_id);
        await db.prepare("UPDATE repair_requests SET status = 'filled' WHERE id = ?").run(match.request_id);
      } else if (outcome !== "completed") {
        await db.prepare("UPDATE listing_parts SET availability = 'available' WHERE id = ? AND safety_status NOT IN ('unsafe', 'rejected')")
          .run(match.listing_part_id);
      }
    });
    const message = outcome === "completed" && match.status === "accepted"
      ? "The users recorded a completed handover. ReJenga did not arrange or verify the physical transfer."
      : `The reservation was ${outcome}; the part is available again only if it remains eligible and safe.`;
    await notify(match.donor_id, "Match outcome recorded", message);
    res.json({ outcome });
  } catch (error) {
    next(error);
  }
});

app.get("/api/matches/mine", requireUser, async (req, res) => {
  const currentUser = user(req);
  const rows = currentUser.role === "admin" || currentUser.role === "technician"
    ? await db.prepare(`SELECT m.id, m.status, m.outcome, m.created_at AS createdAt, dl.image_id AS imageId, pt.part_name AS partName,
        dm.brand, dm.model_name AS modelName, donor.name AS donorName, recipient.name AS recipientName,
        r.area AS requestArea, dl.area AS donorArea
      FROM matches m JOIN listing_parts lp ON lp.id = m.listing_part_id
      JOIN part_types pt ON pt.id = lp.part_type_id JOIN device_listings dl ON dl.id = lp.listing_id
      JOIN device_models dm ON dm.id = dl.model_id JOIN users donor ON donor.id = dl.donor_id
      JOIN repair_requests r ON r.id = m.request_id JOIN users recipient ON recipient.id = r.recipient_id
      ORDER BY m.created_at DESC`).all()
    : await db.prepare(`SELECT m.id, m.status, m.outcome, m.created_at AS createdAt, dl.image_id AS imageId, pt.part_name AS partName,
        dm.brand, dm.model_name AS modelName, donor.name AS donorName, recipient.name AS recipientName,
        r.area AS requestArea, dl.area AS donorArea
      FROM matches m JOIN listing_parts lp ON lp.id = m.listing_part_id
      JOIN part_types pt ON pt.id = lp.part_type_id JOIN device_listings dl ON dl.id = lp.listing_id
      JOIN device_models dm ON dm.id = dl.model_id JOIN users donor ON donor.id = dl.donor_id
      JOIN repair_requests r ON r.id = m.request_id JOIN users recipient ON recipient.id = r.recipient_id
      WHERE donor.id = ? OR recipient.id = ? ORDER BY m.created_at DESC`).all(currentUser.id, currentUser.id);
  res.json({ matches: rows });
});

app.get("/api/notifications", requireUser, async (req, res) => {
  const notifications = await db.prepare(`SELECT id, title, body, read_at AS readAt, created_at AS createdAt
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).all(user(req).id);
  res.json({ notifications });
});

app.patch("/api/notifications/:id/read", requireUser, async (req, res, next) => {
  try {
    const result = await db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL")
      .run(now(), routeParam(req, "id"), user(req).id);
    if (Number(result.changes) === 0
      && !await db.prepare("SELECT id FROM notifications WHERE id = ? AND user_id = ? AND read_at IS NOT NULL").get(routeParam(req, "id"), user(req).id)) {
      throw new ApiError(404, "Notification not found.");
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/images/:id", requireUser, async (req, res, next) => {
  try {
    const currentUser = user(req);
    const image = requireOne(await db.prepare(`SELECT i.mime_type, i.filename, i.image_data, i.owner_id FROM images i WHERE i.id = ?`)
      .get(routeParam(req, "id")) as { mime_type: string; filename: string; image_data: Buffer; owner_id: string } | undefined, "Image not found.");
    const listing = await db.prepare("SELECT id FROM device_listings WHERE image_id = ?").get(routeParam(req, "id")) as { id: string } | undefined;
    const allowed = image.owner_id === currentUser.id || currentUser.role === "technician" || currentUser.role === "admin"
      || (listing && await db.prepare(`SELECT 1 FROM matches m JOIN repair_requests r ON r.id = m.request_id
        JOIN listing_parts lp ON lp.id = m.listing_part_id JOIN device_listings dl ON dl.id = lp.listing_id
        WHERE r.recipient_id = ? AND dl.id = ?`).get(currentUser.id, listing.id));
    if (!allowed) throw new ApiError(403, "You do not have access to this image.");
    res.setHeader("Content-Type", image.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${image.filename.replace(/["\\\r\n]/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(image.image_data);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireRole("admin"), async (_req, res) => {
  const users = await db.prepare(`SELECT id, name, email, role, status, area, created_at AS createdAt
    FROM users ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`).all();
  res.json({ users });
});

app.patch("/api/admin/users/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const data = parse(z.object({
      status: z.enum(["approved", "denied"]).optional(),
      role: z.enum(["technician", "donor", "recipient"]).optional(),
    }).refine((value) => value.status !== undefined || value.role !== undefined, "Choose an account status or role to update."), req.body);
    const target = requireOne(await db.prepare("SELECT id, role, status FROM users WHERE id = ?")
      .get(routeParam(req, "id")) as { id: string; role: Role; status: string } | undefined, "User not found.");
    if (target.role === "admin") throw new ApiError(400, "Administrator accounts cannot be changed here.");
    if (target.status !== "approved" && data.status === "approved") {
      throw new ApiError(400, "Users must verify their email address before their account can be activated.");
    }
    if (data.role && target.status !== "approved") {
      throw new ApiError(400, "Email must be verified before an account role can be changed.");
    }
    if (data.status === "denied" && target.status !== "pending") {
      throw new ApiError(400, "Only accounts awaiting email verification can be denied here.");
    }
    const status = data.status ?? target.status;
    await transaction(async () => {
      await db.prepare("UPDATE users SET status = ?, role = COALESCE(?, role) WHERE id = ?")
        .run(status, data.role ?? null, target.id);
      if (status === "denied") await db.prepare("DELETE FROM email_verification_codes WHERE user_id = ?").run(target.id);
    });
    if (data.status === "approved" && target.status !== "approved") {
      await notify(target.id, "Account approved", `Your ReJenga ${data.role ?? target.role} account is ready to use.`);
    }
    res.json({ status, role: data.role ?? target.role });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/catalog", requireRole("admin"), async (_req, res) => {
  const models = await db.prepare("SELECT id, brand, model_name AS modelName, active FROM device_models ORDER BY brand, model_name").all();
  const parts = await db.prepare("SELECT id, part_name AS partName, active FROM part_types ORDER BY part_name").all();
  const rules = await db.prepare(`SELECT cr.id, cr.source, cr.active, donor.brand AS donorBrand, donor.model_name AS donorModel,
      recipient.brand AS recipientBrand, recipient.model_name AS recipientModel, pt.part_name AS partName
    FROM compatibility_rules cr JOIN device_models donor ON donor.id = cr.donor_model_id
    JOIN device_models recipient ON recipient.id = cr.recipient_model_id
    JOIN part_types pt ON pt.id = cr.part_type_id ORDER BY donor.brand, donor.model_name`).all();
  res.json({ models, parts, rules });
});

app.post("/api/admin/models", requireRole("admin"), async (req, res, next) => {
  try {
    const data = parse(z.object({ brand: z.string().trim().min(2).max(80), modelName: z.string().trim().min(1).max(100) }), req.body);
    const modelId = id();
    await db.prepare("INSERT INTO device_models (id, brand, model_name) VALUES (?, ?, ?)").run(modelId, data.brand, data.modelName);
    res.status(201).json({ id: modelId });
  } catch (error) {
    next(isUniqueViolation(error)
      ? new ApiError(409, "That model is already in the catalogue.") : error);
  }
});

app.post("/api/admin/parts", requireRole("admin"), async (req, res, next) => {
  try {
    const { partName } = parse(z.object({ partName: z.string().trim().min(2).max(100) }), req.body);
    const partId = id();
    await db.prepare("INSERT INTO part_types (id, part_name) VALUES (?, ?)").run(partId, partName);
    res.status(201).json({ id: partId });
  } catch (error) {
    next(isUniqueViolation(error)
      ? new ApiError(409, "That part is already in the catalogue.") : error);
  }
});

app.post("/api/admin/rules", requireRole("admin"), async (req, res, next) => {
  try {
    const data = parse(z.object({
      donorModelId: z.string().min(1),
      recipientModelId: z.string().min(1),
      partTypeId: z.string().min(1),
      source: z.string().trim().min(3).max(250),
    }), req.body);
    const ruleId = id();
    await db.prepare(`INSERT INTO compatibility_rules
      (id, donor_model_id, recipient_model_id, part_type_id, source) VALUES (?, ?, ?, ?, ?)`)
      .run(ruleId, data.donorModelId, data.recipientModelId, data.partTypeId, data.source);
    res.status(201).json({ id: ruleId });
  } catch (error) {
    next(isUniqueViolation(error)
      ? new ApiError(409, "That compatibility rule already exists.") : error);
  }
});

app.patch("/api/admin/rules/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    const result = await db.prepare("UPDATE compatibility_rules SET active = ? WHERE id = ?").run(Number(active), routeParam(req, "id"));
    if (Number(result.changes) === 0) throw new ApiError(404, "Compatibility rule not found.");
    res.json({ active });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/reports", requireRole("admin"), async (_req, res) => {
  const count = async (table: string, where = "") => {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as { count: number };
    return row.count;
  };
  const totals = {
    users: await count("users", "WHERE status = 'approved'"),
    pendingAccounts: await count("users", "WHERE status = 'pending'"),
    activeListings: await count("device_listings", "WHERE status = 'active'"),
    openRequests: await count("repair_requests", "WHERE status = 'open'"),
    reservedMatches: await count("matches", "WHERE status = 'reserved'"),
    technicianAccepted: await count("matches", "WHERE status = 'accepted'"),
    unsafeBlocked: await count("listing_parts", "WHERE safety_status = 'unsafe'"),
    completedOutcomes: await count("matches", "WHERE status = 'completed'"),
  };
  res.json({ totals });
});

app.get("/api/admin/listings", requireRole("admin"), async (_req, res) => {
  const listings = await db.prepare(`SELECT dl.id, dl.image_id AS imageId, dl.status, dl.area, dl.description, dl.created_at AS createdAt,
      dm.brand, dm.model_name AS modelName, u.name AS donorName, lp.availability, lp.safety_status AS safetyStatus,
      pt.part_name AS partName, cl.status AS classificationStatus, cl.prediction_type AS predictionType,
      cl.predicted_class AS predictedClass, cl.confidence
    FROM device_listings dl JOIN device_models dm ON dm.id = dl.model_id JOIN users u ON u.id = dl.donor_id
    JOIN listing_parts lp ON lp.listing_id = dl.id JOIN part_types pt ON pt.id = lp.part_type_id
    LEFT JOIN classifications cl ON cl.image_id = dl.image_id
    ORDER BY dl.created_at DESC`).all();
  res.json({ listings });
});

app.patch("/api/admin/listings/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const { status } = parse(z.object({ status: z.enum(["active", "moderated", "removed"]) }), req.body);
    const listingId = routeParam(req, "id");
    const result = await db.prepare("UPDATE device_listings SET status = ? WHERE id = ?").run(status, listingId);
    if (Number(result.changes) === 0) throw new ApiError(404, "Listing not found.");
    const donor = await db.prepare("SELECT donor_id FROM device_listings WHERE id = ?").get(listingId) as { donor_id: string };
    await notify(donor.donor_id, "Listing status updated", `An administrator changed your listing status to ${status}.`);
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Images must be no larger than 5 MB." : "The uploaded file could not be processed." });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error("Unhandled ReJenga API error:", error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const dist = resolve("dist");
if (!process.env.VERCEL && existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`ReJenga API listening on http://localhost:${port}`);
  });
}

export default app;
