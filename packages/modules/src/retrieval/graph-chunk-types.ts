/**
 * Graph-compatible chunking contract.
 *
 * `graph-evidence-v1` is additive. It does not change the production hybrid
 * chunker, chunk-id grammar, contextualization, embeddings, or retrieval. Its
 * raw text units are exact slices of the clean Markdown body so a future graph
 * evidence span can be validated without trusting a generated context note.
 */

export const GRAPH_CHUNKING_PROFILE = "graph-evidence-v1" as const;
export const GRAPH_CHUNKER_VERSION = "graph-chunk-v1" as const;
export const GRAPH_OFFSET_SURFACE = "clean-markdown-body-v1" as const;
export const GRAPH_OFFSET_ENCODING = "utf16-code-unit" as const;

export type GraphChunkingProfile = typeof GRAPH_CHUNKING_PROFILE;
export type GraphChunkerVersion = typeof GRAPH_CHUNKER_VERSION;
export type GraphOffsetSurface = typeof GRAPH_OFFSET_SURFACE;
export type GraphOffsetEncoding = typeof GRAPH_OFFSET_ENCODING;
export type GraphDiagnosticSeverity = "info" | "warning" | "error";
export type GraphBlockKind = "narrative" | "table" | "list";
export type GraphOverlapAlignment =
  | "sentence"
  | "paragraph"
  | "word"
  | "table-row"
  | "list-item"
  | "block";

/** Half-open character range in a declared surface. */
export interface GraphSourceSpan {
  /** Inclusive UTF-16 code-unit offset. */
  readonly start: number;
  /** Exclusive UTF-16 code-unit offset. */
  readonly end: number;
}

/** Heading-delimited section in the exact clean Markdown body. */
export interface GraphDocumentSection {
  readonly sectionId: string;
  readonly artifactId: string;
  readonly parentSectionId: string | null;
  readonly ancestorSectionIds: readonly string[];
  readonly heading: string | null;
  readonly level: number;
  /** Code classified from this heading alone; `other` when unmapped. */
  readonly headingCode: string;
  /** This heading's code, or the nearest mapped ancestor's code. */
  readonly sectionCode: string;
  readonly headingPath: readonly string[];
  /** Heading line through the end of the section subtree. */
  readonly sourceSpan: GraphSourceSpan;
  /** Directly owned content, excluding child sections. */
  readonly directContentSpan: GraphSourceSpan;
  readonly contentSha256: string;
  readonly directContentSha256: string;
}

export interface GraphTableMetadata {
  readonly tableId: string;
  /** Exact source span containing the header and separator rows. */
  readonly headerSpan: GraphSourceSpan;
  readonly rowIds: readonly string[];
  readonly headerIncluded: boolean;
}

export interface GraphListItemPart {
  readonly itemId: string;
  readonly parentItemId: string | null;
  readonly itemOrdinal: number;
  readonly depth: number;
  readonly markerSpan: GraphSourceSpan;
  readonly partOrdinal: number;
  readonly continued: boolean;
}

export interface GraphListMetadata {
  readonly listId: string;
  readonly itemIds: readonly string[];
  readonly itemParts: readonly GraphListItemPart[];
}

/** A generated display prefix, never part of raw evidence. */
export interface GraphGeneratedSpan {
  readonly kind: "table-header" | "list-marker";
  /** UTF-16 range in `displayContent`. */
  readonly localSpan: GraphSourceSpan;
  /** Exact source span copied into the generated prefix. */
  readonly sourceSpan: GraphSourceSpan;
}

export interface GraphOverlap {
  readonly predecessorTextUnitId: string;
  /** Repeated source region in the clean Markdown body. */
  readonly sourceSpan: GraphSourceSpan;
  /** Repeated region at the start of `content`. */
  readonly localSpan: GraphSourceSpan;
  readonly requestedChars: number;
  readonly actualChars: number;
  readonly alignment: GraphOverlapAlignment;
}

/**
 * One graph-compatible raw text unit.
 *
 * `content` is an exact, contiguous slice of the clean Markdown body.
 * `displayContent` may add a table header or list marker for readability; those
 * bytes are declared in `generatedSpans` and must never be used as evidence.
 */
