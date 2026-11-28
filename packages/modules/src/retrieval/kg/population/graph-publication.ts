/**
 * Graph publication gate.
 *
 * A graph record may enter retrieval only when all three lifecycle fields agree
 * with `GRAPH_PUBLISHED_RECORD`. The importer deliberately writes candidate
 * records (`reviewState: "approved_candidate"`, `observationState:
 * "quarantined"`) and no publication state at all, so a strict reader is safe
 * and inert until a separate publication stage promotes reviewed records.
 *
 * The vocabulary mirrors `docs/GRAPH_SCHEMA.md` section 2.5. Keep the reader
 * and the eventual publisher on these constants instead of repeating string
 * literals in Cypher and in TypeScript.
 */

export const GRAPH_PUBLICATION_STATES = [
  "unpublished",
  "published",
  "superseded",
  "retracted",
] as const;

export type GraphPublicationState = (typeof GRAPH_PUBLICATION_STATES)[number];

export const GRAPH_REVIEW_STATES = [
  "not_required",
  "pending",
  "approved",
  "rejected",
  "changes_requested",
] as const;

export type GraphReviewState = (typeof GRAPH_REVIEW_STATES)[number];

export const GRAPH_OBSERVATION_STATES = [
  "extracted",
  "schema_invalid",
  "evidence_invalid",
  "quarantined",
  "reviewed",
  "promoted",
  "rejected",
] as const;

export type GraphObservationState = (typeof GRAPH_OBSERVATION_STATES)[number];

/**
 * The only state triple a reader may serve.
 *
 * `approved` is the review decision, `promoted` is the observation lifecycle
 * step that makes a candidate a canonical record, and `published` is the
 * projection visibility flag. A record missing any one of them is not
 * published, even if the other two look convincing.
 */
export const GRAPH_PUBLISHED_RECORD = {
  publicationState: "published",
  reviewState: "approved",
  observationState: "promoted",
} as const satisfies {
  publicationState: GraphPublicationState;
  reviewState: GraphReviewState;
  observationState: GraphObservationState;
};

export interface GraphLifecycleFields {
  readonly publicationState?: unknown;
  readonly reviewState?: unknown;
  readonly observationState?: unknown;
}

/**
 * True only for a fully published record.
 *
 * Adapters call this again on every row they receive from Neo4j. The Cypher
 * predicate is the first gate; this function is the second, so a future query
 * edit cannot silently widen what the retrieval arm serves.
 */
export function isPublishedGraphRecord(record: GraphLifecycleFields): boolean {
  return (
    record.publicationState === GRAPH_PUBLISHED_RECORD.publicationState &&
    record.reviewState === GRAPH_PUBLISHED_RECORD.reviewState &&
    record.observationState === GRAPH_PUBLISHED_RECORD.observationState
  );
}
