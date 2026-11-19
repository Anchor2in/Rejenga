import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { runPhotoCheck, saveUpload, validatePhoto } from "@/server/uploads";
import { closeListing, notifyMatchesForListing } from "@/server/workflow";
import { loadPhotos } from "@/server/photos";

const { deviceListings, listingParts, listingPhotos, deviceModels, partTypes, areas, matches, users } = schema;
const modelLabel = sql<string>`${deviceModels.brand} || ' ' || ${deviceModels.modelName}`;

const partSchema = z.object({
  partTypeId: z.number().int(),
  donorCondition: z.enum(["working", "unsure", "not_working"]),
  donorNotes: z.string().trim().max(300).optional(),
});

const listingSchema = z.object({
  modelId: z.coerce.number().int().positive("Pick the phone model"),
  areaId: z.coerce.number().int().positive("Pick your approximate area"),
  visibleCondition: z.string().trim().min(5, "Describe what you can see (cracks, dents, missing buttons…)").max(1000),
  description: z.string().trim().max(1000).optional(),
  parts: z.array(partSchema).min(1, "Choose at least one part you can give"),
  batterySafe: z.boolean(),
});

async function storePhotos(listingId: number, files: File[]) {
  const ids: number[] = [];
  for (const f of files) {
    const saved = await saveUpload(f);
    const [p] = await db.insert(listingPhotos).values({ listingId, ...saved, aiStatus: config.aiEnabled ? "pending" : "disabled" }).returning({ id: listingPhotos.id });
    ids.push(p.id);
  }
  // The AI check runs in the background so the form returns quickly.
  void (async () => {
    for (const id of ids) await runPhotoCheck(id);
  })();
}

function photoFiles(form: FormData) {
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > config.maxPhotosPerListing) throw new Error(`Upload at most ${config.maxPhotosPerListing} photos.`);
  files.forEach(validatePhoto);
  return files;
}

export const createListingFn = createServerFn({ method: "POST" })
  .validator((d: FormData) => d)
  .handler(async ({ data: form }) => {
    const user = await requireUser(["community"]);
    const parsed = listingSchema.parse(JSON.parse(String(form.get("payload") ?? "{}")));
    const files = photoFiles(form);
    const batteryIds = (await db.select({ id: partTypes.id }).from(partTypes).where(eq(partTypes.isBattery, true))).map((p) => p.id);
    if (parsed.parts.some((p) => batteryIds.includes(p.partTypeId)) && !parsed.batterySafe) {
      throw new Error("Batteries that are swollen, leaking, hot or burnt can't be listed. Remove the battery from the list and see the safety guidance.");
    }
    const listingId = await db.transaction(async (tx) => {
      const [l] = await tx
        .insert(deviceListings)
        .values({ donorId: user.id, modelId: parsed.modelId, areaId: parsed.areaId, visibleCondition: parsed.visibleCondition, description: parsed.description || null })
        .returning({ id: deviceListings.id });
      const unique = [...new Map(parsed.parts.map((p) => [p.partTypeId, p])).values()];
      await tx.insert(listingParts).values(unique.map((p) => ({ listingId: l.id, partTypeId: p.partTypeId, donorCondition: p.donorCondition, donorNotes: p.donorNotes || null })));
      return l.id;
    });
    await storePhotos(listingId, files);
    await notifyMatchesForListing(listingId);
    return listingId;
  });

export const addPhotosFn = createServerFn({ method: "POST" })
  .validator((d: FormData) => d)
  .handler(async ({ data: form }) => {
    const user = await requireUser();
    const listingId = Number(form.get("listingId"));
    const [l] = await db.select().from(deviceListings).where(eq(deviceListings.id, listingId));
    if (!l || (l.donorId !== user.id && user.role !== "admin")) throw new Error("Listing not found.");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(listingPhotos).where(eq(listingPhotos.listingId, listingId));
    const files = photoFiles(form);
    if (n + files.length > config.maxPhotosPerListing) throw new Error(`A listing can have at most ${config.maxPhotosPerListing} photos.`);
    await storePhotos(listingId, files);
    return { ok: true };
  });

export const recheckPhotoFn = createServerFn({ method: "POST" })
  .validator(z.number().int())
  .handler(async ({ data: photoId }) => {
    const user = await requireUser();
    const [p] = await db
      .select({ donorId: deviceListings.donorId })
      .from(listingPhotos)
      .innerJoin(deviceListings, eq(deviceListings.id, listingPhotos.listingId))
      .where(eq(listingPhotos.id, photoId));
    if (!p || (p.donorId !== user.id && user.role !== "admin")) throw new Error("Photo not found.");
    await db.update(listingPhotos).set({ aiStatus: "pending" }).where(eq(listingPhotos.id, photoId));
    void runPhotoCheck(photoId);
    return { ok: true };
  });

