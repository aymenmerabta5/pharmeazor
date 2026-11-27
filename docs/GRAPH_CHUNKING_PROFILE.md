# Graph-compatible chunking profile (`graph-evidence-v1`)

**Status:** implemented as an additive, offline text model. It has no database
writer, embedding path, graph extractor, or retrieval endpoint.

This profile prepares evidence-grade text units for the logical graph described
in [GRAPH_ONTOLOGY.md](./GRAPH_ONTOLOGY.md) and
[GRAPH_SCHEMA.md](./GRAPH_SCHEMA.md). It is separate from the production hybrid
chunker described in [RETRIEVAL.md](./RETRIEVAL.md) and characterized in
[RAG_CHUNKER_PHASE1.md](./RAG_CHUNKER_PHASE1.md).

## 1. Compatibility boundary

The production hybrid path is unchanged:

- `packages/modules/src/retrieval/chunk.ts` still owns `hybrid-v1`;
- existing chunk IDs, context keys, contextualized hashes, embeddings, BM25
  postings, traces, gold labels, and baselines are untouched;
- graph output is not written to `retrieval_chunks`;
- graph text is not passed to the embedding-lab artifact reader.

A graph `legacyChunkId` deliberately keeps the existing grammar:

```text
<artifact>#<primary-section>-<occurrence>#<ordinal>
```

It is diagnostic only. The hybrid and graph profiles can emit the same string
for different text because graph chunking is section-pure. It must never be used
as a hybrid lookup key, benchmark label, database join, or sidecar foreign key.

Graph references use a profile-, configuration-, and snapshot-scoped identity:

```text
textUnitId =
  graph-evidence-v1:<configFingerprint>:<snapshotFingerprint>:<legacyChunkId>
```

The configuration fingerprint covers:

- profile and graph algorithm versions;
- section taxonomy and retrieval-helper versions;
- offset surface and encoding;
- `maxChars` and `overlapChars`.

The snapshot fingerprint is content-addressed from the configuration and exact
document body. A changed document therefore cannot silently reuse an old
`textUnitId`, even when the inherited `legacyChunkId` text is unchanged.
Changes to the shared heading taxonomy or retrieval text helpers must bump
`SECTION_TAXONOMY_VERSION` or `RETRIEVAL_TEXT_HELPER_VERSION` in `chunk.ts`.
The scoped ID is for the graph sidecar and evidence spans. It must never be
accepted by the benchmark chunk-id schema, the embedding-lab parser, or the
hybrid artifact joiner.

This profile does **not** make early same-code insertion stable. A document
revision creates a new snapshot and new text-unit IDs; old evidence references
must be detected by `rawContentSha256` and marked stale rather than silently
relinked.

## 2. Source surface and offsets

`graph-evidence-v1` declares:

```text
offsetSurface = clean-markdown-body-v1
offsetEncoding = utf16-code-unit
```

The surface is the exact clean Markdown returned by
`stripFrontMatter(markdown)`, before legacy heading reconstruction,
sanitization, or context-note prepending. The graph profile does not rewrite
source text; sanitization remains a hybrid-retrieval concern.

All ranges are half-open `[start, end)` UTF-16 code-unit offsets. This matches
JavaScript slicing and the existing KG tokenizer/gazetteer. Manifest section
offsets are Python Unicode code-point offsets and must not be mixed directly;
they can be converted only for validation.

Every text unit is validated as:

```text
documentBody.slice(sourceSpan.start, sourceSpan.end) === content
content.slice(uniqueLocalSpan.start, uniqueLocalSpan.end)
  === documentBody.slice(uniqueSourceSpan.start, uniqueSourceSpan.end)
sha256(content) === rawContentSha256
```

`rawContentSha256` is independent of the hybrid `contentHash`, which remains the
hash of contextualized text. Callers may pass the manifest hash as
`expectedDocumentContentSha256`; a mismatch aborts before chunking.

## 3. Section model

Every ATX heading with at most three leading spaces creates a
`GraphDocumentSection`. The profile records:

