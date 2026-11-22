import { readFile } from "node:fs/promises";

/**
 * Extraction provenance.
 *
 * The cleaning manifest records when a document was parsed and the extraction
 * report records whether the whole document was read, but neither reaches the
 * index unless it is carried explicitly. Both the ingest worker and the
 * metadata-only backfill use this module so a document cannot be re-ingested
 * with less provenance than it had before.
 */

export const DEFAULT_EXTRACTIONS_PATH = "tooling/retrieval-lab/data/metadata/extractions.csv";

export interface ExtractionProvenance {
  readonly documentId: string;
  readonly extractionStatus: string | null;
  readonly reviewRequired: boolean;
  readonly extractedAt: string | null;
}

const VALID_STATUS = new Set(["EXTRACTED", "PARTIAL"]);

/**
 * Minimal RFC 4180 reader. The report's quoted fields contain commas, so
 * splitting on `,` would silently shift every column.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function readExtractions(path: string): Promise<Map<string, ExtractionProvenance>> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Extraction report not readable (${path}): ${detail}`);
  }
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("Extraction report is empty");
  const index = new Map(header.map((name, position) => [name.trim(), position]));
  for (const required of ["document_id", "extraction_status", "review_required", "extracted_at"]) {
    if (!index.has(required))
      throw new Error(`Extraction report is missing the ${required} column`);
  }

  const extractions = new Map<string, ExtractionProvenance>();
  for (const row of rows) {
    const documentId = (row[index.get("document_id")!] ?? "").trim();
    if (!documentId) continue;
    const status = (row[index.get("extraction_status")!] ?? "").trim();
    const extractedAt = (row[index.get("extracted_at")!] ?? "").trim();
    extractions.set(documentId, {
      documentId,
      extractionStatus: VALID_STATUS.has(status) ? status : null,
      reviewRequired: (row[index.get("review_required")!] ?? "").trim() === "yes",
      extractedAt: extractedAt || null,
    });
  }
  return extractions;
}

/**
 * Read the report when it exists.
 *
 * The corpus data is not committed, so a fresh checkout has no extraction
 * report. That is not an error: the document simply keeps the cleaning
 * timestamp as its extraction time and reports no extraction status.
 */
export async function readExtractionsIfPresent(
  path: string,
): Promise<Map<string, ExtractionProvenance> | null> {
  try {
    return await readExtractions(path);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("ENOENT")) return null;
    throw cause;
  }
}

/**
 * Artifact ids carry a part suffix (`...__smpc`, `...__notice`); the extraction
 * report is keyed by the collection document id.
 */
export function provenanceForArtifact(
  extractions: ReadonlyMap<string, ExtractionProvenance>,
  artifactId: string,
): ExtractionProvenance | null {
  return (
    extractions.get(artifactId) ?? extractions.get(artifactId.replace(/__[a-z]+$/, "")) ?? null
  );
}

/**
 * Merge provenance into a document's metadata.
 *
 * `extracted_at` always ends up populated: the extraction report's timestamp
 * when the document was sectioned, otherwise the cleaning timestamp that is
 * already in the manifest. A missing extraction status stays absent rather than
 * being guessed, so the agent reports "status unknown" instead of inventing a
 * clean extraction.
 */
export function applyProvenance(
  metadata: Record<string, unknown>,
  provenance: ExtractionProvenance | null,
): Record<string, unknown> {
  const cleanedAt = typeof metadata.cleaned_at === "string" ? metadata.cleaned_at : null;
  const extractedAt = provenance?.extractedAt ?? cleanedAt;
  return {
    ...metadata,
    ...(extractedAt ? { extracted_at: extractedAt } : {}),
    ...(provenance?.extractionStatus ? { extraction_status: provenance.extractionStatus } : {}),
    review_required: provenance?.reviewRequired === true ? "yes" : "no",
  };
}
