import type {
  KgAliasRecord,
  KgBuildCounts,
  KgEntityRecord,
  KgEntitySourceRecord,
  KgMentionRecord,
  KgRunStart,
  KgStoreCounts,
} from "./types";

/**
 * Inward-facing contract for the offline knowledge-graph store.
 *
 * The Postgres adapter lives in `packages/api`; nothing in this package opens
 * a connection or depends on a driver. `buildId` is passed to every write so a
 * later prune can identify rows the current corpus no longer produces.
 */
export interface KgStorePort {
  beginRun(input: KgRunStart): Promise<void>;
  upsertEntities(buildId: string, records: readonly KgEntityRecord[]): Promise<void>;
  upsertAliases(buildId: string, records: readonly KgAliasRecord[]): Promise<void>;
  upsertSources(buildId: string, records: readonly KgEntitySourceRecord[]): Promise<void>;
  upsertMentions(buildId: string, records: readonly KgMentionRecord[]): Promise<void>;
  completeRun(buildId: string, counts: KgBuildCounts): Promise<void>;
  failRun(buildId: string, message: string): Promise<void>;
  prune(buildId: string): Promise<void>;
  reset(): Promise<void>;
  counts(): Promise<KgStoreCounts>;
}