- a content- and position-derived snapshot `sectionId`;
- `parentSectionId` and ordered `ancestorSectionIds`;
- full `headingPath[]`, heading level, and own `headingCode`;
- `sectionCode`, inherited from the nearest mapped ancestor when the heading
  itself maps to `other`;
- the subtree `sourceSpan` and the direct-content span excluding children;
- hashes of both spans.

Small sections are never packed across heading boundaries. A text unit belongs
to exactly one section, and its `sectionCode` describes that section, not the
first section of an unrelated packed group.

Sections with headings but no direct body remain in the hierarchy and produce no
text unit. A non-empty document without headings gets one root section; a
whitespace-only document produces no section or unit.

The section ID is snapshot-scoped: a section edit changes its subtree hash and
therefore its ID. This is intentional for evidence versions. It is not a
longitudinal document-revision identity.

## 4. Text units and overlap

Each text unit records:

- profile/config-scoped `textUnitId` and diagnostic `legacyChunkId`;
- document and section order;
- exact raw `content`, its hash, and display text;
- whole-source, unique-source, and unique-local spans;
- block kind and structural IDs;
- overlap provenance;
- token estimate and injection flag.

Overlap is reserved before splitting:

```text
uniqueBudget = maxChars - overlapChars
```

`maxChars` is a soft ceiling for the complete raw unit; unique content is
normally at most `uniqueBudget`, leaving capacity for source-owned overlap.
Atomic table rows, unbroken words, and fenced blocks may exceed the ceiling only
with an explicit overflow diagnostic. Common non-terminal abbreviations
(`p. ex.`, `e.g.`) do not create sentence boundaries. Overlap starts only at a
sentence, list-item, table-row, or explicit word/block boundary from the
immediately preceding unit in the same block. It never crosses a section or
structural block; a cross-block boundary is intentional and is not reported as
an omitted overlap.

Each overlap records the predecessor text-unit ID, source and local spans,
requested and actual sizes, and alignment. List markers are not overlap
candidates. If no semantic boundary fits inside an eligible block, no overlap is
emitted and an `overlap_omitted` diagnostic is recorded. Overlap is never
silently dropped or started from an arbitrary character window.

Unique ranges are the canonical mention-extraction surface. Overlapping text is
repeated source, not new evidence; mentions and future assertions must dedupe by
document offsets and quote hash.

## 5. Tables and lists

### Tables

The parser recognizes a header row, separator row, and contiguous pipe rows.
Rows are atomic:

- complete rows are kept intact;
- newlines and Markdown pipes are preserved;
- header/separator/row identity is retained;
- an oversized row is kept intact and emits `atomic-table-row-overflow` rather
  than being silently split;
- a row whose cell count differs from its header emits `table_column_mismatch`
  while remaining intact.

The first raw table unit contains the source header. Later units carry the
header's exact source span with `headerIncluded=false`. `displayContent`
prepends that header for readability and marks the prefix in `generatedSpans`.
The generated header is never part of raw `content`.

### Lists

The parser retains list, item, item ordinal, parent-item, depth, marker span,
continuation, and part ordinals. Unindented lazy continuation lines remain in
their item until a blank line ends the list. Short complete items may share one
unit. An oversized item is split only after its marker, at sentence or word
boundaries, retaining the same item ID and continuation metadata. A marker is
never emitted as its own unit and is never an overlap boundary.

Continuation units do not contain a bullet in raw evidence. `displayContent`
adds the source marker as a generated prefix and declares it in
`generatedSpans`.

## 6. Evidence versus display text

`GraphTextUnit.content` is the only raw evidence surface for this profile.

`displayContent` is a derived readability surface:

```text
displayContent = generatedPrefix + content
```

Generated table headers and list markers are listed in `generatedSpans` with
local and exact source ranges. They must never back an `EvidenceSpan`, a mention
offset, or a canonical clinical assertion.

`graphEvidenceSpan(unit, start, end)` validates a mechanical quote against raw
`content` and returns the snapshot-scoped unit ID, raw hash, offset encoding,
unit-local offsets, document offsets, quote, and quote hash. It rejects a span
outside `uniqueLocalSpan`, so overlap text cannot become duplicate evidence.
Clinical assertion creation and review remain outside this profile.

## 7. Implementation

