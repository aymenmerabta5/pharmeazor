# Neo4j graph population

**Status:** importer implemented, approval-gated, and **not executed against a real Neo4j instance** in this repository.  
**Ontology:** `GRAPH_ONTOLOGY.md` version 0.1 — still a draft.  
**Candidate taxonomies:** entity, relationship, and entity-link taxonomies remain temporary and unapproved by Person 1.  
**Approval gate:** no graph data may be published without a recorded `status: "approved"` artifact matching the exact upstream checksums.

## 1. What this stage does

The population pipeline turns **approved** candidate entity clusters and candidate
relationships into a deterministic Neo4j import plan, then imports that plan with
idempotent `MERGE` statements.

It does not:

- create canonical entities from unapproved candidates;
- publish ambiguous or unresolved candidates;
- modify PostgreSQL or the Hybrid RAG pipeline;
- use an LLM as a judge;
- run without a recorded approval and an external Neo4j target.

## 2. Hard gate

The current repository has:

- no Person 1/domain approval record for the ontology or candidate taxonomies;
- no approved entity-link artifact;
- no approved relationship artifact;
- no Neo4j service, driver, or connection configured.

The importer therefore reports `blocked_missing_approval` and imports zero nodes
and zero relationships. `docs/GRAPH_POPULATION_APPROVAL.example.json` is a
template only; its `status` is `template` and it is rejected.

## 3. Inputs

- Entity-link artifact:
  - `tooling/cleaning-lab/output/entity-links/manifest.json`
  - `confident-matches.jsonl`
- Relationship artifact:
  - `tooling/cleaning-lab/output/relationships/manifest.json`
  - `relationship-candidates.jsonl`

The loader verifies both manifests, both output checksums, the entity artifact
identity shared by the two artifacts, and all taxonomy versions.

Only `confident` entity clusters are eligible. Ambiguous and unresolved clusters
remain rejected. A relationship is eligible only when:

- its kind is explicitly approved;
- both endpoint IDs belong to approved confident clusters;
- both endpoint groups are approved node groups;
- the endpoints are not the same cluster;
- the relationship has an approved ontology mapping and direction.

## 4. Approval contract

The approval file must contain:

- `schemaVersion: 1`, `status: "approved"`;
- reviewer identity, timestamp, and review reference;
- ontology, population-model, entity-taxonomy, link-taxonomy, and
  relationship-taxonomy versions;
- exact SHA-256 checksums of the link manifest, confident-match file,
  relationship manifest, and relationship-candidate file;
- approved node groups and Neo4j labels from the ontology allowlist;
- approved relationship kinds and a type/direction mapping from the binary
  ontology relationship allowlist;
- an optional expiry timestamp.

The engine rejects template, missing, expired, version-mismatched,
checksum-mismatched, unknown-label, unknown-type, and unsafe mapping files.

## 5. Safe ontology mapping

The current contract only permits binary ontology relationships that can be
represented directly by the existing candidate endpoints. Composition and
clinical statements that require canonical composition/assertion nodes remain
out of scope.

Default template mapping:

| Candidate kind                       | Neo4j type             | Direction |
| ------------------------------------ | ---------------------- | --------- |
| `product_has_dose_form`              | `HAS_DOSE_FORM`        | forward   |
| `product_has_route`                  | `HAS_ROUTE`            | forward   |
| `product_has_authorization`          | `AUTHORIZES`           | reverse   |
| `product_has_atc_class`              | `CLASSIFIED_AS`        | forward   |
| `product_has_therapeutic_class`      | `CLASSIFIED_AS`        | forward   |
| `authorization_held_by_organization` | `AUTHORIZATION_HOLDER` | forward   |

The approval file must explicitly choose and approve any mapping. Other
candidate relationship kinds are rejected until the ontology review defines
their canonical shape.

Node labels are restricted to the ontology's reference labels:
`MedicinalProduct`, `Substance`, `Organization`, `ClinicalConcept`,
`PopulationGroup`, `DoseForm`, `RouteOfAdministration`, and
`TherapeuticClass`. Every node also carries the common `GraphEntity` label.
`excipient` and `food_or_beverage` are not approved as node groups in this
model.

## 6. Plan and import behavior

### Validation

`--validate-only` is the default. It writes only:

- `validation.json`
- `manifest.json`

It never connects to Neo4j.

### Plan

`--plan` requires a valid approval and writes:

- `entities.jsonl`
- `relationships.jsonl`
- `rejected-records.jsonl`
- `validation.json`
- `manifest.json`

The plan is deterministic and includes exact entity member evidence, aliases,
identity/context keys, relationship support, and the approved direction/type.

### Apply

`--apply` builds the same plan and imports it through the Neo4j HTTP transaction
endpoint. Required environment:

```text
NEO4J_HTTP_URL
NEO4J_USER
NEO4J_PASSWORD
NEO4J_DATABASE (optional, default: neo4j)
```

No driver dependency is added. Credentials are sent only in the HTTP
`Authorization` header and are never logged.

## 7. Neo4j records

For each approved entity cluster:

- `(:GraphEntity:<approved-label> {candidateClusterId})`
- properties: group, label, aliases, alias count, identity keys, context keys,
  member count, ontology version, review state, quarantine state, import run.

For provenance:

- `(:Source {sourceId})`
- `(:Document {documentId})`
- `(:Evidence {evidenceId})`
- `(:Document)-[:PUBLISHED_BY]->(:Source)`
- `(:Evidence)-[:FROM_DOCUMENT]->(:Document)` for text evidence
- `(:Evidence)-[:FROM_SOURCE]->(:Source)` for structured/metadata evidence
- `(:GraphEntity)-[:HAS_EVIDENCE]->(:Evidence)`

For each approved relationship:

- `(:GraphEntity)-[r:<approved-type> {relationshipId}]->(:GraphEntity)`
- properties: relationship kind, ontology version, review state, quarantine
  state, support kind, support evidence ID, import run.
- The support evidence node is created but is referenced by ID; Neo4j cannot
  attach an edge from a native relationship to an evidence node.

Every import also writes `(:ImportRun {runId})` with plan ID, approval hash,
counts, status, start/finish times, and failure information.

## 8. Idempotency and integrity

- Constraints are created with `IF NOT EXISTS` for entity cluster, source,
  document, evidence, and import-run keys.
- Nodes use `MERGE` on stable IDs.
- Relationships use `MERGE` on the relationship ID and endpoints.
- A second run updates the same records rather than duplicating them.
- Post-import validation compares entity and relationship counts with the plan,
  checks that every entity has evidence, and checks the evidence-link count.
- The import run is marked `failed` if a batch or validation fails.

## 9. Commands

```bash
bun run retrieval:graph:import -- --validate-only
bun run retrieval:graph:import -- --plan --approval <approval.json>
bun run retrieval:graph:import -- --apply --approval <approval.json>
```

The approval file is never optional for `--plan` or `--apply`.

## 10. Observed validation result

Full validation on the current artifacts, without approval:

| Item                                                 |  Result |
| ---------------------------------------------------- | ------: |
| Confident clusters                                   |   4,390 |
| Confident members                                    | 113,381 |
| Ambiguous clusters                                   |   2,125 |
| Ambiguous members                                    |  72,059 |
| Unresolved candidates                                |   2,560 |
| Candidate relationships                              |  65,624 |
| Relationships with both endpoints confidently linked |   7,253 |
| Relationships with unresolved endpoints              |  58,371 |
| Self-loop relationships                              |       0 |
| Eligible entities                                    |       0 |
| Eligible relationships                               |       0 |
| Imported nodes                                       |       0 |
| Imported relationships                               |       0 |

Input checksums observed by validation:

- link manifest: `39d8ebf7c1b3945311050ca9d79c1ca5d98a15ab7a39efd52563d3824e94b17f`
- confident matches: `860e5bd01a82b10fadd30f46ded395820bf55ceb4b72a61175228a59373b3df8`
- relationship manifest: `629565f62198f0299f40ef26b913190d8799146300af746cf4a06851ad6ccfa6`
- relationship candidates: `60ebd3c35d234c33e1d3e00dc824bd16e5fab59330a0446f39e1e83b3b64d881`

The validation report and manifest are generated under
`tooling/cleaning-lab/output/graph-population/` and are ignored by Git.

The low number of resolvable relationships is expected: many relationship
endpoints are structured observations that remain ambiguous or unresolved in the
entity-link artifact. They must not be published.

## 11. Implementation surfaces

| Concern                                             | Location                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval contract, mapping validation, evidence IDs | `packages/modules/src/retrieval/kg/population/graph-population.ts`                                                                           |
| Artifact readers and plan builder                   | `packages/api/src/workers/retrieval/graph-population.ts`                                                                                     |
| Neo4j HTTP adapter                                  | `packages/api/src/workers/retrieval/neo4j-http.ts`                                                                                           |
| Import executor and post-validation                 | `packages/api/src/workers/retrieval/graph-import.ts`                                                                                         |
| CLI                                                 | `packages/api/src/workers/retrieval/import-graph.ts`                                                                                         |
| Tests                                               | `packages/modules/tests/retrieval-kg-population.test.ts`, `packages/api/tests/graph-import.test.ts`, `packages/api/tests/neo4j-http.test.ts` |

## 12. Remaining limitations

- No Person 1/domain approval exists, so the current corpus has not been
  published and no real Neo4j import has run.
- The ontology is still a draft; the approved mapping is limited to a small set
  of binary relationships.
- Composition, clinical assertions, dosage, contraindication, and other n-ary
  statements need canonical assertion/composition nodes before population.
- Excipient and food/beverage candidates are not approved as graph nodes.
- Link members are capped by the link artifact; full counts remain in the
  cluster record.
- Relationship support evidence is referenced by ID; a native Neo4j relationship
  cannot own an outgoing `SUPPORTED_BY` edge.
- No Neo4j service is defined in the repository; the target must be provisioned
  externally.
- No GraphRAG projection or retrieval endpoint is implemented.
