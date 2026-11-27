import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { GRAPH_ONTOLOGY_VERSION, GRAPH_POPULATION_MODEL_VERSION } from "@repo/modules/retrieval";
import {
  buildGraphPopulationPlan,
  validateGraphPopulation,
} from "../src/workers/retrieval/graph-population";
import { importGraphPlan } from "../src/workers/retrieval/graph-import";
import type { Neo4jClient, Neo4jStatement } from "../src/workers/retrieval/neo4j-http";
import { runEntityExtraction } from "../src/workers/retrieval/entity-export";
import { runEntityLinkExtraction } from "../src/workers/retrieval/entity-link-export";
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
  readonly links: string;
  readonly relationships: string;
  readonly output: string;
  readonly approvalPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "graph-import-"));
  roots.push(root);
  const metadata = join(root, "metadata");
  const structured = join(root, "structured");
  const documents = join(root, "documents", "MED001");
  const graph = join(root, "graph");
  const entities = join(root, "entity-mentions");
  const links = join(root, "entity-links");
  const relationships = join(root, "relationships");
  const output = join(root, "graph-population");
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
      "66313736,AUTRE PRODUIT,COMPRIME,orale,Autorisation active,Procedure nationale,Commercialisee,LABORATOIRE TEST,MED001",
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
  await runEntityLinkExtraction({ entityDir: entities, outputDir: links });
  await runRelationshipExtraction({
    graphDir: graph,
    entityDir: entities,
    outputDir: relationships,
  });

  const linkManifestText = await readFile(join(links, "manifest.json"), "utf8");
  const relationshipManifestText = await readFile(join(relationships, "manifest.json"), "utf8");
  const linkManifest = JSON.parse(linkManifestText) as {
    checksums: { confidentMatches: string };
  };
  const relationshipManifest = JSON.parse(relationshipManifestText) as {
    checksums: { relationshipCandidates: string };
  };
  const approvalPath = join(root, "approval.json");
  await writeFile(
    approvalPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "approved",
        approvedBy: "Person 1",
        approvedAt: "2026-11-27T00:00:00.000Z",
        reviewReference: "review-2026-11-27",
        ontologyVersion: GRAPH_ONTOLOGY_VERSION,
        modelVersion: GRAPH_POPULATION_MODEL_VERSION,
        entityTaxonomyVersion: "entity-mention-taxonomy-v0.1",
        linkTaxonomyVersion: "entity-link-candidate-taxonomy-v0.1",
        relationshipTaxonomyVersion: "relationship-candidate-taxonomy-v0.1",
        inputChecksums: {
          linkManifestSha256: sha256(linkManifestText),
          confidentMatchesSha256: linkManifest.checksums.confidentMatches,
          relationshipManifestSha256: sha256(relationshipManifestText),
          relationshipCandidatesSha256: relationshipManifest.checksums.relationshipCandidates,
        },
        approvedNodeGroups: [
          "product",
          "substance",
          "organization",
          "clinical",
          "population",
          "dose_form",
          "route",
          "therapeutic_class",
        ],
        nodeLabels: {
          product: "MedicinalProduct",
          substance: "Substance",
          organization: "Organization",
          clinical: "ClinicalConcept",
          population: "PopulationGroup",
          dose_form: "DoseForm",
          route: "RouteOfAdministration",
          therapeutic_class: "TherapeuticClass",
        },
        approvedRelationshipKinds: [
          "product_has_dose_form",
          "product_has_route",
          "product_has_authorization",
          "product_has_atc_class",
          "product_has_therapeutic_class",
          "authorization_held_by_organization",
        ],
        relationshipMappings: {
          product_has_dose_form: { type: "HAS_DOSE_FORM", direction: "forward" },
          product_has_route: { type: "HAS_ROUTE", direction: "forward" },
          product_has_authorization: { type: "AUTHORIZES", direction: "reverse" },
          product_has_atc_class: { type: "CLASSIFIED_AS", direction: "forward" },
          product_has_therapeutic_class: { type: "CLASSIFIED_AS", direction: "forward" },
          authorization_held_by_organization: {
            type: "AUTHORIZATION_HOLDER",
            direction: "forward",
          },
        },
        expiresAt: "2027-11-27T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { links, relationships, output, approvalPath };
}

class FakeNeo4jClient implements Neo4jClient {
  readonly statements: Neo4jStatement[] = [];
  private readonly entityCount: number;
  private readonly relationshipCount: number;

  constructor(entityCount: number, relationshipCount: number) {
    this.entityCount = entityCount;
    this.relationshipCount = relationshipCount;
  }

  async run(statements: readonly Neo4jStatement[]) {
    this.statements.push(...statements);
    return statements.map(() => ({ columns: [], rows: [] }));
  }

