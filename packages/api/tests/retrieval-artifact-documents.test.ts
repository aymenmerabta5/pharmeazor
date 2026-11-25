import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import type { ArtifactChunk } from "../src/adapters/retrieval/precomputed";
import { artifactDocumentsFromSnapshot } from "../src/workers/retrieval/artifact-documents";

function row(overrides: Partial<ArtifactChunk> = {}): ArtifactChunk {
  const text = overrides.text ?? "Contextualized chunk text.\n";
  return {
    row: 0,
    chunkId: "MED001__SRC_ANPP_RCP__DOC001__smpc#dosage-0#0",
    artifactId: "MED001__SRC_ANPP_RCP__DOC001__smpc",
    sectionCode: "dosage",
    contextKey: "a".repeat(64),
    language: "fr",
    textSha256: createHash("sha256").update(text, "utf8").digest("hex"),
    text,
    ...overrides,
  };
}

describe("artifactDocumentsFromSnapshot", () => {
  it("uses artifact text as the embedded content and keeps the artifact hash", () => {
    const first = row();
    const second = row({
      row: 1,
      chunkId: "MED001__SRC_ANPP_RCP__DOC001__smpc#dosage-0#1",
      text: "Second chunk.\n",
      textSha256: createHash("sha256").update("Second chunk.\n", "utf8").digest("hex"),
    });

    const [document] = artifactDocumentsFromSnapshot([second, first], []);

    expect(document).toBeDefined();
    expect(document!.chunks).toHaveLength(2);
    expect(document!.chunks[0]!.chunkId).toBe(first.chunkId);
    expect(document!.chunks[1]!.chunkId).toBe(second.chunkId);
    expect(document!.chunks[0]!.content).toBe(first.text);
    expect(document!.chunks[0]!.contextualizedContent).toBe(first.text);
    expect(document!.chunks[0]!.contentHash).toBe(first.textSha256);
    expect(document!.chunks[0]!.ordinal).toBe(0);
    expect(document!.chunks[1]!.ordinal).toBe(1);
  });

  it("joins manifest metadata when the artifact id is still present", () => {
    const artifact = row();
    const [document] = artifactDocumentsFromSnapshot(
      [artifact],
      [
        {
          artifact_id: artifact.artifactId,
          title: "PARACETAMOL 500 mg",
          source_id: "ANPP_RCP",
          source_name: "ANPP SmPC",
          authority_level: 1,
          language: "en",
          document_type: "smpc",
        },
      ],
    );

    expect(document!.source.title).toBe("PARACETAMOL 500 mg");
    expect(document!.source.sourceName).toBe("ANPP SmPC");
    expect(document!.source.authorityLevel).toBe(1);
    expect(document!.source.language).toBe("en");
    expect(document!.row.partial_provenance).toBe(false);
  });

  it("synthesizes partial provenance for artifact ids absent from the manifest", () => {
    const artifact = row();
    const [document] = artifactDocumentsFromSnapshot([artifact], []);

    expect(document!.row.partial_provenance).toBe(true);
    expect(document!.row.provenance_source).toBe("embedding-artifact");
    expect(document!.source.sourceId).toBe("MED001");
    expect(document!.source.documentId).toBe(artifact.artifactId);
    expect(document!.markdown).toBe("");
    expect(document!.contentSha256).toBe(artifact.textSha256);
  });
});
