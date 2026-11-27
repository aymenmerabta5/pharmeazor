import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { runEntityExtraction } from "../src/workers/retrieval/entity-export";
import { runGraphChunkExport } from "../src/workers/retrieval/graph-export";
import { runRelationshipExtraction } from "../src/workers/retrieval/relationship-export";

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
  readonly entities: string;
  readonly metadata: string;
  readonly structured: string;
  readonly output: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "relationship-export-"));
  roots.push(root);
  const metadata = join(root, "metadata");
  const structured = join(root, "structured");
  const documents = join(root, "documents", "MED001");
  const graph = join(root, "graph");
  const entities = join(root, "entity-mentions");
  const output = join(root, "relationships");
  await mkdir(metadata, { recursive: true });
  await mkdir(structured, { recursive: true });
  await mkdir(documents, { recursive: true });

  const artifactId = "MED001__SRC_ANPP_RCP__DOC001__smpc";
  const body = [
    "## Indications",
    "DOLIPRANE 500 mg est indique dans la douleur.",
    "## Effets indesirables",
    "- Nausee",
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
  await runEntityExtraction({
    graphDir: graph,
    sourceRoot: root,
    sourceManifestPath: manifest,
    metadataDir: metadata,
    structuredDir: structured,
    outputDir: entities,
  });
  return { root, manifest, graph, entities, metadata, structured, output };
}

describe("candidate-only relationship export", () => {
  it("writes text and structured relationships with verified provenance", async () => {
    const { graph, entities, output } = await fixture();
    const report = await runRelationshipExtraction({
      graphDir: graph,
      entityDir: entities,
      outputDir: output,
    });

    expect(report.filesWritten).toBe(true);
    expect(report.status).toBe("candidate_only");
    expect(report.ontologyVersion).toBe("relationship-candidate-taxonomy-v0.1");
    expect(report.counts.relationships).toBeGreaterThan(0);
    expect(report.counts.structuredRelationships).toBeGreaterThan(0);
    expect(report.counts.textRelationships).toBeGreaterThan(0);
    expect(report.counts.relationshipsByKind.product_has_substance).toBeGreaterThan(0);
    expect(report.counts.relationshipsByKind.product_indicated_for_condition).toBeGreaterThan(0);
    expect(report.counts.relationshipsByKind.product_held_by_organization).toBeGreaterThan(0);
    expect(report.counts.relationshipsByKind.product_has_atc_class).toBeGreaterThan(0);

    const relationships = (await readFile(join(output, "relationship-candidates.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const stored = JSON.parse(
      await readFile(join(output, "manifest.json"), "utf8"),
    ) as typeof report;
    const taxonomy = JSON.parse(await readFile(join(output, "taxonomy.json"), "utf8")) as {
      status: string;
      sourceEntityTaxonomy: string;
      definitions: unknown[];
    };

    expect(relationships.length).toBe(report.counts.relationships);
    expect(stored.filesWritten).toBe(true);
    expect(stored.checksums.relationshipCandidates).toBe(
      sha256(await readFile(join(output, "relationship-candidates.jsonl"), "utf8")),
    );
    expect(taxonomy.status).toBe("temporary_review_required");
    expect(taxonomy.sourceEntityTaxonomy).toBe("entity-mention-taxonomy-v0.1");
    expect(taxonomy.definitions.length).toBeGreaterThan(20);

    for (const relationship of relationships) {
      expect(relationship.observationState).toBe("quarantined");
      expect("canonicalEntityId" in relationship).toBe(false);
      expect("resolvedEntityId" in relationship).toBe(false);
      expect("relationshipId" in relationship).toBe(true);
      const subject = relationship.subject as Record<string, unknown>;
      const object = relationship.object as Record<string, unknown>;
      const support = relationship.support as Record<string, unknown>;
      expect(typeof subject.endpointId).toBe("string");
      expect(typeof object.endpointId).toBe("string");
      expect(["text_support", "structured_row"]).toContain(support.kind as string);
      if (support.kind === "text_support") {
        expect(typeof support.quote).toBe("string");
        expect(typeof support.quoteSha256).toBe("string");
        expect(sha256(support.quote as string)).toBe(support.quoteSha256 as string);
        expect(typeof support.documentStart).toBe("number");
        expect(typeof support.documentEnd).toBe("number");
      }
    }

    const textSupport = relationships.find(
      (relationship) => (relationship.support as Record<string, unknown>).kind === "text_support",
    );
    expect(textSupport).toBeDefined();
    expect((textSupport!.subject as Record<string, unknown>).endpointKind).toBe("mention");
  });

  it("validates a dry run without creating the output directory", async () => {
    const { graph, entities, output } = await fixture();
    const report = await runRelationshipExtraction({
      graphDir: graph,
      entityDir: entities,
      outputDir: output,
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.filesWritten).toBe(false);
    await expect(stat(output)).rejects.toThrow();
  });

  it("rejects a changed entity mention checksum", async () => {
    const { graph, entities, output } = await fixture();
    const mentionsPath = join(entities, "entity-mentions.jsonl");
    await writeFile(mentionsPath, `${await readFile(mentionsPath, "utf8")}tampered\n`, "utf8");

    await expect(
      runRelationshipExtraction({
        graphDir: graph,
        entityDir: entities,
        outputDir: output,
      }),
    ).rejects.toThrow("Entity mentions checksum mismatch");
  });
});
