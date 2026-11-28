import { createHash } from "node:crypto";
import {
  GRAPH_ENTITY_LABEL,
  graphEntityLabels,
  graphEvidenceId,
  relationshipMapping,
  type GraphEntityPlan,
  type GraphPopulationApproval,
  type GraphRelationshipPlan,
  type LinkEvidence,
} from "@repo/modules/retrieval";
import { readJsonlFile } from "./artifact-jsonl";
import type { Neo4jClient, Neo4jStatement } from "../../adapters/retrieval/neo4j-http";
import { relationshipSupportAsEvidence } from "./graph-population";

export interface GraphImportOptions {
  readonly entitiesPath: string;
  readonly relationshipsPath: string;
  readonly approval: GraphPopulationApproval;
  readonly client: Neo4jClient;
  readonly runId: string;
  readonly planId: string;
  readonly batchSize?: number;
  readonly expectedEntityCount?: number;
  readonly expectedRelationshipCount?: number;
  readonly expectedEvidenceCount?: number;
}

export interface GraphImportReport {
  readonly runId: string;
  readonly planId: string;
  readonly status: "completed" | "failed";
  readonly entityRows: number;
  readonly relationshipRows: number;
  readonly evidenceRows: number;
  readonly batches: number;
  readonly validation: {
    readonly entityCount: number;
    readonly relationshipCount: number;
    readonly entitiesWithEvidence: number;
    readonly evidenceLinks: number;
  };
  readonly error: string | null;
}

/**
 * Import a previously approved export plan into Neo4j.
 *
 * All node and relationship writes are MERGE-based and keyed by stable
 * candidate IDs. Ambiguous/unresolved plan rows never reach this function.
 */
export async function importGraphPlan(options: GraphImportOptions): Promise<GraphImportReport> {
  const batchSize = Math.max(1, options.batchSize ?? 500);
  const startedAt = new Date().toISOString();
  let entityRows = 0;
  let relationshipRows = 0;
  let batches = 0;
  const evidenceIds = new Set<string>();
  let status: "completed" | "failed" = "completed";
  let error: string | null = null;
  try {
    await options.client.run([
      { statement: constraintStatement("graph_entity_id", "GraphEntity", "candidateClusterId") },
      { statement: constraintStatement("graph_source_id", "Source", "sourceId") },
      { statement: constraintStatement("graph_document_id", "Document", "documentId") },
      { statement: constraintStatement("graph_evidence_id", "Evidence", "evidenceId") },
      { statement: constraintStatement("graph_import_run_id", "ImportRun", "runId") },
      {
        statement: `MERGE (r:ImportRun {runId: $runId})
SET r.planId = $planId, r.approvalSha256 = $approvalSha256,
    r.status = 'running', r.startedAt = $startedAt`,
        parameters: {
          runId: options.runId,
          planId: options.planId,
          approvalSha256: approvalHash(options.approval),
          startedAt,
        },
      },
    ]);

    const entityBatch: GraphEntityPlan[] = [];
    for await (const entity of readJsonlFile<GraphEntityPlan>(options.entitiesPath)) {
      for (const member of entity.members) evidenceIds.add(graphEvidenceId(member.evidence));
      entityBatch.push(entity);
      if (entityBatch.length >= batchSize) {
        await importEntityBatch(options, entityBatch, startedAt);
        entityRows += entityBatch.length;
        batches += 1;
        entityBatch.length = 0;
      }
    }
    if (entityBatch.length > 0) {
      await importEntityBatch(options, entityBatch, startedAt);
      entityRows += entityBatch.length;
      batches += 1;
    }

    const relationshipBatch: GraphRelationshipPlan[] = [];
    for await (const relationship of readJsonlFile<GraphRelationshipPlan>(
      options.relationshipsPath,
    )) {
      evidenceIds.add(graphEvidenceId(relationshipSupportAsEvidence(relationship.support)));
      relationshipBatch.push(relationship);
      if (relationshipBatch.length >= batchSize) {
        await importRelationshipBatch(options, relationshipBatch, startedAt);
        relationshipRows += relationshipBatch.length;
        batches += 1;
        relationshipBatch.length = 0;
      }
    }
    if (relationshipBatch.length > 0) {
      await importRelationshipBatch(options, relationshipBatch, startedAt);
      relationshipRows += relationshipBatch.length;
      batches += 1;
    }
    if (options.expectedEntityCount !== undefined && entityRows !== options.expectedEntityCount) {
      throw new Error(
        `Plan contains ${entityRows} entities but ${options.expectedEntityCount} were approved`,
      );
    }
    if (
      options.expectedRelationshipCount !== undefined &&
      relationshipRows !== options.expectedRelationshipCount
    ) {
      throw new Error(
        `Plan contains ${relationshipRows} relationships but ${options.expectedRelationshipCount} were approved`,
      );
    }

    const validation = await validateImportedGraph(options, {
      entityRows,
      relationshipRows,
    });
    await options.client.run([
      {
        statement: `MATCH (r:ImportRun {runId: $runId})
SET r.status = 'completed', r.importedNodes = $nodes,
    r.importedRelationships = $relationships, r.importedEvidence = $evidence,
    r.finishedAt = $finishedAt`,
        parameters: {
          runId: options.runId,
          nodes: entityRows,
          relationships: relationshipRows,
          evidence: evidenceIds.size,
          finishedAt: new Date().toISOString(),
        },
      },
    ]);
    return {
      runId: options.runId,
      planId: options.planId,
      status,
      entityRows,
      relationshipRows,
      evidenceRows: evidenceIds.size,
      batches,
      validation,
      error,
    };
  } catch (cause) {
    status = "failed";
    error = cause instanceof Error ? cause.message : String(cause);
    try {
      await options.client.run([
        {
          statement: `MATCH (r:ImportRun {runId: $runId})
SET r.status = 'failed', r.error = $error, r.finishedAt = $finishedAt`,
          parameters: {
            runId: options.runId,
            error,
            finishedAt: new Date().toISOString(),
          },
        },
      ]);
    } catch {
      // Preserve the original failure; the import run may be unreachable.
    }
    throw new Error(error);
  }
}

