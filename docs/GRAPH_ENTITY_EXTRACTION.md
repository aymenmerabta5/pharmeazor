# Candidate-only entity extraction

**Status:** implemented as an offline, artifact-first candidate pipeline.
**Taxonomy:** `entity-mention-taxonomy-v0.1` — temporary and not approved.
**Review gate:** Person 1 must review the mention kinds and node/value classification before canonical entities, linking, relationships, or graph retrieval are implemented.

This layer turns the raw text units produced by
[`graph-evidence-v1`](./GRAPH_CHUNKING_PROFILE.md) into typed entity mentions and
structured observations. It does not create canonical entities, resolve
mentions, extract relationships itself, write PostgreSQL, populate Neo4j, embed
graph objects, or alter Hybrid RAG.

Relationship candidates are a separate downstream artifact documented in
[GRAPH_RELATIONSHIP_EXTRACTION.md](./GRAPH_RELATIONSHIP_EXTRACTION.md). That
layer references this artifact's mention and observation IDs; it does not change
this artifact's records or introduce canonical entity IDs.

## 1. Boundary

The pipeline produces only:

- `v1` in the extraction manifest;
- candidate mentions;
- structured observations;
- diagnostics;
- the temporary taxonomy.

Every text candidate is `quarantined`. The JSON records deliberately have no
`canonicalEntityId` or `resolvedEntityId` field.

The existing Hybrid RAG tables, contextualization notes, embeddings, BM25
postings, benchmark data, and online retrieval service are untouched.

The existing resolved `kg_entities` / `kg_mentions` sidecar is also not written.
Its `entity_id NOT NULL` foreign key and its normalized-key merging belong to a
later linking stage; candidate extraction cannot safely use that shape.

## 2. Inputs

- Graph artifact:
  - `tooling/cleaning-lab/output/graph-evidence/manifest.json`
  - `sections.jsonl`
  - `text-units.jsonl`
  - `diagnostics.jsonl`
- Cleaning source manifest:
  - `tooling/cleaning-lab/output/manifest.jsonl`
- Source registry:
  - `tooling/retrieval-lab/data/metadata/sources.csv`
- Structured references:
  - `tooling/retrieval-lab/data/metadata/name_map.csv`
  - `tooling/cleaning-lab/output/structured/nomenclature_products.csv`
  - `tooling/cleaning-lab/output/structured/bdpm_cis.csv`

The exporter verifies graph file checksums and requires the source manifest hash
to equal the hash recorded by the graph export. It also checks each graph text
unit's document hash against the joined source manifest row.

## 3. Temporary mention taxonomy

The taxonomy is intentionally broader than the existing KG entity enum. It
distinguishes entity candidates from controlled values and references.

### Evidence/reference kinds

`source`, `document`, `document_section`, `document_type`, `language`,
`jurisdiction`, `source_type`.

### Product/regulatory kinds

`medicinal_product`, `brand_term`, `pharmaceutical_product`, `product_package`,
`substance`, `excipient`, `dose_form`, `strength`, `route_of_administration`,
`therapeutic_class`, `atc_class`, `product_type`, `marketing_category`,
`regulatory_status`, `marketing_status`, `schedule`, `regulatory_procedure`,
`regulatory_authorization`, `regulatory_authority`, `organization`.

### Clinical kinds

`clinical_condition`, `symptom`, `adverse_effect`, `overdose_effect`,
`clinical_finding`, `medical_procedure`, `laboratory_test`,
`monitoring_parameter`, `biological_target`, `population_group`,
`food_or_beverage`.

### Value kinds

`identifier_registration`, `identifier_cis`, `identifier_ndc`, `identifier_unii`,
`identifier_dci`, `identifier_atc`, `quantity`, `dose_amount`, `date`,
`package_presentation`, `shelf_life`, `storage_condition`,
`product_characteristic`.

The authoritative temporary list, descriptions, family, storage class, and
recognition priority live in
`packages/modules/src/retrieval/kg/extraction/mention-kinds.ts`.

Decisions Person 1 must make include:

- which values become nodes rather than value objects;
- whether `atc_class` is separate from `therapeutic_class`;
- whether excipients are substances with a role or a separate node;
- whether product characteristics and identifiers become graph nodes;
- clinical concept granularity;
- which organization roles become explicit relationships later.

## 4. Extraction methods

### Deterministic dictionary matching

- Token-indexed, accent-folded, UTF-16 offset-preserving matching.
- Longest non-overlapping surface wins unless multiple kinds share the exact span.
- Sources:
  - name-map brands, DCI substances, ATC/classes, forms, strengths, holders;
  - nomenclature brands, substances, forms, strengths, packs, schedules,
    holders, countries, registration numbers, shelf life;
  - BDPM CIS names, forms, routes, statuses, procedures, marketing status,
    holders, CIS;
  - source registry names, types, jurisdictions, languages;
  - existing route and population lexicons;
  - a small temporary clinical lexicon grounded in observed corpus terms.

