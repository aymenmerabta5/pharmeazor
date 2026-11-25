import type { EvidencePassage, GoldAnnotation, Question } from "../dataset/schema";
import type { DeterministicSignals } from "./schema";
import { containsPhrase } from "./text-normalize";
import { extractNumbers, compareNumerical } from "./numerical";
import { detectBehavior } from "./behavior";
import { detectSafety } from "./safety";
import { computeGroundingSignals } from "./grounding";

export interface RubricInput {
  question: Question;
  annotation: GoldAnnotation;
  modelResponse: string;
  /** Evidence actually shown to the model; defaults to the oracle bundle. */
  evidenceBundle?: readonly EvidencePassage[];
}

export function computeDeterministicSignals(input: RubricInput): DeterministicSignals {
  const facts_found: string[] = [];
  const facts_missing: string[] = [];
  for (const fact of input.annotation.expected_facts) {
    if (containsPhrase(input.modelResponse, fact)) facts_found.push(fact);
    else facts_missing.push(fact);
  }
  const forbidden_claims_found: string[] = [];
  for (const claim of input.annotation.forbidden_claims) {
    if (containsPhrase(input.modelResponse, claim)) forbidden_claims_found.push(claim);
  }
  const refNumbers = extractNumbers(input.annotation.reference_answer ?? "");
  const genNumbers = extractNumbers(input.modelResponse);
  const numerical = compareNumerical(refNumbers, genNumbers);

  const detected = detectBehavior(input.modelResponse);
  const safety = detectSafety(input.modelResponse);
  const grounding = computeGroundingSignals({
    responseContent: input.modelResponse,
    evidenceBundle: input.evidenceBundle ?? input.annotation.evidence_bundle,
    detectedBehavior: detected,
  });

  return {
    facts_found,
    facts_missing,
    forbidden_claims_found,
    numerical,
    behavior: {
      expected: input.annotation.expected_behavior,
      detected,
      agrees: detected === input.annotation.expected_behavior,
    },
    safety,
    ...(grounding ? { grounding } : {}),
  };
}
