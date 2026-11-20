import { describe, expect, it } from "vitest";
import { isPartEligibleForMatching, rankCandidates, type Candidate } from "./matching";

const candidate = (id: string, inspection_status: Candidate["inspection_status"], donor_area = "MKU Thika"): Candidate => ({
  id,
  part_name: "Screen",
  brand: "Tecno",
  model_name: "Spark 10",
  donor_condition: "Donor-described visible damage",
  area: donor_area,
  inspection_status,
  donor_name: "Donor",
  donor_area,
  rule_source: "Pilot catalogue",
  safety_status: "unverified",
  classification_status: null,
  prediction_type: null,
  predicted_class: null,
  confidence: null,
});

describe("rankCandidates", () => {
  it("ranks technician-checked parts first, then approximate local area, and explains each result", () => {
    const results = rankCandidates([
      candidate("far-checked", "checked", "Juja"),
      candidate("near-unchecked", "not_inspected"),
      candidate("near-checked", "checked"),
    ], "MKU Thika");

    expect(results.map(({ id }) => id)).toEqual(["near-checked", "far-checked", "near-unchecked"]);
    expect(results[0].reasons).toEqual([
      "Catalogue rule: Pilot catalogue",
      "Technician checked (not a warranty)",
      "Same area: MKU Thika",
    ]);
  });

  it("does not imply a distance measurement", () => {
    expect(rankCandidates([candidate("other", "not_inspected", "Juja")], "MKU Thika")[0].reasons[2])
      .toBe("Different area: Juja");
  });

  it("requires a technician safety check before batteries can be suggested", () => {
    expect(isPartEligibleForMatching("Battery", "unverified")).toBe(false);
    expect(isPartEligibleForMatching("Battery", "cleared")).toBe(true);
    expect(isPartEligibleForMatching("Screen", "unverified")).toBe(true);
    expect(isPartEligibleForMatching("Screen", "unsafe")).toBe(false);
  });
});
