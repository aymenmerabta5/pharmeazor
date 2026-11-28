# Candidate-only entity linking and deduplication

- **Status:** implemented as an offline, artifact-first candidate pipeline.
- **Taxonomy:** `entity-link-candidate-taxonomy-v0.1` — temporary and not approved.
- **Source entity taxonomy:** `entity-mention-taxonomy-v0.1`.
- **Review gate:** Person 1 must review the link groups, identity keys, and conflict rules before canonical entities, resolved links, database persistence, or graph publication are implemented.

This layer groups candidate mentions and structured observations that appear to
refer to the same real-world entity. It does not create canonical entities,
resolve mentions, write PostgreSQL, populate Neo4j, embed graph objects, or alter
Hybrid RAG.

## 1. Boundary

The exporter produces only:

- confident candidate clusters;
- ambiguous candidate clusters;
- unresolved candidate records;
- diagnostics;
- the temporary link taxonomy;
- a versioned manifest.

Every cluster and unresolved record is `quarantined`. The JSON records
deliberately have no `canonicalEntityId`, `resolvedEntityId`, or canonical link
field. A `candidateClusterId` is an opaque candidate-group identity, not a
canonical entity ID.

The Relationship Extraction artifact was inspected for compatibility but is not
required as an input and is not modified. No relationship is used to infer entity
identity.

## 2. Inputs

- Candidate entity artifact:
  - `tooling/cleaning-lab/output/entity-mentions/manifest.json`
  - `entity-mentions.jsonl`
  - `structured-observations.jsonl`
  - `taxonomy.json`

The exporter verifies the entity manifest, mention and observation checksums,
taxonomy checksum, supported entity extractor version, and temporary review
status. A changed or dry-run entity artifact is rejected.

## 3. Link groups

Only groups that can represent a real-world entity are linked:

| Group               | Member kinds                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `product`           | `medicinal_product`, `brand_term`, `pharmaceutical_product`                                                                     |
| `substance`         | `substance`                                                                                                                     |
| `excipient`         | `excipient`                                                                                                                     |
| `organization`      | `organization`, `regulatory_authority`                                                                                          |
| `clinical`          | clinical conditions, symptoms, adverse/overdose effects, findings, procedures, tests, monitoring parameters, biological targets |
| `food_or_beverage`  | `food_or_beverage`                                                                                                              |
| `population`        | `population_group`                                                                                                              |
| `dose_form`         | `dose_form`                                                                                                                     |
| `route`             | `route_of_administration`                                                                                                       |
| `therapeutic_class` | `therapeutic_class`, `atc_class`                                                                                                |

Identifiers, quantities, dates, package values, strengths, schedules, statuses,
source/document references, and other role/value mentions are not turned into
candidate entities. They remain evidence or attributes.

## 4. Identity evidence

### Strong identifiers

Structured rows contribute product identity keys only when the source explicitly
provides them:

- registration number: `reg:<source>:<normalized-number>`;
- BDPM CIS: `cis:<digits>`;
- NDC: `ndc:<digits>`;
- UNII and DCI codes are retained as evidence but are not attached to product
  records, because they identify substances rather than products;
- ATC codes are classification keys, never product identity keys.

A mention's `cis` attribute can provide a CIS key when the entity extractor
carried it from BDPM.

### Names, aliases, and context

- Product names use a full normalized key and a strength-stripped brand key.
- Substances use the exact normalized name; salt/hydrate variants are kept
  separate and flagged ambiguous at the base-name level.
- Organizations use the existing legal-suffix-stripped organization key.
- Clinical terms use the existing condition normalizer.
- Dose forms use the existing normalized dose-form key.
- Jurisdictions use the existing country alias normalizer.
- Product context includes source, jurisdiction, form, strength, holder, product
  type, and schedule.
- Clinical and population context includes language.
- Organization context includes source and jurisdiction.

Structured context is taken only from the same source row. Text context is taken
from the mention's document provenance and exact span. No field is filled from a
similar product, another source, or another row.

## 5. Statuses

### Confident

A confident cluster requires at least two members and one of:

- a shared strong identifier with no conflicting group or context;
- one exact name key with compatible type and context.

A name alone never overrides a conflicting identifier.

### Ambiguous

A cluster is ambiguous when:

- the same name has multiple disjoint identifier components;
- the same base substance has different salt/hydrate forms;
- clinical or organization members have different roles;
- product context conflicts on form, strength, holder, source, jurisdiction,
  product type, or schedule;
- the same clinical/population label spans different languages;
- the label is too short or generic to identify safely.

Ambiguous clusters are candidates for review. They are not resolved links.

### Unresolved

An unresolved record is a linkable mention or observation that has no safe
partner: a singleton, a weak label, or a record that cannot be assigned to a
unique identifier component. Unresolved records retain their exact evidence and
identity keys so a later review can link them.

## 6. Evidence and provenance

Every member preserves:

- endpoint kind and ID;
- candidate kind and family;
- surface/raw label and normalized label;
- source ID, jurisdiction, and document type;
- exact text span with UTF-16 offsets, quote, quote hash, raw-content hash,
  text-unit, section, and document identity; or
- the structured source row, row number, row hash, and schema version.

