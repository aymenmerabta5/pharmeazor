# Pharmeazor Knowledge Graph Logical Schema

**Version:** 0.1  
**Status:** Draft — logical design only; not a database schema and not approved for implementation  
**Date:** 2026-11-27  
**Ontology contract:** [GRAPH_ONTOLOGY.md](./GRAPH_ONTOLOGY.md)  
**Runtime context:** [RETRIEVAL.md](./RETRIEVAL.md), [RAG_CHUNKER_PHASE1.md](./RAG_CHUNKER_PHASE1.md)

This document defines **how** the ontology is logically structured: node
records, relationship records, identity keys, hashes, qualifiers, evidence,
lifecycle states, and the canonical-to-GraphRAG mapping.

It is technology-neutral. It does not introduce a graph database, DDL,
migration, extraction pipeline, index, or runtime endpoint. Existing production
fields are identified explicitly; everything else is a proposal.

## 1. Scope and invariants

The schema must preserve these invariants:

1. Source documents and exact source spans remain the evidence of record.
2. Candidate extraction output is quarantined until reviewed and promoted; it is
   not canonical truth.
3. Canonical clinical assertions are typed nodes, not unqualified binary edges.
4. GraphRAG is a one-way, versioned, loss-reporting projection of published
   canonical knowledge. It is not a source of truth.
5. The existing hybrid retriever is independent and remains the baseline and
   fallback.
6. IDs are not content hashes. Content hashes detect change; reviewed identity
   keys decide which record is the same logical record.
7. Missing values remain missing. No field is filled from a similar product,
   another language, another jurisdiction, or a later source unless a reviewed
   rule explicitly permits it.
8. A model confidence, embedding similarity, graph degree, community label, or
   relationship weight is never clinical confidence.
9. No generic `RELATED_TO`, `SAME_AS`, or automatic co-occurrence relationship is
   permitted.
10. No clinical fact may be served from a community report, generated entity
    description, context note, or model memory.

## 2. Schema conventions and status

### 2.1 Existing versus proposed