async function importEntityBatch(
  options: GraphImportOptions,
  entities: readonly GraphEntityPlan[],
  importedAt: string,
): Promise<void> {
  const byLabel = new Map<string, Array<Record<string, unknown>>>();
  const evidence: EvidenceRow[] = [];
  for (const entity of entities) {
    const labels = graphEntityLabels(entity.group, options.approval);
    const specific = labels.find((label) => label !== GRAPH_ENTITY_LABEL);
    if (!specific) throw new Error(`No approved Neo4j label for ${entity.candidateClusterId}`);
    const label = safeLabel(specific);
    const rows = byLabel.get(label) ?? [];
    rows.push({
      candidateClusterId: entity.candidateClusterId,
      candidateGroup: entity.group,
      label: entity.label,
      aliases: [...entity.aliases],
      aliasCount: entity.aliasCount,
      identityKeys: [...entity.identityKeys],
      contextKeys: [...entity.contextKeys],
      memberCount: entity.memberCount,
      ontologyVersion: entity.ontologyVersion,
      reviewState: entity.reviewState,
      observationState: entity.observationState,
      importRunId: options.runId,
      importedAt,
    });
    byLabel.set(label, rows);
    for (const member of entity.members) {
      evidence.push({
        evidenceId: graphEvidenceId(member.evidence),
        entityId: entity.candidateClusterId,
        evidence: member.evidence,
        sourceId: member.sourceId,
        jurisdiction: member.jurisdiction,
        documentType: member.documentType,
      });
    }
  }
  const statements: Neo4jStatement[] = [];
  for (const [label, rows] of byLabel) {
    statements.push({
      statement: entityStatement(label),
      parameters: { rows },
    });
  }
  statements.push(...evidenceStatements(evidence, options.runId, importedAt));
  await options.client.run(statements);
}

