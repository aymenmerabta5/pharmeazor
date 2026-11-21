# PHARMEAZOR — clean corpus

This folder turns the raw PHARMEAZOR collection into a normalized corpus that is
ready to insert into PostgreSQL and later chunk + embed with **BGE-M3**.

It is an **offline** tool. It runs on a maintainer's machine, reads the raw
collection, and writes clean Markdown plus an import manifest. It is not part of
the application runtime. It is a workspace member with no runtime role and no
JavaScript dependencies.

The raw collection is never modified. The pipeline reads the raw collection
root, writes everything under `tooling/cleaning-lab/output/`, and keeps a
complete trail from every output back to the source file, SHA-256, source rank
and collection date.

The two labs are linked by path: the retrieval lab
(`tooling/retrieval-lab`) collects into `tooling/retrieval-lab/data/`, and this
cleaning lab reads that exact tree. No copy, move or rewrite happens between
them. Run the collection stage first, then run this pipeline.

The raw root is resolved in this order:

1. `--data-root "<path>"` on the command line
2. the `PHARMEAZOR_DATA_ROOT` environment variable
3. `data_root` in `config.yaml` (default: `../retrieval-lab`), resolved
   relative to that file

`output/` is generated and is ignored by Git by default. It is fully
reproducible with `python run.py`; remove that line from `.gitignore` only if
you deliberately want to commit the 44 MB deliverable.

---

## 1. What the raw collection actually contains

| Item                                                                             | Measured                                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Rows in `documents.csv`                                                          | 800                                                                  |
| Collected rows                                                                   | 555                                                                  |
| Verified collected rows                                                          | 552                                                                  |
| Rejected rows (kept out)                                                         | 3                                                                    |
| `no_results` / `MANUAL` rows                                                     | 245                                                                  |
| Unique raw files after grouping shared files                                     | 419                                                                  |
| Raw file groups cleaned                                                          | 415                                                                  |
| Raw file groups skipped (1 scanned PDF)                                          | 1                                                                    |
| Raw file groups exported as structured reference (nomenclature + BDPM registers) | 3                                                                    |
| Clean Markdown documents                                                         | **558**                                                              |
| Near-duplicates removed (tracked, not deleted from raw)                          | **63**                                                               |
| Structured reference artifacts                                                   | **3**                                                                |
| Total clean text                                                                 | **19.6 M characters**, 21,608 headings, median 30,448 chars/document |

By source and language:

| Source                                           | Clean docs | Rank |
| ------------------------------------------------ | ---------: | ---: |
| `BDPM_FR` (ANSM/BDPM RCP + patient notice)       |        310 |    3 |
| `DAILYMED` (US labels)                           |        168 |    3 |
| `SANTE_MSP` (derived official nomenclature docs) |         40 |    2 |
| `ANPP_RCP` (Algerian SmPC PDFs)                  |         40 |    1 |

`390` documents are French, `168` are English. No Arabic document was present in
this snapshot.

The source formats are genuinely different, not variations of one template:

- **ANPP RCP PDFs** — numbered French SmPC headings (`4.1- Indications…`), often
  split across lines, repeated page headers, product name only on the cover.
- **BDPM HTML** — a product page containing the **RCP** and the **Notice
  patient** in separate tab panels. Prices, SMR/ASMR, reimbursement and stock
  blocks are present but are not clinical content.
- **DailyMed PDFs** — either modern PLR labels (`1 INDICATIONS AND USAGE`,
  highlights + full PI + a packaging tail) or OTC drug-facts labels
  (`Active ingredients`, `Uses`, `Warnings`, `Directions`, `Do not use`).
- **Official nomenclature XLSX** — three sheets: registered, non-renewed,
  withdrawn. It is a product register, not prose.
- **BDPM register TXT dumps** — tab-separated reference files. The CIS_COMPO
  dump in this collection has **eight** columns, not the five-column public
  layout, so it needed a dedicated mapping.

The ancient-looking `?` characters in some French register files were **not**
data loss: the files are Windows-1252. The cleaner decodes them to UTF-8
correctly. The four `MED028` rows whose `source_id` was `DOC007`…`DOC010` were
repaired from `MED028__SRC_BDPM_FR__DOC007`; the raw CSV was left untouched.

---

## 2. Why Markdown (and not plain text or JSON)

**Markdown is the right target for this corpus.** The source documents already
have a real heading hierarchy; the cleaning job is to preserve it, not flatten
it.

- A plain `.txt` file throws away heading boundaries. The later splitter would
  have to guess where “4.2 Posologie” ends and “4.3 Contre-indications” begins.
