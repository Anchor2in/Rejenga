import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { endSession, getSessionUser, hashPassword, startSession, verifyPassword } from "@/server/auth";
import { config } from "@/server/config";
import { notify } from "@/server/workflow";

export const getAuthStateFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  let unread = 0;
  if (user) {
    const [r] = await db
      .select({ n: count() })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
    unread = r?.n ?? 0;
  }
  return { user, unread };
});

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  areaId: z.coerce.number().int().positive("Pick your approximate area"),
  technician: z.boolean().default(false),
});

export const signUpFn = createServerFn({ method: "POST" })
  .validator(signUpSchema)
  .handler(async ({ data }) => {
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, data.email));
    if (existing) throw new Error("An account with that email already exists. Sign in instead.");
    const status = data.technician || config.requireAccountApproval ? "pending" : "active";
    const [user] = await db
      .insert(schema.users)
      .values({
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        passwordHash: await hashPassword(data.password),
        role: data.technician ? "technician" : "community",
        status,
        areaId: data.areaId,
      })
      .returning({ id: schema.users.id });
    if (status === "pending") {
      const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "admin"));
      await notify(db, admins.map((a) => a.id), `${data.name} (${data.technician ? "technician" : "community member"}) is waiting for account approval.`, "/admin/users");
    }
    await startSession(user.id);
    return { status };
  });

export const signInFn = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().trim().toLowerCase(), password: z.string() }))
  .handler(async ({ data }) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, data.email));
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) throw new Error("Wrong email or password.");
    await startSession(user.id);
    return { status: user.status };
  });

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  await endSession();
  return { ok: true };
});
