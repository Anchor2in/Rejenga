import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/auth";
import { cancelMatch, expireReservations, recordInspection, recordOutcome } from "@/server/workflow";
import { loadPhotos } from "@/server/photos";

const { matches, listingParts, deviceListings, partRequests, deviceModels, partTypes, areas, users, inspections, compatibilityRules } = schema;

function matchQuery() {
  const donorModel = alias(deviceModels, "donor_model");
  const recipientModel = alias(deviceModels, "recipient_model");
  const donor = alias(users, "donor");
  const recipient = alias(users, "recipient");
  const donorArea = alias(areas, "donor_area");
  const recipientArea = alias(areas, "recipient_area");
  return db
    .select({
      id: matches.id,
      status: matches.status,
      reason: matches.reason,
      distanceKm: matches.distanceKm,
      inspectionStatusAtMatch: matches.inspectionStatusAtMatch,
      reservedAt: matches.reservedAt,
      expiresAt: matches.expiresAt,
      closedAt: matches.closedAt,
      outcomeNote: matches.outcomeNote,
      listingId: deviceListings.id,
      listingPartId: listingParts.id,
      requestId: partRequests.id,
      partName: partTypes.name,
      isBattery: partTypes.isBattery,
      donorCondition: listingParts.donorCondition,
      donorNotes: listingParts.donorNotes,
      visibleCondition: deviceListings.visibleCondition,
      inspectionStatus: listingParts.inspectionStatus,
      donorModel: sql<string>`${donorModel.brand} || ' ' || ${donorModel.modelName}`,
      recipientModel: sql<string>`${recipientModel.brand} || ' ' || ${recipientModel.modelName}`,
      problem: partRequests.problem,
      donorId: donor.id,
      donorName: donor.name,
      donorPhone: donor.phone,
      donorArea: donorArea.name,
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientPhone: recipient.phone,
      recipientArea: recipientArea.name,
      ruleSource: compatibilityRules.source,
    })
    .from(matches)
    .innerJoin(listingParts, eq(listingParts.id, matches.listingPartId))
    .innerJoin(deviceListings, eq(deviceListings.id, listingParts.listingId))
    .innerJoin(partTypes, eq(partTypes.id, listingParts.partTypeId))
    .innerJoin(donorModel, eq(donorModel.id, deviceListings.modelId))
    .innerJoin(partRequests, eq(partRequests.id, matches.requestId))
    .innerJoin(recipientModel, eq(recipientModel.id, partRequests.modelId))
    .innerJoin(donor, eq(donor.id, deviceListings.donorId))
    .innerJoin(recipient, eq(recipient.id, partRequests.recipientId))
    .innerJoin(donorArea, eq(donorArea.id, deviceListings.areaId))
    .innerJoin(recipientArea, eq(recipientArea.id, partRequests.areaId))
    .innerJoin(compatibilityRules, eq(compatibilityRules.id, matches.ruleId))
    .$dynamic();
}

export const getMatchFn = createServerFn({ method: "GET" })
  .validator(z.number().int())
  .handler(async ({ data: id }) => {
    const user = await requireUser();
    await expireReservations();
    const [m] = await matchQuery().where(eq(matches.id, id));
    const isParty = m && (m.donorId === user.id || m.recipientId === user.id);
    if (!m || (!isParty && user.role === "community")) throw new Error("Match not found.");
    const technician = alias(users, "technician");
    const [inspection] = await db
      .select({
        inspectedAt: inspections.inspectedAt,
        observedCondition: inspections.observedCondition,
        fit: inspections.fit,
        decision: inspections.decision,
        notes: inspections.notes,
        technicianName: technician.name,
      })
      .from(inspections)
      .innerJoin(technician, eq(technician.id, inspections.technicianId))
      .where(eq(inspections.matchId, id));
    const open = m.status === "reserved" || m.status === "accepted";
    // Contact details are shared only between the two parties while the match is open.
    const showContacts = open && (isParty || user.role !== "community");
    return {
      match: {
        ...m,
        donorPhone: showContacts ? m.donorPhone : null,
        recipientPhone: showContacts ? m.recipientPhone : null,
      },
      inspection: inspection ?? null,
      photos: await loadPhotos(m.listingId),
      viewer: {
        isDonor: m.donorId === user.id,
        isRecipient: m.recipientId === user.id,
        canInspect: (user.role === "technician" || user.role === "admin") && m.status === "reserved",
        canRecordOutcome: (m.recipientId === user.id || user.role === "admin") && m.status === "accepted",
        canCancel: open && (isParty || user.role === "admin"),
      },
    };
  });

export const getMyMatchesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  await expireReservations();
  const rows = await matchQuery()
    .where(or(eq(deviceListings.donorId, user.id), eq(partRequests.recipientId, user.id)))
    .orderBy(desc(matches.reservedAt));
  return rows.map((m) => {
    const open = m.status === "reserved" || m.status === "accepted";
    return { ...m, donorPhone: open ? m.donorPhone : null, recipientPhone: open ? m.recipientPhone : null };
  });
});

export const getInspectionQueueFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(["technician"]);
  await expireReservations();
  const waiting = await matchQuery().where(eq(matches.status, "reserved")).orderBy(asc(matches.reservedAt));
  const technician = alias(users, "technician");
  const recent = await db
    .select({ matchId: inspections.matchId, decision: inspections.decision, fit: inspections.fit, inspectedAt: inspections.inspectedAt, technicianName: technician.name })
    .from(inspections)
    .innerJoin(technician, eq(technician.id, inspections.technicianId))
    .where(user.role === "admin" ? undefined : eq(inspections.technicianId, user.id))
    .orderBy(desc(inspections.inspectedAt))
    .limit(30);
  const recentMatches = recent.length ? await matchQuery().where(inArray(matches.id, recent.map((r) => r.matchId))) : [];
  return { waiting, recent: recent.map((r) => ({ ...r, match: recentMatches.find((m) => m.id === r.matchId)! })) };
});

export const inspectFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      matchId: z.number().int(),
      observedCondition: z.string().trim().min(5, "Record what you observed on the bench").max(1000),
      fit: z.enum(["fits", "does_not_fit", "uncertain"]),
      decision: z.enum(["accepted", "rejected", "unsafe"]),
      notes: z.string().trim().max(1000).optional(),
    }),
  )
  .handler(async ({ data: { matchId, ...input } }) => {
    const user = await requireUser(["technician"]);
    await recordInspection(user.id, matchId, input);
    return { ok: true };
  });

export const outcomeFn = createServerFn({ method: "POST" })
  .validator(z.object({ matchId: z.number().int(), outcome: z.enum(["completed", "declined"]), note: z.string().trim().max(500).optional() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await recordOutcome(user.id, user.role === "admin", data.matchId, data.outcome, data.note);
    return { ok: true };
  });

export const cancelMatchFn = createServerFn({ method: "POST" })
  .validator(z.object({ matchId: z.number().int(), note: z.string().trim().max(500).optional() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await cancelMatch(user.id, user.role === "admin", data.matchId, data.note);
    return { ok: true };
  });

