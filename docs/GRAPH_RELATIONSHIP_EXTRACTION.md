# Candidate-only relationship extraction

- **Status:** implemented as an offline, artifact-first candidate pipeline.
- **Taxonomy:** `relationship-candidate-taxonomy-v0.1` — temporary and not approved.
- **Source entity taxonomy:** `entity-mention-taxonomy-v0.1`.
- **Review gate:** Person 1 must review the relationship kinds, endpoint semantics, and qualifier rules before canonical relationships, canonical entity linking, or graph publication are implemented.

This layer derives candidate relationships from the candidate entity artifact
and the `graph-evidence-v1` text units. It does not create canonical entities,
resolve mentions, publish relationship truth, write PostgreSQL, populate Neo4j,
embed graph objects, or alter Hybrid RAG.

Candidate entity linking is a parallel downstream artifact documented in
[GRAPH_ENTITY_LINKING.md](./GRAPH_ENTITY_LINKING.md). Relationship extraction
does not require it and does not use relationship endpoints as entity identity
evidence.

## 1. Boundary

The exporter produces only:

- candidate relationship records;
- diagnostics;
- the temporary relationship taxonomy;
- a versioned manifest.

Every relationship has `observationState: "quarantined"`. The JSON records
deliberately have no `canonicalEntityId`, `resolvedEntityId`, `relationshipTruth`,
or resolved endpoint field. Relationship endpoints are mention IDs or structured
observation IDs, never canonical entity IDs.

The existing Hybrid RAG tables, contextualization notes, embeddings, BM25
postings, benchmark data, and online retrieval service are untouched. The
existing resolved `kg_entities` / `kg_mentions` sidecar is not written.

## 2. Inputs

- Graph artifact:
  - `tooling/cleaning-lab/output/graph-evidence/manifest.json`
  - `tooling/cleaning-lab/output/graph-evidence/text-units.jsonl`
- Candidate entity artifact:
  - `tooling/cleaning-lab/output/entity-mentions/manifest.json`
  - `entity-mentions.jsonl`
  - `structured-observations.jsonl`
  - `taxonomy.json`

The exporter verifies the entity manifest, the mention and observation
checksums, the entity taxonomy checksum and review status, the graph text-unit
checksum, and the graph manifest identity recorded by the entity artifact. A
changed graph or entity artifact is rejected rather than silently mixed.

## 3. Temporary relationship taxonomy

The taxonomy is intentionally conservative. It distinguishes structured-register
relations from section-gated text relations.

### Product and regulatory

`product_has_substance`, `product_has_dose_form`, `product_has_strength`,
`product_has_package`, `product_has_route`, `product_has_atc_class`,
`product_has_therapeutic_class`, `product_has_schedule`,
`product_has_product_type`, `product_has_regulatory_status`,
`product_has_marketing_status`, `product_has_regulatory_procedure`,
`product_has_shelf_life`, `product_held_by_organization`,
`product_has_authorization`, `authorization_held_by_organization`.

### Clinical

`product_indicated_for_condition`, `product_contraindicated_for_condition`,
`product_has_adverse_effect`, `product_has_overdose_effect`,
`product_targets_population`.

### Evidence and value

`product_has_excipient`, `product_has_storage_condition`,
`product_has_product_characteristic`, `source_has_jurisdiction`,
`source_has_language`, `source_has_type`.

The authoritative temporary list, endpoint kinds, section gates, cue patterns,
and precedence live in
`packages/modules/src/retrieval/kg/extraction/relationship-kinds.ts`.

Person 1 must decide:

- which relationship kinds become canonical relationship records;
- whether a product/brand endpoint is the correct subject for each relation;
- whether text-derived clinical relations require a stronger assertion envelope;
- whether structured register rows become product-level or authorization-level
  relations;
- which qualifiers are required before publication.

## 4. Extraction rules

### Structured rows

A structured relationship is derived only from observations that share the same
evidence row:

- same source ID, path, row number, and row hash; or
- the same metadata artifact/field identity.

Observations from different rows are never joined, even when their normalized
values are equal. This preserves the register row as the evidence boundary.

### Section-gated text rules

Text relationships are derived from the mention set of one graph text unit:

- unit-scoped clinical rules require exactly one document-title product
  candidate in the unit;
- clause-scoped rules require both endpoints and any cue in the same clause;
- the subject must be mentioned in the document title, which prevents unrelated
  brand-like matches from becoming product subjects;
- subject and object must not be the same span, the same normalized value, or
  overlapping spans;
- a support span longer than 2,000 UTF-16 code units is rejected rather than
  emitted as vague evidence.

These rules are not general co-occurrence extraction. A condition in a
`warnings` unit does not become an indication, and a mention pair without the
required section or cue does not become a relationship.

## 5. Evidence and provenance

Text relationships include:

- endpoint mention IDs, candidate kinds, surface forms, and full mention
  evidence;
- document provenance, including source ID, source URL, title, language,
  jurisdiction, authority level, and dates;
