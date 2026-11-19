import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/auth";
import { closeListing, expireReservations, notify } from "@/server/workflow";

const { users, areas, deviceListings, listingParts, partRequests, matches, inspections, deviceModels, partTypes, listingPhotos } = schema;

export const getUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser(["admin"]);
  return db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, status: users.status, area: areas.name, createdAt: users.createdAt })
    .from(users)
    .leftJoin(areas, eq(areas.id, users.areaId))
    .orderBy(sql`case ${users.status} when 'pending' then 0 when 'active' then 1 else 2 end`, desc(users.createdAt));
});

export const updateUserFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int(), status: z.enum(["active", "suspended"]).optional(), role: z.enum(["community", "technician", "admin"]).optional() }))
  .handler(async ({ data }) => {
    const admin = await requireUser(["admin"]);
    if (data.id === admin.id) throw new Error("You can't change your own account here.");
    const set: Partial<typeof users.$inferInsert> = {};
    if (data.status) set.status = data.status;
    if (data.role) set.role = data.role;
    const [u] = await db.update(users).set(set).where(eq(users.id, data.id)).returning({ id: users.id, status: users.status });
    if (!u) throw new Error("User not found.");
    if (data.status === "active") await notify(db, u.id, "Your ReJenga account was approved. You can now list phones and request parts.", "/dashboard");
    if (data.status === "suspended") await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
    return { ok: true };
  });

export const getAllListingsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser(["admin"]);
  return db
    .select({
      id: deviceListings.id,
      model: sql<string>`${deviceModels.brand} || ' ' || ${deviceModels.modelName}`,
      donor: users.name,
      area: areas.name,
      status: deviceListings.status,
      createdAt: deviceListings.createdAt,
      parts: sql<number>`(select count(*)::int from ${listingParts} lp where lp.listing_id = ${deviceListings.id})`,
      photos: sql<number>`(select count(*)::int from ${listingPhotos} p where p.listing_id = ${deviceListings.id})`,
    })
    .from(deviceListings)
    .innerJoin(deviceModels, eq(deviceModels.id, deviceListings.modelId))
    .innerJoin(users, eq(users.id, deviceListings.donorId))
    .innerJoin(areas, eq(areas.id, deviceListings.areaId))
    .orderBy(desc(deviceListings.createdAt));
});

export const removeListingFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int(), reason: z.string().trim().min(3, "Give a reason the donor will see").max(300) }))
  .handler(async ({ data }) => {
    const admin = await requireUser(["admin"]);
    await closeListing(admin.id, data.id, "removed", data.reason);
    return { ok: true };
  });

const reportSchema = z.object({ days: z.number().int().min(1).max(3650).default(30) });

export const getReportFn = createServerFn({ method: "GET" })
  .validator(reportSchema)
  .handler(async ({ data }) => {
    await requireUser(["admin"]);
    await expireReservations();
    const since = new Date(Date.now() - data.days * 86_400_000);
    const tally = async <T extends string>(col: any, table: any, dateCol: any) =>
      (await db.select({ k: col, n: count() }).from(table).where(gte(dateCol, since)).groupBy(col)) as { k: T; n: number }[];

    const [listingsBy, requestsBy, matchesBy, inspectionsBy, partStates, usersBy, aiBy, byArea, byModel, totalListings] = await Promise.all([
      tally(deviceListings.status, deviceListings, deviceListings.createdAt),
      tally(partRequests.status, partRequests, partRequests.createdAt),
      tally(matches.status, matches, matches.reservedAt),
      tally(inspections.decision, inspections, inspections.inspectedAt),
      db.select({ k: sql<string>`${listingParts.inspectionStatus} || ':' || ${listingParts.availability}`, n: count() }).from(listingParts).groupBy(listingParts.inspectionStatus, listingParts.availability),
      db.select({ k: sql<string>`${users.role} || ':' || ${users.status}`, n: count() }).from(users).groupBy(users.role, users.status),
      tally(listingPhotos.aiStatus, listingPhotos, listingPhotos.createdAt),
      db
        .select({ area: areas.name, listings: sql<number>`count(distinct ${deviceListings.id})::int`, requests: sql<number>`count(distinct ${partRequests.id})::int` })
        .from(areas)
        .leftJoin(deviceListings, and(eq(deviceListings.areaId, areas.id), gte(deviceListings.createdAt, since)))
        .leftJoin(partRequests, and(eq(partRequests.areaId, areas.id), gte(partRequests.createdAt, since)))
        .groupBy(areas.name)
        .orderBy(areas.name),
      db
        .select({ model: sql<string>`${deviceModels.brand} || ' ' || ${deviceModels.modelName}`, part: partTypes.name, n: count() })
        .from(partRequests)
        .innerJoin(deviceModels, eq(deviceModels.id, partRequests.modelId))
        .innerJoin(partTypes, eq(partTypes.id, partRequests.partTypeId))
        .where(gte(partRequests.createdAt, since))
        .groupBy(deviceModels.brand, deviceModels.modelName, partTypes.name)
        .orderBy(desc(count()))
        .limit(10),
      db.select({ n: count() }).from(deviceListings),
    ]);
    const lowConf = await db
      .select({ n: count() })
      .from(listingPhotos)
      .where(and(eq(listingPhotos.aiLowConfidence, true), gte(listingPhotos.createdAt, since)));
    const toMap = (rows: { k: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.k, r.n])) as Record<string, number>;
    return {
      days: data.days,
      listings: toMap(listingsBy),
      requests: toMap(requestsBy),
      matches: toMap(matchesBy),
      inspections: toMap(inspectionsBy),
      parts: toMap(partStates),
      users: toMap(usersBy),
      ai: { ...toMap(aiBy), lowConfidence: lowConf[0]?.n ?? 0 },
      byArea,
      topRequested: byModel,
      totalListings: totalListings[0]?.n ?? 0,
    };
  });