### Pattern extraction

- ATC, Algerian registration numbers, NDC, UNII, CIS.
- Quantities and package strings.
- ISO/French dates.
- Shelf life, storage instructions, product characteristics.
- Marketing category labels such as OTC/prescription/export-only.

### Section-gated clinical cues

The first pass extracts clinical-condition and adverse-effect candidates from
bullet items in indications, contraindications, adverse-effect, and overdose
sections, plus excipient phrases from excipient sections. It does not infer
relations or clinical assertions.

## 5. Evidence and provenance

Text mentions use `graphEvidenceSpan`, so they only cover a unit's
`uniqueLocalSpan`. They retain:

- `textUnitId`, document snapshot, artifact and document IDs;
- section ID, code, heading, and heading path;
- UTF-16 local and document offsets;
- exact quote, quote hash, and raw content hash;
- source ID/name/URL, title, language, jurisdiction, authority level, and dates.

Structured observations retain a `StructuredRecordRef` with:

- source ID;
- source file path;
- row number;
- stable row hash;
- schema version.

Metadata observations retain a `MetadataRecordRef` with artifact and field
identity. Structured data never gets a fabricated text span.

## 6. Outputs

Default directory: `tooling/cleaning-lab/output/entity-mentions`.

- `entity-mentions.jsonl`
- `structured-observations.jsonl`
- `diagnostics.jsonl`
- `taxonomy.json`
- `manifest.json`

The manifest is written last and records:

- extractor and ontology versions;
- graph artifact and source-input checksums;
- graph snapshot/config identity;
- output checksums;
- mention and observation counts by candidate kind;
- inherited graph diagnostics;
- `status: "candidate_only"`.

## 7. Commands

```bash
bun run retrieval:entities:export -- --dry-run
bun run retrieval:entities:export
bun run retrieval:entities:export -- --limit 20 --dry-run
```

The default input is the existing graph-evidence artifact. The command writes no
database rows.

## 8. Verification and observed run

Implementation surfaces:

| Concern                    | Location                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Temporary taxonomy         | `packages/modules/src/retrieval/kg/extraction/mention-kinds.ts`                                      |
| Lexicon matcher            | `packages/modules/src/retrieval/kg/extraction/lexicon.ts`                                            |
| Text/pattern/cue extractor | `packages/modules/src/retrieval/kg/extraction/text.ts`                                               |
| Clinical temporary lexicon | `packages/modules/src/retrieval/kg/extraction/clinical-lexicon.ts`                                   |
| Artifact orchestration     | `packages/api/src/workers/retrieval/entity-export.ts`                                                |
| CLI                        | `packages/api/src/workers/retrieval/export-entity-mentions.ts`                                       |
| Tests                      | `packages/modules/tests/retrieval-kg-extraction.test.ts`, `packages/api/tests/entity-export.test.ts` |

A full dry run on the current 488-document graph artifact produced:

- 53,379 text units scanned;
- 196,897 candidate mentions;
- 90,267 structured observations;
- 0 extraction diagnostics;
- 115 inherited graph overlap omissions;
- no oversized units.

All 51 taxonomy kinds are represented in the manifest counts, including zeros.
Only `document` and `document_section` remain unobserved as mention kinds because
they are evidence references; their provenance is carried by every mention and
observation. These are candidate counts, not clinical validation.

## 9. Evaluation without an LLM judge

No LLM-as-a-Judge is used. The evaluation protocol is deterministic:

- manually labelled sample spans and candidate kinds;
- exact span/type precision and recall;
- source and document provenance coverage;
- duplicate and invalid-span counts;
- type coverage by source family and language;
- human review of the temporary taxonomy and a stratified sample.

## 10. Remaining limitations

- The taxonomy has not been reviewed by Person 1.
- Clinical vocabulary coverage is intentionally small and temporary.
- Free-text clinical recall is not yet comprehensive.
- Dictionary matching can produce ambiguous or over-broad candidates.
- Structured CSV encoding/quirks are preserved, not silently corrected.
- No canonical entities, entity linking, database persistence, or Neo4j
  population exist. Relationships are candidate-only in the separate
  [GRAPH_RELATIONSHIP_EXTRACTION.md](./GRAPH_RELATIONSHIP_EXTRACTION.md)
  artifact; no canonical relationship exists.
- Text evidence is embedded in each mention JSONL record. A future database
  staging design must split it into a separate `EvidenceSpan` row without
  changing the source span/hash invariants.
- No graph evaluation baseline or golden set exists.
