# Knowledge-graph validation and evaluation

- **Status:** implemented as an offline, deterministic evaluation framework.
- **Taxonomies:** `entity-mention-taxonomy-v0.1`, `relationship-candidate-taxonomy-v0.1`, `entity-link-candidate-taxonomy-v0.1` — all temporary and unapproved.
- **Gold data:** the committed dataset is an empty manual-annotation scaffold. No labels are shipped and no metric in this repository is a baseline yet.
- **Review gate:** Person 1 must review the taxonomies and the gold labels before a score can support graph approval or publication.

This stage validates the candidate entity, relationship, and entity-link
artifacts and scores them where manually labelled gold data exists. It does not
create canonical entities, approve a taxonomy, publish a relationship, write
PostgreSQL, populate Neo4j, or alter Hybrid RAG.

## 1. Boundary

The evaluator is deliberately outside the graph approval path:

- it runs before graph approval and before Neo4j population;
- it never connects to Neo4j, PostgreSQL, or a model provider;
- it never writes a candidate artifact or a database row;
- it never promotes an ambiguous or unresolved candidate;
- it never invents a label, a score, or a missing denominator.

Validation is artifact integrity, not clinical validation. A clean run means the
records are internally consistent; it does not mean the extracted facts are
clinically correct.

## 2. Position in the pipeline

```text
graph-evidence-v1
  → entity mentions + structured observations
  → relationship candidates
  → confident / ambiguous / unresolved link candidates
  → validation and evaluation        ← this stage
  → recorded approval
  → Neo4j population
```

Scores are computed from the artifacts the pipeline actually emitted. The
evaluation does not re-run extraction, so it measures the recorded artifact, not
a fresh in-memory variant.

## 3. Inputs

| Artifact                | Required files                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Graph evidence          | `manifest.json`, `text-units.jsonl`, `diagnostics.jsonl`, `sections.jsonl`                                                                 |
| Candidate entities      | `manifest.json`, `entity-mentions.jsonl`, `structured-observations.jsonl`, `diagnostics.jsonl`, `taxonomy.json`                            |
| Candidate relationships | `manifest.json`, `relationship-candidates.jsonl`, `diagnostics.jsonl`, `taxonomy.json`                                                     |
| Candidate entity links  | `manifest.json`, `confident-matches.jsonl`, `ambiguous-matches.jsonl`, `unresolved-candidates.jsonl`, `diagnostics.jsonl`, `taxonomy.json` |
| Gold dataset            | `manifest.json`, three gold JSONL files (see below)                                                                                        |

Before a record reaches the evaluator, every file checksum is verified and the
artifacts must agree on:

- the graph manifest, profile, configuration, corpus snapshot, and source
  manifest identity;
- the entity manifest, mention checksum, and structured-observation checksum;
- the entity, relationship, and entity-link taxonomy versions and their
  `temporary_review_required` status;
- `status: "candidate_only"` and `filesWritten: true` on candidate manifests.

A changed, mixed, or dry-run artifact is rejected rather than silently scored.

## 4. Gold dataset protocol

The committed scaffold lives at
`tooling/retrieval-lab/eval/graph-gold/`:

```text
manifest.json
entity-mentions.gold.jsonl      (empty)
relationships.gold.jsonl        (empty)
entity-links.gold.jsonl         (empty)
```

The manifest declares the annotation scope for each document and structured
row. A scope is one of:

| Scope           | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `exhaustive`    | Every candidate of that task in the unit is labelled. Precision is defined. |
| `partial`       | Only a sample is labelled. Recall is defined; precision is `null`.          |
| `not_annotated` | The unit is outside that task's evaluation.                                 |

```json
{
  "schemaVersion": 1,
  "datasetId": "kg-gold-v1",
  "protocolVersion": "kg-gold-v1",
  "status": "awaiting_manual_annotation",
  "description": "Why this dataset exists.",
  "annotators": ["reviewer-id"],
  "documents": [
    {
      "documentId": "DOC001",
      "documentSnapshotId": "snapshot-...",
      "artifactId": "MED001__SRC_ANPP_RCP__DOC001__smpc",
      "entityScope": "exhaustive",
      "relationshipScope": "partial",
      "note": null
    }
  ],
  "structuredRows": [
    {
      "sourceId": "SANTE_MSP",
      "path": "nomenclature_products.csv",
      "rowNumber": 42,
      "entityScope": "not_annotated",
      "relationshipScope": "exhaustive",
      "note": null
    }
  ]
}
```

### Entity annotation

```json
{
  "goldId": "E-0001",
  "entity": {
    "kind": "text_span",
    "documentSnapshotId": "snapshot-...",
    "documentId": "DOC001",
    "documentStart": 120,
    "documentEnd": 129,
    "quote": "DOLIPRANE",
    "candidateKind": "brand_term"
  },
  "note": null
}
```

Structured observations use the same `goldId`/`note` wrapper with:

```json
{
  "kind": "structured_row",
  "sourceId": "SANTE_MSP",
  "path": "nomenclature_products.csv",
  "rowNumber": 42,
  "rawValue": "DOLIPRANE",
  "candidateKind": "pharmaceutical_product"
}
```

Entity annotations only accept `text_span` and `structured_row`. Metadata
observations are validated for provenance but are not scored by entity
precision because they are direct projections of source metadata.

### Relationship annotation

```json
{
  "goldId": "R-0001",
  "relationshipKind": "product_has_dose_form",
  "subject": { "kind": "structured_row", "...": "..." },
  "object": { "kind": "structured_row", "...": "..." },
  "note": null
}
```

Both endpoints must share one text unit or one structured row, which is the
extraction boundary used by the candidate pipeline. A relationship that spans
two units is rejected and excluded from scoring.

### Entity-link annotation

Links are labelled as pairs, not clusters, so false merges and false splits are
both measurable:

```json
{
  "goldId": "L-0001",
  "decision": "same_entity",
  "group": "product",
  "left": { "kind": "structured_row", "...": "..." },
  "right": { "kind": "structured_row", "...": "..." },
  "note": null
}
```

`decision` is `same_entity` or `different_entity`. A second label for the same
unordered pair with a conflicting decision is rejected.

### Annotation rules

- Do not invent labels. Fill the scaffold only from manual review of the raw
  candidate evidence.
- A text span must quote the exact source text at its document offsets. A
  mismatch excludes the label and produces a diagnostic.
- Use `exhaustive` only when every candidate of that task in the unit was
  reviewed. `partial` keeps recall honest without fabricating precision.
- Keep the manifest `status` in sync with the files. Labels in an
  `awaiting_manual_annotation` dataset produce a warning.
- Name at least one annotator once labels exist.

## 5. Metrics

### Precision, recall, F1

For a labelled task:

```text
precision = TP / (TP + FP)
recall    = TP / (TP + FN)
F1        = 2PR / (P + R)
```

A measure whose denominator is zero is reported as `null`, never as `0`.
Per-kind metrics and macro averages are reported. Macro averages include only
slices where the measure is defined.

### Entity mentions

- **Strict** matching uses document span + candidate kind for text mentions, and
  source/path/row/raw value + candidate kind for structured observations.
- **Relaxed span** matching ignores the candidate kind and reports
  `typeMismatches`. It answers "was the span found?" separately from "was it
  typed correctly?".
- Predictions on exhaustive units that match no gold label are false positives.
- Gold labels on annotated units that match no prediction are false negatives.

### Relationships

- Matching uses relationship kind + subject identity + object identity.
- Direction is significant.
- Predictions are false positives only when both endpoints fall inside
  exhaustive relationship scopes.
- Self-relationships, overlapping text endpoints, duplicate candidates, unknown
  kinds, and unsupported support rows are validation errors before scoring.

### Entity links

| Gold decision      | Predicted in one confident cluster | Result                       |
| ------------------ | ---------------------------------- | ---------------------------- |
| `same_entity`      | yes                                | true positive                |
| `same_entity`      | no                                 | false negative (false split) |
| `different_entity` | yes                                | false positive (false merge) |
| `different_entity` | no                                 | true negative                |

`trueNegatives` is reported alongside P/R/F1. False merges and false splits keep
up to 20 gold IDs for review. A gold pair whose endpoints were never extracted
is counted in `unresolvedGoldEndpoints` and excluded from the confusion matrix,
so linking is measured only on the endpoints the extractor produced. Ambiguous
clusters never count as a confident link.

## 6. Validation checks

Diagnostics are aggregated by code with a count and up to ten sample IDs.

| Area          | Examples                                                                                                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text units    | content hash, offset encoding, source span                                                                                                                                                                                                                                                                     |
| Mentions      | duplicate IDs, duplicate spans, span/kind conflicts, quote hash, document offsets, provenance fields, family mismatch, unknown kind                                                                                                                                                                            |
| Observations  | duplicate IDs, duplicate values, row number/hash, metadata hash, family mismatch, empty value                                                                                                                                                                                                                  |
| Relationships | duplicate IDs, logical duplicates, self-reference, overlapping endpoints, unknown kind, invalid endpoint kinds, method/support mismatch, support outside the unit, clause support not covering both endpoints, support row mismatch, wrong endpoint IDs, oversized support                                     |
| Links         | duplicate cluster IDs, confident singleton, member-count/truncation mismatch, group mismatch, duplicate endpoints across clusters, missing source endpoints, evidence mismatch, confident conflicts, alias and identity-key problems, shared identity key across confident clusters, unresolved reason/overlap |
| Gold          | malformed records, duplicate gold IDs, quote mismatch, unresolved spans, non-colocated relationship endpoints, link group mismatch, conflicting pair decisions                                                                                                                                                 |

## 7. Reports and reproducibility

`bun run retrieval:graph:evaluate` writes to
`tooling/cleaning-lab/output/graph-evaluation/`:

