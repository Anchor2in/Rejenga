import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { db, schema, type Executor } from "./db";
import { config } from "./config";
import { rankCandidates, type CandidateInput, type MatchRequest, type RankedCandidate } from "./matching";

const { areas, compatibilityRules, deviceListings, deviceModels, listingParts, listingPhotos, matches, partRequests, partTypes, users, notifications, inspections } = schema;

export class WorkflowError extends Error {}

const modelLabel = sql<string>`${deviceModels.brand} || ' ' || ${deviceModels.modelName}`;

export async function notify(ex: Executor, userIds: number | number[], message: string, link?: string) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
  if (ids.length === 0) return;
  await ex.insert(notifications).values(ids.map((userId) => ({ userId, message, link })));
}

async function activeTechnicianIds(ex: Executor) {
  const rows = await ex
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "technician"), eq(users.status, "active")));
  return rows.map((r) => r.id);
}

export async function loadMatchRequest(ex: Executor, requestId: number): Promise<(MatchRequest & { status: string; partName: string }) | null> {
  const [r] = await ex
    .select({
      id: partRequests.id,
      recipientId: partRequests.recipientId,
      modelId: partRequests.modelId,
      modelLabel,
      partTypeId: partRequests.partTypeId,
      partName: partTypes.name,
      status: partRequests.status,
      area: { id: areas.id, name: areas.name, lat: areas.lat, lng: areas.lng },
    })
    .from(partRequests)
    .innerJoin(deviceModels, eq(deviceModels.id, partRequests.modelId))
    .innerJoin(partTypes, eq(partTypes.id, partRequests.partTypeId))
    .innerJoin(areas, eq(areas.id, partRequests.areaId))
    .where(eq(partRequests.id, requestId));
  return r ?? null;
}

/** All listed parts of the requested type, with the catalogue rule (if any) linking them to the request's model. */
export async function loadCandidateInputs(ex: Executor, req: MatchRequest): Promise<CandidateInput[]> {
  const photoCount = ex
    .select({ listingId: listingPhotos.listingId, n: sql<number>`count(*)::int`.as("n") })
    .from(listingPhotos)
    .groupBy(listingPhotos.listingId)
    .as("photo_count");
  const rows = await ex
    .select({
      listingPartId: listingParts.id,
      listingId: deviceListings.id,
      donorId: deviceListings.donorId,
      listingStatus: deviceListings.status,
      modelId: deviceModels.id,
      modelLabel,
      modelActive: deviceModels.active,
      partTypeId: partTypes.id,
      partName: partTypes.name,
      partActive: partTypes.active,
      donorCondition: listingParts.donorCondition,
      inspectionStatus: listingParts.inspectionStatus,
      availability: listingParts.availability,
      checkedAt: listingParts.checkedAt,
      photoCount: sql<number>`coalesce(${photoCount.n}, 0)`,
      area: { id: areas.id, name: areas.name, lat: areas.lat, lng: areas.lng },
      ruleId: compatibilityRules.id,
      ruleActive: compatibilityRules.active,
      ruleSource: compatibilityRules.source,
      ruleDonorModelId: compatibilityRules.donorModelId,
      ruleRecipientModelId: compatibilityRules.recipientModelId,
      rulePartTypeId: compatibilityRules.partTypeId,
    })
    .from(listingParts)
    .innerJoin(deviceListings, eq(deviceListings.id, listingParts.listingId))
    .innerJoin(deviceModels, eq(deviceModels.id, deviceListings.modelId))
    .innerJoin(partTypes, eq(partTypes.id, listingParts.partTypeId))
    .innerJoin(areas, eq(areas.id, deviceListings.areaId))
    .leftJoin(photoCount, eq(photoCount.listingId, deviceListings.id))
    .leftJoin(
      compatibilityRules,
      and(
        eq(compatibilityRules.donorModelId, deviceListings.modelId),
        eq(compatibilityRules.recipientModelId, req.modelId),
        eq(compatibilityRules.partTypeId, listingParts.partTypeId),
      ),
    )
    .where(eq(listingParts.partTypeId, req.partTypeId));
  return rows.map(({ ruleId, ruleActive, ruleSource, ruleDonorModelId, ruleRecipientModelId, rulePartTypeId, ...c }) => ({
    ...c,
    photoCount: Number(c.photoCount),
    rule:
      ruleId === null
        ? null
        : {
            id: ruleId,
            active: ruleActive!,
            source: ruleSource!,
            donorModelId: ruleDonorModelId!,
            recipientModelId: ruleRecipientModelId!,
            partTypeId: rulePartTypeId!,
          },
  }));
}

export async function findCandidates(ex: Executor, requestId: number): Promise<RankedCandidate[]> {
  const req = await loadMatchRequest(ex, requestId);
  if (!req) return [];
  return rankCandidates(await loadCandidateInputs(ex, req), req);
}