  async query(statement: string) {
    if (statement.includes("AS count") && statement.includes("(e:GraphEntity")) {
      return [{ count: this.entityCount }];
    }
    if (statement.includes("AS count") && statement.includes("[r]")) {
      return [{ count: this.relationshipCount }];
    }
    if (statement.includes("entitiesWithEvidence")) {
      return [{ entitiesWithEvidence: this.entityCount, evidenceLinks: this.entityCount }];
    }
    return [];
  }
}

describe("Neo4j graph population", () => {
  it("blocks publication without an approval artifact", async () => {
    const { links, relationships, output } = await fixture();
    const report = await validateGraphPopulation({
      linkDir: links,
      relationshipDir: relationships,
      outputDir: output,
      write: false,
    });
    expect(report.status).toBe("blocked_missing_approval");
    expect(report.approval.approved).toBe(false);
    expect(report.counts.importedNodes).toBe(0);
    expect(report.counts.confidentClusters).toBeGreaterThan(0);
  });

  it("validates and plans only approved confident candidates", async () => {
    const { links, relationships, output, approvalPath } = await fixture();
    const validation = await validateGraphPopulation({
      linkDir: links,
      relationshipDir: relationships,
      approvalPath,
      outputDir: output,
      write: false,
    });
    expect(validation.status).toBe("ready");
    expect(validation.approval.approved).toBe(true);
    expect(validation.counts.eligibleEntities).toBeGreaterThan(0);
    expect(validation.counts.eligibleRelationships).toBeGreaterThan(0);

    const plan = await buildGraphPopulationPlan({
      linkDir: links,
      relationshipDir: relationships,
      approvalPath,
      outputDir: output,
    });
    expect(plan.report.status).toBe("ready");
    expect(plan.report.counts.eligibleEntities).toBeGreaterThan(0);
    expect(plan.report.counts.eligibleRelationships).toBeGreaterThan(0);
    expect(plan.report.counts.evidenceNodes).toBeGreaterThan(0);
    expect(plan.report.planId).toMatch(/^plan_/u);
    await expect(readFile(plan.entitiesPath, "utf8")).resolves.toContain("candidateClusterId");
    await expect(readFile(plan.relationshipsPath, "utf8")).resolves.toContain("neo4jType");
    await expect(readFile(plan.rejectedPath, "utf8")).resolves.toContain("recordKind");
  });

  it("imports only through an injected client and validates counts", async () => {
    const { links, relationships, output, approvalPath } = await fixture();
    const plan = await buildGraphPopulationPlan({
      linkDir: links,
      relationshipDir: relationships,
      approvalPath,
      outputDir: output,
    });
    const fake = new FakeNeo4jClient(
      plan.report.counts.eligibleEntities,
      plan.report.counts.eligibleRelationships,
    );
    const report = await importGraphPlan({
      entitiesPath: plan.entitiesPath,
      relationshipsPath: plan.relationshipsPath,
      approval: plan.approval,
      client: fake,
      runId: "gimp_test",
      planId: plan.report.planId!,
      expectedEntityCount: plan.report.counts.eligibleEntities,
      expectedRelationshipCount: plan.report.counts.eligibleRelationships,
    });
    expect(report.status).toBe("completed");
    expect(report.entityRows).toBe(plan.report.counts.eligibleEntities);
    expect(report.relationshipRows).toBe(plan.report.counts.eligibleRelationships);
    expect(fake.statements.some((entry) => entry.statement.includes("MERGE (e:"))).toBe(true);
    expect(fake.statements.some((entry) => entry.statement.includes("MERGE (a)-[r:"))).toBe(true);
    expect(fake.statements.some((entry) => entry.statement.includes("CREATE CONSTRAINT"))).toBe(
      true,
    );
  });

  it("rejects a plan when approval is absent or checksums changed", async () => {
    const { links, relationships, output, approvalPath } = await fixture();
    await expect(
      buildGraphPopulationPlan({
        linkDir: links,
        relationshipDir: relationships,
        outputDir: output,
      }),
    ).rejects.toThrow("approval file is required");

    const changedPath = join(output, "..", "changed-approval.json");
    const approval = JSON.parse(await readFile(approvalPath, "utf8")) as Record<string, unknown>;
    const checksums = approval.inputChecksums as Record<string, string>;
    await writeFile(
      changedPath,
      JSON.stringify({
        ...approval,
        inputChecksums: { ...checksums, confidentMatchesSha256: "changed" },
      }),
      "utf8",
    );
    await expect(
      buildGraphPopulationPlan({
        linkDir: links,
        relationshipDir: relationships,
        approvalPath: changedPath,
        outputDir: output,
      }),
    ).rejects.toThrow("does not match the artifact");
  });

  it("does not create the validation directory in a non-writing validation", async () => {
    const { links, relationships, output } = await fixture();
    const report = await validateGraphPopulation({
      linkDir: links,
      relationshipDir: relationships,
      outputDir: output,
      write: false,
    });
    expect(report.filesWritten).toBe(false);
    await expect(stat(output)).rejects.toThrow();
  });
});