- a text support span with UTF-16 local and document offsets;
- exact support quote, quote hash, raw-content hash, text-unit ID, section ID,
  section code, heading, and heading path.

Structured relationships include:

- endpoint observation IDs, candidate kinds, raw and normalized values;
- the source row ID, path, row number, row hash, and schema version;
- the shared row reference as the support record.

No structured observation receives a fabricated text span. No text relationship
uses a contextualization note, generated display prefix, table header, or list
marker as evidence.

## 6. Outputs

Default directory: `tooling/cleaning-lab/output/relationships`.

- `relationship-candidates.jsonl`
- `diagnostics.jsonl`
- `taxonomy.json`
- `manifest.json`

The manifest is written last and records:

- extractor and taxonomy versions;
- entity artifact and graph artifact identities and checksums;
- output checksums;
- relationship counts by kind and method;
- text/structured relationship counts;
- documents with text relations, text units, mentions, observations, and
  structured rows scanned;
- diagnostics by code;
- `status: "candidate_only"`.

## 7. Commands

```bash
bun run retrieval:relationships:export -- --dry-run
bun run retrieval:relationships:export
bun run retrieval:relationships:export -- --entities <dir> --out <dir>
```

The command reads the existing graph and entity artifacts. It writes no database
rows and does not alter the hybrid index.

## 8. Verification and observed run

Implementation surfaces:

| Concern                 | Location                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Temporary taxonomy      | `packages/modules/src/retrieval/kg/extraction/relationship-kinds.ts`                                          |
| Relationship types      | `packages/modules/src/retrieval/kg/extraction/relationship-types.ts`                                          |
| Deterministic extractor | `packages/modules/src/retrieval/kg/extraction/relationship.ts`                                                |
| Streaming artifact I/O  | `packages/api/src/workers/retrieval/artifact-jsonl.ts`                                                        |
| Artifact orchestration  | `packages/api/src/workers/retrieval/relationship-export.ts`                                                   |
| CLI                     | `packages/api/src/workers/retrieval/export-relationships.ts`                                                  |
| Tests                   | `packages/modules/tests/retrieval-kg-relationships.test.ts`, `packages/api/tests/relationship-export.test.ts` |

A full run on the observed 2026-11-27 snapshot produced:

- 65,624 candidate relationships;
- 63,276 structured-row relationships and 2,348 text relationships;
- 196,897 mentions, 90,265 observations, 33,860 mention-bearing text units, and
  12,705 structured row groups scanned;
- 0 extraction diagnostics;
- 257 documents with text relationships.

Final checksums:

- `relationship-candidates.jsonl`: `889de9b6a9b121ac139a9c591a2b6bfc11c39737cc48f2c287dad753e7c8a74a`
- `diagnostics.jsonl`: empty SHA-256 `e3b0c442...`
- `taxonomy.json`: `dbcbb93b8be1ca7bbabd46042f3634a98c64e0adfe937b52a4705d663ad89512`

The artifact is generated and ignored by Git. These are candidate counts, not
clinical validation. `product_has_storage_condition` remains unobserved in this
snapshot, which includes repeated-substance deduplication.

## 9. Evaluation without an LLM judge

No LLM-as-a-Judge is used. The evaluation protocol is deterministic:

- manually labelled sample relationships and endpoint spans;
- exact span/type precision and recall;
- support-span validity and hash coverage;
- duplicate and self-relation counts;
- coverage by relationship kind, source family, and language;
- structured-row provenance coverage;
- human review of the temporary taxonomy and a stratified sample.

The implemented framework in [GRAPH_EVALUATION.md](./GRAPH_EVALUATION.md) scores
relationship kind plus both endpoint identities, validates support spans and
rows, and reports per-kind precision and recall. The committed gold dataset is
empty, so no score is a baseline yet.

A relationship is a candidate observation, not a clinical assertion. It must not
be used as an answer until reviewed and promoted by a separate approved
workflow.

## 10. Remaining limitations

- The relationship taxonomy has not been reviewed by Person 1.
- Text recall is deliberately conservative; many documents do not repeat the
  product name in the same text unit as the clinical object.
- The document-title product guard can still accept a generic product name that
  is also a substance or class term; manual review remains required.
- Structured rows can contain source-specific encoding quirks and missing
  fields; missing values remain unknown.
- No canonical entities, resolved entity links, relationship publication,
  database persistence, or Neo4j population exist. Candidate-only entity
  linking is documented separately in
  [GRAPH_ENTITY_LINKING.md](./GRAPH_ENTITY_LINKING.md).
- No manually labelled relationship golden set or graph evaluation baseline
  exists. The offline evaluation framework in
  [GRAPH_EVALUATION.md](./GRAPH_EVALUATION.md) is implemented, but the committed
  gold dataset is an empty annotation scaffold.
- `product_has_storage_condition` was not observed in the current snapshot.
- The relationship artifact is a large generated JSONL file and is not
  committed.