- A pure JSON file makes the text hard to review and diff. YAML front matter +
  Markdown gives both machine-readable metadata and a human-readable body.
- `MarkdownHeaderTextSplitter` can split on `##`/`###`/`####` first, then
  `RecursiveCharacterTextSplitter` handles oversized sections. The resulting
  chunks keep a section code (`indications`, `dosage`, …) instead of being blind
  900-token windows.
- Markdown renders correctly on GitHub and in the OpenCode review pane, so the
  data can be spot-checked by a pharmacist without a special tool.

Each file looks like this:

```markdown
---
artifact_id: MED031__SRC_BDPM_FR__DOC002__rcp
source_id: BDPM_FR
authority_level: 3
medicine_ids: [MED031]
language: fr
publication_date: "2026-11-12"
collected_at: "2026-11-12T23:25:27"
strengths: [20MG]
...
---

# ENALAPRIL ACCORD 20 mg, comprimé

> Source: Base de données publique des médicaments (France) (autorité 3/4) · collecté le 2026-11-12 · publié le 2026-11-12 · langue: fr

## 1 DENOMINATION DU MEDICAMENT

...

### 4.1 Indications thérapeutiques

...
```

The YAML front matter is **not embedded**. `chunking.py` strips it before
splitting; metadata is passed as chunk metadata / database columns instead.

### Where LangChain is used

LangChain is used where it adds value: `langchain_core.documents.Document`,
`MarkdownHeaderTextSplitter`, `RecursiveCharacterTextSplitter` and
tokenizer-aware splitting. Format-aware extraction stays in PyMuPDF and
BeautifulSoup because the generic LangChain loaders flatten BDPM’s separate RCP
and notice panels and lose the `AmmAnnexeTitre*` heading classes that carry the
SmPC hierarchy. The pipeline therefore uses LangChain for the document/splitter
layer and purpose-built extractors for the source layer.

```text
documents.csv
   → group shared files + verify SHA-256
   → PDF / BDPM-HTML / XLSX / register-TXT extractor
   → Block[] (heading, paragraph, bullet, table)
   → section taxonomy + Markdown renderer
   → strength-aware dedupe
   → output/documents/<medicine>/*.md + manifest.jsonl
   → LangChain splitter preview + validation
```

---

## 3. Section taxonomy

Every heading is mapped to a stable code so retrieval can filter by section
regardless of language, publisher or heading wording:

| Code                                                                            | Typical headings                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `indications`                                                                   | Indications thérapeutiques, Indications and Usage, Uses                   |
| `dosage`                                                                        | Posologie et mode d’administration, Dosage and Administration, Directions |
| `contraindications`                                                             | Contre-indications, Contraindications, Do not use, Ne prenez jamais       |
| `interactions`                                                                  | Interactions médicamenteuses, Drug Interactions, Autres médicaments       |
| `warnings`                                                                      | Mises en garde, Warnings, Precautions, Ask a doctor…                      |
| `pregnancy`                                                                     | Fertilité/grossesse/allaitement, Pregnancy, Nursing Mothers               |
| `adverse_effects`                                                               | Effets indésirables, Adverse Reactions                                    |
| `overdose`                                                                      | Surdosage, Overdosage                                                     |
| `pharmacodynamics` / `pharmacokinetics`                                         | Propriétés pharmacodynamiques / pharmacocinétiques                        |
| `denomination`, `composition`, `excipients`, `storage`, `package`, …            | product/administrative sections                                           |
| `nomenclature_registered`, `nomenclature_non_renewed`, `nomenclature_withdrawn` | derived official-register docs                                            |

The four sections required by the project brief are `indications`, `dosage`,
`contraindications`, `interactions`. Their presence is recorded per document
(`key_sections_present` / `key_sections_missing`) and per medicine
(`reports/coverage.csv`).

---

## 4. Source authority and precedence

The rank comes from the project brief and is enforced by the collection lab's
source registry (`data/metadata/sources.csv`). The cleaning lab reads that
registry instead of keeping a second copy, so a source added or re-ranked in
the collection lab is picked up automatically. `config.yaml` only relabels the
cleaning-specific `tier`; identity, authority and jurisdiction are never
overridden there.

| Rank | Tier                             | Sources                        |
| ---: | -------------------------------- | ------------------------------ |
|    1 | `official_algerian_smpc`         | `ANPP_RCP`, `ANPP_SITE`        |
|    2 | `official_algerian_nomenclature` | `SANTE_MSP`                    |
|    3 | `foreign_institutional`          | `BDPM_FR`, `DAILYMED`, `EMA`   |
|    4 | `algerian_professional`          | `PHARMNET`, `PHARMNET_CATALOG` |

