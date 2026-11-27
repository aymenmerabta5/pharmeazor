import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ENTITY_MENTION_TAXONOMY_VERSION } from "@repo/modules/retrieval";
import { sha256File } from "./artifact-jsonl";

const SUPPORTED_ENTITY_EXTRACTOR_VERSION = "entity-extraction-v1";

interface EntityArtifactManifest {
  readonly schemaVersion?: unknown;
  readonly status?: unknown;
  readonly extractorVersion?: unknown;
  readonly ontologyVersion?: unknown;
  readonly filesWritten?: unknown;
  readonly graphArtifact?: {
    readonly manifestSha256?: unknown;
    readonly profile?: unknown;
    readonly configHash?: unknown;
    readonly corpusSnapshotHash?: unknown;
    readonly sourceManifestSha256?: unknown;
  };
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
  readonly counts?: Readonly<Record<string, unknown>>;
}

export interface EntityArtifactInput {
  readonly directory: string;
  readonly manifest: EntityArtifactManifest;
  readonly manifestSha256: string;
  readonly mentionsPath: string;
  readonly observationsPath: string;
  readonly mentionsChecksum: string;
  readonly observationsChecksum: string;
}

/**
 * Validate and locate the candidate entity artifact consumed by downstream
 * offline stages. It rejects dry-run manifests and any changed file.
 */
export async function readEntityArtifactInput(directory: string): Promise<EntityArtifactInput> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as EntityArtifactManifest;
  if (manifest.schemaVersion !== 1 || manifest.status !== "candidate_only") {
    throw new Error("Unsupported entity artifact manifest");
  }
  if (manifest.filesWritten !== true) {
    throw new Error("The entity artifact manifest does not describe written files");
  }
  if (manifest.ontologyVersion !== ENTITY_MENTION_TAXONOMY_VERSION) {
    throw new Error(
      `Entity ontology ${String(manifest.ontologyVersion)} is not ${ENTITY_MENTION_TAXONOMY_VERSION}`,
    );
  }
  if (manifest.extractorVersion !== SUPPORTED_ENTITY_EXTRACTOR_VERSION) {
    throw new Error(
      `Entity extractor ${String(manifest.extractorVersion)} is not ${SUPPORTED_ENTITY_EXTRACTOR_VERSION}`,
    );
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const mentionsFile = requiredString(files.entityMentions, "entity files.entityMentions");
  const observationsFile = requiredString(
    files.structuredObservations,
    "entity files.structuredObservations",
  );
  const taxonomyFile = requiredString(files.taxonomy, "entity files.taxonomy");
  const mentionsPath = join(directory, mentionsFile);
  const observationsPath = join(directory, observationsFile);
  const taxonomyPath = join(directory, taxonomyFile);
  const mentionsChecksum = await sha256File(mentionsPath);
  const observationsChecksum = await sha256File(observationsPath);
  if (
    mentionsChecksum !== requiredString(checksums.entityMentions, "entity checksums.entityMentions")
  ) {
    throw new Error("Entity mentions checksum mismatch");
  }
  if (
    observationsChecksum !==
    requiredString(checksums.structuredObservations, "entity checksums.structuredObservations")
  ) {
    throw new Error("Structured observations checksum mismatch");
  }
  const taxonomyChecksum = await sha256File(taxonomyPath);
  if (taxonomyChecksum !== requiredString(checksums.taxonomy, "entity checksums.taxonomy")) {
    throw new Error("Entity taxonomy checksum mismatch");
  }
  const taxonomy = JSON.parse(await readFile(taxonomyPath, "utf8")) as {
    readonly version?: unknown;
    readonly status?: unknown;
  };
  if (
    taxonomy.version !== ENTITY_MENTION_TAXONOMY_VERSION ||
    taxonomy.status !== "temporary_review_required"
  ) {
    throw new Error("Entity taxonomy is not the expected temporary review artifact");
  }
  return {
    directory,
    manifest,
    manifestSha256: createHash("sha256").update(manifestText, "utf8").digest("hex"),
    mentionsPath,
    observationsPath,
    mentionsChecksum,
    observationsChecksum,
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
