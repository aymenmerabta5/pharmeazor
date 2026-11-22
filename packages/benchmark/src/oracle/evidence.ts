import type { EvidencePassage } from "../dataset/schema";
import { loadGoldAnnotationsFromFile } from "../dataset/gold-loader";
import { sha256, FIELD_SEP, RECORD_SEP } from "../shared/hash";

/**
 * Loads the curated oracle evidence from the gold annotation file.
 *
 * Only questions whose bundle is non-empty appear in the map. A question
 * without evidence is skipped by the oracle arm, never answered with an empty
 * evidence block.
 */
export async function loadEvidenceBundle(
  goldAnnotationsPath: string,
): Promise<Map<string, readonly EvidencePassage[]>> {
  const annotations = await loadGoldAnnotationsFromFile(goldAnnotationsPath);
  const out = new Map<string, readonly EvidencePassage[]>();
  for (const annotation of annotations) {
    if (annotation.evidence_bundle.length > 0) {
      out.set(annotation.question_id, annotation.evidence_bundle);
    }
  }
  return out;
}

/**
 * Deterministic identity of an evidence set. Two oracle runs may only be
 * compared when this hash matches, because changing a passage changes the
 * experiment.
 */
export function hashEvidenceBundle(
  bundle: ReadonlyMap<string, readonly EvidencePassage[]>,
): string {
  const questionIds = [...bundle.keys()].sort();
  const canonical = questionIds
    .map((questionId) => {
      const passages = [...(bundle.get(questionId) ?? [])].sort((a, b) =>
        a.evidence_id.localeCompare(b.evidence_id),
      );
      const serialized = passages
        .map((p) =>
          [
            p.evidence_id,
            p.source_id,
            p.source_name,
            p.section_code,
            p.chunk_id ?? "",
            p.text,
          ].join(FIELD_SEP),
        )
        .join(RECORD_SEP);
      return `${questionId}${FIELD_SEP}${serialized}`;
    })
    .join(RECORD_SEP);
  return sha256(canonical);
}
