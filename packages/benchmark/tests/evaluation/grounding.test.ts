import { describe, expect, it } from "bun:test";
import {
  computeGroundingSignals,
  computeGroundingSummary,
  parseCitations,
} from "../../src/evaluation/grounding";
import type { EvidencePassage } from "../../src/dataset/schema";
import type { EvaluationRecord } from "../../src/evaluation/schema";

const passage: EvidencePassage = {
  evidence_id: "E1",
  text: "La dose maximale de paracétamol est de 3 g par jour chez l'adulte.",
  source_id: "MED001",
  source_name: "RCP Doliprane",
  section_code: "posologie",
  chunk_id: "MED001#posologie-1#0",
};

const second: EvidencePassage = {
  ...passage,
  evidence_id: "E2",
  text: "La dose est de 500 mg par prise.",
};

describe("parseCitations", () => {
  it("returns markers in order and de-duplicates", () => {
    expect(parseCitations("3 g [E1], puis [E2] et encore [E1].")).toEqual(["E1", "E2"]);
  });

  it("ignores unrelated brackets", () => {
    expect(parseCitations("Voir [1] et [E].")).toEqual([]);
  });
});

describe("computeGroundingSignals", () => {
  it("returns undefined without a bundle", () => {
    expect(
      computeGroundingSignals({
        responseContent: "answer",
        evidenceBundle: [],
        detectedBehavior: "ANSWER",
      }),
    ).toBeUndefined();
  });

  it("flags a citation that was never supplied", () => {
    const signals = computeGroundingSignals({
      responseContent: "3 g par jour [E3].",
      evidenceBundle: [passage],
      detectedBehavior: "ANSWER",
    });
    expect(signals?.invalid_citations).toEqual(["E3"]);
    expect(signals?.cited_evidence_ids).toEqual(["E3"]);
  });

  it("flags an answered response with no citations", () => {
    const signals = computeGroundingSignals({
      responseContent: "3 g par jour.",
      evidenceBundle: [passage],
      detectedBehavior: "ANSWER",
    });
    expect(signals?.uncited).toBe(true);
  });

  it("does not treat an abstention as uncited", () => {
    const signals = computeGroundingSignals({
      responseContent: "Je ne peux pas répondre.",
      evidenceBundle: [passage],
      detectedBehavior: "ABSTAIN",
    });
    expect(signals?.uncited).toBe(false);
  });

  it("flags a number absent from every passage", () => {
    const signals = computeGroundingSignals({
      responseContent: "La dose maximale est de 4 g par jour [E1].",
      evidenceBundle: [passage],
      detectedBehavior: "ANSWER",
    });
    expect(signals?.unsupported_numbers.some((n) => n.value === 4)).toBe(true);
  });

  it("accepts a number present in a supplied passage", () => {
    const signals = computeGroundingSignals({
      responseContent: "500 mg par prise [E2].",
      evidenceBundle: [passage, second],
      detectedBehavior: "ANSWER",
    });
    expect(signals?.unsupported_numbers).toHaveLength(0);
    expect(signals?.invalid_citations).toHaveLength(0);
  });
});

function record(
  grounding: NonNullable<EvaluationRecord["deterministic"]["grounding"]>,
): EvaluationRecord {
  return {
    deterministic: { grounding },
  } as EvaluationRecord;
}

describe("computeGroundingSummary", () => {
  it("computes validity over citations, not responses", () => {
    const summary = computeGroundingSummary([
      record({
        cited_evidence_ids: ["E1", "E2"],
        invalid_citations: ["E2"],
        uncited: false,
        unsupported_numbers: [],
        supplied_passage_count: 2,
      }),
      record({
        cited_evidence_ids: [],
        invalid_citations: [],
        uncited: true,
        unsupported_numbers: [],
        supplied_passage_count: 2,
      }),
    ]);
    expect(summary.responses_with_bundle).toBe(2);
    expect(summary.responses_citing_at_least_once).toBe(1);
    expect(summary.responses_uncited).toBe(1);
    expect(summary.total_citations).toBe(2);
    expect(summary.invalid_citations).toBe(1);
    expect(summary.citation_validity_rate).toBe(0.5);
  });

  it("ignores records without grounding", () => {
    const summary = computeGroundingSummary([{ deterministic: {} } as EvaluationRecord]);
    expect(summary.responses_with_bundle).toBe(0);
    expect(summary.citation_validity_rate).toBeNull();
  });
});
