/**
 * Knowledge-graph entity vocabulary.
 *
 * The types are deliberately broader than the seven core clinical nodes:
 * pharmacy documents and the product register also support controlled values
 * (forms, strengths, schedules, statuses) and provenance nodes (source,
 * jurisdiction, document type, language). Each type below has at least one
 * real source in this repository.
 *
 * Relationships are a later task. This module only records entities, aliases,
 * provenance, and text mentions.
 */

export const KG_ENTITY_TYPES = [
  "medicine",
  "brand",
  "product",
  "ingredient",
  "atc_class",
  "therapeutic_class",
  "dosage_form",
  "strength",
  "route",
  "organization",
  "registration",
  "schedule",
  "product_type",
  "regulatory_status",
  "packaging",
  "source",
  "jurisdiction",
  "document_type",
  "language",
  "condition",
  "population",
] as const;

export type KgEntityType = (typeof KG_ENTITY_TYPES)[number];

export const KG_SOURCE_KINDS = [
  "name_map",
  "nomenclature",
  "brand_evidence",
  "documents",
  "sources",
  "manifest",
  "title",
  "chunk",
  "derived",
] as const;

export type KgSourceKind = (typeof KG_SOURCE_KINDS)[number];

export const KG_MENTION_METHODS = ["gazetteer", "regex", "cue", "bullet", "lexicon"] as const;

export type KgMentionMethod = (typeof KG_MENTION_METHODS)[number];

export interface KgEntityRecord {
  readonly entityId: string;
  readonly entityType: KgEntityType;
  readonly entityKey: string;
  readonly canonicalLabel: string;
  readonly normalizedLabel: string;
  readonly confidence: number;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface KgAliasRecord {
  readonly entityId: string;
  readonly aliasNorm: string;
  readonly aliasRaw: string;
  readonly language: string | null;
  readonly sourceId: string;
  readonly confidence: number;
}

export interface KgEntitySourceRecord {
  readonly entityId: string;
  readonly sourceKind: KgSourceKind;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly sourceUrl: string | null;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface KgMentionRecord {
  readonly mentionId: string;
  readonly entityId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly chunkId: string | null;
  readonly sectionCode: string;
  readonly sectionHeading: string | null;
  readonly surface: string;
  /** UTF-16 code-unit offset into the exact text named by `textHash`. */
  readonly charStart: number;
  /** Exclusive UTF-16 code-unit end offset. */
  readonly charEnd: number;
  readonly sourceField: "chunk" | "title";
  readonly textHash: string;
  readonly method: KgMentionMethod;
  readonly confidence: number;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface KgBuildCounts {
  readonly documents: number;
  readonly chunks: number;
  readonly entities: number;
  readonly aliases: number;
  readonly sources: number;
  readonly mentions: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly mentionsByType: Readonly<Record<string, number>>;
  readonly skippedDocuments: number;
  readonly missingFiles: number;
  readonly warnings: readonly string[];
}

export interface KgBuildResult {
  readonly entities: readonly KgEntityRecord[];
  readonly aliases: readonly KgAliasRecord[];
  readonly sources: readonly KgEntitySourceRecord[];
  readonly mentions: readonly KgMentionRecord[];
  readonly counts: KgBuildCounts;
}

export interface KgRunStart {
  readonly runId: string;
  readonly mode: "corpus" | "database";
  readonly corpusHash: string;
  readonly extractorVersion: string;
}

export interface KgStoreCounts {
  readonly entities: number;
  readonly aliases: number;
  readonly sources: number;
  readonly mentions: number;
  readonly byType: ReadonlyArray<{ readonly entityType: string; readonly count: number }>;
}
