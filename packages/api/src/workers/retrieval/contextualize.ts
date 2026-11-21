/**
 * Contextualization workbench for the retrieval corpus.
 *
 * The ingest step prepends a short note that situates each chunk inside its
 * source document before the text is embedded and indexed (Anthropic's
 * Contextual Retrieval). That note has to be written by a language model: a
 * template cannot say what a specific chunk is about, and a generic document
 * summary adds almost nothing.
 *
 * This worker does not call a model. It prepares the exact work a model needs
 * (the document plus the chunks that still lack a note), and it validates and
 * merges the notes the model returns. That keeps the model outside the build
 * and makes the pass resumable: notes are keyed by the chunk text, so a rerun
 * only asks for the chunks that changed.
 *
 *   bun run retrieval:contextualize -- status
 *   bun run retrieval:contextualize -- queue --source BDPM_FR
 *   bun run retrieval:contextualize -- digest --artifact MED001__SRC_BDPM_FR__DOC001__notice
 *   bun run retrieval:contextualize -- prepare --medicine MED001
 *   bun run retrieval:contextualize -- apply notes/MED001.jsonl
 *   bun run retrieval:contextualize -- export --require-context
 *
 * Note rows are JSONL:
 *   {"context_key":"…","chunk_id":"…","note":"…"}
 *
 * `export` writes the exact strings the embedding model will receive, so the
 * corpus can be embedded by any BGE-M3 server without re-deriving them.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  chunkMarkdownDocument,
  type ChunkDraft,
  type ChunkSourceDocument,
} from "@repo/modules/retrieval";

const DEFAULT_ROOT = "tooling/cleaning-lab/output";
const DEFAULT_NOTES = "tooling/cleaning-lab/output/context/notes.jsonl";
const DEFAULT_PACKETS = "tooling/cleaning-lab/output/context/packets";
const DEFAULT_EMBED_INPUT = "tooling/cleaning-lab/output/context/embed-input.jsonl";
const MAX_NOTE_CHARS = 3_000;

interface ManifestRow {
  readonly artifact_id?: unknown;
  readonly artifact_type?: unknown;
  readonly output_path?: unknown;
  readonly status?: unknown;
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
  readonly key_sections_present?: unknown;
  readonly key_sections_missing?: unknown;
  readonly section_count?: unknown;
  readonly sections?: unknown;
}

type Command = "status" | "queue" | "digest" | "prepare" | "apply" | "export" | "help";

interface Options {
  readonly command: Command;
  readonly root: string;
  readonly manifest: string;
  readonly notes: string;
  readonly packets: string;
  readonly embedInput: string;
  readonly medicineIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly artifacts: readonly string[];
  readonly limit: number | null;
  readonly maxChars: number;
  readonly notesFile: string | null;
  readonly bodyChars: number;
  readonly pendingOnly: boolean;
  readonly allowUnknown: boolean;
  readonly requireContext: boolean;
}

interface LoadedDocument {
  readonly row: ManifestRow;
  readonly source: ChunkSourceDocument;
  readonly markdown: string;
  readonly chunks: ChunkDraft[];
}

interface NoteRow {
  readonly context_key: string;
  readonly note: string;
  readonly chunk_id?: string;
  readonly artifact_id?: string;
  readonly model?: string;
  readonly language?: string;
  readonly created_at?: string;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.command === "help") {
    console.log(helpText());
    return;
  }
  const notes = await readNotes(options.notes);
  const documents = await loadDocuments(options, notes);
  const allChunks = documents.flatMap((document) => document.chunks);
  const pending = allChunks.filter((chunk) => !notes.has(chunk.contextKey));

  if (options.command === "status") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          documents: documents.length,
          chunks: allChunks.length,
          contextualized: allChunks.length - pending.length,
          pending: pending.length,
          notesPath: options.notes,
          bySource: summarizeBySource(documents, notes),
          byMedicine: summarizeByMedicine(documents, notes),
          nextArtifacts: [...new Set(pending.map((chunk) => chunk.artifactId))].slice(0, 20),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (options.command === "queue") {
    const queue = documents
      .map((document) => ({
        artifactId: document.source.artifactId,
        source: document.source.sourceId,
        medicineIds: document.source.medicineIds,
        title: document.source.title,
        chunks: document.chunks.length,
        pending: document.chunks.filter((chunk) => !notes.has(chunk.contextKey)).length,
      }))
      .filter((entry) => entry.pending > 0)
      .sort(
        (left, right) =>
          left.pending - right.pending || left.artifactId.localeCompare(right.artifactId),
      );
    const selected = options.limit === null ? queue : queue.slice(0, options.limit);
    console.log(
      JSON.stringify(
        {
          ok: true,
          documentsWithPending: queue.length,
          pendingChunks: queue.reduce((total, entry) => total + entry.pending, 0),
          documents: selected,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (options.command === "digest") {
    if (documents.length === 0) throw new Error("digest requires --artifact or --source");
    printDigest(documents, notes, options);
    return;
  }

  if (options.command === "export") {
    if (options.requireContext && pending.length > 0) {
      throw new Error(
        `${pending.length} chunk(s) have no model-written context note; finish contextualize before exporting`,
      );
    }
    const languageByArtifact = new Map(
      documents.map((document) => [document.source.artifactId, document.source.language]),
    );
    const rows = allChunks.map((chunk) => ({
      chunk_id: chunk.chunkId,
      artifact_id: chunk.artifactId,
      context_key: chunk.contextKey,
      section_code: chunk.sectionCode,
      language: languageByArtifact.get(chunk.artifactId) ?? "unknown",
      text: chunk.contextualizedContent,
      text_sha256: sha256(chunk.contextualizedContent),
    }));
    await mkdir(dirname(options.embedInput), { recursive: true });
    await writeFile(
      options.embedInput,
      `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
      "utf8",
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          documents: documents.length,
          chunks: rows.length,
          contextualized: rows.length - pending.length,
          missingContext: pending.length,
          characters: rows.reduce((total, row) => total + row.text.length, 0),
          out: options.embedInput,
          note: "Each line's text is exactly what the embedding model receives: note, blank line, chunk.",
        },
        null,
        2,
      ),
    );
    return;
  }

  if (options.command === "apply") {
    const file = options.notesFile;
    if (!file) throw new Error("apply requires a notes JSONL path");
    const known = new Set(allChunks.map((chunk) => chunk.contextKey));
    const rows = await readNoteRows(file);
    const accepted: NoteRow[] = [];
    const unknown: NoteRow[] = [];
    for (const row of rows) {
      if (!known.has(row.context_key)) {
        unknown.push(row);
        continue;
      }
      accepted.push(row);
    }
    if (unknown.length > 0 && !options.allowUnknown) {
      throw new Error(
        `${unknown.length} note(s) reference a chunk that no longer exists; rerun prepare or pass --allow-unknown`,
      );
    }
    await appendNotes(options.notes, accepted);
    console.log(
      JSON.stringify(
        {
          ok: true,
          applied: accepted.length,
          skippedUnknown: unknown.length,
          notesPath: options.notes,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pendingByArtifact = new Map<string, ChunkDraft[]>();
  for (const chunk of pending) {
    const list = pendingByArtifact.get(chunk.artifactId) ?? [];
    list.push(chunk);
    pendingByArtifact.set(chunk.artifactId, list);
  }

  await mkdir(options.packets, { recursive: true });
  const index: Array<{ artifactId: string; chunks: number; pending: number; packet: string }> = [];
  for (const document of documents) {
    const missing = pendingByArtifact.get(document.source.artifactId);
    if (!missing || missing.length === 0) continue;
    const name = `${document.source.artifactId}.json`;
    const packetPath = join(options.packets, name);
    await writeFile(
      packetPath,
      `${JSON.stringify(buildPacket(document, missing), null, 2)}\n`,
      "utf8",
    );
    index.push({
      artifactId: document.source.artifactId,
      chunks: document.chunks.length,
      pending: missing.length,
      packet: packetPath,
    });
  }
  await writeFile(
    join(options.packets, "index.json"),
    `${JSON.stringify({ documents: index.length, pending: pending.length, packets: index }, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        packets: index.length,
        pending: pending.length,
        packetDir: options.packets,
        noteTemplate: {
          context_key: "<from packet>",
          chunk_id: "<from packet>",
          note: "<50-100 token situating note>",
        },
      },
      null,
      2,
    ),
  );
}

function buildPacket(document: LoadedDocument, missing: readonly ChunkDraft[]) {
  const row = document.row;
  return {
    artifact_id: document.source.artifactId,
    title: document.source.title,
    source_id: document.source.sourceId,
    source_name: document.source.sourceName,
    authority_level: document.source.authorityLevel,
    jurisdiction: document.source.jurisdiction,
    document_type: document.source.documentType,
    language: document.source.language,
    medicine_ids: document.source.medicineIds,
    medicine_names: document.source.medicineNames,
    inn: document.source.inn,
    brand_name: document.source.brandName,
    strength_form: document.source.strengthForm,
    publication_date: row.publication_date ?? null,
    collected_at: row.collected_at ?? null,
    revision_date: row.revision_date ?? null,
    key_sections_present: row.key_sections_present ?? [],
    key_sections_missing: row.key_sections_missing ?? [],
    section_count: row.section_count ?? null,
    document_outline: row.sections ?? [],
    total_chunks: document.chunks.length,
    pending_chunks: missing.length,
    chunks: missing.map((chunk) => ({
      chunk_id: chunk.chunkId,
      context_key: chunk.contextKey,
      section_code: chunk.sectionCode,
      section_codes: chunk.sectionCodes,
      section_path: chunk.sectionPath,
      token_estimate: chunk.tokenEstimate,
      content: chunk.content,
    })),
  };
}

function printDigest(
  documents: readonly LoadedDocument[],
  notes: ReadonlyMap<string, string>,
  options: Options,
): void {
  for (const document of documents) {
    const chunks = options.pendingOnly
      ? document.chunks.filter((chunk) => !notes.has(chunk.contextKey))
      : document.chunks;
    if (chunks.length === 0) continue;
    const source = document.source;
    const date = stringValue(document.row.publication_date) ?? "-";
    console.log(
      `### ${source.artifactId} | ${source.title} | ${source.documentType} | ${date} | n=${chunks.length}`,
    );
    for (const chunk of chunks) {
      const heads = chunk.sectionPath
        .split(" | ")
        .filter((part) => part.trim().length > 0)
        .join(" > ");
      const body = collapse(chunk.content).slice(0, options.bodyChars);
      console.log(
        `${chunk.contextKey} ${chunk.chunkId} [${chunk.sectionCode}] ${heads} :: ${body}`,
      );
    }
  }
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function summarizeBySource(
  documents: readonly LoadedDocument[],
  notes: ReadonlyMap<string, string>,
) {
  const result: Record<string, { documents: number; chunks: number; pending: number }> = {};
  for (const document of documents) {
    const entry = result[document.source.sourceId] ?? { documents: 0, chunks: 0, pending: 0 };
    entry.documents += 1;
    entry.chunks += document.chunks.length;
    entry.pending += document.chunks.filter((chunk) => !notes.has(chunk.contextKey)).length;
    result[document.source.sourceId] = entry;
  }
  return result;
}

function summarizeByMedicine(
  documents: readonly LoadedDocument[],
  notes: ReadonlyMap<string, string>,
) {
  const result: Record<string, { documents: number; chunks: number; pending: number }> = {};
  for (const document of documents) {
    for (const medicineId of document.source.medicineIds) {
      const entry = result[medicineId] ?? { documents: 0, chunks: 0, pending: 0 };
      entry.documents += 1;
      entry.chunks += document.chunks.length;
      entry.pending += document.chunks.filter((chunk) => !notes.has(chunk.contextKey)).length;
      result[medicineId] = entry;
    }
  }
  return result;
}

async function loadDocuments(
  options: Options,
  notes: ReadonlyMap<string, string>,
): Promise<LoadedDocument[]> {
  const rows = await readManifest(options.manifest);
  const selected = selectRows(rows, options);
  const documents: LoadedDocument[] = [];
  for (const row of selected) {
    const artifactId = stringValue(row.artifact_id);
    const outputPath = stringValue(row.output_path);
    const title = stringValue(row.title);
    const sourceId = stringValue(row.source_id);
    if (!artifactId || !outputPath || !title || !sourceId) continue;
    const authorityLevel = Number(row.authority_level);
    if (!Number.isInteger(authorityLevel) || authorityLevel < 1 || authorityLevel > 4) continue;
    const markdown = await readFile(resolve(options.root, outputPath), "utf8");
    const source: ChunkSourceDocument = {
      artifactId,
      documentId: stringValue(row.document_id) ?? artifactId,
      title,
      sourceId,
      sourceName: stringValue(row.source_name) ?? sourceId,
      authorityLevel,
      jurisdiction: stringValue(row.jurisdiction),
      documentType: stringValue(row.document_type) ?? "document",
      language: stringValue(row.language) ?? "unknown",
      medicineIds: stringArray(row.medicine_ids),
      medicineNames: stringArray(row.medicine_names),
      inn: stringValue(row.inn),
      brandName: stringValue(row.brand_name),
      strengthForm: stringValue(row.strength_form),
      sourceUrls: stringArray(row.source_urls),
    };
    documents.push({
      row,
      source,
      markdown,
      chunks: chunkMarkdownDocument(source, markdown, {
        maxChars: options.maxChars,
        contextNotes: notes,
      }),
    });
  }
  return documents;
}

function selectRows(rows: readonly ManifestRow[], options: Options): ManifestRow[] {
  const seen = new Set<string>();
  const selected: ManifestRow[] = [];
  for (const row of rows) {
    if (row.artifact_type !== "document" || row.status !== "clean") continue;
    if (typeof row.output_path !== "string" || !row.output_path) continue;
    const artifactId = stringValue(row.artifact_id);
    if (!artifactId || seen.has(artifactId)) continue;
    if (options.artifacts.length > 0 && !options.artifacts.includes(artifactId)) continue;
    if (options.sourceIds.length > 0) {
      const sourceId = stringValue(row.source_id);
      if (!sourceId || !options.sourceIds.includes(sourceId)) continue;
    }
    if (options.medicineIds.length > 0) {
      const medicineIds = stringArray(row.medicine_ids);
      if (!options.medicineIds.some((id) => medicineIds.includes(id))) continue;
    }
    seen.add(artifactId);
    selected.push(row);
    if (options.command !== "queue" && options.limit !== null && selected.length >= options.limit)
      break;
  }
  return selected;
}

async function readManifest(path: string): Promise<ManifestRow[]> {
  const text = await readFile(path, "utf8");
  const rows: ManifestRow[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (cause) {
      throw new Error(`Manifest line ${index + 1} is not valid JSON`, { cause });
    }
    if (parsed && typeof parsed === "object") rows.push(parsed as ManifestRow);
  }
  return rows;
}

async function readNotes(path: string): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return notes;
    throw error;
  }
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (cause) {
      throw new Error(`Context note line ${index + 1} is not valid JSON`, { cause });
    }
    const row = parsed as Partial<NoteRow>;
    if (typeof row.context_key !== "string" || typeof row.note !== "string") continue;
    const note = row.note.trim();
    if (note) notes.set(row.context_key, note);
  }
  return notes;
}

async function readNoteRows(path: string): Promise<NoteRow[]> {
  const text = await readFile(path, "utf8");
  const rows: NoteRow[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (cause) {
      throw new Error(`${path} line ${index + 1} is not valid JSON`, { cause });
    }
    const row = parsed as Partial<NoteRow>;
    if (typeof row.context_key !== "string" || !/^[a-f0-9]{64}$/.test(row.context_key)) {
      throw new Error(`${path} line ${index + 1} has an invalid context_key`);
    }
    if (typeof row.note !== "string") {
      throw new Error(`${path} line ${index + 1} has no note`);
    }
    const note = row.note.trim();
    if (note.length < 20 || note.length > MAX_NOTE_CHARS) {
      throw new Error(
        `${path} line ${index + 1} note must be 20-${MAX_NOTE_CHARS} characters (got ${note.length})`,
      );
    }
    rows.push({ ...row, context_key: row.context_key, note } as NoteRow);
  }
  return rows;
}

async function appendNotes(path: string, rows: readonly NoteRow[]): Promise<void> {
  if (rows.length === 0) return;
  await mkdir(dirname(path), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(path, `${payload}\n`, { encoding: "utf8", flag: "a" });
}

function parseOptions(argv: readonly string[]): Options {
  const command = (argv[0] ?? "status") as Options["command"];
  if (!["status", "queue", "digest", "prepare", "apply", "export", "help"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  let root = process.env.RETRIEVAL_CORPUS_ROOT?.trim() || DEFAULT_ROOT;
  let manifest: string | null = null;
  let notes = process.env.RETRIEVAL_CONTEXT_NOTES?.trim() || DEFAULT_NOTES;
  let packets = process.env.RETRIEVAL_CONTEXT_PACKETS?.trim() || DEFAULT_PACKETS;
  let embedInput = process.env.RETRIEVAL_EMBED_INPUT?.trim() || DEFAULT_EMBED_INPUT;
  let maxChars = 4_096;
  let limit: number | null = null;
  let notesFile: string | null = null;
  let bodyChars = 90;
  let pendingOnly = false;
  let allowUnknown = false;
  let requireContext = false;
  const medicineIds: string[] = [];
  const sourceIds: string[] = [];
  const artifacts: string[] = [];

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const next = () => {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case "--root":
        root = next();
        break;
      case "--manifest":
        manifest = next();
        break;
      case "--notes":
        notes = next();
        break;
      case "--packets":
        packets = next();
        break;
      case "--out":
        embedInput = next();
        break;
      case "--medicine":
        for (const value of next().split(",")) {
          const id = value.trim();
          if (!/^MED\d{3}$/.test(id)) throw new Error(`Invalid medicine id: ${id}`);
          medicineIds.push(id);
        }
        break;
      case "--artifact":
        artifacts.push(next().trim());
        break;
      case "--source":
        sourceIds.push(next().trim());
        break;
      case "--body":
        bodyChars = positiveInteger(next(), "--body");
        break;
      case "--pending-only":
        pendingOnly = true;
        break;
      case "--limit":
        limit = positiveInteger(next(), "--limit");
        break;
      case "--max-chars":
        maxChars = positiveInteger(next(), "--max-chars");
        break;
      case "--allow-unknown":
        allowUnknown = true;
        break;
      case "--require-context":
        requireContext = true;
        break;
      default:
        if (command === "apply" && !argument.startsWith("--")) {
          notesFile = argument;
          break;
        }
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  const resolvedRoot = resolve(root);
  return {
    command,
    root: resolvedRoot,
    manifest: resolve(manifest ?? join(resolvedRoot, "manifest.jsonl")),
    notes: resolve(notes),
    packets: resolve(packets),
    embedInput: resolve(embedInput),
    medicineIds: [...new Set(medicineIds)],
    sourceIds: [...new Set(sourceIds)],
    artifacts: [...new Set(artifacts)],
    limit,
    maxChars,
    notesFile: notesFile ? resolve(notesFile) : null,
    bodyChars,
    pendingOnly,
    allowUnknown,
    requireContext,
  };
}

function helpText(): string {
  return [
    "bun run retrieval:contextualize -- <command> [options]",
    "",
    "  status                 coverage of model-written context notes",
    "  queue                  documents with pending chunks, fewest pending first",
    "  digest                 one compact line per chunk, for writing notes",
    "  prepare                write one work packet per document with pending chunks",
    "  apply <notes.jsonl>    validate and merge notes into the store",
    "  export                 write the exact embedding input for every chunk",
    "",
    "  --root <path>          corpus root (default tooling/cleaning-lab/output)",
    "  --manifest <path>      manifest path (default <root>/manifest.jsonl)",
    "  --notes <path>         note store (default tooling/cleaning-lab/output/context/notes.jsonl)",
    "  --packets <path>       packet directory (default <root>/context/packets)",
    "  --out <path>           export path (default <root>/context/embed-input.jsonl)",
    "  --medicine <id>        restrict to one or more MEDxxx documents",
    "  --source <id>          restrict to one source, e.g. BDPM_FR",
    "  --artifact <id>        restrict to one artifact (repeatable)",
    "  --limit <n>            at most n documents",
    "  --max-chars <n>        chunk ceiling (default 4096)",
    "  --body <n>             digest body preview length (default 90)",
    "  --pending-only         digest only chunks that still need a note",
    "  --allow-unknown        apply notes whose chunk no longer exists",
    "  --require-context      export fails if any selected chunk has no note",
  ].join("\n");
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
