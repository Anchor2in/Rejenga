import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/auth";
import { cancelRequest, expireReservations, findCandidates, notifyMatchesForRequest, reservePart } from "@/server/workflow";

const { partRequests, deviceModels, partTypes, areas, matches, listingPhotos } = schema;
const modelLabel = sql<string>`${deviceModels.brand} || ' ' || ${deviceModels.modelName}`;

const requestSchema = z.object({
  modelId: z.coerce.number().int().positive("Pick your phone model"),
  partTypeId: z.coerce.number().int().positive("Pick the part you need"),
  areaId: z.coerce.number().int().positive("Pick your approximate area"),
  problem: z.string().trim().min(5, "Describe the problem in a few words").max(1000),
});

export const createRequestFn = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    const user = await requireUser(["community"]);
    const [r] = await db.insert(partRequests).values({ recipientId: user.id, ...data }).returning({ id: partRequests.id });
    await notifyMatchesForRequest(r.id);
    return r.id;
  });

export const getMyRequestsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  await expireReservations();
  return db
    .select({
      id: partRequests.id,
      model: modelLabel,
      part: partTypes.name,
      area: areas.name,
      status: partRequests.status,
      createdAt: partRequests.createdAt,
      openMatchId: sql<number | null>`(select m.id from ${matches} m where m.request_id = ${partRequests.id} and m.status in ('reserved','accepted') limit 1)`,
    })
    .from(partRequests)
    .innerJoin(deviceModels, eq(deviceModels.id, partRequests.modelId))
    .innerJoin(partTypes, eq(partTypes.id, partRequests.partTypeId))
    .innerJoin(areas, eq(areas.id, partRequests.areaId))
    .where(eq(partRequests.recipientId, user.id))
    .orderBy(desc(partRequests.createdAt));
});

export const getRequestFn = createServerFn({ method: "GET" })
  .validator(z.number().int())
  .handler(async ({ data: id }) => {
    const user = await requireUser();
    await expireReservations();
    const [request] = await db
      .select({
        id: partRequests.id,
        recipientId: partRequests.recipientId,
        model: modelLabel,
        part: partTypes.name,
        area: areas.name,
        problem: partRequests.problem,
        status: partRequests.status,
        createdAt: partRequests.createdAt,
      })
      .from(partRequests)
      .innerJoin(deviceModels, eq(deviceModels.id, partRequests.modelId))
      .innerJoin(partTypes, eq(partTypes.id, partRequests.partTypeId))
      .innerJoin(areas, eq(areas.id, partRequests.areaId))
      .where(eq(partRequests.id, id));
    if (!request || (request.recipientId !== user.id && user.role === "community")) throw new Error("Request not found.");

    const history = await db
      .select({ id: matches.id, status: matches.status, reservedAt: matches.reservedAt, closedAt: matches.closedAt })
      .from(matches)
      .where(eq(matches.requestId, id))
      .orderBy(desc(matches.reservedAt));

    const candidates = request.status === "open" ? await findCandidates(db, id) : [];
    const listingIds = [...new Set(candidates.map((c) => c.listingId))];
    const photos = listingIds.length
      ? await db
          .select({
            listingId: listingPhotos.listingId,
            fileName: listingPhotos.fileName,
            aiStatus: listingPhotos.aiStatus,
            aiModelLabel: listingPhotos.aiModelLabel,
            aiModelConfidence: listingPhotos.aiModelConfidence,
            aiDamageLabel: listingPhotos.aiDamageLabel,
            aiDamageConfidence: listingPhotos.aiDamageConfidence,
            aiLowConfidence: listingPhotos.aiLowConfidence,
          })
          .from(listingPhotos)
          .where(inArray(listingPhotos.listingId, listingIds))
      : [];

    return {
      request,
      isOwner: request.recipientId === user.id,
      history,
      candidates: candidates.map((c) => ({
        listingPartId: c.listingPartId,
        listingId: c.listingId,
        modelLabel: c.modelLabel,
        partName: c.partName,
        area: c.area.name,
        distanceKm: c.distanceKm,
        inspectionStatus: c.inspectionStatus,
        checkedAt: c.checkedAt,
        reasons: c.reasons,
        unverified: c.unverified,
        photos: photos.filter((p) => p.listingId === c.listingId),
      })),
    };
  });

export const reservePartFn = createServerFn({ method: "POST" })
  .validator(z.object({ requestId: z.number().int(), listingPartId: z.number().int() }))
  .handler(async ({ data }) => {
    const user = await requireUser(["community"]);
    return reservePart(user.id, data.requestId, data.listingPartId);
  });

export const cancelRequestFn = createServerFn({ method: "POST" })
  .validator(z.number().int())
  .handler(async ({ data: id }) => {
    const user = await requireUser();
    await cancelRequest(user.id, id);
    return { ok: true };
  });
