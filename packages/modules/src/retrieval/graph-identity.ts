import { createHash } from "node:crypto";
import type { GraphChunkingProfile } from "./graph-chunk-types";

/** Content-addressed snapshot identity for one exact graph document input. */
export function graphDocumentSnapshotId(
  profile: GraphChunkingProfile,
  configHash: string,
  artifactId: string,
  documentContentSha256: string,
): string {
  const digest = sha256([profile, configHash, artifactId, documentContentSha256].join("\u0000"));
  return `snapshot_${digest.slice(0, 24)}`;
}

/** Profile, configuration, and snapshot scoped graph text-unit identity. */
export function graphScopedTextUnitId(
  profile: GraphChunkingProfile,
  configHash: string,
  documentSnapshotId: string,
  legacyChunkId: string,
): string {
  const snapshotScope = documentSnapshotId.replace(/^snapshot_/u, "").slice(0, 16);
  return `${profile}:${configHash.slice(0, 16)}:${snapshotScope}:${legacyChunkId}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
