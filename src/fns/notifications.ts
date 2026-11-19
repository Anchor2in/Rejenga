import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getSessionUser } from "@/server/auth";

export const getNotificationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) throw new Error("Please sign in first.");
  return db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(100);
});

export const markNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) throw new Error("Please sign in first.");
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  return { ok: true };
});
