import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import type {
  CandidateEntityCluster,
  MentionCandidateRecord,
  RelationshipCandidateRecord,
  StructuredObservationRecord,
} from "@repo/modules/retrieval";
import { readJsonlFile } from "../src/workers/retrieval/artifact-jsonl";
import { runEntityExtraction } from "../src/workers/retrieval/entity-export";
import { runEntityLinkExtraction } from "../src/workers/retrieval/entity-link-export";
import { runGraphChunkExport } from "../src/workers/retrieval/graph-export";
import { runGraphEvaluation } from "../src/workers/retrieval/graph-evaluation";
import { runRelationshipExtraction } from "../src/workers/retrieval/relationship-export";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface Fixture {
  readonly graph: string;
  readonly entities: string;
  readonly relationships: string;
  readonly links: string;
  readonly root: string;
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "graph-evaluation-"));
  roots.push(root);
  const metadata = join(root, "metadata");
  const structured = join(root, "structured");
  const documents = join(root, "documents", "MED001");
  const graph = join(root, "graph");
  const entities = join(root, "entity-mentions");
  const relationships = join(root, "relationships");
  const links = join(root, "entity-links");
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
  await runRelationshipExtraction({
    graphDir: graph,
    entityDir: entities,
    outputDir: relationships,
  });
  await runEntityLinkExtraction({ entityDir: entities, outputDir: links });
  return { root, graph, entities, relationships, links };
}

type GoldRef =
  | {
      readonly kind: "text_span";
      readonly documentSnapshotId: string;
      readonly documentId: string;
      readonly documentStart: number;
      readonly documentEnd: number;
      readonly quote: string;
      readonly candidateKind: string;
    }
  | {
      readonly kind: "structured_row";
      readonly sourceId: string;
      readonly path: string;
      readonly rowNumber: number;
      readonly rawValue: string;
      readonly candidateKind: string;
    }
  | {
      readonly kind: "metadata";
      readonly sourceId: string;
      readonly artifactId: string;
      readonly field: string;
      readonly rawValue: string;
      readonly candidateKind: string;
    };

function goldRef(
  evidence: {
    readonly kind: string;
    readonly documentSnapshotId?: string;
    readonly documentId?: string;
    readonly documentStart?: number;
    readonly documentEnd?: number;
    readonly quote?: string;
    readonly sourceId?: string;
    readonly path?: string;
    readonly rowNumber?: number;
    readonly artifactId?: string;
    readonly field?: string;
  },
  candidateKind: string,
  label: string,
): GoldRef {
  if (evidence.kind === "text_span") {
    return {
      kind: "text_span",
      documentSnapshotId: evidence.documentSnapshotId!,
      documentId: evidence.documentId!,
      documentStart: evidence.documentStart!,
      documentEnd: evidence.documentEnd!,
      quote: evidence.quote!,
      candidateKind,
    };
  }
  if (evidence.kind === "structured_record" || evidence.kind === "structured_row") {
    return {
      kind: "structured_row",
      sourceId: evidence.sourceId!,
      path: evidence.path!,
      rowNumber: evidence.rowNumber!,
      rawValue: label,
      candidateKind,
    };
  }
  return {
    kind: "metadata",
    sourceId: evidence.sourceId!,
    artifactId: evidence.artifactId!,
    field: evidence.field!,
    rawValue: label,
    candidateKind,
  };
}

function refScopeKey(ref: GoldRef): string {
  if (ref.kind === "text_span") {
    return `document:${ref.documentSnapshotId}:${ref.documentId}`;
  }
  if (ref.kind === "structured_row") {
    return `row:${ref.sourceId}:${ref.path}:${ref.rowNumber}`;
  }
  return `metadata:${ref.sourceId}:${ref.artifactId}:${ref.field}`;
}