async function releasePart(ex: Executor, listingPartId: number) {
  await ex
    .update(listingParts)
    .set({ availability: "available" })
    .where(
      and(
        eq(listingParts.id, listingPartId),
        eq(listingParts.availability, "reserved"),
        inArray(listingParts.inspectionStatus, ["not_inspected", "checked"]),
      ),
    );
}

async function reopenRequest(ex: Executor, requestId: number) {
  await ex
    .update(partRequests)
    .set({ status: "open" })
    .where(and(eq(partRequests.id, requestId), eq(partRequests.status, "reserved")));
}

type MatchParties = { id: number; status: string; listingPartId: number; requestId: number; donorId: number; recipientId: number; partName: string; modelLabel: string };

async function lockMatch(ex: Executor, matchId: number): Promise<MatchParties> {
  const [m] = await ex
    .select({
      id: matches.id,
      status: matches.status,
      listingPartId: matches.listingPartId,
      requestId: matches.requestId,
      donorId: deviceListings.donorId,
      recipientId: partRequests.recipientId,
      partName: partTypes.name,
      modelLabel,
    })
    .from(matches)
    .innerJoin(listingParts, eq(listingParts.id, matches.listingPartId))
    .innerJoin(deviceListings, eq(deviceListings.id, listingParts.listingId))
    .innerJoin(deviceModels, eq(deviceModels.id, deviceListings.modelId))
    .innerJoin(partTypes, eq(partTypes.id, listingParts.partTypeId))
    .innerJoin(partRequests, eq(partRequests.id, matches.requestId))
    .where(eq(matches.id, matchId))
    .for("update", { of: matches });
  if (!m) throw new WorkflowError("Match not found.");
  return m;
}

/** Expires reservations past their deadline and releases safe parts. Called lazily before reads/writes. */
export async function expireReservations() {
  const stale = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(inArray(matches.status, ["reserved", "accepted"]), lt(matches.expiresAt, new Date())));
  for (const { id } of stale) {
    await db.transaction(async (tx) => {
      const m = await lockMatch(tx, id);
      if (m.status !== "reserved" && m.status !== "accepted") return;
      await tx.update(matches).set({ status: "expired", closedAt: new Date() }).where(eq(matches.id, id));
      await releasePart(tx, m.listingPartId);
      await reopenRequest(tx, m.requestId);
      await notify(tx, [m.donorId, m.recipientId], `The reservation for the ${m.modelLabel} ${m.partName.toLowerCase()} expired and the part was released.`, `/matches/${id}`);
    });
  }
  return stale.length;
}

export async function reservePart(userId: number, requestId: number, listingPartId: number) {
  await expireReservations();
  return db.transaction(async (tx) => {
    const [reqRow] = await tx
      .select({ id: partRequests.id, recipientId: partRequests.recipientId, status: partRequests.status })
      .from(partRequests)
      .where(eq(partRequests.id, requestId))
      .for("update");
    if (!reqRow || reqRow.recipientId !== userId) throw new WorkflowError("Request not found.");
    if (reqRow.status !== "open") throw new WorkflowError("This request already has a reserved part or is closed.");

    const candidate = (await findCandidates(tx, requestId)).find((c) => c.listingPartId === listingPartId);
    if (!candidate) throw new WorkflowError("That part is no longer available or no longer matches your request. Refresh the list.");

    const updated = await tx
      .update(listingParts)
      .set({ availability: "reserved" })
      .where(and(eq(listingParts.id, listingPartId), eq(listingParts.availability, "available")))
      .returning({ id: listingParts.id });
    if (updated.length === 0) throw new WorkflowError("Someone else just reserved that part. Refresh the list.");

    const [match] = await tx
      .insert(matches)
      .values({
        listingPartId,
        requestId,
        ruleId: candidate.ruleId,
        status: "reserved",
        reason: [...candidate.reasons, ...candidate.unverified.map((u) => `Unverified: ${u}`)].join("\n"),
        distanceKm: candidate.distanceKm,
        inspectionStatusAtMatch: candidate.inspectionStatus,
        expiresAt: new Date(Date.now() + config.reservationDays * 86_400_000),
      })
      .returning({ id: matches.id });
    await tx.update(partRequests).set({ status: "reserved" }).where(eq(partRequests.id, requestId));

    const what = `${candidate.modelLabel} ${candidate.partName.toLowerCase()}`;
    await notify(tx, candidate.donorId, `Your ${what} was reserved. A technician needs to check it before handover.`, `/matches/${match.id}`);
    await notify(tx, userId, `You reserved a ${what}. Take it to a technician for a check.`, `/matches/${match.id}`);
    await notify(tx, await activeTechnicianIds(tx), `A reserved ${what} is waiting for inspection.`, `/matches/${match.id}`);
    return match.id;
  });
}

