import {
  GRAPH_PUBLISHED_RECORD,
  foldKgText,
  isPublishedGraphRecord,
} from "@repo/modules/retrieval";
import type { Neo4jClient } from "./neo4j-http";

/**
 * Read published graph evidence from Neo4j.
 *
 * This adapter is deliberately read-only and narrow:
 *
 * - it starts from `GraphEntity` nodes that match the query terms;
 * - it expands one hop through a relationship whose endpoints and relationship
 *   are all published;
 * - it returns only `Evidence` nodes attached to those entities whose kind is
 *   `text_span` and whose `artifactId` and `quote` can bridge to a chunk.
 *
 * The Cypher predicates and `isPublishedGraphRecord` both enforce the same
 * gate. The importer currently writes candidate records with no
 * `publicationState`, so this reader returns nothing until a separate
 * publication stage promotes records. That is intentional: an empty graph arm
 * is correct, a candidate leak is not.
 */

export interface GraphEvidenceReadInput {
  /** Query terms from the retrieval service; folded again here. */
  readonly terms: readonly string[];
}

export interface GraphEvidenceLimits {
  readonly entityLimit: number;
  readonly neighborLimit: number;
  readonly evidenceLimit: number;
}

export interface GraphEvidence {
  readonly evidenceId: string;
  readonly entityId: string;
  readonly artifactId: string;
  readonly quote: string;
  readonly score: number;
}

interface ScoredEntity {
  readonly score: number;
  readonly isSeed: boolean;
}

const DEFAULT_LIMITS: GraphEvidenceLimits = {
  entityLimit: 24,
  neighborLimit: 48,
  evidenceLimit: 160,
};

/**
 * Accent and script folding for the Cypher side of the match.
 *
 * Neo4j has no Unicode normalisation function, so the expression is a static
 * chain of `replace` calls. It mirrors the useful parts of `foldKgText` for
 * the three product languages: French accents and ligatures, and Arabic
 * diacritics plus the alef/ya/ta-marbuta variants. The input expression is
 * always a fixed property path, never user text, so the generated Cypher is
 * static and cannot be injected.
 */
const FOLDS: ReadonlyArray<readonly [string, string]> = [
  ["à", "a"],
  ["á", "a"],
  ["â", "a"],
  ["ã", "a"],
  ["ä", "a"],
  ["å", "a"],
  ["ç", "c"],
  ["è", "e"],
  ["é", "e"],
  ["ê", "e"],
  ["ë", "e"],
  ["ì", "i"],
  ["í", "i"],
  ["î", "i"],
  ["ï", "i"],
  ["ñ", "n"],
  ["ò", "o"],
  ["ó", "o"],
  ["ô", "o"],
  ["õ", "o"],
  ["ö", "o"],
  ["ù", "u"],
  ["ú", "u"],
  ["û", "u"],
  ["ü", "u"],
  ["ý", "y"],
  ["ÿ", "y"],
  ["œ", "oe"],
  ["æ", "ae"],
  ["أ", "ا"],
  ["إ", "ا"],
  ["آ", "ا"],
  ["ٱ", "ا"],
  ["ى", "ي"],
  ["ة", "ه"],
  ["\u064b", ""],
  ["\u064c", ""],
  ["\u064d", ""],
  ["\u064e", ""],
  ["\u064f", ""],
  ["\u0650", ""],
  ["\u0651", ""],
  ["\u0652", ""],
  ["\u0653", ""],
  ["\u0654", ""],
  ["\u0655", ""],
  ["\u0656", ""],
  ["\u0657", ""],
  ["\u0658", ""],
  ["\u0670", ""],
  ["\u0640", ""],
  ["’", "'"],
  ["‘", "'"],
  ["`", "'"],
];

function foldedExpression(expression: string): string {
  return FOLDS.reduce(
    (current, [from, to]) => `replace(${current}, '${from}', '${to}')`,
    `toLower(${expression})`,
  );
}

const ENTITY_QUERY = `MATCH (seed:GraphEntity)
WHERE seed.publicationState = $published
  AND seed.reviewState = $approved
  AND seed.observationState = $promoted
  AND any(alias IN coalesce(seed.aliases, []) + [coalesce(seed.label, '')]
          WHERE any(term IN $terms WHERE ${foldedExpression("alias")} CONTAINS term))
WITH seed
LIMIT $entityLimit
OPTIONAL MATCH (seed)-[relationship]-(neighbor:GraphEntity)
WHERE neighbor <> seed
  AND neighbor.publicationState = $published
  AND neighbor.reviewState = $approved
  AND neighbor.observationState = $promoted
  AND relationship.publicationState = $published
  AND relationship.reviewState = $approved
  AND relationship.observationState = $promoted
WITH collect(DISTINCT seed) AS seeds,
     [candidate IN collect(DISTINCT neighbor) WHERE candidate IS NOT NULL] AS neighbors
WITH seeds, [candidate IN neighbors WHERE NOT (candidate IN seeds)] AS neighbors
UNWIND (seeds + neighbors) AS entity
RETURN entity.candidateClusterId AS entityId,
       entity.label AS label,
       coalesce(entity.aliases, []) AS aliases,
       entity IN seeds AS isSeed,
       entity.publicationState AS publicationState,
       entity.reviewState AS reviewState,
       entity.observationState AS observationState
LIMIT $rowLimit`;

