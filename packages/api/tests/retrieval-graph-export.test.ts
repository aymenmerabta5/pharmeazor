import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { runGraphChunkExport } from "../src/workers/retrieval/graph-export";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function fixture(): Promise<{
  readonly root: string;
  readonly manifest: string;
  readonly output: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "graph-export-"));
  roots.push(root);
  const artifactId = "MED001__SRC_ANPP_RCP__DOC001__smpc";
  const body =
    "## Posologie\n\n500 mg par prise.\n\n## Contre-indications\n\nInsuffisance hepatique.";
  const relativePath = join("documents", "MED001", `${artifactId}.md`);
  await mkdir(join(root, "documents", "MED001"), { recursive: true });
  await writeFile(join(root, relativePath), body, "utf8");
  const manifest = join(root, "manifest.jsonl");
  await writeFile(
    manifest,
    `${JSON.stringify({
      artifact_id: artifactId,
      artifact_type: "document",
      output_path: relativePath.replaceAll("\\", "/"),
      status: "clean",
      document_id: "DOC001",
      source_id: "ANPP_RCP",
      source_name: "ANPP",
      authority_level: 1,
      jurisdiction: "DZ",
      document_type: "smpc",
      language: "fr",
      medicine_ids: ["MED001"],
      medicine_names: ["Paracetamol"],
      inn: "paracetamol",
      brand_name: "Doliprane",
      strength_form: "500 mg comprime",
      title: "Paracetamol 500 mg",
      source_urls: ["https://example.test/doc"],
      content_sha256: sha256(body),
    })}\n`,
    "utf8",
  );
  return { root, manifest, output: join(root, "graph-evidence") };
}

describe("graph evidence export", () => {
  it("writes versioned sections, text units, diagnostics, and a manifest", async () => {
    const { root, manifest, output } = await fixture();
    const report = await runGraphChunkExport({
      root,
      manifestPath: manifest,
      outputDir: output,
    });

    expect(report.filesWritten).toBe(true);
    expect(report.counts.documents).toBe(1);
    expect(report.counts.sections).toBe(2);
    expect(report.counts.textUnits).toBe(2);
    expect(report.profile).toBe("graph-evidence-v1");
    expect(report.algorithmVersion).toBe("graph-chunk-v1");
    expect(report.sectionTaxonomyVersion).toBe("clinical-heading-v1");
    expect(report.textHelperVersion).toBe("retrieval-text-v1");
    expect(report.documents[0]?.documentSnapshotId).toMatch(/^snapshot_[a-f0-9]{24}$/u);

    const sections = (await readFile(join(output, "sections.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const units = (await readFile(join(output, "text-units.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const stored = JSON.parse(
      await readFile(join(output, "manifest.json"), "utf8"),
    ) as typeof report;

    expect(sections).toHaveLength(2);
    expect(units).toHaveLength(2);
    expect(units[0]?.textUnitId).toContain(report.documents[0]?.documentSnapshotId.slice(9, 25));
    expect(stored.filesWritten).toBe(true);
    expect(stored.checksums.textUnits).toBe(report.checksums.textUnits);
    expect(stored.counts).toEqual(report.counts);
  });

  it("validates a dry run without creating the output directory", async () => {
    const { root, manifest, output } = await fixture();
    const report = await runGraphChunkExport({
      root,
      manifestPath: manifest,
      outputDir: output,
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.filesWritten).toBe(false);
    await expect(stat(output)).rejects.toThrow();
  });

  it("fails when the manifest source hash does not match the clean body", async () => {
    const { root, manifest, output } = await fixture();
    const rows = (await readFile(manifest, "utf8")).trim().split("\n");
    const row = JSON.parse(rows[0]!) as Record<string, unknown>;
    await writeFile(
      manifest,
      `${JSON.stringify({ ...row, content_sha256: sha256("different body") })}\n`,
      "utf8",
    );

    await expect(
      runGraphChunkExport({ root, manifestPath: manifest, outputDir: output }),
    ).rejects.toThrow("Graph source hash mismatch");
  });
});