export type InspectionInput = {
  observedCondition: string;
  fit: "fits" | "does_not_fit" | "uncertain";
  decision: "accepted" | "rejected" | "unsafe";
  notes?: string;
};

export async function recordInspection(technicianId: number, matchId: number, input: InspectionInput) {
  if (input.decision === "accepted" && input.fit !== "fits") {
    throw new WorkflowError("A part can only be accepted when you recorded that it fits.");
  }
  await expireReservations();
  return db.transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (m.status !== "reserved") throw new WorkflowError("Only reserved parts waiting for a check can be inspected.");
    if (m.donorId === technicianId || m.recipientId === technicianId) {
      throw new WorkflowError("You can't inspect a part you are giving or receiving. Ask another technician.");
    }
    const now = new Date();
    await tx.insert(inspections).values({ matchId, technicianId, inspectedAt: now, ...input });
    const what = `${m.modelLabel} ${m.partName.toLowerCase()}`;
    if (input.decision === "accepted") {
      await tx
        .update(matches)
        .set({ status: "accepted", expiresAt: new Date(now.getTime() + config.reservationDays * 86_400_000) })
        .where(eq(matches.id, matchId));
      await tx.update(listingParts).set({ inspectionStatus: "checked", checkedAt: now }).where(eq(listingParts.id, m.listingPartId));
      await notify(tx, [m.donorId, m.recipientId], `A technician accepted the ${what}. Arrange the handover and record the outcome.`, `/matches/${matchId}`);
    } else {
      const unsafe = input.decision === "unsafe";
      await tx
        .update(matches)
        .set({ status: unsafe ? "blocked_unsafe" : "rejected", closedAt: now })
        .where(eq(matches.id, matchId));
      await tx
        .update(listingParts)
        .set({ inspectionStatus: unsafe ? "blocked_unsafe" : "rejected", availability: "withdrawn", checkedAt: now })
        .where(eq(listingParts.id, m.listingPartId));
      await reopenRequest(tx, m.requestId);
      await notify(
        tx,
        [m.donorId, m.recipientId],
        unsafe
          ? `A technician blocked the ${what} as unsafe. It will not be suggested again — see the safety guidance.`
          : `A technician rejected the ${what}. Your request is open again.`,
        unsafe ? "/safety" : `/matches/${matchId}`,
      );
    }
  });
}

export async function recordOutcome(userId: number, isAdmin: boolean, matchId: number, outcome: "completed" | "declined", note?: string) {
  await expireReservations();
  return db.transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (!isAdmin && userId !== m.donorId && userId !== m.recipientId) throw new WorkflowError("Match not found.");
    if (!isAdmin && userId !== m.recipientId) throw new WorkflowError("Only the recipient records whether the handover happened.");
    if (m.status !== "accepted") throw new WorkflowError("An outcome can only be recorded after a technician accepted the part.");
    await tx
      .update(matches)
      .set({ status: outcome, closedAt: new Date(), closedById: userId, outcomeNote: note || null })
      .where(eq(matches.id, matchId));
    const what = `${m.modelLabel} ${m.partName.toLowerCase()}`;
    if (outcome === "completed") {
      await tx.update(listingParts).set({ availability: "handed_over" }).where(eq(listingParts.id, m.listingPartId));
      await tx.update(partRequests).set({ status: "fulfilled" }).where(eq(partRequests.id, m.requestId));
      await notify(tx, [m.donorId, m.recipientId], `The handover of the ${what} was recorded as completed. Thank you!`, `/matches/${matchId}`);
    } else {
      await releasePart(tx, m.listingPartId);
      await reopenRequest(tx, m.requestId);
      await notify(tx, [m.donorId, m.recipientId], `The ${what} was declined after the check. The part is available again.`, `/matches/${matchId}`);
    }
  });
}

export async function cancelMatch(userId: number, isAdmin: boolean, matchId: number, note?: string) {
  return db.transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (!isAdmin && userId !== m.donorId && userId !== m.recipientId) throw new WorkflowError("Match not found.");
    if (m.status !== "reserved" && m.status !== "accepted") throw new WorkflowError("This match is already closed.");
    await tx
      .update(matches)
      .set({ status: "cancelled", closedAt: new Date(), closedById: userId, outcomeNote: note || null })
      .where(eq(matches.id, matchId));
    await releasePart(tx, m.listingPartId);
    await reopenRequest(tx, m.requestId);
    await notify(tx, [m.donorId, m.recipientId].filter((id) => id !== userId), `The reservation for the ${m.modelLabel} ${m.partName.toLowerCase()} was cancelled.`, `/matches/${matchId}`);
  });
}

