import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { cancelMatch, closeListing, expireReservations, findCandidates, recordInspection, recordOutcome, reservePart } from "@/server/workflow";

const { areas, users, deviceModels, partTypes, compatibilityRules, deviceListings, listingParts, partRequests, matches, notifications } = schema;

let ids: { donor: number; recipient: number; recipient2: number; tech: number; screenPart: number; batteryPart: number; farScreenPart: number; request: number; request2: number; listing: number };

async function fixture() {
  await db.execute(sql`truncate table notifications, inspections, matches, part_requests, listing_photos, listing_parts, device_listings, compatibility_rules, part_types, device_models, sessions, users, areas restart identity cascade`);
  const [near, far] = await db.insert(areas).values([{ name: "MKU", town: "Thika", lat: -1.0446, lng: 37.0835 }, { name: "Juja", town: "Juja", lat: -1.102, lng: 37.014 }]).returning();
  const [donor, recipient, recipient2, tech] = await db
    .insert(users)
    .values([
      { name: "Donor", email: "d@x", passwordHash: "x", status: "active", areaId: near.id },
      { name: "Recipient", email: "r@x", passwordHash: "x", status: "active", areaId: near.id },
      { name: "Recipient 2", email: "r2@x", passwordHash: "x", status: "active", areaId: near.id },
      { name: "Tech", email: "t@x", passwordHash: "x", role: "technician", status: "active", areaId: near.id },
    ])
    .returning();
  const [model] = await db.insert(deviceModels).values({ brand: "Tecno", modelName: "Spark 10" }).returning();
  const [screen, battery] = await db.insert(partTypes).values([{ name: "Screen" }, { name: "Battery", isBattery: true }]).returning();
  await db.insert(compatibilityRules).values([screen, battery].map((p) => ({ donorModelId: model.id, recipientModelId: model.id, partTypeId: p.id, source: "Same model" })));
  const [listing, farListing] = await db
    .insert(deviceListings)
    .values([
      { donorId: donor.id, modelId: model.id, areaId: near.id, visibleCondition: "Cracked back" },
      { donorId: donor.id, modelId: model.id, areaId: far.id, visibleCondition: "Dead" },
    ])
    .returning();
  const [screenPart, batteryPart, farScreenPart] = await db
    .insert(listingParts)
    .values([
      { listingId: listing.id, partTypeId: screen.id, donorCondition: "working" },
      { listingId: listing.id, partTypeId: battery.id },
      { listingId: farListing.id, partTypeId: screen.id },
    ])
    .returning();
  const [request, request2] = await db
    .insert(partRequests)
    .values([
      { recipientId: recipient.id, modelId: model.id, partTypeId: screen.id, areaId: near.id, problem: "Cracked" },
      { recipientId: recipient2.id, modelId: model.id, partTypeId: screen.id, areaId: near.id, problem: "Cracked too" },
    ])
    .returning();
  ids = { donor: donor.id, recipient: recipient.id, recipient2: recipient2.id, tech: tech.id, screenPart: screenPart.id, batteryPart: batteryPart.id, farScreenPart: farScreenPart.id, request: request.id, request2: request2.id, listing: listing.id };
}

const part = async (id: number) => (await db.select().from(listingParts).where(eq(listingParts.id, id)))[0];
const request = async (id: number) => (await db.select().from(partRequests).where(eq(partRequests.id, id)))[0];
const match = async (id: number) => (await db.select().from(matches).where(eq(matches.id, id)))[0];

beforeEach(fixture);
afterAll(async () => {
  await db.$client.end();
});

