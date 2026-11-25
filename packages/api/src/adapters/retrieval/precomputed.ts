/**
 * Precomputed BGE-M3 artifact reader.
 *
 * The embedding lab writes three files:
 *
 *   manifest.json   run metadata, pinned model revision, checksums
 *   chunks.jsonl    one row per vector: chunk id, text hash, vector index
 *   vectors.npy     float16 matrix, one row per chunk
 *
 * The indexer does not trust row order or a stale artifact. It re-chunks the
 * corpus with the production chunker, joins every chunk by `chunk_id`, and
 * requires the artifact's `text_sha256` to equal the chunker's `contentHash`.
 * A mismatch means the vectors describe different text and the import stops.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  assertNormalized,
  parseNpy,
  type ChunkDraft,
  type NpyDtype,
} from "@repo/modules/retrieval";

export interface PrecomputedVectorSummary {
  readonly directory: string;
  readonly model: string;
  readonly revision: string;
  readonly dimensions: number;
  readonly dtype: NpyDtype;
  readonly rows: number;
  readonly vectorsSha256: string;
  readonly chunksSha256: string;
}

export interface PrecomputedVectorSource {
  readonly model: string;
  readonly revision: string;
  readonly dimensions: number;
  readonly dtype: NpyDtype;
  readonly rows: number;
  /** Validate the artifact row against a chunk without materializing the vector. */
  validateChunk(chunk: ChunkDraft): void;
  /** Validate and materialize the vector for a chunk. */
  vectorFor(chunk: ChunkDraft): number[];
  chunkIds(): string[];
  /** Artifact rows, for an indexer that treats the artifact itself as the corpus snapshot. */
  artifactChunks(): readonly ArtifactChunk[];
  describe(): PrecomputedVectorSummary;
}

interface EmbeddingManifest {
  readonly schema_version?: unknown;
  readonly model?: {
    readonly repo_id?: unknown;
    readonly revision?: unknown;
    readonly dim?: unknown;
    readonly pooling?: unknown;
    readonly normalize?: unknown;
  };
  readonly input?: { readonly rows?: unknown };
  readonly output?: {
    readonly rows?: unknown;
    readonly dim?: unknown;
    readonly dtype?: unknown;
    readonly vectors_sha256?: unknown;
    readonly chunks_sha256?: unknown;
  };
  readonly checksums?: {
    readonly vectors_sha256?: unknown;
    readonly chunks_sha256?: unknown;
  };
}

export interface ArtifactChunk {
  readonly row: number;
  readonly chunkId: string;
  readonly artifactId: string;
  readonly sectionCode: string;
  readonly contextKey: string;
  readonly language: string;
  readonly textSha256: string;
  /** Final contextualized text as embedded by the artifact. */
  readonly text: string;
}

interface ValidatedManifest {
  readonly model: string;
  readonly revision: string;
  readonly dimensions: number;
  readonly dtype: NpyDtype;
  readonly rows: number;
  readonly vectorsSha256: string;
  readonly chunksSha256: string;
}