Every document carries `authority_level`, `authority_tier`, `source_name` and
`jurisdiction`. When two sources disagree later, the lower rank wins, and the
losing passage is still retained with its rank so the disagreement can be
explained. `BDPM_FR` and `DAILYMED` are both rank 3 but are kept separate because
they are different jurisdictions.

---

## 5. What cleaning does

### PDFs (ANPP + DailyMed)

- Removes repeated running headers/footers and page numbers, but **preserves the
  first page** so the ANPP product name/strength/form is not erased.
- Drops PDF table-of-contents dot leaders, cover banners, `Reference ID` lines.
- Removes the DailyMed highlights summary and the full-PI contents block, keeping
  one copy of the full PI.
- Cuts the DailyMed packaging tail (`Package Description`, `Principal Display
  Panel`, repeated `Product Information` blocks) on **full prescribing
  information** documents only. OTC drug-facts labels keep their whole panel:
  the extraction order of an OTC PDF is not stable, and cutting at a display
  panel removed one label's `Directions` block.
- Rejoins PDF hyphenation and hard-wrapped lines into paragraphs.
- Repairs BDPM drop caps (`C hez` → `Chez`, `I nsuffisance` → `Insuffisance`)
  without treating a leading `I`/`C` as a Roman section number.
- Rejects false headings from body references (`WARNINGS).`, `PRECAUTIONS),`,
  percentages like `22.8 % of patients…`).

### BDPM HTML

- Extracts the **RCP** and the **Notice patient** as two separate artifacts.
- Converts the RCP/notice headings from `AmmAnnexeTitre*`/`AmmNoticeTitre*`
  classes into Markdown heading levels.
- Promotes leaflet subsection headings that BDPM stores as bold or plain
  paragraphs (`Ne prenez jamais`, `Avertissements et précautions`,
  `Autres médicaments`, `Grossesse et allaitement`, `Conduite de véhicules`).
- Excludes prices, SMR/ASMR, reimbursement, stock and presentation-marketing
  blocks. The project brief explicitly excludes prices and stock information.

### Official nomenclature XLSX

- Parses all three sheets (registered / non-renewed / withdrawn).
- Normalizes dates, column names, whitespace and product identity.
- Keeps **all 9,595 products** in the reference table; `in_scope` marks the
  **2,101** products matching one of the 40 medicines. `is_combination` marks the
  **547** combination products so a monotherapy doc cannot be mistaken for a
  fixed-dose combination.
- Produces one derived Markdown document per medicine with complete product
  bullets (brand, DCI, form, dosage, pack, schedule, holder, country, dates,
  type, status, withdrawal reason).

### BDPM register TXT

- Decodes Windows-1252 to UTF-8.
- Parses the register type from the document title, not the file name.
- Exports only rows matching the 40 target medicines:
  - `bdpm_cis.csv` — 1,399 product rows (name, form, route, status, holder, …)
  - `bdpm_composition.csv` — 3,614 composition rows (designation, dosage, …)
- Composition rows inherit medicine identity from their parent CIS code.
- These are **structured reference tables**, not embedded prose.

### Deduplication

- Exact duplicates are collapsed by SHA-256.
- Near-duplicates use 5-word shingles + Jaccard similarity, only inside the same
  source / document type / language / medicine set / **strength set**.
- Strength is part of the key: different strengths of the same product are never
  merged, because posology is strength-specific. Because the metadata strength
  list can be empty when the collector's title carries no dosage, the strengths
  each document declares in its own title and composition section are compared
  before any collapse: a declared-strength mismatch vetoes the merge however
  high the template similarity is (ANPP SmPCs of two strengths score 0.98+).
- Official Algerian docs only collapse at ≥ 0.985; foreign labels at ≥ 0.93.
- 63 documents were marked duplicate and are listed in `reports/duplicates.csv`
  with `duplicate_of` and similarity. The raw files remain untouched.

---

## 6. Output layout