| Concern                               | Location                                                    |
| ------------------------------------- | ----------------------------------------------------------- |
| Public profile and splitting          | `packages/modules/src/retrieval/graph-chunk.ts`             |
| Public types and profile constants    | `packages/modules/src/retrieval/graph-chunk-types.ts`       |
| Position-preserving Markdown parser   | `packages/modules/src/retrieval/graph-markdown.ts`          |
| Source/hash/identity invariant checks | `packages/modules/src/retrieval/graph-chunk-validation.ts`  |
| Snapshot and scoped identity          | `packages/modules/src/retrieval/graph-identity.ts`          |
| Offline exporter                      | `packages/api/src/workers/retrieval/graph-export.ts`        |
| Exporter CLI                          | `packages/api/src/workers/retrieval/export-graph-chunks.ts` |
| Contract tests                        | `packages/modules/tests/retrieval-graph-chunk.test.ts`      |
| Exporter tests                        | `packages/api/tests/retrieval-graph-export.test.ts`         |

Public entry points are exported through `@repo/modules/retrieval`.

## 8. Offline export

```bash
bun run retrieval:graph:export -- --dry-run
bun run retrieval:graph:export -- --source ANPP_RCP
bun run retrieval:graph:export -- --artifact MED001__SRC_ANPP_RCP__DOC002__smpc
```

The exporter validates the source manifest hash before chunking and writes:

- `sections.jsonl`;
- `text-units.jsonl`;
- `diagnostics.jsonl`;
- `manifest.json`, including source and output checksums, profile versions,
  effective configuration, corpus snapshot hash, and diagnostic counts.

The default output is `tooling/cleaning-lab/output/graph-evidence`, which is
already ignored by the cleaning tool. An output manifest is written last as the
completion marker.

## 9. Verification

```bash
bun test packages/modules/tests/retrieval-graph-chunk.test.ts
bun test packages/modules/tests/retrieval-chunk.test.ts \
  packages/modules/tests/retrieval-chunk-characterization.test.ts
bun test packages/api/tests/retrieval-graph-export.test.ts
bun run --cwd packages/modules typecheck
bun run --cwd packages/modules lint
bun run --cwd packages/modules format:check
```

The graph tests cover section purity, parent/effective codes, production
title/provenance shape, front matter, UTF-16 offsets including non-BMP and Arabic
text, overlap reservation and explicit omission, cross-section isolation, table
row/header handling, oversized atomic rows and fences, nested and continued
lists without marker-only units, snapshot-scoped identity, forged source/overlap
rejection, inherited renumbering, and deterministic output.

A full-corpus dry run on the observed 2026-11-27 snapshot selected 488 clean
documents and produced 19,816 sections and 53,379 text units. It reported zero
warnings, zero errors, zero oversized units, 115 explicit overlap omissions, and
a maximum raw unit length of 4,091 characters. Source-manifest hash:
`8d240604d2326aabdeb5a00c9e21ad7d2e36acdded647ad4692e7b221ec9b3d7`; corpus
snapshot hash:
`8f482d78f34b295938423643444b2d595dae57baefed1a97a40bb0bf2ea732c7`.
The corpus is generated and ignored, so this is an observation, not a committed
fixture.

## 10. Deliberately deferred

- PostgreSQL sidecar tables and persistence.
- Context notes for graph units and graph retrieval projections.
- Candidate mention extraction is implemented in
  [GRAPH_ENTITY_EXTRACTION.md](./GRAPH_ENTITY_EXTRACTION.md). Candidate
  relationship extraction is implemented in
  [GRAPH_RELATIONSHIP_EXTRACTION.md](./GRAPH_RELATIONSHIP_EXTRACTION.md).
  Candidate assertions, canonical graph publication, entity linking, canonical
  relationships, and GraphRAG remain deferred.
- A graph golden set and baseline.
- Promoting these boundaries into the hybrid index, which would require
  contextualization, embedding, artifact, trace, gold-label, and baseline
  migration as one reviewed change.

Canonical graph and GraphRAG implementation still require the owner and
multidisciplinary approvals recorded in `GRAPH_ONTOLOGY.md`; this profile only
provides the source-mapped text substrate.