export async function openPrecomputedVectors(directory: string): Promise<PrecomputedVectorSource> {
  const root = resolve(directory);
  const manifestPath = join(root, "manifest.json");
  const chunksPath = join(root, "chunks.jsonl");
  const vectorsPath = join(root, "vectors.npy");

  const manifest = validateManifest(await readJson(manifestPath));
  const actualVectorsSha256 = await sha256File(vectorsPath);
  if (actualVectorsSha256 !== manifest.vectorsSha256) {
    throw new Error(
      `vectors.npy does not match the artifact manifest (expected ${manifest.vectorsSha256}, got ${actualVectorsSha256})`,
    );
  }
  const actualChunksSha256 = await sha256File(chunksPath);
  if (actualChunksSha256 !== manifest.chunksSha256) {
    throw new Error(
      `chunks.jsonl does not match the artifact manifest (expected ${manifest.chunksSha256}, got ${actualChunksSha256})`,
    );
  }

  const artifactChunks = await readChunkRows(chunksPath, manifest);
  const matrix = parseNpy(await readFile(vectorsPath));
  if (matrix.rows !== manifest.rows) {
    throw new Error(
      `vectors.npy has ${matrix.rows} rows but the manifest declares ${manifest.rows}`,
    );
  }
  if (matrix.columns !== manifest.dimensions) {
    throw new Error(
      `vectors.npy has ${matrix.columns} columns but the manifest declares ${manifest.dimensions}`,
    );
  }
  if (matrix.dtype !== manifest.dtype) {
    throw new Error(`vectors.npy is ${matrix.dtype} but the manifest declares ${manifest.dtype}`);
  }
  assertNormalized(matrix);

  const byChunkId = new Map<string, ArtifactChunk>();
  for (const chunk of artifactChunks) {
    if (byChunkId.has(chunk.chunkId)) {
      throw new Error(`Duplicate chunk id in chunks.jsonl: ${chunk.chunkId}`);
    }
    byChunkId.set(chunk.chunkId, chunk);
  }

  function requireChunk(chunk: ChunkDraft): ArtifactChunk {
    const artifact = byChunkId.get(chunk.chunkId);
    if (!artifact) {
      throw new Error(
        `No precomputed vector for chunk ${chunk.chunkId}; re-run the embedding lab after changing the corpus or chunker`,
      );
    }
    if (artifact.artifactId !== chunk.artifactId) {
      throw new Error(
        `Chunk ${chunk.chunkId} belongs to ${chunk.artifactId} but the artifact says ${artifact.artifactId}`,
      );
    }
    if (artifact.sectionCode !== chunk.sectionCode) {
      throw new Error(
        `Chunk ${chunk.chunkId} is section ${chunk.sectionCode} but the artifact says ${artifact.sectionCode}`,
      );
    }
    if (artifact.textSha256 !== chunk.contentHash) {
      throw new Error(
        `Chunk ${chunk.chunkId} has changed since it was embedded (artifact ${artifact.textSha256}, chunker ${chunk.contentHash}); re-run the embedding lab`,
      );
    }
    return artifact;
  }

  return {
    model: manifest.model,
    revision: manifest.revision,
    dimensions: manifest.dimensions,
    dtype: manifest.dtype,
    rows: manifest.rows,
    validateChunk(chunk: ChunkDraft): void {
      requireChunk(chunk);
    },
    vectorFor(chunk: ChunkDraft): number[] {
      const artifact = requireChunk(chunk);
      const vector = matrix.row(artifact.row);
      if (vector.length !== manifest.dimensions) {
        throw new Error(
          `Precomputed vector ${chunk.chunkId} has ${vector.length} dimensions, expected ${manifest.dimensions}`,
        );
      }
      return vector;
    },
    chunkIds(): string[] {
      return [...byChunkId.keys()];
    },
    artifactChunks(): readonly ArtifactChunk[] {
      return artifactChunks;
    },
    describe(): PrecomputedVectorSummary {
      return {
        directory: root,
        model: manifest.model,
        revision: manifest.revision,
        dimensions: manifest.dimensions,
        dtype: manifest.dtype,
        rows: manifest.rows,
        vectorsSha256: manifest.vectorsSha256,
        chunksSha256: manifest.chunksSha256,
      };
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(`Cannot read the embedding artifact manifest at ${path}`, { cause });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(`The embedding artifact manifest at ${path} is not valid JSON`, {
      cause,
    });
  }
}

function validateManifest(value: unknown): ValidatedManifest {
  if (!value || typeof value !== "object") {
    throw new Error("The embedding artifact manifest must be a JSON object");
  }
  const manifest = value as EmbeddingManifest;
  if (manifest.schema_version !== 1) {
    throw new Error(
      `Unsupported embedding artifact schema_version ${String(manifest.schema_version)}; expected 1`,
    );
  }
  if (!manifest.model || typeof manifest.model !== "object") {
    throw new Error("The embedding artifact manifest has no model block");
  }
  if (!manifest.output || typeof manifest.output !== "object") {
    throw new Error("The embedding artifact manifest has no output block");
  }

  const model = requireString(manifest.model.repo_id, "model.repo_id");
  const revision = requireString(manifest.model.revision, "model.revision");
  const dimensions = requireInteger(manifest.model.dim, "model.dim", 1);
  if (dimensions !== 1024) {
    throw new Error(
      `The retrieval schema stores 1024-dimensional BGE-M3 vectors; the artifact has ${dimensions}`,
    );
  }
  const pooling = requireString(manifest.model.pooling, "model.pooling").toLowerCase();
  if (pooling !== "cls") {
    throw new Error(`The artifact uses ${pooling} pooling; BGE-M3 retrieval expects cls`);
  }
  if (manifest.model.normalize !== true) {
    throw new Error("The artifact is not L2-normalized; cosine retrieval would be invalid");
  }

  const rows = requireInteger(manifest.output.rows, "output.rows", 1);
  if (manifest.input?.rows !== undefined) {
    const inputRows = requireInteger(manifest.input.rows, "input.rows", 0);
    if (inputRows !== rows) {
      throw new Error(`The artifact embedded ${rows} rows but its input declares ${inputRows}`);
    }
  }
  const outputDimensions = requireInteger(manifest.output.dim, "output.dim", 1);
  if (outputDimensions !== dimensions) {
    throw new Error(
      `The artifact model is ${dimensions}-dimensional but its output is ${outputDimensions}-dimensional`,
    );
  }
  const dtype = requireDtype(manifest.output.dtype);
  const vectorsSha256 = requireSha256(
    manifest.checksums?.vectors_sha256 ?? manifest.output.vectors_sha256,
    "checksums.vectors_sha256",
  );
  const chunksSha256 = requireSha256(
    manifest.checksums?.chunks_sha256 ?? manifest.output.chunks_sha256,
    "checksums.chunks_sha256",
  );

  return { model, revision, dimensions, dtype, rows, vectorsSha256, chunksSha256 };
}

async function readChunkRows(path: string, manifest: ValidatedManifest): Promise<ArtifactChunk[]> {
  const text = await readFile(path, "utf8");
  const rows: ArtifactChunk[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (cause) {
      throw new Error(`chunks.jsonl line ${index + 1} is not valid JSON`, { cause });
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`chunks.jsonl line ${index + 1} is not an object`);
    }
    const row = parsed as Record<string, unknown>;
    const position = requireInteger(row.row, `chunks.jsonl line ${index + 1} row`, 0);
    if (position !== rows.length) {
      throw new Error(
        `chunks.jsonl line ${index + 1} has row ${position}, expected ${rows.length}`,
      );
    }
    const vectorIndex = requireInteger(
      row.vector_index,
      `chunks.jsonl line ${index + 1} vector_index`,
      0,
    );
    if (vectorIndex !== position) {
      throw new Error(
        `chunks.jsonl line ${index + 1} has vector_index ${vectorIndex}, expected ${position}`,
      );
    }
    const embeddingModel = requireString(
      row.embedding_model,
      `chunks.jsonl line ${index + 1} embedding_model`,
    );
    if (embeddingModel !== manifest.model) {
      throw new Error(
        `chunks.jsonl line ${index + 1} was embedded with ${embeddingModel}, expected ${manifest.model}`,
      );
    }
    const embeddingRevision = requireString(
      row.embedding_revision,
      `chunks.jsonl line ${index + 1} embedding_revision`,
    );
    if (embeddingRevision !== manifest.revision) {
      throw new Error(
        `chunks.jsonl line ${index + 1} uses revision ${embeddingRevision}, expected ${manifest.revision}`,
      );
    }
    const embeddingDimensions = requireInteger(
      row.embedding_dim,
      `chunks.jsonl line ${index + 1} embedding_dim`,
      1,
    );
    if (embeddingDimensions !== manifest.dimensions) {
      throw new Error(
        `chunks.jsonl line ${index + 1} has ${embeddingDimensions} dimensions, expected ${manifest.dimensions}`,
      );
    }
    const embeddingDtype = requireDtype(
      row.embedding_dtype,
      `chunks.jsonl line ${index + 1} embedding_dtype`,
    );
    if (embeddingDtype !== manifest.dtype) {
      throw new Error(
        `chunks.jsonl line ${index + 1} is ${embeddingDtype}, expected ${manifest.dtype}`,
      );
    }
    const text = requireString(row.text, `chunks.jsonl line ${index + 1} text`);
    const textSha256 = requireSha256(row.text_sha256, `chunks.jsonl line ${index + 1} text_sha256`);
    if (createHash("sha256").update(text, "utf8").digest("hex") !== textSha256) {
      throw new Error(`chunks.jsonl line ${index + 1} text does not match its text_sha256`);
    }
    rows.push({
      row: position,
      chunkId: requireString(row.chunk_id, `chunks.jsonl line ${index + 1} chunk_id`),
      artifactId: requireString(row.artifact_id, `chunks.jsonl line ${index + 1} artifact_id`),
      sectionCode: requireString(row.section_code, `chunks.jsonl line ${index + 1} section_code`),
      contextKey: requireSha256(row.context_key, `chunks.jsonl line ${index + 1} context_key`),
      language: requireString(row.language, `chunks.jsonl line ${index + 1} language`),
      textSha256,
      text,
    });
  }
  if (rows.length !== manifest.rows) {
    throw new Error(
      `chunks.jsonl has ${rows.length} rows but the manifest declares ${manifest.rows}`,
    );
  }
  return rows;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireInteger(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return value;
}

function requireDtype(value: unknown, name = "output.dtype"): NpyDtype {
  if (value === "float16" || value === "float32") return value;
  throw new Error(`${name} must be float16 or float32`);
}

function requireSha256(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${name} must be a 64-character SHA-256 hex digest`);
  }
  return value.toLowerCase();
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}
