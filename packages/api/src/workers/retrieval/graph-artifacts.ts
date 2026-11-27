import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ENTITY_LINK_TAXONOMY_VERSION,
  RELATIONSHIP_TAXONOMY_VERSION,
} from "@repo/modules/retrieval";
import { sha256File } from "./artifact-jsonl";

interface LinkManifest {
  readonly schemaVersion?: unknown;
  readonly status?: unknown;
  readonly ontologyVersion?: unknown;
  readonly filesWritten?: unknown;
  readonly entityArtifact?: {
    readonly manifestSha256?: unknown;
  };
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
  readonly counts?: Readonly<Record<string, unknown>>;
}

interface RelationshipManifest {
  readonly schemaVersion?: unknown;
  readonly status?: unknown;
  readonly ontologyVersion?: unknown;
  readonly filesWritten?: unknown;
  readonly entityArtifact?: {
    readonly manifestSha256?: unknown;
  };
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
  readonly counts?: Readonly<Record<string, unknown>>;
}

export interface LinkArtifactInput {
  readonly directory: string;
  readonly manifest: LinkManifest;
  readonly manifestSha256: string;
  readonly confidentMatchesPath: string;
  readonly confidentMatchesSha256: string;
}

export interface RelationshipArtifactInput {
  readonly directory: string;
  readonly manifest: RelationshipManifest;
  readonly manifestSha256: string;
  readonly relationshipCandidatesPath: string;
  readonly relationshipCandidatesSha256: string;
}

export async function readLinkArtifactInput(directory: string): Promise<LinkArtifactInput> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as LinkManifest;
  if (manifest.schemaVersion !== 1 || manifest.status !== "candidate_only") {
    throw new Error("Unsupported entity-link artifact manifest");
  }
  if (manifest.filesWritten !== true) {
    throw new Error("The entity-link artifact has not been written");
  }
  if (manifest.ontologyVersion !== ENTITY_LINK_TAXONOMY_VERSION) {
    throw new Error(
      `Entity-link ontology ${String(manifest.ontologyVersion)} is not ${ENTITY_LINK_TAXONOMY_VERSION}`,
    );
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const confidentFile = requiredString(files.confidentMatches, "link files.confidentMatches");
  const confidentMatchesPath = join(directory, confidentFile);
  const confidentMatchesSha256 = await sha256File(confidentMatchesPath);
  if (
    confidentMatchesSha256 !==
    requiredString(checksums.confidentMatches, "link checksums.confidentMatches")
  ) {
    throw new Error("Confident entity-link checksum mismatch");
  }
  return {
    directory,
    manifest,
    manifestSha256: createHash("sha256").update(manifestText, "utf8").digest("hex"),
    confidentMatchesPath,
    confidentMatchesSha256,
  };
}

export async function readRelationshipArtifactInput(
  directory: string,
): Promise<RelationshipArtifactInput> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as RelationshipManifest;
  if (manifest.schemaVersion !== 1 || manifest.status !== "candidate_only") {
    throw new Error("Unsupported relationship artifact manifest");
  }
  if (manifest.filesWritten !== true) {
    throw new Error("The relationship artifact has not been written");
  }
  if (manifest.ontologyVersion !== RELATIONSHIP_TAXONOMY_VERSION) {
    throw new Error(
      `Relationship ontology ${String(manifest.ontologyVersion)} is not ${RELATIONSHIP_TAXONOMY_VERSION}`,
    );
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const candidatesFile = requiredString(
    files.relationshipCandidates,
    "relationship files.relationshipCandidates",
  );
  const relationshipCandidatesPath = join(directory, candidatesFile);
  const relationshipCandidatesSha256 = await sha256File(relationshipCandidatesPath);
  if (
    relationshipCandidatesSha256 !==
    requiredString(
      checksums.relationshipCandidates,
      "relationship checksums.relationshipCandidates",
    )
  ) {
    throw new Error("Relationship candidates checksum mismatch");
  }
  return {
    directory,
    manifest,
    manifestSha256: createHash("sha256").update(manifestText, "utf8").digest("hex"),
    relationshipCandidatesPath,
    relationshipCandidatesSha256,
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