export const getMyListingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select({ id: deviceListings.id, model: modelLabel, area: areas.name, status: deviceListings.status, createdAt: deviceListings.createdAt })
    .from(deviceListings)
    .innerJoin(deviceModels, eq(deviceModels.id, deviceListings.modelId))
    .innerJoin(areas, eq(areas.id, deviceListings.areaId))
    .where(eq(deviceListings.donorId, user.id))
    .orderBy(desc(deviceListings.createdAt));
  const parts = rows.length
    ? await db
        .select({ listingId: listingParts.listingId, name: partTypes.name, availability: listingParts.availability, inspectionStatus: listingParts.inspectionStatus })
        .from(listingParts)
        .innerJoin(partTypes, eq(partTypes.id, listingParts.partTypeId))
        .where(inArray(listingParts.listingId, rows.map((r) => r.id)))
    : [];
  return rows.map((r) => ({ ...r, parts: parts.filter((p) => p.listingId === r.id) }));
});

export const getListingFn = createServerFn({ method: "GET" })
  .validator(z.number().int())
  .handler(async ({ data: id }) => {
    const user = await requireUser();
    const [listing] = await db
      .select({
        id: deviceListings.id,
        donorId: deviceListings.donorId,
        donorName: users.name,
        model: modelLabel,
        area: areas.name,
        visibleCondition: deviceListings.visibleCondition,
        description: deviceListings.description,
        status: deviceListings.status,
        removedReason: deviceListings.removedReason,
        createdAt: deviceListings.createdAt,
      })
      .from(deviceListings)
      .innerJoin(deviceModels, eq(deviceModels.id, deviceListings.modelId))
      .innerJoin(areas, eq(areas.id, deviceListings.areaId))
      .innerJoin(users, eq(users.id, deviceListings.donorId))
      .where(eq(deviceListings.id, id));
    if (!listing || (listing.donorId !== user.id && user.role === "community")) throw new Error("Listing not found.");
    const parts = await db
      .select({
        id: listingParts.id,
        name: partTypes.name,
        isBattery: partTypes.isBattery,
        donorCondition: listingParts.donorCondition,
        donorNotes: listingParts.donorNotes,
        inspectionStatus: listingParts.inspectionStatus,
        availability: listingParts.availability,
        checkedAt: listingParts.checkedAt,
        openMatchId: sql<number | null>`(select m.id from ${matches} m where m.listing_part_id = ${listingParts.id} and m.status in ('reserved','accepted') limit 1)`,
      })
      .from(listingParts)
      .innerJoin(partTypes, eq(partTypes.id, listingParts.partTypeId))
      .where(eq(listingParts.listingId, id))
      .orderBy(asc(partTypes.id));
    return { listing, parts, photos: await loadPhotos(id), isOwner: listing.donorId === user.id, maxPhotos: config.maxPhotosPerListing };
  });

export const withdrawListingFn = createServerFn({ method: "POST" })
  .validator(z.number().int())
  .handler(async ({ data: id }) => {
    const user = await requireUser();
    const [l] = await db.select().from(deviceListings).where(eq(deviceListings.id, id));
    if (!l || l.donorId !== user.id) throw new Error("Listing not found.");
    if (l.status !== "active") throw new Error("This listing is not active.");
    await closeListing(user.id, id, "withdrawn");
    return { ok: true };
  });

export const withdrawPartFn = createServerFn({ method: "POST" })
  .validator(z.number().int())
  .handler(async ({ data: partId }) => {
    const user = await requireUser();
    const [p] = await db
      .select({ donorId: deviceListings.donorId })
      .from(listingParts)
      .innerJoin(deviceListings, eq(deviceListings.id, listingParts.listingId))
      .where(eq(listingParts.id, partId));
    if (!p || p.donorId !== user.id) throw new Error("Part not found.");
    const res = await db
      .update(listingParts)
      .set({ availability: "withdrawn" })
      .where(and(eq(listingParts.id, partId), eq(listingParts.availability, "available")))
      .returning({ id: listingParts.id });
    if (!res.length) throw new Error("Only available parts can be withdrawn. Cancel the reservation first.");
    return { ok: true };
  });
