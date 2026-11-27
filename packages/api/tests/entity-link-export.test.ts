import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { runEntityLinkExtraction } from "../src/workers/retrieval/entity-link-export";
import { runEntityExtraction } from "../src/workers/retrieval/entity-export";
import { runGraphChunkExport } from "../src/workers/retrieval/graph-export";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function fixture(): Promise<{
  readonly graph: string;
  readonly entities: string;
  readonly output: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "entity-link-export-"));
  roots.push(root);
  const metadata = join(root, "metadata");
  const structured = join(root, "structured");
  const documents = join(root, "documents", "MED001");
  const graph = join(root, "graph");
  const entities = join(root, "entity-mentions");
  const output = join(root, "entity-links");
  await mkdir(metadata, { recursive: true });
  await mkdir(structured, { recursive: true });
  await mkdir(documents, { recursive: true });

  const artifactId = "MED001__SRC_ANPP_RCP__DOC001__smpc";
  const body = [
    "## Indications",
    "DOLIPRANE 500 mg est indique dans la douleur.",
    "## Effets indesirables",
    "DOLIPRANE peut provoquer une nausee.",
    "## Autres informations",
    "DOLIPRANE, titulaire : LABORATOIRE TEST. ATC N02BE01.",
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
      "MED002,paracetamol,PARACETAMOL,N02BE01,Antalgiques,DOLIPRANE,algerian_official,250MG,COMPRIME,LABORATOIRE TEST,03 B 062,504/04 B 062/17,SANTE_MSP",
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
      "66313736,DOLIPRANE,COMPRIME,orale,Autorisation active,Procedure nationale,Commercialisee,UNIQUE HOLDER,MED001",
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

  await runGraphChunkExport({ root, manifestPath: manifest, outputDir: graph });
  await runEntityExtraction({
    graphDir: graph,
    sourceRoot: root,
    sourceManifestPath: manifest,
    metadataDir: metadata,
    structuredDir: structured,
    outputDir: entities,
  });
  return { graph, entities, output };
}

describe("candidate-only entity-link export", () => {
  it("writes confident, ambiguous, and unresolved candidates with checksums", async () => {
    const { entities, output } = await fixture();
    const report = await runEntityLinkExtraction({
      entityDir: entities,
      outputDir: output,
    });

    expect(report.filesWritten).toBe(true);
    expect(report.status).toBe("candidate_only");
    expect(report.ontologyVersion).toBe("entity-link-candidate-taxonomy-v0.1");
    expect(report.counts.confidentClusters).toBeGreaterThan(0);
    expect(report.counts.ambiguousClusters).toBeGreaterThan(0);
    expect(report.counts.unresolvedCandidates).toBeGreaterThan(0);
    expect(report.counts.linkableRecords).toBeGreaterThan(0);

    const confident = (await readFile(join(output, "confident-matches.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const ambiguous = (await readFile(join(output, "ambiguous-matches.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const unresolved = (await readFile(join(output, "unresolved-candidates.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const stored = JSON.parse(
      await readFile(join(output, "manifest.json"), "utf8"),
    ) as typeof report;
    const taxonomy = JSON.parse(await readFile(join(output, "taxonomy.json"), "utf8")) as {
      status: string;
      sourceEntityTaxonomy: string;
      groups: unknown[];
    };

    expect(confident).toHaveLength(report.counts.confidentClusters);
    expect(ambiguous).toHaveLength(report.counts.ambiguousClusters);
    expect(unresolved).toHaveLength(report.counts.unresolvedCandidates);
    expect(stored.filesWritten).toBe(true);
    expect(stored.checksums.confidentMatches).toBe(
      sha256(await readFile(join(output, "confident-matches.jsonl"), "utf8")),
    );
    expect(taxonomy.status).toBe("temporary_review_required");
    expect(taxonomy.sourceEntityTaxonomy).toBe("entity-mention-taxonomy-v0.1");
    expect(taxonomy.groups.length).toBeGreaterThan(5);

    for (const cluster of [...confident, ...ambiguous]) {
      expect(cluster.observationState).toBe("quarantined");
      expect("canonicalEntityId" in cluster).toBe(false);
      expect("resolvedEntityId" in cluster).toBe(false);
      expect(cluster.status).toBe(confident.includes(cluster) ? "confident" : "ambiguous");
      expect(Number(cluster.memberCount)).toBeGreaterThan(0);
      const members = cluster.members as Array<Record<string, unknown>>;
      expect(members.length).toBeGreaterThan(0);
      expect(members.length).toBeLessThanOrEqual(Number(cluster.memberCount));
      for (const member of members) {
        const evidence = member.evidence as Record<string, unknown>;
        expect(["text_span", "structured_row", "metadata"]).toContain(evidence.kind as string);
        expect(typeof member.endpointId).toBe("string");
      }
    }
    for (const candidate of unresolved) {
      expect(candidate.observationState).toBe("quarantined");
      expect("canonicalEntityId" in candidate).toBe(false);
      expect(typeof (candidate.endpoint as Record<string, unknown>).endpointId).toBe("string");
    }
  });

  it("validates a dry run without creating the output directory", async () => {
    const { entities, output } = await fixture();
    const report = await runEntityLinkExtraction({
      entityDir: entities,
      outputDir: output,
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.filesWritten).toBe(false);
    await expect(stat(output)).rejects.toThrow();
  });

  it("rejects a changed entity mention checksum", async () => {
    const { entities, output } = await fixture();
    const mentionsPath = join(entities, "entity-mentions.jsonl");
    await writeFile(mentionsPath, `${await readFile(mentionsPath, "utf8")}tampered\n`, "utf8");

    await expect(
      runEntityLinkExtraction({ entityDir: entities, outputDir: output }),
    ).rejects.toThrow("Entity mentions checksum mismatch");
  });
});