export interface GraphTextUnit {
  readonly profile: GraphChunkingProfile;
  /** Profile-, configuration-, and document-snapshot-scoped evidence identity. */
  readonly textUnitId: string;
  /**
   * Legacy-shaped identifier for diagnostics only. It is not a hybrid lookup
   * key: the two profiles can emit the same string for different text.
   */
  readonly legacyChunkId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly documentSnapshotId: string;
  /** Zero-based text-unit order across the document. */
  readonly documentOrdinal: number;
  readonly sectionId: string;
  readonly sectionHeading: string;
  readonly sectionPath: readonly string[];
  readonly sectionLevel: number;
  readonly headingCode: string;
  readonly sectionCode: string;
  /** Zero-based part ordinal within one section occurrence. */
  readonly ordinal: number;
  readonly content: string;
  readonly displayContent: string;
  readonly rawContentSha256: string;
  /** Exact raw content range in the clean Markdown body. */
  readonly sourceSpan: GraphSourceSpan;
  /** Non-overlapped source range owned by this unit. */
  readonly uniqueSourceSpan: GraphSourceSpan;
  /** Range of `uniqueSourceSpan` inside `content`. */
  readonly uniqueLocalSpan: GraphSourceSpan;
  readonly overlaps: readonly GraphOverlap[];
  readonly blockKind: GraphBlockKind;
  readonly blockIds: readonly string[];
  readonly table: GraphTableMetadata | null;
  readonly list: GraphListMetadata | null;
  readonly generatedSpans: readonly GraphGeneratedSpan[];
  readonly tokenEstimate: number;
  readonly injectionRisk: boolean;
}

export interface GraphChunkDiagnostic {
  readonly code: string;
  readonly severity: GraphDiagnosticSeverity;
  readonly message: string;
  readonly sectionId?: string;
  readonly textUnitId?: string;
  readonly sourceSpan?: GraphSourceSpan;
}

/** Effective, versioned configuration used to produce graph text units. */
export interface GraphChunkingConfig {
  readonly profile: GraphChunkingProfile;
  readonly algorithmVersion: GraphChunkerVersion;
  readonly sectionTaxonomyVersion: string;
  readonly textHelperVersion: string;
  readonly offsetSurface: GraphOffsetSurface;
  readonly offsetEncoding: GraphOffsetEncoding;
  readonly maxChars: number;
  readonly overlapChars: number;
  readonly configHash: string;
}

export interface GraphChunkingResult extends GraphChunkingConfig {
  readonly artifactId: string;
  readonly documentId: string;
  readonly title: string;
  readonly sourceId: string;
  readonly language: string;
  readonly documentContentSha256: string;
  /** Content-addressed identity for this exact document snapshot. */
  readonly documentSnapshotId: string;
  readonly sections: readonly GraphDocumentSection[];
  readonly textUnits: readonly GraphTextUnit[];
  readonly diagnostics: readonly GraphChunkDiagnostic[];
}

export interface GraphChunkingOptions {
  /**
   * Soft ceiling for one raw text unit, including overlap. Atomic structures
   * may exceed it only with an explicit diagnostic. Defaults to 4,096.
   */
  readonly maxChars?: number;
  /** Requested semantic overlap capacity. Defaults to 15% of `maxChars`. */
  readonly overlapChars?: number;
  /** Optional manifest hash; a mismatch rejects an unexpected source snapshot. */
  readonly expectedDocumentContentSha256?: string;
}

/** Mechanical evidence reference validated against one graph text unit. */
export interface GraphEvidenceSpan {
  readonly textUnitId: string;
  readonly documentSnapshotId: string;
  readonly rawContentSha256: string;
  readonly offsetEncoding: GraphOffsetEncoding;
  /** Unit-local UTF-16 offsets. */
  readonly start: number;
  readonly end: number;
  /** Document-level UTF-16 offsets for deduplication. */
  readonly documentStart: number;
  readonly documentEnd: number;
  readonly quote: string;
  readonly quoteSha256: string;
}

/** Exact clean Markdown body used to produce a graph chunking result. */
export interface GraphDocumentBody {
  readonly text: string;
  readonly contentSha256: string;
}
