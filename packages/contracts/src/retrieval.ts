/**
 * Retrieval wire contract.
 *
 * One definition of the payload that crosses the process boundary between the
 * application and the Eve harness. The application builds it, the harness
 * parses it, and both import these types, so a field added on one side cannot
 * drift from the other.
 *
 * This package is deliberately free of runtime dependencies: it is imported by
 * the agent process, which must not pull in `server-only` modules, a database
 * driver, or a provider SDK.
 */

export const RETRIEVAL_WIRE_VERSION = 1;

/** A calendar date, `YYYY-MM-DD`, or `null` when the source did not state one. */
export type RetrievalDate = string | null;

export interface RetrievalWireAuthority {
  readonly level: number;
  readonly tier: string | null;
  readonly label: string;
  readonly official: boolean;
  readonly description: string;
}

export interface RetrievalWireChunk {
  readonly chunkId: string;
  readonly citation: string;
  readonly title: string;
  readonly sectionHeading: string;
  readonly sectionPath: string;
  readonly sectionCodes: readonly string[];
  readonly sourceId: string;
  readonly sourceName: string;
  readonly documentType: string;
  readonly language: string;
  readonly authorityLevel: number;
  readonly authorityTier: string | null;
  readonly authority: RetrievalWireAuthority;
  readonly medicineNames: readonly string[];
  readonly sourceUrls: readonly string[];
  /**
   * When the regulator published or last revised the source document. This is
   * the currency of the clinical claim.
   */
  readonly publicationDate: RetrievalDate;
  /** When the application fetched the source document. */
  readonly collectedAt: RetrievalDate;
  /** When the application parsed and normalised the document. */
  readonly extractedAt: RetrievalDate;
  /** When the chunk entered the vector index. */
  readonly indexedAt: RetrievalDate;
  /** `EXTRACTED`, `PARTIAL`, or null when the source recorded no status. */
  readonly extractionStatus: string | null;
  /** True when the extraction pipeline flagged the document for review. */
  readonly reviewRequired: boolean;
  /**
   * Pre-rendered `source · published · extracted` label. The model copies this
   * verbatim instead of formatting dates itself, which is what stops it from
   * inventing a date the source never stated.
   */
  readonly citationStamp: string;
  readonly content: string;
  readonly contentTruncated: boolean;
}

export interface RetrievalWireOverlapEntry {
  readonly chunkId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly authorityLevel: number;
  readonly authorityLabel: string;
  readonly claimScope: string;
}

export interface RetrievalWireOverlap {
  readonly medicineIds: readonly string[];
  readonly sectionCodes: readonly string[];
  readonly claimScope: string;
  readonly entries: readonly RetrievalWireOverlapEntry[];
  readonly preferredChunkId: string;
  readonly preferredAuthorityLevel: number;
  readonly authorityGap: number;
  readonly numericDivergence: readonly string[];
  readonly numbersCompared: boolean;
}

export interface RetrievalWireDiagnostics {
  readonly embeddingModel: string;
  readonly rerankerModel: string | null;
  readonly rerank: string;
  readonly denseCandidates: number;
  readonly lexicalCandidates: number;
  readonly fusedCandidates: number;
  readonly rerankedCandidates: number;
  readonly returnedChunks: number;
  readonly droppedForInjection: number;
  readonly elapsedMs: number;
  /** Terms the alias layer appended to the lexical query. */
  readonly expandedTerms: readonly string[];
  /** Brands that matched more than one substance and were not expanded. */
  readonly ambiguousAliases: readonly string[];
}

export interface RetrievalWireResponse {
  readonly ok: true;
  readonly wireVersion: number;
  readonly chunks: readonly RetrievalWireChunk[];
  readonly authorityPolicy: string;
  readonly authorityOverlaps: readonly RetrievalWireOverlap[];
  readonly diagnostics: RetrievalWireDiagnostics;
}