async function writeGold(
  root: string,
  fixtureValue: Fixture,
): Promise<{ readonly directory: string; readonly summary: Record<string, number> }> {
  const directory = join(root, "gold");
  await mkdir(directory, { recursive: true });
  const mentions: MentionCandidateRecord[] = [];
  for await (const mention of readJsonlFile<MentionCandidateRecord>(
    join(fixtureValue.entities, "entity-mentions.jsonl"),
  )) {
    mentions.push(mention);
  }
  const observations: StructuredObservationRecord[] = [];
  for await (const observation of readJsonlFile<StructuredObservationRecord>(
    join(fixtureValue.entities, "structured-observations.jsonl"),
  )) {
    observations.push(observation);
  }
  const relationships: RelationshipCandidateRecord[] = [];
  for await (const relationship of readJsonlFile<RelationshipCandidateRecord>(
    join(fixtureValue.relationships, "relationship-candidates.jsonl"),
  )) {
    relationships.push(relationship);
  }
  const clusters: CandidateEntityCluster[] = [];
  for await (const cluster of readJsonlFile<CandidateEntityCluster>(
    join(fixtureValue.links, "confident-matches.jsonl"),
  )) {
    clusters.push(cluster);
  }

  const textMention = mentions.find((mention) => mention.evidence.kind === "text_span");
  if (!textMention) throw new Error("Fixture produced no text mention");
  const entityRef = goldRef(
    textMention.evidence,
    textMention.candidateKind,
    textMention.surfaceText,
  );

  const relationship = relationships[0];
  if (!relationship) throw new Error("Fixture produced no relationship");
  const subject = goldRef(
    relationship.subject.evidence,
    relationship.subject.candidateKind,
    relationship.subject.endpointKind === "mention"
      ? relationship.subject.surfaceText
      : relationship.subject.rawValue,
  );
  const object = goldRef(
    relationship.object.evidence,
    relationship.object.candidateKind,
    relationship.object.endpointKind === "mention"
      ? relationship.object.surfaceText
      : relationship.object.rawValue,
  );

  const linkCluster = clusters.find((cluster) => cluster.members.length >= 2);
  if (!linkCluster) throw new Error("Fixture produced no linkable confident cluster");
  const left = linkCluster.members[0]!;
  const right = linkCluster.members[1]!;
  const leftRef = goldRef(left.evidence, left.candidateKind, left.label);
  const rightRef = goldRef(right.evidence, right.candidateKind, right.label);

  const documentScopes = new Map<
    string,
    {
      documentId: string;
      documentSnapshotId: string;
      artifactId: string;
      entityScope: "exhaustive" | "partial" | "not_annotated";
      relationshipScope: "exhaustive" | "partial" | "not_annotated";
      note: null;
    }
  >();
  const rowScopes = new Map<
    string,
    {
      sourceId: string;
      path: string;
      rowNumber: number;
      entityScope: "exhaustive" | "partial" | "not_annotated";
      relationshipScope: "exhaustive" | "partial" | "not_annotated";
      note: null;
    }
  >();
  const addScope = (ref: GoldRef, relationshipRef: boolean) => {
    if (ref.kind === "text_span") {
      const key = refScopeKey(ref);
      const existing = documentScopes.get(key) ?? {
        documentId: ref.documentId,
        documentSnapshotId: ref.documentSnapshotId,
        artifactId: textMention.document.artifactId,
        entityScope: "not_annotated" as const,
        relationshipScope: "not_annotated" as const,
        note: null,
      };
      documentScopes.set(key, {
        ...existing,
        entityScope: ref === entityRef ? "exhaustive" : existing.entityScope,
        relationshipScope: relationshipRef ? "exhaustive" : existing.relationshipScope,
      });
      return;
    }
    if (ref.kind === "structured_row") {
      const key = refScopeKey(ref);
      rowScopes.set(key, {
        sourceId: ref.sourceId,
        path: ref.path,
        rowNumber: ref.rowNumber,
        entityScope: "not_annotated",
        relationshipScope: relationshipRef ? "exhaustive" : "not_annotated",
        note: null,
      });
    }
  };
  addScope(entityRef, false);
  addScope(subject, true);
  addScope(object, true);

  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        datasetId: "kg-evaluation-api-fixture",
        protocolVersion: "kg-gold-v1",
        status: "manually_labelled",
        description: "Synthetic API fixture; not shipped gold data.",
        annotators: ["test"],
        documents: [...documentScopes.values()],
        structuredRows: [...rowScopes.values()],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(directory, "entity-mentions.gold.jsonl"),
    `${JSON.stringify({ goldId: "E1", entity: entityRef, note: null })}\n`,
    "utf8",
  );
  await writeFile(
    join(directory, "relationships.gold.jsonl"),
    `${JSON.stringify({
      goldId: "R1",
      relationshipKind: relationship.relationshipKind,
      subject,
      object,
      note: null,
    })}\n`,
    "utf8",
  );
  await writeFile(
    join(directory, "entity-links.gold.jsonl"),
    `${JSON.stringify({
      goldId: "L1",
      decision: "same_entity",
      group: linkCluster.group,
      left: leftRef,
      right: rightRef,
      note: null,
    })}\n`,
    "utf8",
  );
  return {
    directory,
    summary: { mentions: mentions.length, observations: observations.length },
  };
}