```text
tooling/cleaning-lab/
  config.yaml                 # data path, source tiers, splitter settings
  settings.py                 # typed, validated loader for config.yaml
  run.py                      # one-command entry point
  requirements.txt
  pipeline/
    extractors.py             # PDF/HTML -> blocks -> Markdown
    sections.py               # heading taxonomy + notice/OTC aliases
    structured.py             # XLSX + BDPM registers
    dedupe.py                 # strength-aware near-duplicate detection
    chunking.py               # LangChain splitter preview
    clean_corpus.py           # orchestration + reports
    validate.py               # traceability and quality gate
  output/
    documents/
      <medicine>/             # one directory per medicine, mirroring data/raw/
        *.md                  # 478 clean documents: SmPC, RCP, notice, label, nomenclature
      _shared/                # artifacts that belong to no single medicine
    manifest.jsonl            # one row per artifact; the import contract
    inventory.jsonl           # one row per raw file group and its fate
    excluded.jsonl            # 235 non-collected/rejected raw rows
    structured/
      nomenclature_products.csv|jsonl
      bdpm_cis.csv
      bdpm_composition.csv
    preview/
      chunks_sample.jsonl     # first 2 chunks per document
      chunk_stats.json        # splitter statistics for every document
    reports/
      cleaning_report.csv
      duplicates.csv
      coverage.csv
      coverage_gaps.csv
      skipped.csv
      discovery.csv           # every raw file on disk and its fate
      summary.json
      validation.json
```

### One directory per medicine

`output/documents/` mirrors the collector's `data/raw/` layout: every clean
document is written under the medicine it belongs to, so one medicine's SmPC,
RCP, patient notice, DailyMed label and nomenclature entry sit in a single
directory. The directory is chosen from the artifact's own `medicine_id`, not
from its source path — the Algerian nomenclature workbook is one file covering
all forty medicines, and keying on the source would bury all forty of its
artifacts in `_shared/`. Anything that genuinely spans several medicines lands
in `_shared/`, the same convention the collector already uses.

### The manifest is the database contract

`output/manifest.jsonl` has one JSON object per clean document, duplicate and
structured artifact. Stable fields include:

| Field                                                                               | Meaning                                                         |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `artifact_id`                                                                       | Stable ID, e.g. `MED031__SRC_BDPM_FR__DOC002__rcp`              |
| `document_id` / `part_id`                                                           | Original collection doc + `rcp`/`notice`/`label`/`nomenclature` |
| `source_id`, `source_name`, `authority_level`, `authority_tier`, `jurisdiction`     | provenance + rank                                               |
| `medicine_ids`, `medicine_names`, `inn`, `brand_name`, `strength_form`, `strengths` | identity + dose                                                 |
| `title`, `language`, `document_type`, `country`, `holder`                           | descriptive metadata                                            |
| `publication_date`, `publication_date_raw`, `collected_at`, `revision_date`         | dates                                                           |
| `sha256_raw`, `sha256_actual`, `content_sha256`                                     | file and cleaned-text integrity                                 |
| `original_files`, `source_document_ids`, `source_urls`                              | exact raw trail                                                 |
| `sections`, `key_sections_present`, `key_sections_missing`, `section_count`         | section map with character offsets                              |
| `char_count`, `word_count`, `status`, `duplicate_of`, `similarity`, `warnings`      | quality state                                                   |
| `output_path`                                                                       | Markdown file relative to `output/`                             |

For database insertion, use `content_sha256` to decide re-embedding, and
`artifact_id` as the stable document key. `medicine_ids` is an array because a
combination-product document can legitimately map to several medicines.

---

## 7. Running it

From `tooling/cleaning-lab/` (after the retrieval lab has produced
`tooling/retrieval-lab/data/`):

```powershell
# one-time
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# full clean + splitter preview + validation
python run.py

# no chunk preview (faster)
python run.py --no-chunks

# one medicine only, for debugging
python run.py --only-med MED031 --no-chunks
```

The `data_root` is resolved from `--data-root`, then `PHARMEAZOR_DATA_ROOT`,
then `config.yaml`. `output_root` defaults to `./output` and can be overridden
with `--output-root`.

`settings.py` validates the configuration and the collection registry before a
single file is read. A missing `sources.csv`, an unknown authority level, an
invalid regex or a chunk overlap larger than the chunk size fails immediately
with the path and the expected value, rather than surfacing halfway through a
run. The pipeline receives one typed `Settings` object; it never reads YAML
directly.

The validator is run automatically after every clean. It checks:

- every YAML front matter parses and contains the required fields;
- every `content_sha256` matches the rendered body;
- every collected + verified raw document is covered, explicitly excluded, or
  recorded with a skip/failure reason;
- no forbidden price/SMR boilerplate remains;
- every medicine has at least one clean document;
- the splitter produces at least one chunk per document and no chunk exceeds the
  900-token limit.

A successful run ends with `"ok": true` and `0` uncovered raw documents.

### Upload the result to Cloudflare R2

From the same folder, `r2_upload.py` uploads `output/` under the
`cleaning-lab/` prefix, verifies every object by hashing it, and restores the
remote tree under `downloads/`:

```powershell
.\.venv\Scripts\python.exe r2_upload.py --dry-run
.\.venv\Scripts\python.exe r2_upload.py --checksum --report upload.report.jsonl
.\.venv\Scripts\python.exe r2_upload.py verify --report verify.report.jsonl
.\.venv\Scripts\python.exe r2_upload.py download --skip-existing --report download.report.jsonl
```

See [R2_UPLOAD.md](R2_UPLOAD.md) for the defaults, the shared connection
settings, and the `bun run r2:*` scripts.

---

## 8. Chunking and BGE-M3

The preview uses LangChain:

```python
MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "h1"), ("##", "h2"), ...])
RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base",
    chunk_size=900,
    chunk_overlap=135,
)
```

Tiny heading-only fragments are merged into a neighbour before statistics are
computed. Final measured preview:

| Metric              |      Value |
| ------------------- | ---------: |
| Documents           |        558 |
| Chunks              | **15,226** |
| Median chunk        | 269 tokens |
| Max chunk           | 899 tokens |
| Chunks > 900 tokens |      **0** |
| Chunks < 40 tokens  |      **1** |

These numbers are a compatibility check, not the final retrieval chunk table.
When the real ingestion job is built:

1. Keep the Markdown heading split; do not replace it with a blind character
   splitter.
2. Re-measure with the **BGE-M3 tokenizer**, not `cl100k_base`; the two
   tokenizers do not count French medical text identically.
3. Add a 50–100 token context note to every chunk (document title, brand, INN,
   section, source, date) before embedding, as required by `AGENTS.md`.
4. Keep a stable chunk identity: `artifact_id` + section path + ordinal +
   raw-content hash. Do not renumber chunks when text earlier in the document
   changes.
5. Store the embedding model name/version on every chunk. Changing from BGE-M3
   invalidates all vectors; rebuild into a new table and swap.
6. Keep the source rank and collection date on every chunk so a retrieval answer
   can say which authority it used.
7. `chunks_sample.jsonl` is a review aid; do not import it as the final chunk
   table.

BGE-M3 is a good fit because the corpus is French + English and the product may
later add Arabic. Keep the model multilingual; do not switch to a monolingual
French or English embedder.

---

## 9. Coverage gaps and caveats (measured, not assumed)

All 40 medicines have at least one clean document. All 40 have at least one
Algerian official source (the Ministry nomenclature, rank 2) and at least one
clinical document covering each of the four key sections across the medicine's
documents.

- **25 medicines have no ANPP SmPC in this snapshot.** They still have three
  sources: the official nomenclature, BDPM and DailyMed. The gap is reported in
  `reports/coverage_gaps.csv`; it is a collection gap, not a cleaning gap.
- **Only `MED012` (néfopam) has fewer than three sources** in the cleaned
  corpus: `BDPM_FR` + `SANTE_MSP`. This matches the collection guide's note that
  néfopam has no US label and no ANPP RCP. (`MED028` nifédipine has three sources
  here: BDPM, DailyMed, SANTE.)
- **1 raw file was deliberately skipped** (`reports/skipped.csv`): a scanned
  DailyMed PDF with <200 extractable characters/page → OCR needed. Four very
  short DailyMed OTC labels with no structured clinical headings are kept in the
  corpus with `key_sections_missing` populated rather than discarded.
- **2 rejected rows** from `documents.csv` are excluded (`rejected` in
  `excluded.jsonl`), and **246 no_results/MANUAL rows** are excluded with their
  status. No raw document was deleted or rewritten.
- **Nomenclature documents are reference lists, not clinical prose.** They are
  excluded from clinical section coverage, but counted as a source for
  medication identity/equivalence.
- **BDPM register dumps are reference tables, not documents.** They are filtered
  to the 40 medicines and kept in `structured/`, not embedded as text.
- **Publication dates are not present for every source.** `collected_at` is
  always present. `publication_date` is ISO-normalized when the publisher
  supplied one; the raw value is kept in `publication_date_raw`. ANPP PDFs often
  only carry a text-revision date, which is stored as `revision_date`.
- **Strength extraction is best-effort.** `strength_form` is the collector's
  field; `strengths` is extracted from the title/metadata. When a source omits
  the strength, the list is empty rather than guessed.
- **No Arabic documents were in this snapshot.** The section taxonomy and text
  normalization are Unicode-safe, but Arabic headings would need additional
  aliases before claiming AR coverage.

---

## 10. Recommended next step

Move the **manifest + Markdown body** into the database in one transaction per
artifact, then build a separate chunk table. The clean corpus is deliberately
not chunked into the final table yet: chunk sizes, contextualization and BGE-M3
embedding belong to the retrieval pipeline and must be measured against the
golden set. `output/preview/` proves the documents split cleanly; it is not the
retrieval index.