export interface RetrievalWireError {
  readonly ok: false;
  readonly code: string;
  readonly error: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Render a retrieval date for display.
 *
 * A missing date is reported as `unknown`, never substituted with another
 * timestamp: a date the source did not state is a fact the system does not
 * have, and filling it with the extraction date would tell the reader the
 * opposite of the truth about how current the evidence is.
 */
export function formatRetrievalDate(value: RetrievalDate): string {
  if (typeof value !== "string" || value.length === 0) return "unknown";
  if (ISO_DATE.test(value)) return value;
  const prefix = value.slice(0, 10);
  return ISO_DATE.test(prefix) ? prefix : "unknown";
}

export interface CitationStampInput {
  readonly sourceName: string;
  readonly publicationDate: RetrievalDate;
  readonly extractedAt: RetrievalDate;
  readonly extractionStatus?: string | null;
  readonly reviewRequired?: boolean;
}

/**
 * Build the label the model must copy when it cites a passage.
 *
 * Publication and extraction are both shown and both labelled. They answer
 * different questions — how current the clinical claim is, and when the
 * pipeline read it — and a single date cannot answer both.
 */
export function buildCitationStamp(input: CitationStampInput): string {
  const parts = [
    input.sourceName,
    `published ${formatRetrievalDate(input.publicationDate)}`,
    `extracted ${formatRetrievalDate(input.extractedAt)}`,
  ];
  if (input.extractionStatus === "PARTIAL") parts.push("partial extraction");
  if (input.reviewRequired === true) parts.push("review required");
  return parts.join(" · ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Retrieval response is missing ${field}`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Retrieval response has an invalid ${field}`);
  }
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function dateValue(value: unknown): RetrievalDate {
  if (typeof value !== "string") return null;
  const prefix = value.slice(0, 10);
  return ISO_DATE.test(prefix) ? prefix : null;
}

function parseOverlaps(value: unknown): RetrievalWireOverlap[] {
  if (!Array.isArray(value)) return [];
  const overlaps: RetrievalWireOverlap[] = [];
  for (const entry of value) {
    const overlap = asRecord(entry);
    if (!overlap) continue;
    const entries: RetrievalWireOverlapEntry[] = [];
    if (Array.isArray(overlap.entries)) {
      for (const item of overlap.entries) {
        const record = asRecord(item);
        if (!record) continue;
        entries.push({
          chunkId: requireString(record.chunkId, "authorityOverlaps.entries.chunkId"),
          sourceId: requireString(record.sourceId, "authorityOverlaps.entries.sourceId"),
          sourceName: requireString(record.sourceName, "authorityOverlaps.entries.sourceName"),
          authorityLevel: requireNumber(
            record.authorityLevel,
            "authorityOverlaps.entries.authorityLevel",
          ),
          authorityLabel: requireString(
            record.authorityLabel,
            "authorityOverlaps.entries.authorityLabel",
          ),
          claimScope: optionalString(record.claimScope) ?? "clinical",
        });
      }
    }
    overlaps.push({
      medicineIds: stringArray(overlap.medicineIds),
      sectionCodes: stringArray(overlap.sectionCodes),
      claimScope: optionalString(overlap.claimScope) ?? "clinical",
      entries,
      preferredChunkId: requireString(
        overlap.preferredChunkId,
        "authorityOverlaps.preferredChunkId",
      ),
      preferredAuthorityLevel: requireNumber(
        overlap.preferredAuthorityLevel,
        "authorityOverlaps.preferredAuthorityLevel",
      ),
      authorityGap: requireNumber(overlap.authorityGap, "authorityOverlaps.authorityGap"),
      numericDivergence: stringArray(overlap.numericDivergence),
      numbersCompared: overlap.numbersCompared === true,
    });
  }
  return overlaps;
}

function parseChunk(entry: unknown, index: number): RetrievalWireChunk {
  const chunk = asRecord(entry);
  if (!chunk) throw new Error(`Retrieval response chunk ${index} is not an object`);
  const citation = asRecord(chunk.citation);
  if (!citation) throw new Error(`Retrieval response chunk ${index} has no citation`);
  const authorityLevel = requireNumber(chunk.authorityLevel, `chunks[${index}].authorityLevel`);
  const authority = asRecord(chunk.authority);
  const content = requireString(chunk.content, `chunks[${index}].content`);
  const truncated = content.length > 4_000;
  const publicationDate = dateValue(chunk.publicationDate);
  const extractedAt = dateValue(chunk.extractedAt);
  const extractionStatus = optionalString(chunk.extractionStatus);
  const reviewRequired = chunk.reviewRequired === true;
  const sourceName = requireString(chunk.sourceName, `chunks[${index}].sourceName`);

  return {
    chunkId: requireString(chunk.chunkId, `chunks[${index}].chunkId`),
    citation: requireString(citation.label, `chunks[${index}].citation.label`),
    title: requireString(chunk.title, `chunks[${index}].title`),
    sectionHeading: requireString(chunk.sectionHeading, `chunks[${index}].sectionHeading`),
    sectionPath: requireString(chunk.sectionPath, `chunks[${index}].sectionPath`),
    sectionCodes: stringArray(chunk.sectionCodes),
    sourceId: optionalString(chunk.sourceId) ?? "",
    sourceName,
    documentType: requireString(chunk.documentType, `chunks[${index}].documentType`),
    language: requireString(chunk.language, `chunks[${index}].language`),
    authorityLevel,
    authorityTier: optionalString(chunk.authorityTier),
    authority: {
      level: requireNumber(authority?.level ?? authorityLevel, `chunks[${index}].authority.level`),
      tier: optionalString(authority?.tier),
      label: optionalString(authority?.label) ?? "Unknown authority",
      official: authority?.official === true,
      description: optionalString(authority?.description) ?? "",
    },
    medicineNames: stringArray(chunk.medicineNames),
    sourceUrls: stringArray(chunk.sourceUrls),
    publicationDate,
    collectedAt: dateValue(chunk.collectedAt),
    extractedAt,
    indexedAt: dateValue(chunk.indexedAt),
    extractionStatus,
    reviewRequired,
    citationStamp:
      optionalString(chunk.citationStamp) ??
      buildCitationStamp({
        sourceName,
        publicationDate,
        extractedAt,
        extractionStatus,
        reviewRequired,
      }),
    content: truncated ? `${content.slice(0, 4_000)}…` : content,
    contentTruncated: truncated,
  };
}

/**
 * Validate and normalise a search response.
 *
 * Throws on a structurally broken payload so a transport change fails loudly
 * here instead of silently producing an answer with missing dates.
 */
export function parseRetrievalSearchResponse(payload: unknown): RetrievalWireResponse {
  const envelope = asRecord(payload);
  if (!envelope) throw new Error("Retrieval response is not an object");
  if (envelope.ok !== true) {
    const code = typeof envelope.code === "string" ? `${envelope.code}: ` : "";
    const message = typeof envelope.error === "string" ? envelope.error : "unknown error";
    throw new Error(`Medical corpus retrieval failed (${code}${message})`);
  }
  if (!Array.isArray(envelope.chunks)) {
    throw new Error("Medical corpus retrieval returned no chunk list.");
  }
  const diagnostics = asRecord(envelope.diagnostics) ?? {};
  return {
    ok: true,
    wireVersion:
      typeof envelope.wireVersion === "number" ? envelope.wireVersion : RETRIEVAL_WIRE_VERSION,
    chunks: envelope.chunks.map(parseChunk),
    authorityPolicy:
      optionalString(envelope.authorityPolicy) ??
      "Source authority, lower wins: 1 = ANPP SmPC/leaflet and Ministry of Health nomenclature; " +
        "2 = Pharm'Net Algerian nomenclature register; 3 = foreign institutional reference; " +
        "4 = secondary.",
    authorityOverlaps: parseOverlaps(envelope.authorityOverlaps),
    diagnostics: {
      embeddingModel: optionalString(diagnostics.embeddingModel) ?? "unknown",
      rerankerModel: optionalString(diagnostics.rerankerModel),
      rerank: optionalString(diagnostics.rerank) ?? "unknown",
      denseCandidates: requireNumber(diagnostics.denseCandidates ?? 0, "denseCandidates"),
      lexicalCandidates: requireNumber(diagnostics.lexicalCandidates ?? 0, "lexicalCandidates"),
      fusedCandidates: requireNumber(diagnostics.fusedCandidates ?? 0, "fusedCandidates"),
      rerankedCandidates: requireNumber(diagnostics.rerankedCandidates ?? 0, "rerankedCandidates"),
      returnedChunks: requireNumber(diagnostics.returnedChunks ?? 0, "returnedChunks"),
      droppedForInjection: requireNumber(
        diagnostics.droppedForInjection ?? 0,
        "droppedForInjection",
      ),
      elapsedMs: requireNumber(diagnostics.elapsedMs ?? 0, "elapsedMs"),
      expandedTerms: stringArray(diagnostics.expandedTerms),
      ambiguousAliases: stringArray(diagnostics.ambiguousAliases),
    },
  };
}
