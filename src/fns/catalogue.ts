import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/auth";

const { areas, deviceModels, partTypes, compatibilityRules } = schema;

/** Active catalogue options for forms (public: the sign-up form needs areas). */
export const getCatalogueFn = createServerFn({ method: "GET" }).handler(async () => {
  const [models, parts, areaRows] = await Promise.all([
    db.select().from(deviceModels).where(eq(deviceModels.active, true)).orderBy(asc(deviceModels.brand), asc(deviceModels.modelName)),
    db.select().from(partTypes).where(eq(partTypes.active, true)).orderBy(asc(partTypes.id)),
    db.select().from(areas).where(eq(areas.active, true)).orderBy(asc(areas.town), asc(areas.name)),
  ]);
  return { models, parts, areas: areaRows };
});

export const getCatalogueAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser(["admin"]);
  const donor = alias(deviceModels, "donor_model");
  const recipient = alias(deviceModels, "recipient_model");
  const [models, parts, areaRows, rules] = await Promise.all([
    db.select().from(deviceModels).orderBy(asc(deviceModels.brand), asc(deviceModels.modelName)),
    db.select().from(partTypes).orderBy(asc(partTypes.id)),
    db.select().from(areas).orderBy(asc(areas.town), asc(areas.name)),
    db
      .select({
        id: compatibilityRules.id,
        donor: sql<string>`${donor.brand} || ' ' || ${donor.modelName}`,
        recipient: sql<string>`${recipient.brand} || ' ' || ${recipient.modelName}`,
        part: partTypes.name,
        sameModel: sql<boolean>`${compatibilityRules.donorModelId} = ${compatibilityRules.recipientModelId}`,
        active: compatibilityRules.active,
        source: compatibilityRules.source,
        notes: compatibilityRules.notes,
      })
      .from(compatibilityRules)
      .innerJoin(donor, eq(donor.id, compatibilityRules.donorModelId))
      .innerJoin(recipient, eq(recipient.id, compatibilityRules.recipientModelId))
      .innerJoin(partTypes, eq(partTypes.id, compatibilityRules.partTypeId))
      .orderBy(asc(donor.brand), asc(donor.modelName), asc(partTypes.id)),
  ]);
  return { models, parts, areas: areaRows, rules };
});

export const addModelFn = createServerFn({ method: "POST" })
  .validator(z.object({ brand: z.string().trim().min(1).max(40), modelName: z.string().trim().min(1).max(60), sameModelRules: z.boolean() }))
  .handler(async ({ data }) => {
    const admin = await requireUser(["admin"]);
    const [model] = await db.insert(deviceModels).values({ brand: data.brand, modelName: data.modelName }).onConflictDoNothing().returning();
    if (!model) throw new Error("That model is already in the catalogue.");
    if (data.sameModelRules) {
      const parts = await db.select({ id: partTypes.id }).from(partTypes);
      if (parts.length)
        await db.insert(compatibilityRules).values(
          parts.map((p) => ({ donorModelId: model.id, recipientModelId: model.id, partTypeId: p.id, source: "Same model (default rule)", createdById: admin.id })),
        );
    }
    return model.id;
  });

export const addPartTypeFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(2).max(40), isBattery: z.boolean() }))
  .handler(async ({ data }) => {
    await requireUser(["admin"]);
    const [p] = await db.insert(partTypes).values(data).onConflictDoNothing().returning();
    if (!p) throw new Error("That part type already exists.");
    return p.id;
  });

export const addAreaFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(2).max(60), town: z.string().trim().min(2).max(40), lat: z.number().min(-5).max(5), lng: z.number().min(33).max(42) }))
  .handler(async ({ data }) => {
    await requireUser(["admin"]);
    const [a] = await db.insert(areas).values(data).onConflictDoNothing().returning();
    if (!a) throw new Error("That area already exists.");
    return a.id;
  });

export const addRuleFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      donorModelId: z.number().int(),
      recipientModelId: z.number().int(),
      partTypeId: z.number().int(),
      source: z.string().trim().min(3, "Say where this rule comes from (e.g. technician name, parts supplier)").max(200),
      notes: z.string().trim().max(500).optional(),
      bothWays: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireUser(["admin"]);
    const rows = [{ d: data.donorModelId, r: data.recipientModelId }];
    if (data.bothWays && data.donorModelId !== data.recipientModelId) rows.push({ d: data.recipientModelId, r: data.donorModelId });
    const inserted = await db
      .insert(compatibilityRules)
      .values(rows.map(({ d, r }) => ({ donorModelId: d, recipientModelId: r, partTypeId: data.partTypeId, source: data.source, notes: data.notes || null, createdById: admin.id })))
      .onConflictDoNothing()
      .returning({ id: compatibilityRules.id });
    if (!inserted.length) throw new Error("That rule already exists — switch it on in the list instead.");
    return inserted.length;
  });

const toggleSchema = z.object({ kind: z.enum(["model", "part", "area", "rule"]), id: z.number().int(), active: z.boolean() });

export const toggleCatalogueFn = createServerFn({ method: "POST" })
  .validator(toggleSchema)
  .handler(async ({ data }) => {
    await requireUser(["admin"]);
    const table = { model: deviceModels, part: partTypes, area: areas, rule: compatibilityRules }[data.kind];
    await db.update(table).set({ active: data.active }).where(and(eq(table.id, data.id)));
    return { ok: true };
  });