- `report.json` — deterministic evaluation result, metrics, counts, scope, and
  limitations;
- `diagnostics.jsonl` — one line per aggregated diagnostic;
- `manifest.json` — timestamp, input identities and checksums, output checksums,
  filtering summary, and validation status.

`report.json` excludes the timestamp, so identical inputs produce byte-identical
reports. The manifest carries `generatedAt` and the SHA-256 of both outputs.

## 8. Commands

```bash
bun run retrieval:graph:evaluate -- --dry-run
bun run retrieval:graph:evaluate
bun run retrieval:graph:evaluate -- --limit 500
bun run retrieval:graph:evaluate -- --gold <dir> --out <dir> --fail-on-error
```

`--limit` keeps only the first N graph text units and drops the text-scoped
mentions, relationships, and clusters that fall outside them. Structured
observations and structured relationships remain in scope. The report marks the
run `limited: true` and lists how many records were dropped. Use it on
memory-constrained machines; a limited run is not a full-corpus baseline.

No command starts Neo4j, runs the importer, writes PostgreSQL, or changes the
hybrid index.

## 9. Observed validation run

On 2026-11-28 the framework was run against regenerated artifacts with the empty
gold scaffold and `--limit 25`:

| Item                                    |   Value |
| --------------------------------------- | ------: |
| Text units                              |      25 |
| Mentions                                |     328 |
| Structured observations                 |  90,265 |
| Relationships in scope                  |  63,278 |
| Confident clusters                      |   1,098 |
| Ambiguous clusters                      |     739 |
| Unresolved candidates                   |     736 |
| Text mentions dropped by the limit      | 196,569 |
| Text relationships dropped by the limit |   2,346 |
| Clusters dropped by the limit           |   4,678 |

The run finished with `status: "insufficient_gold_labels"`, `ok: true`, 0 errors,
and 0 warnings. The only diagnostic is the expected `evaluation_scope_limited`
info entry.

The earlier pre-dedupe run found two duplicate observation IDs:
`obs_704fb4d4c40c4c2f1eb678223cb81d93` (nomenclature row 5103) and
`obs_4e8b9f7a85eacb99eb82cb4e6a12a017` (row 5112). The entity exporter now skips
repeated observation IDs, and the regenerated artifact no longer produces those
errors. No scored metrics are reported for this run: the committed gold scaffold
is empty, so all metric objects are `available: false`.

## 10. Implementation surfaces

| Concern                               | Location                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Evaluation types and report model     | `packages/modules/src/retrieval/kg/evaluation/types.ts`                                                 |
| Precision/recall/F1 and macro metrics | `packages/modules/src/retrieval/kg/evaluation/metrics.ts`                                               |
| Gold parsing and validation           | `packages/modules/src/retrieval/kg/evaluation/gold.ts`                                                  |
| Evidence and provenance validation    | `packages/modules/src/retrieval/kg/evaluation/evidence.ts`                                              |
| Entity metrics                        | `packages/modules/src/retrieval/kg/evaluation/entities.ts`                                              |
| Relationship metrics                  | `packages/modules/src/retrieval/kg/evaluation/relationships.ts`                                         |
| Entity-link metrics                   | `packages/modules/src/retrieval/kg/evaluation/linking.ts`                                               |
| Artifact integrity checks             | `packages/modules/src/retrieval/kg/evaluation/validate.ts`                                              |
| Orchestration and diagnostics         | `packages/modules/src/retrieval/kg/evaluation/index.ts`                                                 |
| Artifact readers and identity checks  | `packages/api/src/workers/retrieval/graph-evaluation-input.ts`                                          |
| Report writer                         | `packages/api/src/workers/retrieval/graph-evaluation.ts`                                                |
| CLI                                   | `packages/api/src/workers/retrieval/evaluate-graph.ts`                                                  |
| Empty gold scaffold                   | `tooling/retrieval-lab/eval/graph-gold/`                                                                |
| Tests                                 | `packages/modules/tests/retrieval-kg-evaluation.test.ts`, `packages/api/tests/graph-evaluation.test.ts` |

## 11. Remaining limitations

- No gold labels are committed. Every metric is unavailable until a reviewer
  fills the scaffold; the empty dataset is not a baseline.
- The taxonomies remain temporary and unapproved. Scores measure agreement with
  a draft ontology, not clinical truth.
- Precision depends on exhaustive scopes. A partial dataset can measure recall
  and per-kind behaviour but cannot prove precision.
- Link metrics only use gold pairs whose endpoints were extracted; extraction
  misses are reported separately and are not counted as linking errors.
- Metadata observations are validated structurally but are not scored by entity
  precision.
- A full-corpus run retains all text-unit content for quote validation. Use
  `--limit` on constrained machines and do not compare a limited run with a
  full-corpus baseline.
- No Neo4j population, graph retrieval, or canonical entity resolution is
  evaluated here.
