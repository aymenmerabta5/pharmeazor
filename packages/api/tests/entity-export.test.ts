import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { runGraphChunkExport } from "../src/workers/retrieval/graph-export";
import { runEntityExtraction } from "../src/workers/retrieval/entity-export";

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
  readonly graph: string;
  readonly metadata: string;
  readonly structured: string;
  readonly output: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "entity-export-"));
  roots.push(root);
  const metadata = join(root, "metadata");
  const structured = join(root, "structured");
  const documents = join(root, "documents", "MED001");
  const graph = join(root, "graph");
  const output = join(root, "entity-mentions");
  await mkdir(metadata, { recursive: true });
  await mkdir(structured, { recursive: true });
  await mkdir(documents, { recursive: true });

  const artifactId = "MED001__SRC_ANPP_RCP__DOC001__smpc";
  const body = [
    "## Indications",
    "DOLIPRANE 500 mg est indique dans la douleur. ATC N02BE01.",
    "## Effets indesirables",
    "- Nausee",
    "- Vertige",
    "## Excipients",
    "Amidon de mais, silice colloidale.",
  ].join("\n\n");
  await writeFile(join(documents, `${artifactId}.md`), body, "utf8");
  const manifest = join(root, "manifest.jsonl");
  await writeFile(
    manifest,
    `${JSON.stringify({
      artifact_id: artifactId,
      artifact_type: "document",
      output_path: `documents/MED001/${artifactId}.md`,
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
      brand_name: "DOLIPRANE",
      strength_form: "500 mg comprime",
      title: "Doliprane 500 mg",
      source_urls: ["https://example.test/doc"],
      content_sha256: sha256(body),
    })}\n`,
    "utf8",
  );

  await writeFile(
    join(metadata, "name_map.csv"),
    [
      "medicine_id,dci,dci_as_registered,atc,class,brand_name,brand_type,strength,form,holder,dci_code,num_enregistrement,source_id",
      "MED001,paracetamol,PARACETAMOL,N02BE01,Antalgiques,DOLIPRANE,algerian_official,500MG,COMPRIME,LABORATOIRE TEST,03 B 061,503/03 B 061/16,SANTE_MSP",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(structured, "nomenclature_products.csv"),
    [
      "product_uid,source_id,in_scope,dci,dci_code,brand,form,dosage,pack,schedule,holder,holder_country,registration_number,product_type,status,shelf_life",
      "p1,SANTE_MSP,True,paracetamol,03 B 061,DOLIPRANE,COMPRIME,500MG,B/20,LISTE II,LABORATOIRE TEST,ALGERIE,503/03 B 061/16,GE,enregistre,36 MOIS",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(structured, "bdpm_cis.csv"),
    [
      "cis,name,form,route,status,procedure,marketing_status,holder,medicine_ids",
      "66313736,DOLIPRANE,COMPRIME,orale,Autorisation active,Procedure nationale,Commercialisee,LABORATOIRE TEST,MED001",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(metadata, "sources.csv"),
    [
      "source_id,source_name,source_type,jurisdiction,language,country",
      "ANPP_RCP,ANPP SmPC,official_agency,DZ,fr,Algeria",
      "DAILYMED,DailyMed,foreign_institutional,US,en,United States",
    ].join("\n"),
    "utf8",
  );

  await runGraphChunkExport({
    root,
    manifestPath: manifest,
    outputDir: graph,
  });
  return { root, manifest, graph, metadata, structured, output };
}

describe("candidate-only entity export", () => {
  it("writes mentions, structured observations, taxonomy, and provenance", async () => {
    const { root, manifest, graph, metadata, structured, output } = await fixture();
    const report = await runEntityExtraction({
      graphDir: graph,
      sourceRoot: root,
      sourceManifestPath: manifest,
      metadataDir: metadata,
      structuredDir: structured,
      outputDir: output,
    });

    expect(report.filesWritten).toBe(true);
    expect(report.status).toBe("candidate_only");
    expect(report.ontologyVersion).toBe("entity-mention-taxonomy-v0.1");
    expect(report.counts.mentions).toBeGreaterThan(0);
    expect(report.counts.structuredObservations).toBeGreaterThan(0);
    expect(report.counts.mentionsByKind.brand_term).toBeGreaterThan(0);
    expect(report.counts.mentionsByKind.quantity).toBeGreaterThan(0);
    expect(report.counts.mentionsByKind.identifier_atc).toBeGreaterThan(0);
    expect(report.counts.mentionsByKind.adverse_effect).toBeGreaterThan(0);
    expect(report.counts.mentionsByKind.excipient).toBeGreaterThan(0);
    expect(report.counts.observationsByKind.medicinal_product).toBeGreaterThan(0);

    const mentions = (await readFile(join(output, "entity-mentions.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const observations = (await readFile(join(output, "structured-observations.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const taxonomy = JSON.parse(await readFile(join(output, "taxonomy.json"), "utf8")) as {
      status: string;
      definitions: unknown[];
    };
    const stored = JSON.parse(
      await readFile(join(output, "manifest.json"), "utf8"),
    ) as typeof report;

    expect(mentions.length).toBe(report.counts.mentions);
    expect(observations.length).toBe(report.counts.structuredObservations);
    expect(taxonomy.status).toBe("temporary_review_required");
    expect(taxonomy.definitions.length).toBeGreaterThan(20);
    for (const mention of mentions) {
      expect(mention.observationState).toBe("quarantined");
      expect("canonicalEntityId" in mention).toBe(false);
      const evidence = mention.evidence as Record<string, unknown>;
      expect(typeof evidence.quote).toBe("string");
      expect(typeof evidence.documentStart).toBe("number");
      expect(typeof evidence.documentEnd).toBe("number");
    }
    expect(stored.filesWritten).toBe(true);
    expect(stored.checksums.entityMentions).toBe(report.checksums.entityMentions);
    expect(stored.counts).toEqual(report.counts);
  });

  it("validates a dry run without creating the output directory", async () => {
    const { root, manifest, graph, metadata, structured, output } = await fixture();
    const report = await runEntityExtraction({
      graphDir: graph,
      sourceRoot: root,
      sourceManifestPath: manifest,
      metadataDir: metadata,
      structuredDir: structured,
      outputDir: output,
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.filesWritten).toBe(false);
    await expect(stat(output)).rejects.toThrow();
  });

  it("rejects a changed graph artifact checksum", async () => {
    const { graph, manifest, metadata, structured, output, root } = await fixture();
    const unitsPath = join(graph, "text-units.jsonl");
    await writeFile(unitsPath, `${await readFile(unitsPath, "utf8")}tampered\n`, "utf8");

    await expect(
      runEntityExtraction({
        graphDir: graph,
        sourceRoot: root,
        sourceManifestPath: manifest,
        metadataDir: metadata,
        structuredDir: structured,
        outputDir: output,
      }),
    ).rejects.toThrow("checksum mismatch");
  });
});
