import { describe, expect, it } from "vitest";
import { distanceKm, exclusionReason, rankCandidates, type CandidateInput, type MatchRequest } from "@/server/matching";

const mku = { id: 1, name: "MKU Main Campus", lat: -1.0446, lng: 37.0835 };
const juja = { id: 2, name: "Juja", lat: -1.102, lng: 37.014 };
const req: MatchRequest = { id: 1, recipientId: 9, modelId: 1, modelLabel: "Tecno Spark 10", partTypeId: 1, area: mku };
const rule = { id: 1, active: true, source: "Same model (default rule)", donorModelId: 1, recipientModelId: 1, partTypeId: 1 };

const cand = (o: Partial<CandidateInput> = {}): CandidateInput => ({
  listingPartId: 1,
  listingId: 1,
  donorId: 2,
  listingStatus: "active",
  modelId: 1,
  modelLabel: "Tecno Spark 10",
  modelActive: true,
  partTypeId: 1,
  partName: "Screen",
  partActive: true,
  donorCondition: "working",
  inspectionStatus: "not_inspected",
  availability: "available",
  checkedAt: null,
  photoCount: 0,
  area: mku,
  rule,
  ...o,
});

describe("distanceKm", () => {
  it("is zero for the same point and roughly 10 km from MKU to Juja", () => {
    expect(distanceKm(mku, mku)).toBe(0);
    expect(distanceKm(mku, juja)).toBeGreaterThan(8);
    expect(distanceKm(mku, juja)).toBeLessThan(12);
  });
});

describe("exclusionReason", () => {
  it.each([
    ["own listing", { donorId: 9 }],
    ["withdrawn listing", { listingStatus: "withdrawn" as const }],
    ["removed listing", { listingStatus: "removed" as const }],
    ["reserved part", { availability: "reserved" as const }],
    ["handed-over part", { availability: "handed_over" as const }],
    ["rejected part", { inspectionStatus: "rejected" as const }],
    ["unsafe part", { inspectionStatus: "blocked_unsafe" as const }],
    ["no rule", { rule: null }],
    ["inactive rule", { rule: { ...rule, active: false } }],
    ["inactive model", { modelActive: false }],
  ])("excludes %s", (_, o) => {
    expect(exclusionReason(cand(o), req)).not.toBeNull();
  });

  it("excludes everything when the requested model was disabled", () => {
    expect(exclusionReason(cand(), { ...req, catalogueActive: false })).not.toBeNull();
  });

  it("keeps an available, compatible part", () => {
    expect(exclusionReason(cand(), req)).toBeNull();
  });
});

describe("rankCandidates", () => {
  it("ranks checked parts ahead of nearer uninspected parts, then by distance", () => {
    const ranked = rankCandidates(
      [
        cand({ listingPartId: 1, area: mku }),
        cand({ listingPartId: 2, area: juja, inspectionStatus: "checked", checkedAt: new Date() }),
        cand({ listingPartId: 3, area: juja }),
        cand({ listingPartId: 4, inspectionStatus: "blocked_unsafe" }),
      ],
      req,
    );
    expect(ranked.map((r) => r.listingPartId)).toEqual([2, 1, 3]);
  });

  it("explains each match and keeps donor claims separate as unverified", () => {
    const [r] = rankCandidates([cand()], req);
    expect(r.reasons.join(" ")).toMatch(/Same model/);
    expect(r.unverified.length).toBeGreaterThan(0);
    expect(r.reasons.join(" ")).not.toMatch(/Worked when last used/);
  });
});