- **Existing:** a production field or artifact present in the repository today
  (the ontology's `V` evidence basis).
- **Proposed:** a logical field or node defined by this draft; no production
  implementation exists (the ontology's `P` use-case-derived abstraction).
- **Derived:** a GraphRAG projection field or node; generated from published
  canonical records and never authoritative (the ontology's `P`/`N` derived
  status).
- **Review-required:** the ontology's `R`; this is a review requirement, not a
  fourth data source.

No production field is renamed by this document. The mapping from logical names
to existing fields is in §9.1.

### 2.2 Node and relationship records

Every logical node and relationship is a record with its own identity and
provenance. Relationships are not bare rendered triples. Each relationship
record includes:

- identity and type;
- source and target references;
- lifecycle/publication state;
- source provenance and evidence references;
- qualifiers;
- validity bounds when stated;
- review information.

This is necessary because a relationship can be supported by multiple sources,
conflicted, retracted, or derived by a versioned projection.

### 2.3 Type categories

| Category            | Members                                                                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence            | `Source`, `Document`, `DocumentSection`, `TextUnit`, `EvidenceSpan`, `EntityMention`, `ExtractionRun`, `CandidateAssertion`                                                                                                  |
| Canonical reference | `Substance`, `MedicinalProduct`, `PharmaceuticalProduct`, `ProductPackage`, `DoseForm`, `RouteOfAdministration`, `TherapeuticClass`, `Organization`, `RegulatoryAuthorization`, `Term`, `ClinicalConcept`, `PopulationGroup` |
| Canonical statement | `IngredientComposition`, `ClinicalUseAssertion`, `DosageGuideline`                                                                                                                                                           |
| Derived             | `ProjectionRun`, `ProjectedEntity`, `ProjectedRelationship`, `ProjectedTextUnit`, `Community`, `CommunityReport`, `EmbeddingRecord`                                                                                          |

`CandidateAssertion` is an observation envelope, not a canonical statement.
`Source` is in the evidence category but is also a registry entity.

### 2.4 Logical value objects

These are structured values, not independently retrievable graph nodes:

| Value object           | Fields                                                                                                                                                | Rules                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `SourceRef`            | `sourceId`, `artifactId` (optional), `path`, `row` (optional), `contentSha256`, `sourceUrl` (optional), `registryVersion`                             | Locates the source record; no clinical meaning                              |
| `StructuredRecordRef`  | `artifactId`, `path`, `rowNumber`, `rowSha256`, `sourceId`, `schemaVersion`                                                                           | Evidence for structured composition/register data; not a text evidence span |
| `TextEvidenceRef`      | `textUnitId`, `evidenceSpanId`, `offsetEncoding`, `start`, `end`, `quoteSha256`                                                                       | Required for every published clinical assertion and dosage guideline        |
| `TermRef`              | `termId`, `role`, `language`, `script`                                                                                                                | A reference to a `Term` node; text alone is not a canonical entity          |
| `Quantity`             | `rawText`, `numericValue` (nullable), `unitText` (nullable), `ucumCode` (nullable), `comparator` (nullable), `basis` (nullable), `normalizationState` | Raw source text is required; normalized values are optional and reviewed    |
| `DateValue`            | `rawText`, `isoValue` (nullable), `granularity`, `sourceField`                                                                                        | Missing/unparseable values stay unknown; never substitute another timestamp |
| `AssertionParticipant` | `role`, `participantType`, `participantId`, `ordinal`, `evidenceSpanIds`, `required`                                                                  | Role is constrained by assertion kind; no co-occurrence inference           |
| `QualifierSet`         | population, route, dose, frequency, duration, maximum, severity, frequency of effect, management, applicability, condition, source wording            | Missing values are omitted/null; no default values                          |
| `ReviewRecord`         | `reviewedBy`, `reviewedAt`, `decision`, `notes`, `reviewVersion`                                                                                      | Required before publication of clinical statements                          |
| `LossReport`           | `lossFlags`, `description`, `preservedFields`, `discardedFields`, `sidecarRef`                                                                        | Required for every lossy GraphRAG projection                                |

### 2.5 Lifecycle vocabulary

Use separate fields rather than one ambiguous “status”:

| Field              | Values                                                                                               | Applies to                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `observationState` | `extracted`, `schema_invalid`, `evidence_invalid`, `quarantined`, `reviewed`, `promoted`, `rejected` | `EntityMention`, `CandidateAssertion`, `ExtractionRun` output |
| `validationState`  | `draft`, `schema_valid`, `evidence_valid`, `domain_reviewed`, `rejected`, `stale`                    | Canonical records                                             |
| `publicationState` | `unpublished`, `published`, `superseded`, `retracted`                                                | Canonical records                                             |
| `duplicateState`   | `kept`, `duplicate`                                                                                  | `Document`                                                    |
| `projectionState`  | `building`, `active`, `failed`, `superseded`                                                         | `ProjectionRun` and derived records                           |
| `reviewState`      | `not_required`, `pending`, `approved`, `rejected`, `changes_requested`                               | Records requiring review                                      |

`quarantined` is an observation state, not a way to serve a hidden canonical
fact. A published record moves to `superseded` or `retracted`; it is not deleted
from the evidence history.

### 2.6 Common record envelope

Applicable canonical and derived records use the following common fields. Node
tables below list only additional fields.

| Field                              | Requiredness                                                      | Meaning                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                               | Required                                                          | Opaque stable logical ID; never generated from title or confidence                                                                                                                      |
| `nodeType`                         | Required                                                          | One of the ontology entity names                                                                                                                                                        |
| `schemaVersion`                    | Required                                                          | Logical schema version                                                                                                                                                                  |
| `version`                          | Conditional                                                       | Reviewed revision for canonical records; derived run version for projections                                                                                                            |
| `sourceRefs`                       | Conditional                                                       | Source locator(s), hash(es), registry version; required for canonical records and evidence records except `Source`, and inherited from the parent document/text unit for child evidence |
| `evidenceRefs`                     | Required for published statements                                 | Text or structured evidence references; published clinical statements require text evidence                                                                                             |
| `validationState`                  | Required for canonical                                            | See §2.5                                                                                                                                                                                |
| `publicationState`                 | Required for canonical                                            | See §2.5                                                                                                                                                                                |
| `validFrom` / `validTo`            | Optional                                                          | Source-stated validity; `null` means not stated                                                                                                                                         |
| `recordedAt`                       | Required                                                          | When the record was created                                                                                                                                                             |
| `createdBy`                        | Required for canonical/derived/evidence where provenance is known | Actor or run that created the record; absent only when the source cannot establish it                                                                                                   |
| `supersedesIds`                    | Optional                                                          | Explicit reviewed replacement links                                                                                                                                                     |
| `supersededByIds`                  | Optional                                                          | Inverse lifecycle links                                                                                                                                                                 |
| `retractedAt` / `retractionReason` | Conditional                                                       | Required only after reviewed retraction                                                                                                                                                 |
| `accessScope`                      | Conditional                                                       | Required when source access is restricted; do not default to public for restricted sources                                                                                              |
| `review`                           | Required for published canonical records                          | A `ReviewRecord`                                                                                                                                                                        |
| `contentSha256`                    | Conditional                                                       | Exact content hash where the record owns text; not identity                                                                                                                             |
| `semanticHash`                     | Optional                                                          | Reviewed statement-signature hash for change detection; not identity or truth                                                                                                           |
| `confidence`                       | Optional                                                          | Candidate/projection diagnostic only; never a clinical probability                                                                                                                      |
| `projectionRunId`                  | Required for derived                                              | Versioned projection that produced the record                                                                                                                                           |

## 3. Node types and properties

The tables below use `R` for required, `C` for conditional, and `O` for optional
within the proposed logical schema. `P` marks a proposed field with no current
production field (for example `rawContentSha256`). Existing source fields are
noted where applicable. Where an existing stable identifier exists, it supplies
the logical identity field: `sourceId` for `Source`, `artifactId` for `Document`,
and `chunkId` for `TextUnit`; no replacement grammar is introduced.

### 3.1 Evidence and observation nodes

#### `Source`

- **Layer:** evidence/registry.
- **Status:** existing source metadata; proposed logical node.
- **Identity:** existing `source_id`; names may change while the ID remains.
- **Fields:**
  - `R sourceId` — existing source registry value.
  - `R sourceName`, `R jurisdiction`, `R language[]`, `R sourceType`.
  - `C authorityLevel`, `C authorityTier` — recorded source metadata; the known
    discrepancy in §2.4 of the ontology must not be normalized here.
  - `C registryVersion`, `C reviewState`, `C sourceUrl`.
  - `O notes`, `O baseDomain`, `O termsUrl`.
- **Invariants:** a source ID identifies one registry entry; documents refer to
  that ID. A source name/acronym alone is not identity.
- **Existing basis:** `tooling/retrieval-lab/data/metadata/sources.csv`,
  manifest source fields.

#### `Document`

- **Layer:** evidence.
- **Status:** existing artifacts and production fields; proposed canonical
  evidence node.
- **Identity:** existing `artifact_id`; `document_id` groups parts and is not a
  canonical product ID.
- **Fields:**
  - `R artifactId`, `R documentId`, `R partId`, `R sourceId`.
  - `R documentType`, `R language`, `R jurisdiction`.
  - `R contentSha256` (clean/canonical content hash), `R sourceRefs`.
  - `C title`, `C sourceUrls[]`, `C originalFiles[]`, `C medicineIds[]`,
    `C medicineNames[]`, `C inn`, `C brandName`, `C holder`.
  - `C publicationDate`, `C revisionDate`, `C collectedAt`, `C extractedAt`;
    each is a `DateValue`/nullable date and unknown is not filled.
  - `C duplicateOfDocumentId`, `C cleanerVersion`, `C extractionStatus`,
    `C reviewRequired`.
  - `O parserWarnings[]`.
- **Invariants:** `contentSha256` must match the stored content. `strengthForm`
  is not required because it was empty in every observed clean document.
- **Existing basis:** manifest rows, `packages/database/src/schema/retrieval.ts`,
  `packages/api/src/workers/retrieval/ingest.ts`.

#### `DocumentSection`

- **Layer:** evidence.
- **Status:** manifest metadata exists; first-class node proposed.
- **Identity:** proposed `sectionId` from artifact ID + section occurrence/start
  offset + section hash; heading text alone is insufficient.
- **Fields:**
  - `R sectionId`, `R artifactId`, `R heading`, `R level`, `R startChar`, `R endChar`.
  - `R offsetSurface` — named surface (for example cleaned Markdown body) and
    its document hash.
  - `R sectionCode` — current cleaner taxonomy value, including `other` when
    unmapped.
  - `C headingPath`, `C parentSectionId`, `C sectionContentSha256`.
  - `O table/list markers`, `O extractedTableRef`.
- **Invariants:** offsets must be inside the named surface and associated with
  the exact document hash. The observed manifest section bounds are source
  metadata; they are not automatically exact `EvidenceSpan` offsets.
- **Existing basis:** generated manifest `sections[]`; no first-class production
  section table.

#### `TextUnit`

- **Layer:** evidence.
- **Status:** existing production chunk; proposed logical evidence node.
- **Identity:** existing `chunk_id` format
  `<artifact>#<primary-section>-<occurrence>#<ordinal>`; do not change it here.
- **Fields:**
  - `R chunkId`, `R artifactId`, `R content`, `R contentHash`.
  - `R ordinal`, `R tokenEstimate`.
  - `C sectionCode`, `C sectionCodes[]`, `C sectionHeading`, `C sectionPath`.
  - `C contextKey`, `C contextNote`, `C contextualizedContent`.
  - `C language`, `C injectionRisk`.
  - `C documentSectionIds[]` — **proposed coarse or exact coverage**, not a
    claim that the current chunker stores explicit parent IDs, child membership,
    or source offsets; headings and paths do exist.
  - `P rawContentSha256` — proposed hash of raw `content`; do not reuse the
    existing contextualized `contentHash`.
- **Invariants:** `content` is evidence-compatible; `contextualizedContent` is
  retrieval input and may not back an `EvidenceSpan`. Existing section headings
  and paths are present; explicit parent IDs, child membership, and spans are
  not. Existing section-code arrays are aggregate membership, not source spans.
- **Existing basis:** `retrieval_chunks` and `ChunkDraft`; see
  `docs/RAG_CHUNKER_PHASE1.md`.

#### `EvidenceSpan`

- **Layer:** evidence.
- **Status:** proposed; not implemented.
- **Identity:** `(textUnitId, offsetEncoding, start, end, quoteSha256)`.
- **Fields:**
  - `R spanId`.
  - `R textUnitId`, `R rawContentSha256`.
  - `R offsetEncoding` — `unicode-code-point` or `utf16-code-unit`.
  - `R start`, `R end`, `R quote`, `R quoteSha256`.
  - `R language`.
  - `C documentSectionId`, `C sourceField`.
  - `O extractionRunId`.
- **Invariants:** `quote` must equal the raw text unit slice at the declared
  offsets and hash. No span may point at a context note, description, community
  report, or post-processed output.
- **Existing basis:** absent; current chunks have no spans.

#### `EntityMention`

- **Layer:** candidate observation.
- **Status:** proposed.
- **Identity:** `(extractionRunId, evidenceSpanId, mentionOrdinal, candidateType)`.
- **Fields:**
  - `R mentionId`, `R extractionRunId`, `R evidenceSpanId`.
  - `R surfaceText`, `R language`, `R candidateType`, `R mentionOrdinal`.
  - `C proposedCanonicalId`, `C resolvedCanonicalId`, `C resolutionStatus`.
  - `O modelConfidence` — diagnostic only.
- **Invariants:** a mention is not an entity and cannot be served as one.
  Resolution requires reviewed identity evidence.

#### `ExtractionRun`

- **Layer:** candidate observation.
- **Status:** proposed.
- **Identity:** `(runId, inputSnapshotHash, methodVersion)`.
- **Fields:**
  - `R runId`, `R method` (`structured_parser` or `llm_extraction`),
    `R methodVersion`.
  - `R ontologyVersion`, `R schemaVersion`, `R inputSnapshotHash`.
  - `R startedAt`, `R status`.
  - `C finishedAt`, `C modelProvider`, `C modelId`, `C modelRevision`,
    `C promptVersion`, `C parserVersion`, `C reviewer`.
  - `O diagnostics`, `O rejectionCounts`.
- **Invariants:** a run is reproducible metadata, not evidence. A changed model
  or prompt creates a different run.

#### `CandidateAssertion`

- **Layer:** candidate observation.
- **Status:** proposed.
- **Identity:** opaque `candidateId`; dedupe signatures are not canonical IDs.
- **Fields:**
  - `R candidateId`, `R candidateKind` (`ingredient_composition`,
    `clinical_use`, `dosage`).
  - `R extractionRunId`, `R evidenceSpanIds[]`, `R sourceText`, `R language`.
  - `R observationState`.
  - `C proposedSubjectIds[]`, `C proposedParticipantIds[]`,
    `C proposedQualifiers`.
  - `C proposedCanonicalId` — only after review.
  - `O modelConfidence`, `O rejectionReason`.
- **Invariants:** must have at least one evidence span; cannot be published,
  projected, or used as an answer. Promotion is explicit (`PROMOTED_TO`).

### 3.2 Canonical reference nodes

#### `Substance`

- **Identity:** reviewed `substanceId`; external identifiers are optional
  properties, not identity.
- **Fields:** `R preferredTermId`, `R substanceKind`, `R sourceRefs`; `C
  externalIdentifiers[]`, `C reviewedParentSubstanceId`; `O aliases`.
- **Notes:** base/salt/hydrate distinctions remain separate unless an
  authoritative reviewed mapping exists. A matching text label is not identity.

#### `MedicinalProduct`

- **Identity:** reviewed `productId`; jurisdiction and source context retained.
  `MEDxxx` values remain retrieval scoping IDs and are not copied into `id`.
- **Fields:** `R preferredTermId`, `R jurisdiction`, `R sourceRefs`; `C
  productType`, `C retrievalMedicineIds[]`, `C authorizationIds[]`; `O former
  terms`.
- **Notes:** same brand, strength, form, or combination across jurisdictions is
  not automatically one product.

#### `PharmaceuticalProduct`

- **Identity:** reviewed `pharmaceuticalProductId`; retain a reviewed
  composition/form signature as identity evidence.
- **Fields:** `R medicinalProductId`, `R compositionIds[]`, `R sourceRefs`; `C
  doseFormId`, `C routeIds[]`, `C strengthSummary`; `O releaseCharacteristics`.
- **Notes:** different strength, form, or route is normally a different record.

#### `ProductPackage`

- **Identity:** reviewed `packageId`, scoped to source product record.
- **Fields:** `R medicinalProductId`, `R packageText`, `R sourceRefs`; `C
  packQuantity`, `C packUnit`, `C containerType`, `C externalIdentifiers[]`.
- **Notes:** pack-size variants are retained; no GTIN is invented.

#### `DoseForm`

- **Identity:** reviewed `doseFormId`; optional scheme/code.
- **Fields:** `R preferredTermId`, `R sourceBasis`; `C scheme`, `C code`,
  `C codeVersion`; `O aliases`.
- **Notes:** normalization does not prove route.

#### `RouteOfAdministration`

- **Identity:** reviewed `routeId`; optional scheme/code.
- **Fields:** `R preferredTermId`, `R sourceBasis`; `C scheme`, `C code`,
  `C codeVersion`; `O aliases`.
- **Notes:** absent route is unknown; do not infer it from a dose form.

#### `TherapeuticClass`

- **Identity:** scheme + code/version, or reviewed local class ID.
- **Fields:** `R label`, `R classificationScheme`, `R sourceBasis`; `C code`,
  `C version`, `C parentClassId`; `O external vocabulary mapping`.
- **Notes:** classification is not equivalence and not an indication.

#### `Organization`

- **Identity:** reviewed `organizationId`; optional registry identifiers.
- **Fields:** `R preferredTermId`, `R sourceRefs`; `C country`,
  `C externalIdentifiers[]`, `C roles[]`; `O aliases`.
- **Notes:** role must come from a relationship and its source, not from a name.

#### `RegulatoryAuthorization`

- **Identity:** reviewed `(jurisdiction, authorityOrganizationId,
  authorizationNumber)` plus source version; if number is missing, identity is
  unresolved.
- **Fields:** `R jurisdiction`, `R authorityOrganizationId`, `R productId`,
  `R sourceRefs`; `C authorizationNumberRaw`, `C normalizedNumber`, `C status`,
  `C firstAuthorizedDate`, `C lastAuthorizedDate`, `C holderOrganizationId`,
  `C withdrawalReason`; `O externalIdentifiers[]`.
- **Notes:** a register listing is not proof of status; status/date only if
  stated. No compliance claim.

#### `Term`

- **Identity:** `(entityRef, language, script, normalizedText, termType,
  sourceRef/version)`; duplicate labels across entities do not merge.
- **Fields:** `R entityRef`, `R text`, `R language`, `R script`, `R termType`,
  `R sourceRef`; `C normalizedText`, `C normalizationVersion`, `C
  preferred`, `C reviewState`; `O transliteration`.
- **Notes:** Arabic terms require a source or reviewed translation; a
  translation is not clinical evidence.

#### `ClinicalConcept`

- **Identity:** reviewed `clinicalConceptId`; external terminology mapping is
  optional and versioned.
- **Fields:** `R conceptKind` (`condition`, `symptom`, `finding`, `procedure`,
  `effect`, `other`), `R preferredTermId`, `R sourceRefs`; `C external
  identifiers[]`, `C parentConceptId`; `O aliases`.
- **Notes:** no automatic mapping by string.

#### `PopulationGroup`

- **Identity:** reviewed `populationGroupId` + criteria signature.
- **Fields:** `R criteriaText`, `R sourceRefs`; `C ageMin`, `C ageMax`,
  `C ageUnit`, `C sex`, `C pregnancyStatus`, `C lactationStatus`,
  `C renalCriteria`, `C hepaticCriteria`, `C otherCriteria`; `O code`.
- **Notes:** null criteria mean unknown, not all populations.

### 3.3 Canonical statement nodes

#### `IngredientComposition`

- **Identity:** reviewed `compositionId`; product + substance + role + strength
  basis; versions remain distinct.
- **Fields:**
  - `R compositionId`, `R pharmaceuticalProductId`, `R substanceId`, `R role`
    (`active`, `excipient`, `other`), `R sourceRefs`.
  - `C strength` (`Quantity`), `C referenceStrength`, `C qualitativeOnly`,
    `C originalText`.
  - `O evidenceSpans[]`; `O reviewedNormalization`.
- **Published rule:** a composition may be published with either at least one
  exact text `EvidenceSpan` (`SUPPORTED_BY`) or a directly supporting structured
  source record in `sourceRefs`/`evidenceRefs`. A structured-only composition has
  **no** `SUPPORTED_BY` edge; a text-supported composition may also carry the
  structured reference. A compound co-mention is not enough.
- **Notes:** missing strength stays missing; do not infer it from product title
  unless the source field explicitly supports it.

#### `ClinicalUseAssertion`

- **Identity:** reviewed `assertionId`; not a hash, not a title, not a model
  output.
- **Common fields:**
  - `R assertionKind` (`indication`, `contraindication`, `precaution`,
    `interaction`, `undesirable_effect`, `warning`).
  - `R subjectRef` (product, pharmaceutical product, or substance).
  - `R participantRefs[]` with roles and ordinals.
  - `R originalText` and `R language`.
  - `R evidenceSpans[]` (one or more text spans).
  - `R jurisdiction` when the source is jurisdiction-specific.
  - `R sourceDocumentId`, `R sourceSectionCode` (hint, not evidence).
  - `R validationState`, `R publicationState`, `R review`.
  - `C polarity`, `C modality`, `C recommendationStrength`, `C judgementStatus`,
    `C severityText`, `C frequencyText`, `C applicabilityText`,
    `C managementText`, `C validFrom`, `C validTo`, `C conflictGroupId`.
  - `O reviewerNote`, `O externalCoding[]`.
- **Participant roles:** `subject`, `indication`, `contraindication_context`,
  `interactant`, `effect`, `population`, `condition`, `management`,
  `procedure`, `context`.
- **Published rule:** subject + required participants by kind + at least one
  exact text span + source document + review. No published assertion may be
  built solely from another assertion, graph traversal, a class, or a report.
- **No inference:** no automatic equivalence, no automatic status change, no
  automatic conflict resolution.

#### `DosageGuideline`

- **Identity:** reviewed `dosageGuidelineId`.
- **Fields:**
  - `R productRef` (medicinal or pharmaceutical product), `R evidenceSpans[]`,
    `R originalDoseText`, `R language`.
  - `R sourceDocumentId`, `R validationState`, `R publicationState`, `R review`.
  - `C indicationRef`, `C populationRef`, `C routeRef`, `C frequencyText`,
    `C durationText`, `C maximumText`, `C adjustmentText`.
  - `C doseQuantity` (`Quantity`), `C doseRangeLow/High`, `C basis`.
  - `C validFrom`, `C validTo`, `C sourceSectionCode`.
- **Published rule:** exact dose wording plus evidence and review. Normalized
  values must be derived by a documented, versioned rule; raw text remains.
- **No inference:** no patient-specific calculation, no extrapolation, no unit
  conversion unless reviewed, no assignment of missing population/route.

### 3.4 Derived GraphRAG nodes

#### `ProjectionRun`

- **Fields:** `R projectionRunId`, `R canonicalSnapshotHash`,
  `R ontologyVersion`, `R schemaVersion`, `R mappingVersion`,
  `R projectionState`, `R startedAt`, `R sourceCanonicalPublicationCutoff`;
  `C engine`, `C engineVersion`, `C communityConfig`, `C embeddingModel`,
  `C embeddingRevision`, `C lossReport`, `C finishedAt`; `O diagnostics`.
- **Rule:** only published canonical records may be read. Candidate observations
  are not eligible.

#### `ProjectedEntity`

- **Fields:** `R projectionRunId`, `R projectedEntityId`, `R canonicalType`,
  `R canonicalId`, `R projectedType`, `R title`, `R canonicalPublicationState`;
  `C description`, `C aliases[]`, `C textUnitIds[]`, `C embeddingRecordIds[]`,
  `C lossReport`.
- **Rule:** a generated title/description cannot be cited as source evidence.

#### `ProjectedRelationship`

- **Fields:** `R projectionRunId`, `R projectedRelationshipId`,
  `R sourceProjectedEntityId`, `R targetProjectedEntityId`,
  `R canonicalSourceIds[]`, `R relationshipType`, `R canonicalPublicationState`;
  `C canonicalAssertionId`, `C qualifierSidecar`, `C evidenceTextUnitIds[]`,
  `C weight`, `C weightBasis`, `C lossReport`, `C description`.
- **Rule:** `weight` is a topology/retrieval signal. Its basis must be recorded
  (`uniform`, `support_count`, `source_diversity_count`, or another documented
  policy). It is never a clinical confidence.
- **Rule:** if a qualifier, participant role, negation, or population cannot be
  preserved, the record must carry a sidecar and a loss report, or it must not be
  projected as a simple relationship.

#### `ProjectedTextUnit`

- **Fields:** `R projectionRunId`, `R projectedTextUnitId`,
  `R canonicalTextUnitId`, `R documentId`, `R sourceId`, `R text`,
  `R textSurface` (`raw_content` or `contextualized_content`); `C sectionCodes[]`,
  `C sectionPaths[]`, `C contextNoteReference`, `C overlapMarkers[]`,
  `C lossReport`.
- **Rule:** raw content is the default evidence-compatible surface. If a
  contextualized surface is projected, it is retrieval text, not evidence.

#### `Community`

- **Fields:** `R projectionRunId`, `R communityId`, `R level`, `R memberEntityIds[]`,
  `R memberRelationshipIds[]`, `R algorithm`, `R algorithmVersion`; `C parentId`,
  `C childIds[]`, `C textUnitIds[]`, `C title`.
- **Rule:** community membership is not a clinical category or equivalence.

#### `CommunityReport`

- **Fields:** `R projectionRunId`, `R reportId`, `R reportVersion`, `R communityId`,
  `R summary`, `R fullContent`, `R modelId`, `R promptVersion`, `R generatedAt`,
  `R isPrimaryEvidence` (must be `false`); `C findings`, `C evidenceTextUnitIds[]`,
  `C ranking`, `C reviewState`.
- **Rule:** a report is generated prose. It cannot support a canonical clinical
  assertion or be the sole citation for an answer.

#### `EmbeddingRecord`

- **Fields:** `R projectionRunId`, `R targetType`, `R targetId`, `R modelId`,
  `R modelRevision`, `R dimensions`, `R indexVersion`, `R targetTextSha256`;
  `C normalization`, `C metric`, `C indexStatus`.
- **Rule:** vector similarity and embedding metadata are technical retrieval
  signals, not evidence or identity.

## 4. Relationship records

Every relationship is stored as a record with:

- `R relationshipId`, `R relationshipType`, `R fromId`, `R toId`;
- `R sourceRefs`, `R validationState` (where canonical), `R recordedAt`;
- `C evidenceRefs[]`, `C qualifiers`, `C validFrom`, `C validTo`;
- `C reviewedBy`, `C reviewedAt`;
- `C lossReport` for derived relationships.

Relationship record fields have these defaults: **required**
`relationshipId`, `relationshipType`, `fromId`, `toId`, `recordedAt`, and
source references; **conditional** `validationState`, `publicationState`,
`evidenceRefs`, qualifiers, `validFrom`/`validTo`, review fields, and
`lossReport`; **optional** reviewer notes and non-authoritative display labels.
The table below adds the semantic requirements per relationship.

The logical relationship table:

| Relationship                 | Domain → range                                                                              | Cardinality                      | Required properties / constraints                                                                        | Existing or proposed                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `PUBLISHED_BY`               | `Document` → `Source`                                                                       | N:1                              | document ID, source ID, registry version                                                                 | Existing metadata / proposed node           |
| `HAS_SECTION`                | `Document` → `DocumentSection`                                                              | 1:N                              | document hash, heading, level, offsets, section hash                                                     | Manifest existing / proposed node           |
| `TEXT_UNIT_COVERS_SECTION`   | `TextUnit` → `DocumentSection`                                                              | N:M                              | `coverageKind` (`coarse_section_code` or `verified_span`), source chunk/section IDs                      | Coarse existing; exact proposed             |
| `HAS_EVIDENCE_SPAN`          | `TextUnit` → `EvidenceSpan`                                                                 | 1:N                              | raw content hash, offsets, quote hash, offset encoding                                                   | Proposed                                    |
| `MENTION_IN`                 | `EntityMention` → `EvidenceSpan`                                                            | N:1                              | exact surface text, mention type, run                                                                    | Proposed                                    |
| `PROCESSED_TEXT_UNIT`        | `ExtractionRun` → `TextUnit`                                                                | N:M                              | input hash, method/version                                                                               | Proposed                                    |
| `PRODUCED_MENTION`           | `ExtractionRun` → `EntityMention`                                                           | 1:N                              | run version                                                                                              | Proposed                                    |
| `PRODUCED_CANDIDATE`         | `ExtractionRun` → `CandidateAssertion`                                                      | 1:N                              | run version, candidate kind                                                                              | Proposed                                    |
| `CANDIDATE_SUPPORTED_BY`     | `CandidateAssertion` → `EvidenceSpan`                                                       | 1..N                             | quote/span hash, support role                                                                            | Proposed                                    |
| `PROMOTED_TO`                | `CandidateAssertion` → `IngredientComposition` / `ClinicalUseAssertion` / `DosageGuideline` | 0..1 per candidate               | reviewer, time, validation, canonical ID                                                                 | Proposed                                    |
| `RESOLVES_TO`                | `EntityMention` → canonical entity                                                          | 0..1 per mention                 | reviewer, identity evidence, resolution type                                                             | Proposed                                    |
| `DUPLICATE_OF`               | `Document` → `Document`                                                                     | 0..1 per duplicate               | duplicate group, evidence, cleaner version                                                               | Manifest existing                           |
| `SUPERSEDES`                 | `Document` or canonical statement/authorization/term → same type                            | 0..N                             | source revision evidence, reviewer, reason, effective date                                               | Proposed; some dates existing               |
| `HAS_PHARMACEUTICAL_PRODUCT` | `MedicinalProduct` → `PharmaceuticalProduct`                                                | 1:N                              | product identity evidence                                                                                | Proposed                                    |
| `HAS_PACKAGE`                | `MedicinalProduct` → `ProductPackage`                                                       | 1:N                              | package source text                                                                                      | Proposed                                    |
| `HAS_COMPOSITION`            | `PharmaceuticalProduct` → `IngredientComposition`                                           | 1:N                              | composition evidence                                                                                     | Proposed                                    |
| `CONTAINS_SUBSTANCE`         | `IngredientComposition` → `Substance`                                                       | N:1                              | role, strength basis when stated, evidence                                                               | Proposed; structured basis exists           |
| `HAS_DOSE_FORM`              | `PharmaceuticalProduct` → `DoseForm`                                                        | N:1                              | source form text, normalization state                                                                    | Proposed                                    |
| `HAS_ROUTE`                  | `PharmaceuticalProduct` → `RouteOfAdministration`                                           | 1:N                              | source route text; missing remains unknown                                                               | Proposed                                    |
| `CLASSIFIED_AS`              | `Substance` or `MedicinalProduct` → `TherapeuticClass`                                      | N:M                              | scheme, code/version, classification scope, source                                                       | Proposed; ATC field partially present       |
| `AUTHORIZES`                 | `RegulatoryAuthorization` → `MedicinalProduct`                                              | N:1                              | number, jurisdiction, source status                                                                      | Proposed; register fields partially present |
| `ISSUED_BY`                  | `RegulatoryAuthorization` → `Organization`                                                  | N:1                              | issuer source evidence                                                                                   | Proposed                                    |
| `AUTHORIZATION_HOLDER`       | `RegulatoryAuthorization` → `Organization`                                                  | N:1                              | holder source evidence, time scope                                                                       | Proposed                                    |
| `MANUFACTURER_OF`            | `Organization` → `MedicinalProduct`                                                         | N:M                              | manufacturer role evidence, time scope                                                                   | Proposed                                    |
| `HAS_TERM`                   | Named canonical entity → `Term`                                                             | 1:N                              | language, script, term role, source/evidence                                                             | Proposed                                    |
| `ASSERTION_PARTICIPANT`      | `ClinicalUseAssertion` → canonical participant union                                        | 1:N                              | role, ordinal, requiredness, evidence span                                                               | Proposed                                    |
| `DOSAGE_CONTEXT`             | `DosageGuideline` → canonical context union                                                 | 1:N                              | role, applicability, evidence span                                                                       | Proposed                                    |
| `SUPPORTED_BY`               | `IngredientComposition`, `ClinicalUseAssertion`, or `DosageGuideline` → `EvidenceSpan`      | 1..N for published text evidence | exact span, support role, review; composition structured source refs stay in `sourceRefs`/`evidenceRefs` | Proposed                                    |
| `PROJECTED_FROM`             | `ProjectedEntity` / `ProjectedRelationship` / `ProjectedTextUnit` → canonical record        | N:1 per projection run           | projection run, mapping version, loss report                                                             | Proposed derived                            |
| `HAS_COMMUNITY_MEMBER`       | `Community` → `ProjectedEntity` / `ProjectedRelationship`                                   | 1:N                              | run, member IDs                                                                                          | Proposed derived                            |
| `HAS_CHILD_COMMUNITY`        | `Community` → `Community`                                                                   | 1:N                              | run, level                                                                                               | Proposed derived                            |
| `SUMMARIZES`                 | `CommunityReport` → `Community`                                                             | N:1                              | run, report version                                                                                      | Proposed derived                            |
| `INDEXES`                    | `EmbeddingRecord` → projected target                                                        | N:M                              | model/revision/dimensions, target hash, index version                                                    | Proposed derived                            |

Relationship constraints:

- No edge from a candidate observation directly to a canonical answer.
- No `RELATED_TO`; no automatic `SAME_AS`.
- `SUPERSEDES` must have the same source/target node type. A newer date alone is
  insufficient.
- `CLASSIFIED_AS` does not imply a therapeutic substitution.
- `HAS_ROUTE` is only present when a source explicitly states a route.
- `PUBLISHED_BY` identifies the source registry entry; it does not itself prove
  the source's authority rank.
- `TEXT_UNIT_COVERS_SECTION` with `coarse_section_code` is not a source-span
  claim. Exact coverage requires reviewed `EvidenceSpan` or section bounds.

## 5. Identity, hashes, and revision keys

Hashes detect content change; they do not decide clinical identity.

| Logical type                                            | Identity key                                                              | Content/version hash                                                                      | Notes                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `Source`                                                | existing `sourceId`                                                       | registry snapshot hash/version                                                            | Registry changes are versioned                    |
| `Document`                                              | existing `artifactId`                                                     | existing `contentSha256`; optional source raw hash                                        | `documentId` groups parts; not product identity   |
| `DocumentSection`                                       | artifact + occurrence/start + section hash                                | section content hash + document hash                                                      | Existing manifest has no section ID               |
| `TextUnit`                                              | existing `chunkId`                                                        | existing contextualized `contentHash`; proposed `rawContentSha256`; existing `contextKey` | Do not reuse contextualized hash for raw evidence |
| `EvidenceSpan`                                          | text unit + offset encoding + start/end + quote hash                      | `quoteSha256`                                                                             | Exact quote must validate                         |
| `EntityMention`                                         | extraction run + span + occurrence + type                                 | input/output hash                                                                         | Not an entity                                     |
| `ExtractionRun`                                         | run + input snapshot + method version                                     | input/output manifest hash                                                                | Reproducibility only                              |
| `CandidateAssertion`                                    | opaque candidate ID                                                       | derivation/signature hash optional                                                        | Not canonical; no truth hash                      |
| `Substance`                                             | reviewed internal ID + external mappings                                  | semantic metadata version                                                                 | Text labels are not identity                      |
| `MedicinalProduct`                                      | reviewed internal ID + jurisdiction context                               | source/version references                                                                 | `MEDxxx` is not this identity                     |
| `PharmaceuticalProduct`                                 | reviewed internal ID + composition/form signature                         | reviewed signature hash optional                                                          | Strength/form changes matter                      |
| `ProductPackage`                                        | reviewed internal ID + source package context                             | source package hash                                                                       | Pack variants retained                            |
| `DoseForm`, `RouteOfAdministration`, `TherapeuticClass` | reviewed ID or scheme+code/version                                        | vocabulary version                                                                        | No merge by label                                 |
| `Organization`                                          | reviewed internal ID + optional registry ID                               | source/version                                                                            | Names do not merge                                |
| `RegulatoryAuthorization`                               | jurisdiction + authority + authorization number + source version          | register/version hash                                                                     | Missing number means unresolved                   |
| `Term`                                                  | entity + language + script + normalized text + term type + source context | normalization version                                                                     | No global text identity                           |
| `ClinicalConcept`                                       | reviewed internal ID + optional external mapping                          | mapping version                                                                           | No string merge                                   |
| `PopulationGroup`                                       | reviewed ID + criteria signature                                          | criteria hash optional                                                                    | Missing criteria not defaults                     |
| `IngredientComposition`                                 | reviewed composition ID + product/substance/role/basis signature          | source text/structured hash                                                               | Strength/version retained                         |
| `ClinicalUseAssertion`                                  | reviewed canonical assertion ID                                           | `semanticHash` for change detection                                                       | Identity requires review                          |
| `DosageGuideline`                                       | reviewed canonical guideline ID                                           | semantic hash for change detection                                                        | Raw dose text remains                             |
| `ProjectionRun`                                         | projection run ID                                                         | canonical snapshot + config hash                                                          | Derived only                                      |
| `ProjectedEntity`                                       | run + canonical type + canonical ID                                       | projection input hash                                                                     | One per run                                       |
| `ProjectedRelationship`                                 | run + canonical relationship/assertion ID                                 | projection input hash                                                                     | Qualifier sidecar                                 |
| `ProjectedTextUnit`                                     | run + canonical text unit ID                                              | projection input hash                                                                     | Raw/context surface labelled                      |
| `Community`                                             | run + level + community ID                                                | run hash                                                                                  | Unstable across runs                              |
| `CommunityReport`                                       | run + community + report version                                          | text hash + prompt/model hash                                                             | Never evidence                                    |
| `EmbeddingRecord`                                       | index version + target type/id + model/revision                           | target text hash                                                                          | No identity inference                             |

Additional hash rules:

- `Document.contentSha256` is the clean content hash.
- Existing `TextUnit.contentHash` is the contextualized hash; Phase 1 verified
  this.
- Proposed `TextUnit.rawContentSha256` must be separately computed if evidence
  spans are introduced.
- `EvidenceSpan.quoteSha256` hashes the exact quote at the declared encoding.
- `semanticHash` is a reviewed change-detection signature, never an ID or a
  publication decision.
- A model-generated note, report, or description never receives an evidence
  hash that could be mistaken for a source hash.

## 6. Clinical assertion and qualifier structure

### 6.1 Participant matrix

Only these combinations are valid for a published assertion:

| Kind                 | Required roles                        | Allowed object types                                                                | Optional roles                                                           |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `indication`         | `subject`, `indication`               | Subject product/substance; indication `ClinicalConcept`                             | `population`, `route`, `duration`, `severity`, `context`                 |
| `contraindication`   | `subject`, `contraindication_context` | Subject product/substance; context condition/substance/product/procedure/population | `population`, `severity`, `management`, `context`                        |
| `precaution`         | `subject`, source text                | Subject product/substance; optional context participant                             | `condition`, `population`, `management`, `severity`, `context`           |
| `interaction`        | `subject`, at least one `interactant` | Subject product/substance; interactant product/substance/clinical concept           | `effect`, `management`, `population`, `severity`, `frequency`, `context` |
| `undesirable_effect` | `subject`, `effect`                   | Subject product/substance; effect `ClinicalConcept`                                 | `population`, `severity`, `frequency`, `timing`, `context`               |
| `warning`            | `subject`, source text                | Subject product/substance; optional context participant                             | `condition`, `population`, `management`, `severity`, `context`           |

A source-only warning may have no object participant, but it still requires text
evidence and exact wording. Unknown or `other` assertion kinds are not
published.

### 6.2 Qualifier fields

| Qualifier           | Representation                                    | Rule                                                      |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Population          | `PopulationGroup` participant or structured field | Do not infer absent population                            |
| Route               | `RouteOfAdministration` or raw route text         | Do not infer from form                                    |
| Dose                | exact text plus optional `Quantity`               | Do not convert without review                             |
| Frequency           | source text plus optional structured interval     | Preserve “as needed,” “maximum,” “every …” wording        |
| Duration            | source text plus optional structured duration     | Missing duration remains unknown                          |
| Maximum             | source text and optional quantity                 | No calculated maximum                                     |
| Severity            | source text plus optional coded value             | No invented grade                                         |
| Frequency of effect | source text                                       | Do not convert “rare” to a number                         |
| Applicability       | source wording                                    | Preserve conditions, age, pregnancy, renal/hepatic status |
| Negation/polarity   | enum                                              | “No known risk” is not “no risk”                          |
| Modality            | enum                                              | “May,” “must,” “recommended,” “theoretical” retained      |
| Management          | source text                                       | Not a generated treatment recommendation                  |
| Jurisdiction        | source jurisdiction                               | Do not apply a source across jurisdictions automatically  |
| Validity            | source-stated `validFrom/validTo`                 | Do not infer from publication date if not stated          |
| Conflict group      | reviewed grouping identifier                      | Keeps conflicts together; does not select a winner        |

### 6.3 Dosage guidance

Minimum published dosage statement:

1. exact source statement;
2. one text evidence span;
3. one product or pharmaceutical-product context;
4. source document and language;
5. review record;
6. for any normalized value, a documented unit/basis normalization and its
   version.

An amount with no unit, a unit with no source basis, or a dose with no applicable
population/source context is incomplete and must not be silently completed.

## 7. Evidence and provenance links

### 7.1 Text evidence

- `ClinicalUseAssertion` and `DosageGuideline` use `SUPPORTED_BY` →
  `EvidenceSpan`; text evidence is mandatory for publication.
- `IngredientComposition` may use `SUPPORTED_BY` → `EvidenceSpan`, or may be
  published from a directly supporting `StructuredRecordRef` in
  `sourceRefs`/`evidenceRefs` without a `SUPPORTED_BY` edge. Structured
  references are values, not relationship targets. A text-supported composition
  may also retain the structured reference.
- `CandidateAssertion` uses `CANDIDATE_SUPPORTED_BY`.
- `EvidenceSpan` points into raw `TextUnit.content`, never into
  `contextualizedContent`, the context note, a generated entity description, or
  a community report.
- The exact quote and offsets are validated when the evidence record is created
  and revalidated after any content hash change.
- One published statement can have multiple evidence spans, including
  supporting and source-context spans. Any contradictory evidence remains
  visible; it is not deleted.

### 7.2 Structured evidence

Composition, package, authorization, organization, and form facts may be
supported by a `StructuredRecordRef` in `sourceRefs`/`evidenceRefs` when the
source is a structured reference file. The reference includes source ID, artifact
path, row, row hash, and schema version. It is a value reference, not a graph
node and not a `SUPPORTED_BY` target.

Structured register evidence cannot by itself establish a clinical-use
assertion or a dosage guideline. Source-boundary questions must preserve the
distinction between a name/register record and a clinical label or SmPC. The
`SUPPORTED_BY` edge remains reserved for exact text evidence.

### 7.3 Source and extraction provenance

A published canonical record must retain:

- source ID and source registry version;
- document artifact ID and content hash;
- section ID and exact span where applicable;
- publication/collection/extraction dates when known;
- extraction method, model/prompt/parser version for candidates;
- reviewer and review time;
- all supersession/retraction references.

### 7.4 Authorization

`accessScope` is inherited from the source and document. A graph query must
filter by the authenticated principal before entity projection, traversal,
evidence retrieval, or report selection. A community report built from mixed
scopes cannot be shown unless it has been generated separately for the same
scope. No post-filtering of an already unauthorized graph result is acceptable.

## 8. Revision, conflict, validation, and publication lifecycle

### 8.1 Observation lifecycle

```text
extracted
  ├─ schema_invalid ──► rejected
  ├─ evidence_invalid ─► rejected
  └─ quarantined ──► reviewed ──► promoted
                         └──────► rejected
```

A promotion must create or update a canonical record with a separate
`PROMOTED_TO` relation. `promoted` is never an alias for `published`.

### 8.2 Canonical lifecycle

```text
validationState=draft, publicationState=unpublished
  ├─► validationState=schema_valid
  ├─► validationState=evidence_valid
  ├─► validationState=domain_reviewed
  │       └─► publicationState=published
  │                 ├─► publicationState=superseded
  │                 └─► publicationState=retracted
  └─► validationState=rejected, publicationState=unpublished
```

`rejected` branches only from the pre-publication validation path. Once a
record is `published`, it may move to `superseded` or `retracted`; its
publication state never reverts to `unpublished` and its validation state is not
rewritten to `rejected`. The `stale` validation state is reserved for a
published record whose evidence later needs review; it does not by itself change
the publication state.

- `draft`: validation state after promotion into an editable canonical record;
  publication is `unpublished`; never served.
- `schema_valid`: structural checks pass; evidence may still be absent.
- `evidence_valid`: spans/hashes/source links validate.
- `domain_reviewed`: a qualified reviewer approves the clinical semantics,
  qualifiers, and source scope; publication is still `unpublished`.
- `published`: a publication state reached only after `domain_reviewed`.
- `superseded`: publication state for a record replaced by an explicit reviewed
  successor; retained as history.
- `retracted`: publication state withdrawn by reviewed action; retained as a
  tombstone with reason.
- `rejected`: validation outcome with no publication; retained for audit.
- `stale`: validation state when evidence is superseded or needs re-review; it
  does not mean the record was automatically deleted or rewritten.

No extraction model, embedding model, community algorithm, or automated
similarity check may set `published`.

### 8.3 Validation gates

A canonical clinical statement is publishable only if all are true:

1. the node type and fields satisfy §3 and §6;
2. subject and kind-specific participants exist;
3. at least one exact `EvidenceSpan` is present and validates against the raw
   text unit;
4. source document and source registry references resolve;
5. missing fields are represented as unknown, not guessed;
6. review is approved by the required domain/data reviewer;
7. no unresolved required qualifier is silently dropped;
8. publication does not rely on a community report, generated description, or
   model confidence;
9. authorization scope is known and applied;
10. the record has a stable canonical ID and lifecycle history.

### 8.4 Revisions and conflicts

- A document revision creates a new `Document` version and explicit
  `SUPERSEDES` link only when the source/reviewer establishes it.
- A duplicate cleanup link (`DUPLICATE_OF`) is not a revision and does not
  supersede or retract any clinical expression.
- Conflicting published assertions may share a `conflictGroupId`. They remain
  separate records with their own evidence, dates, and authority metadata.
- No automatic winner is selected in the canonical graph. The existing
  application may apply an authority policy at query/composition time, but must
  show the source and conflict rather than erase it.
- A document with superseded evidence marks affected assertions as
  `validationState=stale` or requires review; it does not automatically rewrite
  the clinical claim.
- Retraction preserves evidence and relationships for audit; it is not a hard
  delete.
- Community reports are regenerated or superseded; they never change canonical
  state.

## 9. Existing production fields and gaps

This table is a boundary contract. It prevents the proposed graph from being
mistaken for an existing database shape.

#### 9.1 Existing production field mapping

| Existing source/field                                                                  | Logical mapping                                 | Use in v0.1                                                              |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `retrieval_documents.artifact_id`                                                      | `Document.artifactId`                           | Existing stable document-part reference                                  |
| `retrieval_documents.document_id`                                                      | `Document.documentId`                           | Existing family/grouping reference; not product identity                 |
| `retrieval_documents.part_id`                                                          | `Document.partId`                               | Existing `rcp`, `notice`, `label`, or `nomenclature` part                |
| `retrieval_documents.source_id` / `source_name`                                        | `Document.sourceId`, `Source`                   | Existing source registry reference                                       |
| `retrieval_documents.authority_level` / `authority_tier`                               | `Document`/`Source` recorded authority metadata | Existing metadata; do not resolve the observed conflict                  |
| `retrieval_documents.jurisdiction`, `document_type`, `language`                        | `Document` fields                               | Existing metadata                                                        |
| `retrieval_documents.medicine_ids` / `medicine_names` / `inn` / `brand_name`           | Scoped source metadata on `Document`            | Existing scoping/name material; not canonical product/substance identity |
| `retrieval_documents.strength_form`                                                    | No required logical mapping                     | Existing field was empty in all observed clean docs                      |
| `retrieval_documents.publication_date`, `collected_at`, `revision_date`                | `Document` date fields                          | Existing; null means unknown                                             |
| `retrieval_documents.content_sha256`                                                   | `Document.contentSha256`                        | Existing clean-content hash                                              |
| `retrieval_documents.content_markdown`                                                 | `Document` content/source surface               | Existing clean Markdown                                                  |
| `retrieval_documents.metadata`                                                         | Source metadata/section hints                   | Metadata only; not canonical graph rows                                  |
| manifest `sections[]` (`code`, `heading`, `level`, `start_char`, `end_char`)           | `DocumentSection`                               | Existing generated metadata; first-class section node proposed           |
| `retrieval_chunks.chunk_id`                                                            | `TextUnit.chunkId`                              | Existing production ID; do not change                                    |
| `retrieval_chunks.content`                                                             | `TextUnit.content`                              | Existing raw evidence-compatible text                                    |
| `retrieval_chunks.contextualized_content`                                              | `TextUnit.contextualizedContent`                | Existing retrieval input; not evidence                                   |
| `retrieval_chunks.content_hash`                                                        | `TextUnit` existing contextualized hash         | Already defined; do not treat as raw quote hash                          |
| `retrieval_chunks.context_key`                                                         | `TextUnit.contextKey`                           | Existing note-cache key; not canonical identity                          |
| `retrieval_chunks.section_code` / `section_codes` / `section_heading` / `section_path` | `TextUnit` section metadata                     | Existing aggregate/primary labels; not exact source spans                |
| `retrieval_chunks.ordinal`, `token_estimate`, `injection_risk`                         | `TextUnit` fields                               | Existing operational metadata                                            |
| `retrieval_chunks.embedding_model` / `embedding_revision` / `embedding` / `term_count` | Existing retrieval index metadata               | Not canonical knowledge; hybrid baseline only                            |
| `retrieval_aliases`                                                                    | No direct `Term` mapping                        | Query-expansion alias table, not a canonical term/identity store         |
| `retrieval_chunks` parent/source spans                                                 | No existing field                               | Proposed `DocumentSection`/`EvidenceSpan` work only                      |

The remaining logical types below are proposed unless their row explicitly says
otherwise. Cardinalities in the relationship table constrain declared records
when the source supports them; an absent record is unknown, not evidence that a
real-world package, route, composition, or authorization does not exist.

#### 9.2 Existing hybrid retrieval is not a graph projection

The current production retrieval path is independent of this schema:

- dense retrieval over pgvector with BGE-M3, lexical BM25, RRF with `k=60`, and
  optional cross-encoder reranking (`docs/RETRIEVAL.md`; `AGENTS.md:54-62`);
- current committed baseline evaluation is an existing trace/hybrid result, not
  a live GraphRAG run; Phase 1 reports recall@20 `0.49` and candidate recall@50
  `0.7633` for that trace;
- no graph database, graph extraction run, GraphRAG index, or GraphRAG retrieval
  endpoint exists;
- the hybrid path remains the baseline and fallback and must not be changed by a
  GraphRAG projection.

A future router may choose between hybrid and graph results only after a separate
evaluation by query class. This document does not authorize that routing.

#### 9.3 Type-level mapping

| Proposed logical type                                              | Existing production/source material                                                              | Status                      | Important gap                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Source`                                                           | `source_id`, `source_name`, authority/jurisdiction metadata in source registry and manifest      | Metadata exists             | No canonical source table; authority conflict                                                             |
| `Document`                                                         | `retrieval_documents`; manifest rows; clean Markdown                                             | Existing                    | No canonical evidence spans; some dates null                                                              |
| `DocumentSection`                                                  | manifest `sections[]` with heading/code/level/start/end                                          | Metadata exists             | No first-class section table/ID                                                                           |
| `TextUnit`                                                         | `retrieval_chunks`; `ChunkDraft`; `chunkId`                                                      | Existing                    | No explicit parent IDs/child membership/source span; packed sections; contextualized hash is not raw hash |
| `EvidenceSpan`                                                     | None                                                                                             | Not implemented             | Exact offsets/quote validation absent                                                                     |
| `EntityMention`                                                    | None                                                                                             | Not implemented             | Extraction/resolution absent                                                                              |
| `ExtractionRun`                                                    | None                                                                                             | Not implemented             | Run/provider/prompt provenance absent                                                                     |
| `CandidateAssertion`                                               | None                                                                                             | Not implemented             | No quarantine store                                                                                       |
| `Substance`                                                        | `manifest.inn`/`medicine_names`; `name_map.dci`; `bdpm_composition.designation`/`substance_code` | Partial structured material | No reviewed canonical substance IDs                                                                       |
| `MedicinalProduct`                                                 | source title/brand; `medicine_ids` grouping; register rows                                       | Partial                     | `MEDxxx` is not product identity                                                                          |
| `PharmaceuticalProduct`                                            | title/form/strength strings; structured form/dosage                                              | Partial                     | `strength_form` is empty in observed clean docs; no canonical composition grouping                        |
| `ProductPackage`                                                   | structured `pack`/`packaging`                                                                    | Partial                     | No canonical package ID; pack variants                                                                    |
| `DoseForm`                                                         | `form` strings and `dosage_forms` sections                                                       | Partial                     | No controlled vocabulary mapping                                                                          |
| `RouteOfAdministration`                                            | Some source text/form strings                                                                    | Weak                        | No dedicated normalized route field                                                                       |
| `TherapeuticClass`                                                 | `name_map.atc`, `name_map.class` fields present in all 4,714 inspected name-map rows             | Partial                     | No general mapping/version/coverage; corpus coverage remains partial                                      |
| `Organization`                                                     | `holder` (40/558), source registry, RCP holder/manufacturer text                                 | Partial                     | No reviewed organization identity                                                                         |
| `RegulatoryAuthorization`                                          | structured `registration_number`, status, initial/final dates; BDPM `cis`                        | Partial                     | No canonical authorization records; authority conflict                                                    |
| `Term`                                                             | source labels, `name_map`, `retrieval_aliases`                                                   | Partial                     | `retrieval_aliases` is query expansion, not a canonical term store                                        |
| `ClinicalConcept`                                                  | source condition/effect text                                                                     | Textual only                | No reviewed concept IDs/mappings                                                                          |
| `PopulationGroup`                                                  | source population/pregnancy/renal text                                                           | Textual only                | No structured population extraction                                                                       |
| `IngredientComposition`                                            | `bdpm_composition` rows; composition sections; nomenclature form/dosage                          | Partial                     | No canonical composition statements/evidence links                                                        |
| `ClinicalUseAssertion`                                             | indications/contraindications/warnings/interactions/adverse sections                             | Textual only                | No extraction, assertion IDs, or publication workflow                                                     |
| `DosageGuideline`                                                  | dosage sections and label directions                                                             | Textual only                | No structured dose/qualifier extraction                                                                   |
| `ProjectionRun` and all projected/community/report/embedding nodes | None                                                                                             | Not implemented             | No GraphRAG index or graph database                                                                       |

Existing production fields that must not be reinterpreted:

- `retrieval_chunks.contentHash` is the contextualized hash, not a raw evidence
  hash.
- `retrieval_chunks.contextKey` is a note-cache key, not canonical identity.
- `sectionCodes` is aggregate membership for packed chunks, not per-span
  verification.
- `strengthForm` exists in the document schema but was empty in all observed
  clean manifest documents; it is not a reliable present-day field.
- `MEDxxx` values are internal target-scope IDs, not canonical product IDs.
- `retrieval_aliases` supports lexical query expansion; it is not a canonical
  `Term`/identity system.
- The current retrieval trace is historical/hybrid evidence; its chunk IDs do not
  establish a current canonical graph snapshot. See `docs/RAG_CHUNKER_PHASE1.md`.

## 10. GraphRAG projection and information loss

### 10.1 Projection rules

1. Consume only `published` canonical records. Exclude candidates, mentions,
   extraction runs, rejected records, and unpublished drafts.
2. Build a `ProjectionRun` with a canonical snapshot hash, ontology/schema
   version, mapping version, engine/config, and community parameters.
3. Preserve canonical IDs in every projected record.
4. Preserve canonical assertion IDs, qualifier sidecars, and evidence text unit
   IDs for every projected relationship derived from a statement.
5. Never turn a projection weight, description, community, or report into a
   source or a clinical statement.
6. Publish a loss report for every lossy transformation. A projection that
   cannot preserve safety-critical qualifiers must not be used as an edge.
7. Bind the GraphRAG index to a versioned projection run. Do not update a
   canonical graph and its index atomically by assumption; build and swap a
   versioned index.
8. Keep the existing hybrid retriever independent. GraphRAG is not a replacement
   and has no automatic fallback authority.

### 10.2 Mapping table

| Canonical concept                                      | GraphRAG projection                                                                                 | Transformation                                                                                                                              | Preserved information                            | Potential information loss                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `Source`                                               | Document/source metadata; not a standalone entity by default                                        | Copy source ID, name, jurisdiction, authority metadata into document metadata                                                               | Source identity and recorded rank                | Authority conflict/context can be flattened; rank is not truth                                                                |
| `Document`                                             | GraphRAG `Document` or projected metadata                                                           | Copy stable document/artifact IDs, title, language, dates, provenance                                                                       | Stable document reference and dates              | `documentId` parts can blur; missing dates remain unknown; no source body guarantee                                           |
| `DocumentSection`                                      | Not a projected entity; section metadata stays on text units                                        | Copy section codes/path/heading where available                                                                                             | Section navigation labels                        | Exact heading hierarchy and offsets may be absent; packing can cross sections                                                 |
| `TextUnit`                                             | `ProjectedTextUnit`                                                                                 | Reference canonical text unit; default raw content; optional contextualized surface                                                         | Canonical text unit ID, document ID, text        | Context note may be mistaken for evidence; no explicit parent IDs/child membership/spans currently exist; overlap duplication |
| `EvidenceSpan`                                         | Not a standalone entity; sidecar/evidence reference on claims/text units                            | Copy span ID, text unit ID, offsets, quote hash, source doc                                                                                 | Exact provenance reference                       | GraphRAG may not display offsets; generated summaries can lose evidence                                                       |
| `EntityMention`, `ExtractionRun`, `CandidateAssertion` | **Not projected**                                                                                   | Exclude all candidate/observation records                                                                                                   | Canonical safety boundary                        | Any unvalidated information is deliberately unavailable to GraphRAG                                                           |
| `Substance`                                            | `ProjectedEntity`                                                                                   | Copy canonical ID, preferred term, descriptions; aliases metadata                                                                           | Canonical substance ID and labels                | Salt/base/role distinctions can be lost if collapsed into one display node                                                    |
| `MedicinalProduct`                                     | `ProjectedEntity`                                                                                   | Copy canonical ID, preferred/source labels, jurisdiction metadata                                                                           | Product ID and product name                      | Jurisdiction/source product hierarchy can be flattened; same brand across sources can be conflated by display                 |
| `PharmaceuticalProduct`                                | `ProjectedEntity`                                                                                   | Copy canonical ID, composition/form/strength summary                                                                                        | Product formulation reference                    | Strength/route release characteristics may be summarized away                                                                 |
| `ProductPackage`                                       | `ProjectedEntity`                                                                                   | Copy package ID and display text; link to product                                                                                           | Package presentation identity                    | Pack size/variant granularity can be lost if title-merged                                                                     |
| `DoseForm`                                             | `ProjectedEntity`                                                                                   | Copy canonical ID, preferred term, scheme/code metadata                                                                                     | Controlled form concept                          | Scheme and source-specific wording may be lost                                                                                |
| `RouteOfAdministration`                                | `ProjectedEntity` when explicitly canonical                                                         | Copy route ID/term and evidence reference                                                                                                   | Explicit route concept                           | Missing route remains missing; form-to-route inference is forbidden                                                           |
| `TherapeuticClass`                                     | `ProjectedEntity`                                                                                   | Copy class label, scheme, code/version                                                                                                      | Class navigation                                 | Classification scope and ATC limitations can be lost; not equivalence                                                         |
| `Organization`                                         | `ProjectedEntity`                                                                                   | Copy organization ID/name and role sidecar                                                                                                  | Organization identity                            | Role/time context can be lost if the node is detached from its relationship                                                   |
| `RegulatoryAuthorization`                              | `ProjectedEntity` plus relationships                                                                | Copy authorization ID, status/dates sidecar; project authorizes/issuer/holder edges only when explicit                                      | Registration/authorization reference             | Status/date/jurisdiction can be flattened; no compliance claim                                                                |
| `Term`                                                 | Not a projected entity by default; title/aliases metadata                                           | Use reviewed preferred label; retain aliases in metadata                                                                                    | Display/query labels                             | Cross-language aliases can be mistaken for canonical identity; source language context can be lost                            |
| `ClinicalConcept`                                      | `ProjectedEntity`                                                                                   | Copy canonical concept ID and preferred label                                                                                               | Concept navigation/label                         | Terminology mappings, parents, and source wording can be lost                                                                 |
| `PopulationGroup`                                      | Not a projected entity by default; qualifier sidecar on assertions/dosage                           | Keep criteria text/structured qualifiers with statement                                                                                     | Population qualifiers for retrieval              | GraphRAG native edges may not support population qualifiers; never drop them silently                                         |
| `IngredientComposition`                                | `ProjectedRelationship` with qualifier sidecar                                                      | Project product↔substance; retain role/strength/basis/source refs                                                                           | Composition topology and qualifiers              | Role, strength, salt/reference details can be lost if collapsed to an unlabelled edge                                         |
| `ClinicalUseAssertion`                                 | `ProjectedRelationship` only if a lossless qualifier sidecar is supported; otherwise canonical-only | Preserve assertion ID, kind, subject, participant roles, polarity, population, evidence IDs; reify or omit lossy n-ary/qualified statements | Typed statement and source/evidence references   | N-ary roles, negation, modality, population, jurisdiction, severity, and wording can be lost; never flatten silently          |
| `DosageGuideline`                                      | Not projected as a simple edge in v0.1; optional sidecar/claim only if engine supports it           | Keep canonical text and evidence; do not force dose/frequency/population into one edge                                                      | Exact dose/qualifier and citation                | Dose, frequency, duration, population, route, and maximum can be lost; omit rather than flatten                               |
| `Community`                                            | `Community`                                                                                         | Derived clustering of projected members                                                                                                     | Topology/hierarchy and membership IDs            | Membership is not clinical grouping; changes across runs                                                                      |
| `CommunityReport`                                      | `CommunityReport`                                                                                   | Generate from community plus cited evidence; record model/prompt/run                                                                        | Navigation/global-search aid and report metadata | Summary error, loss of evidence granularity, and false implication of consensus; not primary evidence                         |
| `EmbeddingRecord`                                      | `EmbeddingRecord`                                                                                   | Store model/revision/index target and hash                                                                                                  | Retrieval reproducibility                        | Similarity is not identity, evidence, or clinical confidence                                                                  |

### 10.3 Weight policy

If GraphRAG requires a relationship weight:

- use a documented `weightBasis` such as `uniform` or
  `supporting_text_unit_count`;
- keep the canonical evidence count separate;
- never use an LLM-generated relation “strength” as clinical confidence;
- never compare weights across projection runs with different policies;
- record weights in the derived layer only.

A weight can influence community detection or ranking. It cannot make a
statement true, increase authority, or replace source review.

### 10.4 Loss rules

Every projected relationship derived from a canonical statement must carry a
`LossReport` with one or more of:

- `none` — no information considered safety-critical was lost;
- `qualifiers_sidecar` — qualifiers are preserved outside the native edge;
- `nary_reified` — an n-ary statement is reified rather than flattened;
- `evidence_ref_only` — the edge references evidence without embedding text;
- `summary_generated` — a generated report/description is present;
- `source_scope_lost` — source/jurisdiction/authority context cannot be
  represented;
- `not_projected` — the canonical record is intentionally absent.

Rules:

- `DosageGuideline` and qualified/n-ary clinical assertions default to
  `not_projected` or sidecar-backed reification, not simple edges.
- A clinical assertion with `polarity=negated`, `modality=uncertain`, a non-empty
  population, multiple interactants, or unresolved qualifiers cannot be reduced
  to an unqualified edge.
- A community report cannot be the only citation for an answer.
- A projected `TextUnit` that uses `contextualized_content` must label the
  surface as retrieval-only; evidence must still come from raw text.

## 11. Validation invariants and queries

### 11.1 Structural invariants

- IDs are unique within a type and stable across unrelated document edits.
- `DocumentSection` offsets, `EvidenceSpan` offsets, and quote hashes validate
  against the named content/version.
- `SUPPORTED_BY` targets only exact text evidence for published clinical
  statements. A structured-only `IngredientComposition` must instead have a
  directly supporting `StructuredRecordRef` in `sourceRefs`/`evidenceRefs`, and
  no `SUPPORTED_BY` edge.
- Every published `ClinicalUseAssertion` has a subject, required participants,
  source document, language, exact span(s), and review.
- Every published `DosageGuideline` has product context, exact dose wording,
  evidence, and review.
- Every published `IngredientComposition` has product, substance, role, and
  text or structured source support.
- A candidate cannot appear in a canonical traversal or GraphRAG projection.
- A source-specific authority ranking is not promoted into a universal clinical
  fact.
- No source date is substituted for another date.
- No missing population, route, dose, or status is populated by a default.
- No cross-language string equality creates a canonical identity.
- No relationship weight, community, report, or model score creates an
  assertion.

### 11.2 Minimum traversal patterns

The schema must support, without implying that they are implemented:

- product → pharmaceutical product → composition → substance;
- product/pharmaceutical product → package, dose form, route;
- product → authorization → issuer/holder organization;
- subject → clinical-use assertion → participants → evidence;
- text unit → evidence span → supporting/candidate/canonical statement;
- document → section → text unit, with explicit uncertainty about packing;
- published canonical set → projection run → projected entities/relationships →
  communities/reports;
- hybrid retrieval → baseline context, independently of GraphRAG.

A traversal is not a new clinical fact. Multi-hop answers must cite the explicit
canonical edges and source evidence used at each step.

## 12. Traceability to the ontology

| Ontology concept                                                                             | Schema definition              | Status                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| `Source`                                                                                     | §3.1 `Source`; §9.1 mapping    | Evidence existing; node proposed          |
| `Document`                                                                                   | §3.1 `Document`; §9.1          | Existing artifacts; proposed node         |
| `DocumentSection`                                                                            | §3.1 `DocumentSection`         | Manifest metadata existing; node proposed |
| `TextUnit`                                                                                   | §3.1 `TextUnit`; §9.1          | Existing production chunk                 |
| `EvidenceSpan`                                                                               | §3.1 `EvidenceSpan`; §7.1      | Proposed                                  |
| `EntityMention`                                                                              | §3.1; §7.1                     | Proposed                                  |
| `ExtractionRun`                                                                              | §3.1; §7.3                     | Proposed                                  |
| `CandidateAssertion`                                                                         | §3.1; §8.1                     | Proposed                                  |
| `Substance`                                                                                  | §3.2 `Substance`               | Partial source basis                      |
| `MedicinalProduct`                                                                           | §3.2 `MedicinalProduct`        | Partial source basis                      |
| `PharmaceuticalProduct`                                                                      | §3.2 `PharmaceuticalProduct`   | Partial source basis                      |
| `ProductPackage`                                                                             | §3.2 `ProductPackage`          | Partial structured basis                  |
| `DoseForm`                                                                                   | §3.2 `DoseForm`                | Partial source strings                    |
| `RouteOfAdministration`                                                                      | §3.2 `RouteOfAdministration`   | Weak/proposed                             |
| `TherapeuticClass`                                                                           | §3.2 `TherapeuticClass`        | Partial ATC/class basis                   |
| `Organization`                                                                               | §3.2 `Organization`            | Partial holder basis                      |
| `RegulatoryAuthorization`                                                                    | §3.2 `RegulatoryAuthorization` | Partial register basis                    |
| `Term`                                                                                       | §3.2 `Term`; §7.3              | Partial FR/EN; AR proposed                |
| `ClinicalConcept`                                                                            | §3.2 `ClinicalConcept`         | Textual only                              |
| `PopulationGroup`                                                                            | §3.2 `PopulationGroup`         | Textual only                              |
| `IngredientComposition`                                                                      | §3.3 `IngredientComposition`   | Partial structured/textual                |
| `ClinicalUseAssertion`                                                                       | §3.3; §6                       | Proposed                                  |
| `DosageGuideline`                                                                            | §3.3 §6.3                      | Proposed                                  |
| `ProjectionRun`                                                                              | §3.4                           | Derived/proposed                          |
| `ProjectedEntity`                                                                            | §3.4                           | Derived/proposed                          |
| `ProjectedRelationship`                                                                      | §3.4; §10                      | Derived/proposed                          |
| `ProjectedTextUnit`                                                                          | §3.4                           | Derived/proposed                          |
| `Community`                                                                                  | §3.4                           | Derived/proposed                          |
| `CommunityReport`                                                                            | §3.4                           | Derived/proposed                          |
| `EmbeddingRecord`                                                                            | §3.4                           | Derived/proposed                          |
| `PUBLISHED_BY`                                                                               | §4                             | Existing metadata/proposed edge           |
| `HAS_SECTION`                                                                                | §4                             | Existing manifest/proposed edge           |
| `TEXT_UNIT_COVERS_SECTION`                                                                   | §4                             | Coarse existing; exact proposed           |
| `HAS_EVIDENCE_SPAN`                                                                          | §4, §7.1                       | Proposed                                  |
| `MENTION_IN`                                                                                 | §4                             | Proposed                                  |
| `PROCESSED_TEXT_UNIT`                                                                        | §4                             | Proposed                                  |
| `PRODUCED_MENTION` / `PRODUCED_CANDIDATE`                                                    | §4                             | Proposed                                  |
| `CANDIDATE_SUPPORTED_BY`                                                                     | §4                             | Proposed                                  |
| `PROMOTED_TO`                                                                                | §4                             | Proposed                                  |
| `RESOLVES_TO`                                                                                | §4                             | Proposed                                  |
| `DUPLICATE_OF`                                                                               | §4                             | Existing manifest/proposed edge           |
| `SUPERSEDES`                                                                                 | §4                             | Proposed; dates partially existing        |
| `HAS_PHARMACEUTICAL_PRODUCT`                                                                 | §4                             | Proposed                                  |
| `HAS_PACKAGE`                                                                                | §4                             | Proposed                                  |
| `HAS_COMPOSITION` / `CONTAINS_SUBSTANCE`                                                     | §4                             | Proposed                                  |
| `HAS_DOSE_FORM` / `HAS_ROUTE`                                                                | §4                             | Proposed                                  |
| `CLASSIFIED_AS`                                                                              | §4                             | Proposed; ATC partial                     |
| `AUTHORIZES` / `ISSUED_BY` / `AUTHORIZATION_HOLDER`                                          | §4                             | Proposed; register partial                |
| `MANUFACTURER_OF`                                                                            | §4                             | Proposed                                  |
| `HAS_TERM`                                                                                   | §4                             | Proposed                                  |
| `ASSERTION_PARTICIPANT` / `DOSAGE_CONTEXT`                                                   | §4, §6                         | Proposed                                  |
| `PROJECTED_FROM` / `HAS_COMMUNITY_MEMBER` / `HAS_CHILD_COMMUNITY` / `SUMMARIZES` / `INDEXES` | §4, §10                        | Derived/proposed                          |

The three diagrams in [GRAPH_ONTOLOGY.md](./GRAPH_ONTOLOGY.md) use the same
names. Their arrows show direction of the relationship name; the catalogs
remain authoritative.

## 13. Open schema decisions

1. Are `DocumentSection` offsets relative to the cleaned body or the whole
   Markdown file? The current manifest has offsets, but the exact surface must be
   verified before evidence spans are implemented.
2. Should `EvidenceSpan` use Unicode code-point offsets or UTF-16 code units?
   The choice must be fixed before extraction and validated across French and
   Arabic text.
3. Which population criteria become structured fields, and which remain source
   wording?
4. How should n-ary interactions and dosage guidelines be represented in the
   eventual GraphRAG engine if its native schema is binary?
5. Which source authority policy is authoritative?
6. Which external identifiers are licensed/available for FR and DZ products?
7. Should external product equivalence links exist? If so, what reviewed
   evidence and approval are required?
8. Which review roles can sign off which assertion kinds?
9. How are superseded-evidence assertions blocked from serving before review?
10. Which authorization/ACL model applies to any restricted corpus future
    additions?

## 14. Explicit non-changes

This document does not:

- change the PostgreSQL schema or migration state;
- add a graph database or dependency;
- change chunk IDs, chunk metadata, embedding input, or retrieval behavior;
- ingest, extract, resolve entities, build communities, or run GraphRAG;
- modify benchmark questions, gold annotations, retrieval traces, or baselines;
- assert medical validity, regulatory compliance, or clinical safety.