async function cancelOpenMatchesWhere(tx: Executor, matchIds: number[], userId: number, note: string) {
  for (const id of matchIds) {
    const m = await lockMatch(tx, id);
    if (m.status !== "reserved" && m.status !== "accepted") continue;
    await tx.update(matches).set({ status: "cancelled", closedAt: new Date(), closedById: userId, outcomeNote: note }).where(eq(matches.id, id));
    await reopenRequest(tx, m.requestId);
    await notify(tx, [m.donorId, m.recipientId].filter((x) => x !== userId), `The reservation for the ${m.modelLabel} ${m.partName.toLowerCase()} was cancelled: ${note}`, `/matches/${id}`);
  }
}

/** Donor withdrawal or admin removal: takes the listing and all its free or reserved parts out of matching. */
export async function closeListing(userId: number, listingId: number, status: "withdrawn" | "removed", reason?: string) {
  return db.transaction(async (tx) => {
    const open = await tx
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(listingParts, eq(listingParts.id, matches.listingPartId))
      .where(and(eq(listingParts.listingId, listingId), inArray(matches.status, ["reserved", "accepted"])));
    await cancelOpenMatchesWhere(tx, open.map((o) => o.id), userId, status === "removed" ? "the listing was removed by an administrator" : "the donor withdrew the listing");
    await tx
      .update(listingParts)
      .set({ availability: "withdrawn" })
      .where(and(eq(listingParts.listingId, listingId), inArray(listingParts.availability, ["available", "reserved"])));
    await tx.update(deviceListings).set({ status, removedReason: reason || null }).where(eq(deviceListings.id, listingId));
  });
}

export async function cancelRequest(userId: number, requestId: number) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(partRequests).where(eq(partRequests.id, requestId)).for("update");
    if (!r || r.recipientId !== userId) throw new WorkflowError("Request not found.");
    if (r.status === "fulfilled" || r.status === "cancelled") throw new WorkflowError("This request is already closed.");
    const open = await tx
      .select({ id: matches.id, listingPartId: matches.listingPartId })
      .from(matches)
      .where(and(eq(matches.requestId, requestId), inArray(matches.status, ["reserved", "accepted"])));
    await cancelOpenMatchesWhere(tx, open.map((o) => o.id), userId, "the recipient cancelled the request");
    for (const o of open) await releasePart(tx, o.listingPartId);
    await tx.update(partRequests).set({ status: "cancelled" }).where(eq(partRequests.id, requestId));
  });
}

/** Tells recipients with open requests (and the donor) when a new listing has a part that matches. */
export async function notifyMatchesForListing(listingId: number) {
  const [listing] = await db
    .select({ donorId: deviceListings.donorId, modelId: deviceListings.modelId, modelLabel })
    .from(deviceListings)
    .innerJoin(deviceModels, eq(deviceModels.id, deviceListings.modelId))
    .where(eq(deviceListings.id, listingId));
  if (!listing) return;
  const partIds = (await db.select({ id: listingParts.id }).from(listingParts).where(eq(listingParts.listingId, listingId))).map((p) => p.id);
  const openRequests = await db
    .selectDistinct({ id: partRequests.id })
    .from(partRequests)
    .innerJoin(listingParts, and(eq(listingParts.listingId, listingId), eq(listingParts.partTypeId, partRequests.partTypeId)))
    .innerJoin(
      compatibilityRules,
      and(
        eq(compatibilityRules.donorModelId, listing.modelId),
        eq(compatibilityRules.recipientModelId, partRequests.modelId),
        eq(compatibilityRules.partTypeId, partRequests.partTypeId),
        eq(compatibilityRules.active, true),
      ),
    )
    .where(eq(partRequests.status, "open"));
  let donorTold = false;
  for (const { id } of openRequests) {
    const req = await loadMatchRequest(db, id);
    const hit = (await findCandidates(db, id)).find((c) => partIds.includes(c.listingPartId));
    if (!req || !hit) continue;
    await notify(db, req.recipientId, `A possible ${req.partName.toLowerCase()} for your ${req.modelLabel} was listed in ${hit.area.name}.`, `/requests/${id}`);
    if (!donorTold) {
      await notify(db, listing.donorId, `Someone is already looking for a part your ${listing.modelLabel} listing may have.`, `/listings/${listingId}`);
      donorTold = true;
    }
  }
}

/** Tells donors whose listed parts match a newly created request. */
export async function notifyMatchesForRequest(requestId: number) {
  const req = await loadMatchRequest(db, requestId);
  if (!req) return 0;
  const found = await findCandidates(db, requestId);
  const donors = [...new Set(found.map((c) => c.donorId))];
  await notify(db, donors, `Someone near ${req.area.name} needs a ${req.partName.toLowerCase()} for a ${req.modelLabel}. A part you listed may fit.`, "/listings");
  return found.length;
}
