import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { db, schema } from "./db";
import { config } from "./config";
import type { SessionUser, UserRole } from "@/lib/types";

const COOKIE = "rejenga_session";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const token = getCookie(COOKIE);
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  deleteCookie(COOKIE, { path: "/" });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      status: schema.users.status,
      areaId: schema.users.areaId,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export class AccessError extends Error {}

/** Signed-in, approved user, optionally limited to some roles. Admins pass every role check. */
export async function requireUser(roles?: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AccessError("Please sign in first.");
  if (user.status === "pending") throw new AccessError("Your account is waiting for administrator approval.");
  if (user.status === "suspended") throw new AccessError("Your account has been suspended. Contact the administrator.");
  if (roles && user.role !== "admin" && !roles.includes(user.role)) {
    throw new AccessError("You don't have access to this page.");
  }
  return user;
}