async function importRelationshipBatch(
  options: GraphImportOptions,
  relationships: readonly GraphRelationshipPlan[],
  importedAt: string,
): Promise<void> {
  const byType = new Map<string, Array<Record<string, unknown>>>();
  const evidence: EvidenceRow[] = [];
  for (const relationship of relationships) {
    const mapping = relationshipMapping(relationship.relationshipKind, options.approval);
    if (!mapping || mapping.type !== relationship.neo4jType) {
      throw new Error(
        `Relationship ${relationship.relationshipId} is not approved as ${relationship.neo4jType}`,
      );
    }
    const type = safeType(relationship.neo4jType);
    const rows = byType.get(type) ?? [];
    const supportEvidence = relationshipSupportAsEvidence(relationship.support);
    rows.push({
      fromEntityId: relationship.fromEntityId,
      toEntityId: relationship.toEntityId,
      relationshipId: relationship.relationshipId,
      relationshipKind: relationship.relationshipKind,
      ontologyVersion: relationship.ontologyVersion,
      reviewState: relationship.reviewState,
      observationState: relationship.observationState,
      supportKind: relationship.support.kind,
      supportEvidenceId: graphEvidenceId(supportEvidence),
      importRunId: options.runId,
      importedAt,
    });
    byType.set(type, rows);
    evidence.push({
      evidenceId: graphEvidenceId(supportEvidence),
      entityId: null,
      evidence: supportEvidence,
      sourceId: relationship.supportSourceId,
      jurisdiction: null,
      documentType: null,
    });
  }
  const statements: Neo4jStatement[] = [];
  for (const [type, rows] of byType) {
    statements.push({
      statement: relationshipStatement(type),
      parameters: { rows },
    });
  }
  statements.push(...evidenceStatements(evidence, options.runId, importedAt));
  await options.client.run(statements);
}

interface EvidenceRow {
  readonly evidenceId: string;
  readonly entityId: string | null;
  readonly evidence: LinkEvidence;
  readonly sourceId: string;
  readonly jurisdiction: string | null;
  readonly documentType: string | null;
}

function evidenceStatements(
  evidence: readonly EvidenceRow[],
  runId: string,
  importedAt: string,
): Neo4jStatement[] {
  const textRows: Array<Record<string, unknown>> = [];
  const structuredRows: Array<Record<string, unknown>> = [];
  const metadataRows: Array<Record<string, unknown>> = [];
  for (const row of evidence) {
    const base = {
      evidenceId: row.evidenceId,
      entityId: row.entityId,
      sourceId: row.sourceId,
      jurisdiction: row.jurisdiction,
      documentType: row.documentType,
      importRunId: runId,
      importedAt,
    };
    if (row.evidence.kind === "text_span") {
      textRows.push({
        ...base,
        textUnitId: row.evidence.textUnitId,
        documentSnapshotId: row.evidence.documentSnapshotId,
        artifactId: row.evidence.artifactId,
        documentId: row.evidence.documentId,
        sectionId: row.evidence.sectionId,
        sectionCode: row.evidence.sectionCode,
        sectionHeading: row.evidence.sectionHeading,
        sectionPath: [...row.evidence.sectionPath],
        offsetEncoding: row.evidence.offsetEncoding,
        localStart: row.evidence.localStart,
        localEnd: row.evidence.localEnd,
        documentStart: row.evidence.documentStart,
        documentEnd: row.evidence.documentEnd,
        quote: row.evidence.quote,
        quoteSha256: row.evidence.quoteSha256,
        rawContentSha256: row.evidence.rawContentSha256,
      });
    } else if (row.evidence.kind === "structured_row") {
      structuredRows.push({
        ...base,
        path: row.evidence.path,
        rowNumber: row.evidence.rowNumber,
        rowSha256: row.evidence.rowSha256,
        schemaVersion: row.evidence.schemaVersion,
      });
    } else {
      metadataRows.push({
        ...base,
        artifactId: row.evidence.artifactId,
        field: row.evidence.field,
        contentSha256: row.evidence.contentSha256,
      });
    }
  }
  const statements: Neo4jStatement[] = [];
  if (textRows.length > 0) {
    statements.push({ statement: textEvidenceStatement(), parameters: { rows: textRows } });
  }
  if (structuredRows.length > 0) {
    statements.push({
      statement: structuredEvidenceStatement(),
      parameters: { rows: structuredRows },
    });
  }
  if (metadataRows.length > 0) {
    statements.push({
      statement: metadataEvidenceStatement(),
      parameters: { rows: metadataRows },
    });
  }
  return statements;
}

