import type { Availability, DonorCondition, InspectionStatus, ListingStatus } from "@/lib/types";
import { donorConditionLabel } from "@/lib/types";

export type AreaPoint = { id: number; name: string; lat: number; lng: number };

export type MatchRequest = {
  id: number;
  recipientId: number;
  modelId: number;
  modelLabel: string;
  partTypeId: number;
  area: AreaPoint;
  /** False when an admin has disabled the requested model or part type. */
  catalogueActive?: boolean;
};

export type CandidateInput = {
  listingPartId: number;
  listingId: number;
  donorId: number;
  listingStatus: ListingStatus;
  modelId: number;
  modelLabel: string;
  modelActive: boolean;
  partTypeId: number;
  partName: string;
  partActive: boolean;
  donorCondition: DonorCondition;
  inspectionStatus: InspectionStatus;
  availability: Availability;
  checkedAt: Date | null;
  photoCount: number;
  area: AreaPoint;
  rule: { id: number; active: boolean; source: string; donorModelId: number; recipientModelId: number; partTypeId: number } | null;
};

export type RankedCandidate = CandidateInput & {
  ruleId: number;
  distanceKm: number;
  reasons: string[];
  unverified: string[];
};

export function distanceKm(a: Pick<AreaPoint, "lat" | "lng">, b: Pick<AreaPoint, "lat" | "lng">) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Returns why a candidate must not be suggested, or null when it is eligible. */
export function exclusionReason(c: CandidateInput, req: MatchRequest): string | null {
  if (req.catalogueActive === false) return "requested model or part is no longer supported";
  if (c.donorId === req.recipientId) return "own listing";
  if (c.listingStatus !== "active") return `listing ${c.listingStatus}`;
  if (c.availability !== "available") return `part ${c.availability}`;
  if (c.inspectionStatus === "blocked_unsafe") return "blocked as unsafe";
  if (c.inspectionStatus === "rejected") return "rejected by a technician";
  if (!c.partActive || !c.modelActive) return "not in the supported catalogue";
  if (c.partTypeId !== req.partTypeId) return "different part type";
  const r = c.rule;
  if (!r || !r.active) return "no active catalogue rule";
  if (r.donorModelId !== c.modelId || r.recipientModelId !== req.modelId || r.partTypeId !== req.partTypeId) {
    return "catalogue rule does not cover this pair";
  }
  return null;
}

const inspectionRank: Record<InspectionStatus, number> = { checked: 0, not_inspected: 1, rejected: 9, blocked_unsafe: 9 };

const fmtDate = (d: Date) => d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

export function explain(c: CandidateInput, req: MatchRequest, km: number) {
  const reasons: string[] = [];
  const unverified: string[] = [];
  const rule = c.rule!;
  reasons.push(
    c.modelId === req.modelId
      ? `Same model as your phone (${req.modelLabel}) — catalogue rule #${rule.id}, source: ${rule.source}`
      : `Catalogue rule #${rule.id} says a ${c.modelLabel} ${c.partName.toLowerCase()} fits a ${req.modelLabel} — source: ${rule.source}`,
  );
  if (c.inspectionStatus === "checked") {
    reasons.push(
      `Technician-checked${c.checkedAt ? ` on ${fmtDate(c.checkedAt)}` : ""} — condition and fit were recorded (not a warranty)`,
    );
  } else {
    unverified.push("Not inspected yet — only the donor's description is known");
  }
  reasons.push(
    c.area.id === req.area.id ? `Same area as you (${c.area.name})` : `About ${km.toFixed(1)} km away (${c.area.name} → ${req.area.name}, area centres)`,
  );
  unverified.push(`Donor says: ${donorConditionLabel[c.donorCondition].toLowerCase()}`);
  if (c.photoCount === 0) unverified.push("No photos uploaded");
  unverified.push("Internal condition can only be confirmed by a technician");
  return { reasons, unverified };
}

/** Filters out ineligible candidates and ranks the rest: technician-checked first, then nearest. */
export function rankCandidates(cands: CandidateInput[], req: MatchRequest): RankedCandidate[] {
  return cands
    .filter((c) => exclusionReason(c, req) === null)
    .map((c) => {
      const km = distanceKm(c.area, req.area);
      return { ...c, ruleId: c.rule!.id, distanceKm: Math.round(km * 10) / 10, ...explain(c, req, km) };
    })
    .sort(
      (a, b) =>
        inspectionRank[a.inspectionStatus] - inspectionRank[b.inspectionStatus] ||
        a.distanceKm - b.distanceKm ||
        a.listingPartId - b.listingPartId,
    );
}
