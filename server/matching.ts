export interface Candidate {
  id: string;
  part_name: string;
  brand: string;
  model_name: string;
  donor_condition: string;
  area: string;
  inspection_status: "checked" | "not_inspected";
  donor_name: string;
  donor_area: string;
  rule_source: string;
  safety_status: "unverified" | "cleared" | "rejected" | "unsafe";
  classification_status: "classified" | "unconfigured" | "failed" | null;
  prediction_type: "device_model" | "visible_damage" | null;
  predicted_class: string | null;
  confidence: number | null;
}

export interface RankedCandidate extends Candidate {
  reasons: string[];
}

export function isPartEligibleForMatching(partName: string, safetyStatus: Candidate["safety_status"]): boolean {
  if (safetyStatus === "rejected" || safetyStatus === "unsafe") return false;
  return !/battery/i.test(partName) || safetyStatus === "cleared";
}

export function rankCandidates(candidates: Candidate[], requestArea: string): RankedCandidate[] {
  return candidates
    .map((candidate) => {
      const reasons = [
        `Catalogue rule: ${candidate.rule_source}`,
        candidate.inspection_status === "checked"
          ? "Technician checked (not a warranty)"
          : "Not inspected yet; technician check required",
        candidate.donor_area.toLocaleLowerCase() === requestArea.toLocaleLowerCase()
          ? `Same area: ${candidate.donor_area}`
          : `Different area: ${candidate.donor_area}`,
      ];
      return { ...candidate, reasons };
    })
    .sort((a, b) => {
      const inspectedOrder = Number(a.inspection_status !== "checked") - Number(b.inspection_status !== "checked");
      if (inspectedOrder !== 0) return inspectedOrder;
      const localOrder = Number(a.donor_area.toLocaleLowerCase() !== requestArea.toLocaleLowerCase())
        - Number(b.donor_area.toLocaleLowerCase() !== requestArea.toLocaleLowerCase());
      if (localOrder !== 0) return localOrder;
      return a.id.localeCompare(b.id);
    });
}