async function validateImportedGraph(
  options: GraphImportOptions,
  expected: { readonly entityRows: number; readonly relationshipRows: number },
): Promise<GraphImportReport["validation"]> {
  const entityRows = await options.client.query(
    `MATCH (e:GraphEntity {importRunId: $runId})
RETURN count(e) AS count`,
    { runId: options.runId },
  );
  const relationshipRows = await options.client.query(
    `MATCH (:GraphEntity {importRunId: $runId})-[r]->(:GraphEntity {importRunId: $runId})
WHERE r.importRunId = $runId
RETURN count(r) AS count`,
    { runId: options.runId },
  );
  const evidenceRows = await options.client.query(
    `MATCH (e:GraphEntity {importRunId: $runId})
OPTIONAL MATCH (e)-[:HAS_EVIDENCE]->(ev:Evidence)
RETURN count(DISTINCT e) AS entitiesWithEvidence, count(ev) AS evidenceLinks`,
    { runId: options.runId },
  );
  const entityCount = numeric(entityRows[0]?.count);
  const relationshipCount = numeric(relationshipRows[0]?.count);
  const entitiesWithEvidence = numeric(evidenceRows[0]?.entitiesWithEvidence);
  const evidenceLinks = numeric(evidenceRows[0]?.evidenceLinks);
  if (entityCount !== expected.entityRows) {
    throw new Error(
      `Imported entity count ${entityCount} does not match planned ${expected.entityRows}`,
    );
  }
  if (relationshipCount !== expected.relationshipRows) {
    throw new Error(
      `Imported relationship count ${relationshipCount} does not match planned ${expected.relationshipRows}`,
    );
  }
  if (entitiesWithEvidence !== expected.entityRows) {
    throw new Error(
      `Entities with evidence ${entitiesWithEvidence} does not match ${expected.entityRows}`,
    );
  }
  if (
    options.expectedEvidenceCount !== undefined &&
    evidenceLinks < options.expectedEvidenceCount
  ) {
    throw new Error(
      `Evidence links ${evidenceLinks} are below the planned ${options.expectedEvidenceCount}`,
    );
  }
  return { entityCount, relationshipCount, entitiesWithEvidence, evidenceLinks };
}

function entityStatement(label: string): string {
  return `UNWIND $rows AS row
MERGE (e:${GRAPH_ENTITY_LABEL} {candidateClusterId: row.candidateClusterId})
SET e:${label},
    e.candidateGroup = row.candidateGroup, e.label = row.label,
    e.aliases = row.aliases, e.aliasCount = row.aliasCount,
    e.identityKeys = row.identityKeys, e.contextKeys = row.contextKeys,
    e.memberCount = row.memberCount, e.ontologyVersion = row.ontologyVersion,
    e.reviewState = row.reviewState, e.observationState = row.observationState,
    e.importRunId = row.importRunId, e.importedAt = row.importedAt`;
}

function relationshipStatement(type: string): string {
  return `UNWIND $rows AS row
MATCH (a:GraphEntity {candidateClusterId: row.fromEntityId})
MATCH (b:GraphEntity {candidateClusterId: row.toEntityId})
MERGE (a)-[r:${type} {relationshipId: row.relationshipId}]->(b)
SET r.relationshipKind = row.relationshipKind, r.ontologyVersion = row.ontologyVersion,
    r.reviewState = row.reviewState, r.observationState = row.observationState,
    r.supportKind = row.supportKind, r.supportEvidenceId = row.supportEvidenceId,
    r.importRunId = row.importRunId, r.importedAt = row.importedAt`;
}