describe("reservation", () => {
  it("lists compatible parts nearest first and only for the requested part type", async () => {
    const c = await findCandidates(db, ids.request);
    expect(c.map((x) => x.listingPartId)).toEqual([ids.screenPart, ids.farScreenPart]);
  });

  it("reserves a part, updates statuses, notifies people, and prevents double reservation", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    expect((await part(ids.screenPart)).availability).toBe("reserved");
    expect((await request(ids.request)).status).toBe("reserved");
    expect((await findCandidates(db, ids.request2)).map((x) => x.listingPartId)).toEqual([ids.farScreenPart]);
    await expect(reservePart(ids.recipient2, ids.request2, ids.screenPart)).rejects.toThrow(/no longer available/);
    await expect(reservePart(ids.recipient, ids.request, ids.farScreenPart)).rejects.toThrow(/already has a reserved part/);
    const notes = await db.select().from(notifications).where(eq(notifications.link, `/matches/${m}`));
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set([ids.donor, ids.recipient, ids.tech]));
  });

  it("allows only one winner when two recipients reserve the same part at once", async () => {
    const results = await Promise.allSettled([reservePart(ids.recipient, ids.request, ids.screenPart), reservePart(ids.recipient2, ids.request2, ids.screenPart)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.$count(matches)).toBe(1);
  });

  it("only lets the request owner reserve", async () => {
    await expect(reservePart(ids.recipient2, ids.request, ids.screenPart)).rejects.toThrow(/not found/);
  });

  it("expires stale reservations and releases the part", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    await db.update(matches).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(matches.id, m));
    expect(await expireReservations()).toBe(1);
    expect((await match(m)).status).toBe("expired");
    expect((await part(ids.screenPart)).availability).toBe("available");
    expect((await request(ids.request)).status).toBe("open");
  });

  it("releases the part when cancelled", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    await cancelMatch(ids.recipient, false, m);
    expect((await part(ids.screenPart)).availability).toBe("available");
    expect((await request(ids.request)).status).toBe("open");
  });
});

describe("inspection and outcome", () => {
  it("accepts a fitting part, marks it checked, then records the handover", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    await recordInspection(ids.tech, m, { observedCondition: "Display fine", fit: "fits", decision: "accepted" });
    expect((await part(ids.screenPart)).inspectionStatus).toBe("checked");
    expect((await match(m)).status).toBe("accepted");
    await recordOutcome(ids.recipient, false, m, "completed");
    expect((await part(ids.screenPart)).availability).toBe("handed_over");
    expect((await request(ids.request)).status).toBe("fulfilled");
  });

  it("refuses to accept a part that doesn't fit", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    await expect(recordInspection(ids.tech, m, { observedCondition: "Wrong size", fit: "does_not_fit", decision: "accepted" })).rejects.toThrow();
  });

  it("blocks an unsafe part for good and reopens the request", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    await recordInspection(ids.tech, m, { observedCondition: "Swollen", fit: "fits", decision: "unsafe" });
    expect((await part(ids.screenPart)).inspectionStatus).toBe("blocked_unsafe");
    expect((await match(m)).status).toBe("blocked_unsafe");
    expect((await request(ids.request)).status).toBe("open");
    const c = await findCandidates(db, ids.request);
    expect(c.map((x) => x.listingPartId)).not.toContain(ids.screenPart);
    await expect(reservePart(ids.recipient, ids.request, ids.screenPart)).rejects.toThrow();
  });

  it("a declined part becomes available again", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    await recordInspection(ids.tech, m, { observedCondition: "OK", fit: "fits", decision: "accepted" });
    await recordOutcome(ids.recipient, false, m, "declined");
    expect((await part(ids.screenPart)).availability).toBe("available");
    expect((await part(ids.screenPart)).inspectionStatus).toBe("checked");
  });
});

describe("listing withdrawal", () => {
  it("cancels open reservations and removes parts from matching", async () => {
    const m = await reservePart(ids.recipient, ids.request, ids.screenPart);
    await closeListing(ids.donor, ids.listing, "withdrawn");
    expect((await match(m)).status).toBe("cancelled");
    expect((await request(ids.request)).status).toBe("open");
    expect((await findCandidates(db, ids.request)).map((x) => x.listingPartId)).toEqual([ids.farScreenPart]);
  });
});
