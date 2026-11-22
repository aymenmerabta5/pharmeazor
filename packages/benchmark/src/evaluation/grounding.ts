import type { EvidencePassage } from "../dataset/schema";
import type {
  DetectedBehavior,
  EvaluationRecord,
  GroundingSignals,
  NumberWithUnit,
} from "./schema";
import { extractNumbers } from "./numerical";
import { CITATION_PATTERN } from "../prompts/oracle/v1";

/**
 * Parses `[E1]`-style markers, preserving order and de-duplicating.
 *
 * The marker pattern is defined next to the oracle prompt so the prompt text
 * and the parser cannot drift apart silently.
 */
export function parseCitations(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const id = `E${match[1]}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export interface GroundingInput {
  responseContent: string;
  evidenceBundle: readonly EvidencePassage[];
  detectedBehavior: DetectedBehavior;
}

const ANSWERING_BEHAVIORS: readonly DetectedBehavior[] = ["ANSWER", "LIMITED_ANSWER"];

/**
 * Deterministic grounding signals for the oracle arm.
 *
 * This is not a faithfulness judge. It only checks two mechanical facts:
 * every cited marker exists in the supplied bundle, and every number in the
 * answer appears somewhere in the supplied text. A human reviewer still owns
 * the authoritative citation and faithfulness verdict.
 */
export function computeGroundingSignals(input: GroundingInput): GroundingSignals | undefined {
  if (input.evidenceBundle.length === 0) return undefined;

  const supplied = new Set(input.evidenceBundle.map((passage) => passage.evidence_id));
  const cited = parseCitations(input.responseContent);
  const invalid = cited.filter((id) => !supplied.has(id));

  const evidenceNumbers = input.evidenceBundle.flatMap((passage) => extractNumbers(passage.text));
  const known = new Set(evidenceNumbers.map(numberKey));
  const unsupported = extractNumbers(input.responseContent).filter((n) => !known.has(numberKey(n)));

  return {
    cited_evidence_ids: cited,
    invalid_citations: invalid,
    uncited: cited.length === 0 && ANSWERING_BEHAVIORS.includes(input.detectedBehavior),
    unsupported_numbers: unsupported,
    supplied_passage_count: input.evidenceBundle.length,
  };
}

function numberKey(n: NumberWithUnit): string {
  return `${n.unit.trim().toLowerCase()}:${n.value}`;
}

export interface GroundingSummary {
  responses_with_bundle: number;
  responses_citing_at_least_once: number;
  responses_uncited: number;
  total_citations: number;
  invalid_citations: number;
  citation_validity_rate: number | null;
  responses_with_unsupported_number: number;
  unsupported_numbers_total: number;
}

/**
 * Aggregates the deterministic grounding signals. Denominator is the number of
 * evaluated responses that carried an evidence bundle, never the whole run.
 */
export function computeGroundingSummary(evaluation: readonly EvaluationRecord[]): GroundingSummary {
  let responsesWithBundle = 0;
  let citing = 0;
  let uncited = 0;
  let totalCitations = 0;
  let invalid = 0;
  let withUnsupported = 0;
  let unsupportedTotal = 0;

  for (const record of evaluation) {
    const grounding = record.deterministic.grounding;
    if (!grounding) continue;
    responsesWithBundle += 1;
    if (grounding.cited_evidence_ids.length > 0) citing += 1;
    if (grounding.uncited) uncited += 1;
    totalCitations += grounding.cited_evidence_ids.length;
    invalid += grounding.invalid_citations.length;
    if (grounding.unsupported_numbers.length > 0) withUnsupported += 1;
    unsupportedTotal += grounding.unsupported_numbers.length;
  }

  return {
    responses_with_bundle: responsesWithBundle,
    responses_citing_at_least_once: citing,
    responses_uncited: uncited,
    total_citations: totalCitations,
    invalid_citations: invalid,
    citation_validity_rate:
      totalCitations === 0 ? null : (totalCitations - invalid) / totalCitations,
    responses_with_unsupported_number: withUnsupported,
    unsupported_numbers_total: unsupportedTotal,
  };
}
