import type {
  GraphRetrievalInput,
  GraphRetrievalPort,
  RankedCandidate,
} from "@repo/services/retrieval";
import type { Neo4jClient } from "./neo4j-http";
import {
  bridgeGraphEvidence,
  postgresGraphChunkSource,
  type GraphChunkSource,
} from "./graph-bridge";
import { readPublishedGraphEvidence, type GraphEvidenceLimits } from "./graph-evidence";

/**
 * Optional Neo4j retrieval arm.
 *
 * The reader selects published entities and one-hop neighbours; the bridge
 * maps their exact evidence quotes to hybrid chunks. The service owns the
 * fallback: any failure here is caught there and the hybrid result is
 * returned. This adapter does not cache or persist anything.
 */

export interface GraphRetrievalOptions {
  readonly client: Neo4jClient;
  readonly model: string;
  /** Injectable for tests; production uses the Postgres bridge. */
  readonly chunks?: GraphChunkSource;
  readonly limits?: Partial<GraphEvidenceLimits>;
  readonly candidateLimit?: number;
  readonly chunkLimit?: number;
}

const DEFAULT_CANDIDATE_LIMIT = 30;
const DEFAULT_CHUNK_LIMIT = 200;

export function createNeo4jGraphRetrieval(options: GraphRetrievalOptions): GraphRetrievalPort {
  const source = options.chunks ?? postgresGraphChunkSource;
  const candidateLimit = Math.max(1, options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT);
  const chunkLimit = Math.max(candidateLimit, options.chunkLimit ?? DEFAULT_CHUNK_LIMIT);

  return {
    async search(input: GraphRetrievalInput): Promise<RankedCandidate[]> {
      const evidence = await readPublishedGraphEvidence(
        options.client,
        { terms: input.terms },
        options.limits,
      );
      if (evidence.length === 0) return [];

      const artifactIds = [...new Set(evidence.map((entry) => entry.artifactId))];
      const quotes = [...new Set(evidence.map((entry) => entry.quote))];
      const rows = await source.loadChunks({
        artifactIds,
        quotes,
        filter: input.filter,
        model: options.model,
        limit: chunkLimit,
      });
      return bridgeGraphEvidence(evidence, rows, Math.min(input.limit, candidateLimit));
    },
  };
}
