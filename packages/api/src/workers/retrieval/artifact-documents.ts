/**
 * Build indexer documents from a precomputed embedding artifact.
 *
 * The artifact is a self-contained corpus snapshot: its chunks.jsonl rows carry
 * the final contextualized text, stable ids and content hashes. This builder
 * uses those rows instead of re-chunking the current cleaning output. Manifest
 * metadata is joined when the artifact id is still present; otherwise a small
 * partial-provenance document is synthesized so the 50-question benchmark can
 * index the whole artifact.
 */
import {
  detectRetrievalInjection,
  type ChunkDraft,
  type ChunkSourceDocument,
} from "@repo/modules/retrieval";
import type { ArtifactChunk } from "../../adapters/retrieval/precomputed";

export interface ArtifactManifestRow {
  readonly artifact_id?: unknown;
  readonly document_id?: unknown;
  readonly part_id?: unknown;
  readonly source_id?: unknown;
  readonly source_name?: unknown;
  readonly authority_level?: unknown;
  readonly authority_tier?: unknown;
  readonly jurisdiction?: unknown;
  readonly document_type?: unknown;
  readonly language?: unknown;
  readonly medicine_ids?: unknown;
  readonly medicine_names?: unknown;
  readonly inn?: unknown;
  readonly brand_name?: unknown;
  readonly strength_form?: unknown;
  readonly title?: unknown;
  readonly source_urls?: unknown;
  readonly publication_date?: unknown;
  readonly collected_at?: unknown;
  readonly revision_date?: unknown;
  readonly content_sha256?: unknown;
  [key: string]: unknown;
}

export interface LoadedDocument {
  readonly row: ArtifactManifestRow;
  readonly source: ChunkSourceDocument;
  readonly partId: string | null;
  readonly authorityTier: string | null;
  readonly publicationDate: Date | null;
  readonly collectedAt: Date | null;
  readonly revisionDate: Date | null;
  readonly contentSha256: string;
  readonly markdown: string;
  readonly chunks: ChunkDraft[];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}
function dateValue(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function ordinalFromChunkId(chunkId: string): number {
  const match = /#\d+$/.exec(chunkId);
  return match ? Number(match[0].slice(1)) : 0;
}

export function artifactDocumentsFromSnapshot(
  rows: readonly ArtifactChunk[],
  manifestRows: readonly ArtifactManifestRow[],
): LoadedDocument[] {
  const manifestById = new Map<string, ArtifactManifestRow>();
  for (const row of manifestRows) {
    const id = stringValue(row.artifact_id);
    if (id && !manifestById.has(id)) manifestById.set(id, row);
  }

  const grouped = new Map<string, ArtifactChunk[]>();
  for (const row of [...rows].sort((left, right) => left.row - right.row)) {
    const list = grouped.get(row.artifactId) ?? [];
    list.push(row);
    grouped.set(row.artifactId, list);
  }

  const documents: LoadedDocument[] = [];
  for (const [artifactId, artifactRows] of grouped) {
    const manifestRow = manifestById.get(artifactId);
    const hasMetadata = Boolean(manifestRow);
    const sourceId =
      stringValue(manifestRow?.source_id) ?? /^(MED\d{3})/.exec(artifactId)?.[1] ?? "artifact";
    const authorityLevel = Number(manifestRow?.authority_level ?? 1);
    const language = stringValue(manifestRow?.language) ?? artifactRows[0]!.language ?? "unknown";
    const source: ChunkSourceDocument = {
      artifactId,
      documentId: stringValue(manifestRow?.document_id) ?? artifactId,
      title: stringValue(manifestRow?.title) ?? artifactId,
      sourceId,
      sourceName: stringValue(manifestRow?.source_name) ?? sourceId,
      authorityLevel:
        Number.isInteger(authorityLevel) && authorityLevel >= 1 && authorityLevel <= 4
          ? authorityLevel
          : 1,
      jurisdiction: stringValue(manifestRow?.jurisdiction),
      documentType: stringValue(manifestRow?.document_type) ?? "document",
      language,
      medicineIds: stringArray(manifestRow?.medicine_ids),
      medicineNames: stringArray(manifestRow?.medicine_names),
      inn: stringValue(manifestRow?.inn),
      brandName: stringValue(manifestRow?.brand_name),
      strengthForm: stringValue(manifestRow?.strength_form),
      sourceUrls: stringArray(manifestRow?.source_urls),
    };

    const chunks: ChunkDraft[] = artifactRows.map((row) => ({
      chunkId: row.chunkId,
      artifactId: row.artifactId,
      sectionCode: row.sectionCode,
      sectionCodes: [row.sectionCode],
      sectionHeading: row.sectionCode,
      sectionPath: "",
      ordinal: ordinalFromChunkId(row.chunkId),
      content: row.text,
      contextNote: "",
      contextualizedContent: row.text,
      contentHash: row.textSha256,
      contextKey: row.contextKey,
      tokenEstimate: Math.ceil(row.text.length / 4),
      injectionRisk: detectRetrievalInjection(row.text),
    }));

    documents.push({
      row: {
        ...manifestRow,
        artifact_id: artifactId,
        provenance_source: "embedding-artifact",
        partial_provenance: !hasMetadata,
      },
      source,
      partId: stringValue(manifestRow?.part_id),
      authorityTier: stringValue(manifestRow?.authority_tier),
      publicationDate: dateValue(manifestRow?.publication_date),
      collectedAt: dateValue(manifestRow?.collected_at),
      revisionDate: dateValue(manifestRow?.revision_date),
      contentSha256: stringValue(manifestRow?.content_sha256) ?? artifactRows[0]!.textSha256,
      markdown: "",
      chunks,
    });
  }
  return documents;
}