function textEvidenceStatement(): string {
  return `UNWIND $rows AS row
MERGE (ev:Evidence {evidenceId: row.evidenceId})
SET ev.kind = 'text_span', ev.sourceId = row.sourceId, ev.documentId = row.documentId,
    ev.artifactId = row.artifactId, ev.textUnitId = row.textUnitId,
    ev.documentSnapshotId = row.documentSnapshotId, ev.sectionId = row.sectionId,
    ev.sectionCode = row.sectionCode, ev.sectionHeading = row.sectionHeading,
    ev.sectionPath = row.sectionPath, ev.offsetEncoding = row.offsetEncoding,
    ev.localStart = row.localStart, ev.localEnd = row.localEnd,
    ev.documentStart = row.documentStart, ev.documentEnd = row.documentEnd,
    ev.quote = row.quote, ev.quoteSha256 = row.quoteSha256,
    ev.rawContentSha256 = row.rawContentSha256, ev.importRunId = row.importRunId,
    ev.importedAt = row.importedAt
MERGE (d:Document {documentId: row.documentId})
SET d.artifactId = row.artifactId, d.documentType = row.documentType,
    d.jurisdiction = row.jurisdiction, d.sourceId = row.sourceId
MERGE (s:Source {sourceId: row.sourceId})
MERGE (d)-[:PUBLISHED_BY]->(s)
MERGE (ev)-[:FROM_DOCUMENT]->(d)
WITH ev, row
OPTIONAL MATCH (e:GraphEntity {candidateClusterId: row.entityId})
FOREACH (_ IN CASE WHEN e IS NULL THEN [] ELSE [1] END |
  MERGE (e)-[:HAS_EVIDENCE]->(ev)
)`;
}

function structuredEvidenceStatement(): string {
  return `UNWIND $rows AS row
MERGE (ev:Evidence {evidenceId: row.evidenceId})
SET ev.kind = 'structured_row', ev.sourceId = row.sourceId, ev.path = row.path,
    ev.rowNumber = row.rowNumber, ev.rowSha256 = row.rowSha256,
    ev.schemaVersion = row.schemaVersion, ev.importRunId = row.importRunId,
    ev.importedAt = row.importedAt
MERGE (s:Source {sourceId: row.sourceId})
MERGE (ev)-[:FROM_SOURCE]->(s)
WITH ev, row
OPTIONAL MATCH (e:GraphEntity {candidateClusterId: row.entityId})
FOREACH (_ IN CASE WHEN e IS NULL THEN [] ELSE [1] END |
  MERGE (e)-[:HAS_EVIDENCE]->(ev)
)`;
}

function metadataEvidenceStatement(): string {
  return `UNWIND $rows AS row
MERGE (ev:Evidence {evidenceId: row.evidenceId})
SET ev.kind = 'metadata', ev.sourceId = row.sourceId, ev.artifactId = row.artifactId,
    ev.field = row.field, ev.contentSha256 = row.contentSha256,
    ev.importRunId = row.importRunId, ev.importedAt = row.importedAt
MERGE (s:Source {sourceId: row.sourceId})
MERGE (ev)-[:FROM_SOURCE]->(s)
WITH ev, row
OPTIONAL MATCH (e:GraphEntity {candidateClusterId: row.entityId})
FOREACH (_ IN CASE WHEN e IS NULL THEN [] ELSE [1] END |
  MERGE (e)-[:HAS_EVIDENCE]->(ev)
)`;
}

function constraintStatement(name: string, label: string, property: string): string {
  return `CREATE CONSTRAINT ${name} IF NOT EXISTS
FOR (n:${safeLabel(label)}) REQUIRE n.${safeProperty(property)} IS UNIQUE`;
}

function safeLabel(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(value)) throw new Error(`Unsafe Neo4j label: ${value}`);
  return value;
}

function safeProperty(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(value)) throw new Error(`Unsafe Neo4j property: ${value}`);
  return value;
}

function safeType(value: string): string {
  if (!/^[A-Z][A-Z0-9_]{1,63}$/u.test(value)) {
    throw new Error(`Unsafe Neo4j relationship type: ${value}`);
  }
  return value;
}

function approvalHash(approval: GraphPopulationApproval): string {
  return createHash("sha256").update(JSON.stringify(approval), "utf8").digest("hex");
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