Clusters also retain identity keys, aliases, name keys, context keys, conflicts,
member counts, and deterministic cluster IDs. Member evidence is capped at
`--max-members`; the full member count and truncation flag are retained. Aliases
are capped at 100 and `aliasCount` reports the full unique alias count.

## 7. Outputs

Default directory: `tooling/cleaning-lab/output/entity-links`.

- `confident-matches.jsonl`
- `ambiguous-matches.jsonl`
- `unresolved-candidates.jsonl`
- `diagnostics.jsonl`
- `taxonomy.json`
- `manifest.json`

The manifest is written last and records input identity/checksums, output
checksums, counts by group and status, member counts, diagnostics, unobserved
groups, the member cap, and `status: "candidate_only"`.

## 8. Commands

```bash
bun run retrieval:links:export -- --dry-run
bun run retrieval:links:export
bun run retrieval:links:export -- --entities <dir> --out <dir> --max-members 5000
```

The command writes no database rows and does not alter the hybrid index.

## 9. Verification and observed run

Implementation surfaces:

| Concern                 | Location                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Temporary link taxonomy | `packages/modules/src/retrieval/kg/extraction/entity-link-kinds.ts`                                    |
| Link types              | `packages/modules/src/retrieval/kg/extraction/entity-link-types.ts`                                    |
| Deterministic matcher   | `packages/modules/src/retrieval/kg/extraction/entity-link.ts`                                          |
| Entity artifact reader  | `packages/api/src/workers/retrieval/entity-artifact-input.ts`                                          |
| Artifact orchestration  | `packages/api/src/workers/retrieval/entity-link-export.ts`                                             |
| CLI                     | `packages/api/src/workers/retrieval/export-entity-links.ts`                                            |
| Tests                   | `packages/modules/tests/retrieval-kg-linking.test.ts`, `packages/api/tests/entity-link-export.test.ts` |

A full run on the observed 2026-11-27 snapshot produced:

| Item                            |  Result |
| ------------------------------- | ------: |
| Mentions scanned                | 196,897 |
| Structured observations scanned |  90,265 |
| Structured rows scanned         |  12,705 |
| Linkable records                | 188,000 |
| Confident clusters              |   4,390 |
| Confident members               | 113,381 |
| Ambiguous clusters              |   2,125 |
| Ambiguous members               |  72,059 |
| Unresolved candidates           |   2,560 |
| Diagnostics                     |       0 |
| Truncated clusters              |       0 |
| Unobserved groups               |    none |

Final checksums:

- `confident-matches.jsonl`: `841cfc84450bbbfc7881732e2d0127a6611e537da2a64954dfc070eb01953a23`
- `ambiguous-matches.jsonl`: `f768b3d92fda428d234667c8f3c45c991555003c5222eb3b311f3608502ea420`
- `unresolved-candidates.jsonl`: `f276e2058d2476ab373537fdd4030404c143b9de272907e37360a890b650f100`
- `diagnostics.jsonl`: empty SHA-256 `e3b0c442...`
- `taxonomy.json`: `7c886e00ddd1f0757a0e5ca1bbae5fe3ad77dfe2d619e15c30231a9ce2a53d88`

The artifact is generated and ignored by Git. Counts are candidate counts, not
clinical validation. This snapshot includes repeated-substance deduplication:
90,265 observations and 188,000 linkable records.

## 10. Evaluation without an LLM judge

No LLM-as-a-Judge is used. The evaluation protocol is deterministic:

- manually labelled duplicate and non-duplicate pairs;
- precision/recall for confident clusters at the endpoint level;
- ambiguity precision on stratified same-name/different-identifier samples;
- unresolved coverage and reason distribution;
- evidence/hash coverage and alias coverage;
- false-merge review for products with the same brand but different strengths,
  forms, holders, or jurisdictions;
- false-split review for synonyms and cross-source aliases.

The implemented framework in [GRAPH_EVALUATION.md](./GRAPH_EVALUATION.md) scores
same-entity and different-entity gold pairs, reports false merges and false
splits, and excludes gold pairs whose endpoints were never extracted. The
committed gold dataset is empty, so no score is a baseline yet.

A confident cluster is still a candidate grouping. It must not be served as a
canonical entity or used for graph answers until reviewed and promoted through a
separate approved workflow.

## 11. Remaining limitations

- The link taxonomy and conflict rules have not been reviewed by Person 1.
- Text mentions rarely carry strong identifiers; many product links rely on
  exact name and source/context compatibility.
- Same-name products with different strengths/forms but missing context remain
  ambiguous or unresolved rather than guessed.
- Clinical text extraction produces long bullet phrases; exact repeated phrases
  can cluster even when they are not clean clinical concepts.
- Source spellings and metadata differences can create conservative ambiguity.
- Member evidence is capped by `--max-members`; full counts and truncation flags
  are retained, but the cluster record contains only the first members.
- No canonical entities, entity resolution, database persistence, Neo4j
  population, or graph retrieval exists.
- No manually labelled entity-link golden set or graph evaluation baseline
  exists. The offline evaluation framework in
  [GRAPH_EVALUATION.md](./GRAPH_EVALUATION.md) is implemented, but the committed
  gold dataset is an empty annotation scaffold.