const EVIDENCE_QUERY = `MATCH (entity:GraphEntity)-[:HAS_EVIDENCE]->(evidence:Evidence)
WHERE entity.candidateClusterId IN $entityIds
  AND entity.publicationState = $published
  AND entity.reviewState = $approved
  AND entity.observationState = $promoted
  AND evidence.kind = 'text_span'
  AND evidence.evidenceId IS NOT NULL
  AND evidence.artifactId IS NOT NULL
  AND evidence.quote IS NOT NULL
RETURN entity.candidateClusterId AS entityId,
       evidence.evidenceId AS evidenceId,
       evidence.artifactId AS artifactId,
       evidence.quote AS quote,
       evidence.kind AS kind,
       entity.publicationState AS publicationState,
       entity.reviewState AS reviewState,
       entity.observationState AS observationState
LIMIT $evidenceLimit`;

/**
 * Read and score published evidence for a query.
 *
 * Seeds are entities whose label or aliases contain a query term. A seed
 * scores `matchedTerms / terms`; a one-hop neighbour scores half the strongest
 * seed (or its own text score when that is higher). Evidence inherits its
 * entity's score. The bridge later sums the distinct quotes that land in the
 * same chunk.
 */
export async function readPublishedGraphEvidence(
  client: Neo4jClient,
  input: GraphEvidenceReadInput,
  limits: Partial<GraphEvidenceLimits> = {},
): Promise<GraphEvidence[]> {
  const effective: GraphEvidenceLimits = { ...DEFAULT_LIMITS, ...limits };
  const terms = uniqueTerms(input.terms.map((term) => foldKgText(term)));
  if (terms.length === 0 || effective.entityLimit < 1 || effective.evidenceLimit < 1) return [];

  const entityRows = await client.query(ENTITY_QUERY, {
    terms,
    published: GRAPH_PUBLISHED_RECORD.publicationState,
    approved: GRAPH_PUBLISHED_RECORD.reviewState,
    promoted: GRAPH_PUBLISHED_RECORD.observationState,
    entityLimit: effective.entityLimit,
    rowLimit: effective.entityLimit + effective.neighborLimit,
  });

  const entities = new Map<string, ScoredEntity>();
  for (const row of entityRows) {
    if (!isPublishedGraphRecord(row)) continue;
    const entityId = stringValue(row.entityId);
    if (!entityId) continue;
    const score = matchScore(terms, stringValue(row.label) ?? "", stringArray(row.aliases));
    const isSeed = row.isSeed === true;
    const existing = entities.get(entityId);
    entities.set(entityId, {
      score: existing ? Math.max(existing.score, score) : score,
      isSeed: existing ? existing.isSeed || isSeed : isSeed,
    });
  }
  if (entities.size === 0) return [];

  const maxSeedScore = Math.max(
    0,
    ...[...entities.values()].filter((entity) => entity.isSeed).map((entity) => entity.score),
  );
  for (const [entityId, entity] of entities) {
    if (entity.isSeed) continue;
    entities.set(entityId, {
      score: Math.max(entity.score, maxSeedScore * 0.5),
      isSeed: false,
    });
  }

  const evidenceRows = await client.query(EVIDENCE_QUERY, {
    entityIds: [...entities.keys()],
    published: GRAPH_PUBLISHED_RECORD.publicationState,
    approved: GRAPH_PUBLISHED_RECORD.reviewState,
    promoted: GRAPH_PUBLISHED_RECORD.observationState,
    evidenceLimit: effective.evidenceLimit,
  });

  // A quote is the bridge key. The same quote can be attached to several
  // entities; count it once at the strongest entity score so a hub entity
  // cannot multiply one piece of evidence into many votes.
  const byQuote = new Map<string, GraphEvidence>();
  for (const row of evidenceRows) {
    if (!isPublishedGraphRecord(row)) continue;
    // The Cypher `kind = 'text_span'` predicate is the first gate; this is the
    // second. Structured and metadata evidence carry no quote and must never
    // reach the bridge, even if a future query edit lets them through.
    if (row.kind !== "text_span") continue;
    const entityId = stringValue(row.entityId);
    const evidenceId = stringValue(row.evidenceId);
    const artifactId = stringValue(row.artifactId);
    const quote = stringValue(row.quote);
    if (!entityId || !evidenceId || !artifactId || !quote) continue;
    const entity = entities.get(entityId);
    if (!entity) continue;
    const key = `${artifactId}\u0000${quote}`;
    const existing = byQuote.get(key);
    if (!existing || entity.score > existing.score) {
      byQuote.set(key, {
        evidenceId,
        entityId,
        artifactId,
        quote,
        score: entity.score,
      });
    }
  }

  return [...byQuote.values()].sort(
    (left, right) =>
      right.score - left.score ||
      left.artifactId.localeCompare(right.artifactId) ||
      left.quote.localeCompare(right.quote),
  );
}

function matchScore(terms: readonly string[], label: string, aliases: readonly string[]): number {
  const haystack = [label, ...aliases].map((value) => foldKgText(value));
  let matched = 0;
  for (const term of terms) {
    if (haystack.some((text) => text.includes(term))) matched += 1;
  }
  return matched / terms.length;
}

function uniqueTerms(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const term = value.trim();
    if (term.length < 2) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}