async function writeEmptyGold(root: string): Promise<string> {
  const directory = join(root, "gold-empty");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        datasetId: "kg-evaluation-empty",
        protocolVersion: "kg-gold-v1",
        status: "awaiting_manual_annotation",
        description: "Empty committed scaffold.",
        annotators: [],
        documents: [],
        structuredRows: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  for (const name of [
    "entity-mentions.gold.jsonl",
    "relationships.gold.jsonl",
    "entity-links.gold.jsonl",
  ]) {
    await writeFile(join(directory, name), "", "utf8");
  }
  return directory;
}

describe("graph evaluation run", () => {
  it("writes reproducible reports with metrics and checksums", async () => {
    const fixtureValue = await fixture();
    const gold = await writeGold(fixtureValue.root, fixtureValue);
    const output = join(fixtureValue.root, "evaluation");
    const report = await runGraphEvaluation({
      graphDir: fixtureValue.graph,
      entityDir: fixtureValue.entities,
      relationshipDir: fixtureValue.relationships,
      linkDir: fixtureValue.links,
      goldDir: gold.directory,
      outputDir: output,
    });

    expect(report.filesWritten).toBe(true);
    expect(report.evaluation.status).toBe("evaluated");
    expect(report.evaluation.validation.ok).toBe(true);
    expect(report.evaluation.metrics.entityMentions.available).toBe(true);
    expect(report.evaluation.metrics.relationships.available).toBe(true);
    expect(report.evaluation.metrics.entityLinks.available).toBe(true);
    expect(report.evaluation.metrics.entityMentions.strict.truePositives).toBeGreaterThan(0);
    expect(report.evaluation.metrics.relationships.strict.truePositives).toBeGreaterThan(0);
    expect(report.evaluation.metrics.entityLinks.confusion.truePositives).toBeGreaterThan(0);

    const reportText = await readFile(join(output, "report.json"), "utf8");
    const diagnosticsText = await readFile(join(output, "diagnostics.jsonl"), "utf8");
    const manifestText = await readFile(join(output, "manifest.json"), "utf8");
    expect(sha256(reportText)).toBe(report.checksums.report);
    expect(sha256(diagnosticsText)).toBe(report.checksums.diagnostics);
    const manifest = JSON.parse(manifestText) as {
      filesWritten: boolean;
      checksums: { report: string; diagnostics: string };
      evaluationVersion: string;
      status: string;
    };
    expect(manifest.filesWritten).toBe(true);
    expect(manifest.evaluationVersion).toBe("kg-evaluation-v1");
    expect(manifest.status).toBe("evaluated");
    expect(manifest.checksums).toEqual(report.checksums);
    expect(JSON.parse(reportText)).toEqual(report.evaluation);

    const dryRun = await runGraphEvaluation({
      graphDir: fixtureValue.graph,
      entityDir: fixtureValue.entities,
      relationshipDir: fixtureValue.relationships,
      linkDir: fixtureValue.links,
      goldDir: gold.directory,
      outputDir: output,
      dryRun: true,
    });
    expect(dryRun.filesWritten).toBe(false);
    expect(dryRun.evaluation).toEqual(report.evaluation);
    expect(dryRun.checksums).toEqual(report.checksums);
  });

  it("writes an empty annotation scaffold without inventing metrics", async () => {
    const fixtureValue = await fixture();
    const gold = await writeEmptyGold(fixtureValue.root);
    const output = join(fixtureValue.root, "evaluation-empty");
    const report = await runGraphEvaluation({
      graphDir: fixtureValue.graph,
      entityDir: fixtureValue.entities,
      relationshipDir: fixtureValue.relationships,
      linkDir: fixtureValue.links,
      goldDir: gold,
      outputDir: output,
    });

    expect(report.evaluation.status).toBe("insufficient_gold_labels");
    expect(report.evaluation.validation.ok).toBe(true);
    expect(report.evaluation.metrics.entityMentions.available).toBe(false);
    expect(report.evaluation.metrics.relationships.available).toBe(false);
    expect(report.evaluation.metrics.entityLinks.available).toBe(false);
    expect(report.evaluation.metrics.entityMentions.goldAnnotations).toBe(0);
  });

  it("rejects a changed candidate artifact", async () => {
    const fixtureValue = await fixture();
    const gold = await writeEmptyGold(fixtureValue.root);
    const mentionsPath = join(fixtureValue.entities, "entity-mentions.jsonl");
    await writeFile(mentionsPath, `${await readFile(mentionsPath, "utf8")}tampered\n`, "utf8");

    await expect(
      runGraphEvaluation({
        graphDir: fixtureValue.graph,
        entityDir: fixtureValue.entities,
        relationshipDir: fixtureValue.relationships,
        linkDir: fixtureValue.links,
        goldDir: gold,
        outputDir: join(fixtureValue.root, "evaluation-tampered"),
      }),
    ).rejects.toThrow("Entity mentions checksum mismatch");
  });

  it("does not create the output directory during a dry run", async () => {
    const fixtureValue = await fixture();
    const gold = await writeEmptyGold(fixtureValue.root);
    const output = join(fixtureValue.root, "evaluation-dry");
    const report = await runGraphEvaluation({
      graphDir: fixtureValue.graph,
      entityDir: fixtureValue.entities,
      relationshipDir: fixtureValue.relationships,
      linkDir: fixtureValue.links,
      goldDir: gold,
      outputDir: output,
      dryRun: true,
    });

    expect(report.filesWritten).toBe(false);
    await expect(stat(output)).rejects.toThrow();
  });

  it("marks a text-unit-limited run as partial", async () => {
    const fixtureValue = await fixture();
    const gold = await writeEmptyGold(fixtureValue.root);
    const report = await runGraphEvaluation({
      graphDir: fixtureValue.graph,
      entityDir: fixtureValue.entities,
      relationshipDir: fixtureValue.relationships,
      linkDir: fixtureValue.links,
      goldDir: gold,
      outputDir: join(fixtureValue.root, "evaluation-limited"),
      limit: 1,
      dryRun: true,
    });

    expect(report.filtering.enabled).toBe(true);
    expect(report.filtering.limit).toBe(1);
    expect(report.filtering.mentionsDropped).toBeGreaterThan(0);
    expect(report.evaluation.scope.limited).toBe(true);
    expect(
      report.evaluation.validation.diagnostics.some(
        (diagnostic) => diagnostic.code === "evaluation_scope_limited",
      ),
    ).toBe(true);
  });
});
