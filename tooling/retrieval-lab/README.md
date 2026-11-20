# PHARMEAZOR — collection stage

Medication knowledge base for pharmacists (Project 2, PHARMEAZOR).

This repository implements the **data collection stage** of Project 2: a
source-aware, compliant collector that finds documents for a list of medicines,
validates them, and stores them with full provenance so the downstream RAG
pipeline (extraction → normalisation → retrieval → cited answers →
verification) can be built on top.

The list of medicines comes from the professor. The source files are **not
committed**: place them under `data/input/` (ignored by git) and import them
once. After that, `data/metadata/medicines.csv` is the runtime source of truth.

| file                                           | content                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `data/input/targetMeds.csv`                    | the 10 antihypertensives (rows 31–40 of the list)                   |
| `data/input/Projet2_Liste_40_medicaments.xlsx` | the full list of 40 medicines + the "mode d'emploi"                 |
| `data/input/nomenclature_algerienne.xlsx`      | the **official national nomenclature**, downloaded by hand (see §5) |

---

## 1. Install

```bash
python -m venv .venv                     # or: uv venv
.venv\Scripts\python -m uv pip install -r requirements.txt
.venv\Scripts\python -m playwright install chromium   # only if you use Playwright sources
```

Python 3.12 is expected.

### Configuration

`config.yaml` is the single source of runtime configuration: paths, HTTP
politeness and retry policy, the source registry, compliance decisions,
discovery routing and collection caps. `config.py` is a typed loader: it
validates the YAML, resolves every path against this folder and exposes stable
names (`RAW_DIR`, `SEED_SOURCES`, ...) to the rest of the package.

A typo, a missing key, an unknown authority level or a discovery entrypoint for
a source that does not exist fails at import time with the offending key.
Paths are resolved relative to `config.yaml`, so the committed defaults work on
every machine. Set `PHARMEAZOR_COLLECTION_CONFIG` to load a different file.

## 2. First run

```bash
python main.py init                      # data/ tree + empty tables + source registry
python main.py import-meds --xlsx "data/input/Projet2_Liste_40_medicaments.xlsx"
python main.py import-nomenclature        # the official register downloaded by hand
python main.py source-audit              # fetch robots.txt evidence for every source
python main.py approve --source DAILYMED --decision permitted --reviewer "your name"
python main.py resolve-names             # DCI -> brand names
python main.py collect-all
python main.py extract                   # clinical sections (BeautifulSoup / pymupdf)
python main.py report
python main.py verify                    # corpus integrity
```

`approve` records the **human** terms-of-use review of a source. Nothing is
automated until a source is approved: the gate returns `REVIEW_REQUIRED` for
every unapproved source, and every decision is written to
`data/metadata/compliance_checks.csv`.

## 3. Commands

| command                                                                                           | what it does                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                                                                                            | creates `data/` and seeds the source registry                                                                                                                                                                                            |
| `import-meds --csv/--xlsx ...`                                                                    | loads the professor's list into `data/input/medicines.csv` (merges by default, `--replace` to overwrite)                                                                                                                                 |
| `sources`                                                                                         | shows the registry with authority, mode and review state                                                                                                                                                                                 |
| `source-audit`                                                                                    | fetches `robots.txt` and stores the rules as review evidence                                                                                                                                                                             |
| `approve --source X --decision permitted\|manual\|excluded --reviewer NAME`                       | records the human review                                                                                                                                                                                                                 |
| `check --source X --url U`                                                                        | runs the compliance gate for one URL (no download)                                                                                                                                                                                       |
| `recon --source X --url U`                                                                        | Playwright reconnaissance (refused unless the gate allows it)                                                                                                                                                                            |
| `resolve-names`                                                                                   | builds the DCI → brand name map (`data/metadata/name_map.csv`)                                                                                                                                                                           |
| `import-nomenclature --file data/input/nomenclature_algerienne.xlsx`                              | reads the **official** nomenclature downloaded by hand: writes the product table, fills column E and records the Algerian commercial names                                                                                               |
| `names [--med MED031] [--algerian]`                                                               | shows the name map                                                                                                                                                                                                                       |
| `discover --med MED031 [--source X]`                                                              | shows the candidate documents a source would yield                                                                                                                                                                                       |
| `collect --med MED031 [--source X] [--refresh]`                                                   | collects one medicine                                                                                                                                                                                                                    |
| `collect-all [--limit N] [--per-source N] [--refresh]`                                            | collects every medicine of the list                                                                                                                                                                                                      |
| `revalidate`                                                                                      | re-checks the identity of stored files without new requests                                                                                                                                                                              |
| `audit [--last N] [--errors]`                                                                     | the structured attempt trail (`data/logs/attempts.jsonl`)                                                                                                                                                                                |
| `extract-brands`                                                                                  | reads the commercial names out of the collected official RCPs                                                                                                                                                                            |
| `set-brand --med MED031 --brand "…" [--strength "25 mg"] [--nomenclature oui\|non\|"a verifier"]` | records what the manual Algerian nomenclature says about a medicine                                                                                                                                                                      |
| `manual-actions`                                                                                  | the list of steps that still need a human                                                                                                                                                                                                |
| `export-list`                                                                                     | fills the professor's list (sources found, brands, counts) — column E stays a manual verdict                                                                                                                                             |
| `report`                                                                                          | coverage, pending review and source health tables                                                                                                                                                                                        |
| `organize-files [--dry-run]`                                                                      | renames every corpus file to `<medicine>__<source>__docNNN[__label].ext`, moves shared registers to `data/raw/_shared/`, records the old → new mapping in `data/metadata/file_renames.csv` (idempotent, never overwrites, never deletes) |
| `verify`                                                                                          | corpus integrity: every file present, hashes matching, ids unique                                                                                                                                                                        |
| `reconcile`                                                                                       | re-syncs the corpus with the files on disk (restores valid quarantined files, backfills lost URLs, drops rows of deleted files)                                                                                                          |
| `extract`                                                                                         | extracts the clinical sections of every document (BeautifulSoup for HTML, pymupdf for PDF) → `sections.csv`; add `--structured` for the document-type-aware tables and `extract-eval` for the 20-notice evaluation                       |
| `notices`                                                                                         | looks for the **patient notice** of every medicine, matches it, links it and reports                                                                                                                                                     |
| `check-usage`                                                                                     | checks every collected document: human medicine, veterinary, register record or other                                                                                                                                                    |
| `status`                                                                                          | quick summary of the corpus                                                                                                                                                                                                              |

## 4. How the pipeline works

```
medicine list ──► compliance gate ──► source adapter (discovery)
                        │                     │
                        │                     ▼
                        │              candidate URLs
                        │                     │
                        ▼                     ▼
                  decision + audit row   second gate check per URL
                                              │
                                              ▼
                              download → integrity → identity check
                                              │
                                              ▼
                              data/raw/<medicine>/<medicine>__<source>__docNNN__<label>.pdf
                              data/metadata/documents.csv (provenance)
```

Compliance rules implemented (from the workflow document):

- **The gate comes first.** No request is made before `SourceRegistry.evaluate()`
  returns `AUTOMATED`; every decision is audited in `compliance_checks.csv`.
- **`robots.txt` is not permission.** A positive robots result never replaces
  the human terms review; a _missing_ robots file is treated as "not reviewed".
- **Manual-only targets.** The official Algerian nomenclature list page is
  never automated — the source is registered as `MANUAL` and the action is
  written to `data/reports/manual_actions.csv`.
- **Excluded domains.** Forums, blogs and social networks are refused
  (`EXCLUDED`), including lookalike domains, subdomains and hosts with
  credentials or ports.
- **Scope.** A target must live on the reviewed domain _and_ inside the
  reviewed path prefix (`allowed_scope`). When a source needs a new path
  (e.g. the BDPM product pages), the scope is extended deliberately and the
  change is recorded in the source notes — the gate refuses everything else.
- **Polite access.** Per-domain delay (plus `Crawl-delay` when published),
  timeouts, bounded retries on transient failures only, `401/403` never retried.
- **Official first, foreign as a complement.** Sources are collected in
  authority order; when a medicine already has an official Algerian document,
  the foreign sources stop at 2 documents each (5 while there is none).
  The coverage rule stays: 3 verified sources, one of them official.
- **Name resolution.** The DCI of every medicine is linked to its commercial
  names (`name_map.csv`), and those names are used to query the official
  portal, which is indexed by brand.
- **Idempotency.** A rerun re-uses existing records, never duplicates files
  and never leaves orphan `.part` files. Identical bytes coming from two URLs
  share one physical file but keep two provenance rows.
- **Validation before the corpus.** A PDF must really be a PDF (signature +
  content type), the identity (substances, salt forms, equivalent INNs,
  brand, strength) must be found in the text, and a foreign leaflet may not
  pass as Algerian-approved. Rejected files are moved to `data/quarantine/`.
- **Audit trail.** Every attempt (gate decision, discovery, download,
  validation, storage) writes one JSON record to `data/logs/attempts.jsonl`
  with timestamp, medicine, source, URL, method, status, file path, hash,
  size, check id and error. `python main.py audit --errors` reads it back.
  The gate decisions are additionally kept in `compliance_checks.csv` and the
  document provenance in `documents.csv`.

### Matching names across registers

The professor's list uses the French DCI; foreign registers use the English
INN. `src/utils/inn_synonyms.py` maps them (paracetamol → acetaminophen,
ibuprofène → ibuprofen, …), and `src/utils/text.py` adds the salt forms
(énalapril → enalapril maleate). A combination medicine
(_paracétamol + codéine_) is only accepted when **every** substance is
present, so a single-ingredient label can never pass as the combination.
This table is the seed of the name-normalisation component (brief, feature 3).

## 5. Sources

Authority levels follow the brief: **1** official Algerian, **2** official
nomenclature, **3** foreign institutional, **4** Algerian professional.

| id                 | source                                                   | level | mode                           | what it gives today                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------- | ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ANPP_RCP`         | rcp.anpp.dz (official SmPC portal)                       | 1     | automated                      | **the priority source** — official Algerian SmPCs (RCP) as PDF. The portal's DCI field is matched **case-sensitively** (`LOSARTAN` finds RCPs, `losartan` does not), so the upper-case form is queried first; the Algerian commercial names are queried as well, and every query is cached |
| `ANPP_SITE`        | anpp.dz product dossiers                                 | 1     | automated                      | only four product dossiers are published there (clamoxyl, ferolam, isotanak, arovan); works by brand name                                                                                                                                                                                  |
| `SANTE_MSP`        | sante.gov.dz nomenclature                                | 2     | manual download, then ingested | the **official national nomenclature** (downloaded by hand): 78 records proving the DCI is registered, with the Algerian brand, code, holder and dosage. The _list page itself_ is never automated                                                                                         |
| `BDPM_FR`          | Base de données publique des médicaments (France)        | 3     | automated                      | **ANSM product pages** (full SmPC + patient notice, server-rendered) and the official register extracts (products, holder, dosage)                                                                                                                                                         |
| `DAILYMED`         | DailyMed / NLM (US)                                      | 3     | automated                      | FDA approved labels (SPL) as PDF, several per DCI (queried under the English INN)                                                                                                                                                                                                          |
| `EMA`              | EMA EPAR product information                             | 3     | automated                      | works for centrally authorised medicines; these generics have no EPAR                                                                                                                                                                                                                      |
| `PHARMNET_CATALOG` | pharmnet-dz.com (catalogue of the Algerian nomenclature) | 4     | automated                      | **name source**: commercial name, DCI, nomenclature code, registration number, form, dosage, holder — no leaflets (name source only)                                                                                                                                                       |
| `PHARMNET`         | pharmnet.dz                                              | 4     | manual                         | was under maintenance during reconnaissance; superseded by `PHARMNET_CATALOG`                                                                                                                                                                                                              |

### Official first, foreign as a complement

- Sources are collected **in authority order** (1 → 2 → 3 → 4).
- Once a medicine has an official Algerian document, the foreign sources stop
  at **2 documents each** (they keep 5 while no official document exists) —
  the foreign sources are a complement, never the primary evidence.
- The coverage rule of the brief is unchanged: **at least 3 verified sources,
  at least one of them official**.

### From the DCI to the commercial names

The project starts from the 40 DCIs of the professor's list and links each one
to its commercial names (`python main.py resolve-names` →
`data/metadata/name_map.csv`):

| brand_type           | where the brand comes from                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `algerian_official`  | the **official national nomenclature** (downloaded by hand, parsed by `import-nomenclature`) and the ANPP RCPs already collected |
| `algerian_secondary` | the Pharm'Net catalogue of the Algerian nomenclature                                                                             |
| `manual`             | what the team records with `set-brand` from the official nomenclature                                                            |
| `foreign_official`   | the French open data (CIS_bdpm / CIS_COMPO_bdpm)                                                                                 |
| `foreign_us`         | the DailyMed label titles                                                                                                        |

Every row keeps the source of the evidence and the date it was collected, and
a brand that covers several DCIs is flagged `ambiguous=yes` (EXFORGE covers
amlodipine _and_ valsartan). Those names are then used to query the official
Algerian portal, which is indexed by brand.

### The official nomenclature

The workbook at `data/input/nomenclature_algerienne.xlsx` is the **NOMENCLATURE
NATIONALE DES PRODUITS PHARMACEUTIQUES** (Ministère de l'Industrie
Pharmaceutique), with three sheets: the products registered (August 2026), the
non-renewed and the withdrawn ones.

```bash
python main.py import-nomenclature
```

- `data/metadata/nomenclature_products.csv` — one row per registered product
  (brand, DCI, nomenclature code, registration number, form, dosage, list,
  holder, country, registration dates, status)
- column E of the medicine list — `oui` (registered), `non` (absent) or
  `a verifier` (it was registered before but is withdrawn / not renewed)
- the official brand names join the name map as `algerian_official`

The file is read with the standard library only (no openpyxl dependency):
`src/medicines/xlsx.py` (reader) and `src/medicines/nomenclature.py`
(matching, withdrawn/non-renewed detection).

### The ANPP RCP portal

`rcp.anpp.dz` is a Livewire application, so the _search_ needs a browser while
the _document_ is a plain public PDF that is downloaded with Requests — exactly
the split the workflow document prescribes ("browser-triggered download" vs.
"public direct PDF URL"). Two findings worth remembering:

- the search index is **case-sensitive** (`LOSARTAN` → results, `losartan` →
  none) and does not tolerate accents, so several spellings of each DCI are
  tried (as written, de-accented, upper case, capitalised, plus the
  equivalent INN);
- the portal only covers part of the list — 15 of the 40 medicines have a
  published RCP (48 documents). The rest is exactly where the Algerian
  nomenclature and the ANPP dossiers come in.

### Getting the Algerian official sources to work

The Algerian sources are brand-based, and the brand names come from the
nomenclature that may only be downloaded by hand:

1. Download the nomenclature manually (see `python main.py manual-actions`).
2. For every medicine, record the brand and whether the DCI exists:
   `python main.py set-brand --med MED031 --brand "…" --nomenclature "oui"`.
3. Re-run `python main.py resolve-names` (the new brand joins the map) and
   `python main.py collect --med MED031` — the ANPP adapter queries the portal
   with the brand names and downloads the matching RCP.

`python main.py extract-brands` goes the other way: it reads the commercial
names out of the official RCPs already collected (every RCP states
"Dénomination commerciale" and "Dénomination commune internationale"), writes
them to `data/metadata/brand_evidence.csv` and into the medicine list.

`python main.py resolve-names` merges every evidence source into
`data/metadata/name_map.csv` (2 300+ records for the 40 medicines), and
`python main.py report` writes `data/reports/brand_gap.csv` — the medicines
that still have no Algerian brand, i.e. the ones the manual step must cover.

### Closing the last gap (>= 3 sources for every medicine)

1. **The Algerian nomenclature (manual, required by the brief) — done.** It
   gives the Algerian brand names and the "present in the Algerian register"
   verdict for column E of the professor's list; the brands then feed the ANPP
   portal search. `python main.py import-nomenclature` does the parsing.
2. **The French SmPCs (automated) — done.** Instead of the slow open-data
   archive, the adapter uses the site's own live search and fetches the
   server-rendered product pages, which carry the full ANSM SmPC and the
   patient notice.

## 6. Data layout

This `data/` tree is the handoff to the cleaning lab. `tooling/cleaning-lab`
reads it in place — its `config.yaml` resolves `data_root` to
`../retrieval-lab`, so the raw files, `documents.csv` and `medicines.csv` are
consumed exactly as collected. Run the collection stage here first, then run
`python run.py` from `tooling/cleaning-lab`.

```
data/
  input/medicines.csv        the medicine list (ids follow the professor's numbering)
  raw/<medicine-slug>/       original files, e.g. paracetamol/paracetamol__dailymed__doc002__ac-fast.pdf
  raw/<medicine-slug>/notices/   the extracted patient notices (text)
  raw/_shared/               registers and product documents used by several medicines
  quarantine/                files rejected by validation (same medicine-first naming)
  metadata/                  provenance and entity tables (the source of truth)
    sources.csv              source registry + review state
    documents.csv            one row per source-document record (provenance)
    notices.csv              one row per patient notice, with its local path
    name_map.csv             DCI -> commercial names (with source and date)
    brand_evidence.csv       the commercial names stated in the official RCPs
    nomenclature_products.csv  the official Algerian nomenclature, per product
    compliance_checks.csv    every gate decision, with reason
    notice_attempts.csv      every Algerian notice page checked, and what it publishes
    sections.csv             the extracted clinical sections, one row per passage
    file_renames.csv         old -> new path of every physical file move (audit trail)
  reports/                   regenerable reports (not provenance)
    coverage_report.csv      per-medicine source coverage and brand info
    pending_review.csv       everything waiting for a human
    needs_attention.csv      collected but not identity-proven
    source_health.csv        per-source status
    brand_gap.csv            medicines that still wait for an Algerian brand
    manual_actions.csv       the steps that still need a human
    professors_list.csv      the professor's spreadsheet filled with our findings
    notice_report.csv        patient-notice coverage per medicine
    usage_report.csv         human/veterinary/register verdict per document
    section_coverage.csv     which sections each medicine has
  logs/collection.log       human-readable audit trail
  logs/attempts.jsonl       structured audit trail (one JSON record per attempt)
  .cache/                   robots.txt cache, source indexes, temp downloads
```

### File naming

Every downloaded file starts with the medicine name, so a folder can be read
without a lookup table:

```
data/raw/paracetamol/paracetamol__dailymed__doc002__ac-fast.pdf
data/raw/ketoprofene-codeine/ketoprofene-codeine__anpp-rcp__doc002__biopharm.pdf
data/raw/_shared/bdpm-fr__cis-bdpm-txt.txt
data/raw/_shared/sante-msp__nomenclature-nationale-des-produits-pharmaceutiques.xlsx
data/raw/paracetamol/notices/paracetamol__bdpm-fr__doc002__notice.txt
```

- the first segment is the **medicine name** (ASCII-folded lowercase slug);
- the source follows, then `docNNN`, which is the same number as the
  `document_id` in `documents.csv` (`MED001__SRC_DAILYMED__DOC002` → `doc002`);
- the optional last segment is the brand, product title or holder — never a
  number;
- a physical file used by several medicines lives once in `_shared/`: registers
  are named after the source and the register, product documents carry the
  `owner1+owner2` prefix;
- the provenance tables keep the machine ids (`MEDxxx`, `SRC_*`, `DOCnnn`);
  `data/metadata/file_renames.csv` records every old → new move with its
  SHA-256 and the affected document ids.

`python main.py organize-files --dry-run` prints the plan;
`python main.py organize-files` applies it. It is idempotent, never overwrites
an existing file and never deletes one.

### The quarantine folder

`data/quarantine/` holds the documents that validation refused. Nothing is
deleted silently: the file stays, the row keeps the reason, and
`python main.py reconcile` re-checks the folder against the current rules and
puts back anything that is actually valid (this is how the four nifédipine
product pages came back after the integrity rule was corrected).

## 7. Current status of the 40 medicines

```bash
python main.py report
```

The corpus holds **552 verified documents** for the 40 medicines of the
professor's list, stored as 422 physical files (identical bytes shared by
hash, one provenance row per medicine and per source).

| source                                       | authority | verified documents | role                                               |
| -------------------------------------------- | --------- | ------------------ | -------------------------------------------------- |
| SANTE_MSP — official Algerian nomenclature   | 2         | 78                 | the official register (downloaded by hand, parsed) |
| ANPP RCP — official Algerian SmPC            | 1         | 48                 | the priority clinical source                       |
| BDPM_FR — ANSM product pages (SmPC + notice) | 3         | 210                | French institutional reference                     |
| DailyMed — US FDA labels                     | 3         | 216                | US institutional reference                         |

**38 of the 40 medicines** meet the brief's rule (three verified sources, one
of them official). The two that do not are real-world facts, not gaps in the
collector:

- **nifédipine (MED028)** — the Algerian register lists it only as withdrawn
  or non-renewed (29 historical products, none currently registered), so there
  is no current official Algerian document to collect. Column E says
  `a verifier`.
- **néfopam (MED012)** — registered in Algeria (official evidence present)
  and in France, but DailyMed has no US label for it and the ANPP portal has
  no RCP: a third source would have to come from ANSM or EMA directly.

**Section extraction** (`python main.py extract`) yields **6 678 sections** from
394 documents — 3 564 parsed with BeautifulSoup (the ANSM pages) and 3 114 with
pymupdf (the RCPs and the US labels) — and **all 40 medicines** have the four
sections the brief requires (indications, posology, contre-indications,
interactions).

The ANPP RCP portal was queried **462 times** (DCI spellings + every official
Algerian brand name) and answered for 58 of them, which is why the official
clinical coverage stops at 15 medicines.

Reruns are safe: re-running the collection leaves the corpus untouched — the
portal queries are cached, so a rerun costs no new requests. `python main.py
verify` checks the corpus invariants (every file present, every hash matching,
no duplicated id) and exits with code 1 if something is inconsistent.

Per-medicine numbers, the source matrix and the review queues are written to
`data/reports/` on every `report` run:

| file                                                         | content                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `coverage_report.csv`                                        | per medicine: verified documents, verified sources, official sources, `coverage_ok` |
| `pending_review.csv`                                         | everything not collected yet (manual, excluded, failed, no results)                 |
| `needs_attention.csv`                                        | collected but not identity-proven (scanned PDF, missing substance, wrong product)   |
| `source_health.csv`                                          | per source: authority, mode, review state, robots rules, document counts            |
| `manual_actions.csv`                                         | the manual steps a human still has to do                                            |
| `sections.csv` (metadata) / `section_coverage.csv` (reports) | the extracted passages and their coverage per medicine                              |

## 8. Tests

```bash
.venv\Scripts\python -m pytest tests -q
```

The suite (128 tests) covers the compliance gate (domain matching, excluded
domains, manual-only targets, scope), text normalisation and identity
validation, the human-use classifier (including the veterinary boilerplate
trap) and the idempotent quarantine, file integrity, the store (idempotency,
hash reuse), the medicine loader, the nomenclature parser and the section
extractor.

## 9. Known limitations

- The ANPP RCP portal publishes RCPs for 15 of the 40 medicines only. It was
  queried 462 times (DCI spellings + every official Algerian brand name) and
  answered for 58 of them, so the gap is in the portal, not in the search.
  For the other 25 the official evidence is the nomenclature itself, which the
  corpus now carries.
- The ANPP website (`anpp.dz`) publishes only four product dossiers, so it
  adds nothing for this list.
- The French BDPM product API (`/api/produit/by-medicament`) returns HTTP 500;
  the adapter uses the site's own **live search** instead
  (`/api/options_autocompilation`, the call the public search box makes) and
  then fetches the product page `/medicament/<id>/extrait`, which is
  server-rendered and contains the **ANSM SmPC and the patient notice**.
  The static register extracts published by the site are a 2022 snapshot and
  miss recent products, so they are kept only as a register extract, not as
  the product list.
- EMA has no EPAR product information for these generic antihypertensives.
- The Pharm'Net catalogue hosts **no leaflets** (`notice_url` is empty) and
  states that its interaction data is a demonstration set — it is used as a
  name source only, and that content is excluded from the corpus. The official
  nomenclature takes precedence over it for the names.
- `pharmnet.dz` (the former domain) is under maintenance.
- Administrative documents (ANPP notes, decisions, forms) are filtered out of
  the medicine discovery; scanned PDFs are collected but reported as
  `not_checked` (no text layer) instead of being counted as verified.
- **No patient notice is published online for the Algerian products.** The
  official portal (rcp.anpp.dz) publishes RCPs only, the Pharm'Net catalogue
  has an empty `notice_url`, and the manufacturers (BEKER was checked on its
  product pages) show the notice in a pop-up without a downloadable file.
  Every attempt is recorded in `data/metadata/notice_attempts.csv`. The
  notices in the corpus are therefore the **French ANSM** and **US DailyMed**
  patient notices, classified as foreign supplementary.

## 10. Section extraction

Two extractors share the same collected corpus. Neither one rewrites a source
file, a provenance row or the legacy `sections.csv`:

- `python main.py extract` is the original keyword extractor and still writes
  `data/metadata/sections.csv` (6 678 sections from 394 documents) and
  `data/reports/section_coverage.csv`;
- `python main.py extract --structured` runs the additive,
  **document-type-aware** pipeline and writes the two new tables described
  below. Nothing in the collection stage changes, and rerunning it only
  re-processes a document whose source hash changed (`--refresh` forces all).

### 10.1 Two document classes, never merged

| class              | source table                                                     | rows | meaning                                     |
| ------------------ | ---------------------------------------------------------------- | ---: | ------------------------------------------- |
| RCP / professional | `data/metadata/documents.csv`, `document_type` `smpc` or `label` |  430 | SmPC and US prescribing information         |
| patient notice     | `data/metadata/notices.csv`, `document_type=NOTICE`              |  156 | French ANSM notices and US patient leaflets |

The RCP profile and the notice profile have separate heading vocabularies, so a
notice passage can never be stored as an RCP passage (or the reverse). A
medicine can have several documents of each class; every row carries the
existing `document_id` and, for a notice, the `parent_document_id` of the
document it was carved from. Contradictions between RCP and notice are **not**
reconciled — both passages are kept as published.

### 10.2 Sections, statuses and methods

Mandatory sections: **indications**, **posologie**, **contre-indications**,
**interactions**, **effets indésirables**. Optional sections: **mises en
garde**, **grossesse**, **propriétés pharmacologiques**, **durée de
conservation / stockage**, **surdosage**.

Every one of the ten canonical keys is written for every document, so a missing
section is visible instead of silently absent:

| status                  | meaning                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `FOUND`                 | the heading and a non-empty verbatim body were stored                                             |
| `NOT_FOUND_IN_DOCUMENT` | the document has a recognised structure and no such heading                                       |
| `NEEDS_REVIEW`          | the heading exists but the body is empty/unreadable, or no document structure was detected at all |
| `EXTRACTION_FAILED`     | the file could not be read; the error is recorded                                                 |

`extraction_method` records how the passage was obtained:
`TEXT_EXTRACTION`, `OCR`, `HEADING_BASED`, `AI_ASSISTED`, `MANUAL_REVIEW`.

### 10.3 Exact wording and validation

A passage is a contiguous run of source lines. The extractor never summarises,
translates, normalises or repairs it; mojibake repair is used **only** for
matching headings, never for the stored text. Original headings, physical page
numbers, printed page numbers and table text are kept. Each section row is
checked mechanically:

- `validation_status` — every stored line still occurs in the source text
  (`VERBATIM_OK` / `VERBATIM_FAILED`);
- `numeric_check` — every numeric expression with a unit is still present
  (`NUMBERS_OK` / `NUMBERS_CHANGED`);
- `review_required` — set when OCR was used with low confidence, when OCR was
  needed but unavailable, when the text is degenerate, or when the stored
  SHA-256 does not match the file (professional documents only).

A failed check changes the status/flag; it never rewrites the passage.

### 10.4 PDF, HTML and OCR

- **HTML** — BeautifulSoup reads the ANSM pages. The SmPC uses
  `AmmAnnexeTitre*`; the embedded notice uses `AmmAnnexeTitre*` too (the
  `AmmNoticeTitre*` block only wraps the denomination and table of contents).
  The duplicated notice table of contents is dropped before extraction.
- **PDF** — pymupdf reads the ANPP RCPs, the DailyMed labels and the DailyMed
  patient leaflets. For a US full label, detection starts at the full
  prescribing-information block after the highlights; for a PDF notice, only
  the patient-information/Medication Guide part is read (never the
  professional part of the same file).
- **OCR** — text is always tried first. A page with fewer than 40 characters is
  sent to Tesseract only when `--ocr auto` (default) and the package/binary are
  installed; the page and the document are flagged, and `--ocr never` records
  the limitation instead of guessing. French, Arabic and English language data
  are requested when available. The normal corpus does not need OCR; the
  optional dependencies are listed in `requirements.txt`.

### 10.5 Optional Gemini fallback

AI assistance is **off** unless an instructor-approved model is configured
explicitly:

```bash
set PHARMEAZOR_GEMINI_MODEL=<approved-model>
set GEMINI_API_KEY=<key>          # or GOOGLE_API_KEY
python main.py extract --structured --ai --med MED001 --refresh
```

No model name is guessed. Requests use the existing `requests` dependency, the
answer is cached under `data/.cache/`, and every proposed quote is checked
against the source before it is stored; an unverifiable quote is discarded and
the section stays `NOT_FOUND_IN_DOCUMENT`.

### 10.6 Outputs

| file                                   | content                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `data/metadata/extractions.csv`        | one row per document: class, source, hash, page count/type, status, method, OCR/AI flags, section counts                       |
| `data/metadata/extracted_sections.csv` | one row per document × canonical section: status, heading, verbatim content, page range, method, validation checks, table JSON |
| `data/reports/extraction_coverage.csv` | per medicine and class: documents, required sections found, review/failure counts                                              |
| `data/reports/extraction_failures.csv` | the review queue (failed or flagged documents with the reason)                                                                 |

Current full run (2026-11-19, 586 targets): **5 860 section rows** — 5 252
`FOUND`, 541 `NOT_FOUND_IN_DOCUMENT`, 67 `NEEDS_REVIEW`, 0
`EXTRACTION_FAILED`. All 5 252 stored passages pass the verbatim check, and
every numeric expression is preserved (3 502 `NUMBERS_OK`, 1 750
`NO_NUMBERS`, 0 `NUMBERS_CHANGED`). **517 of 586 documents have all five
mandatory sections** (146/156 notices, 161/216 US labels, 210/214 SmPCs); 37
documents are in the review queue, mostly because OCR was needed but Tesseract
is not installed.

Useful options: `--med MED001`, `--doctype smpc,label,notice`, `--source
ANPP_RCP`, `--no-notices`, `--tables` (slower PDF table capture), `--ocr
{auto,force,never}`, `--ai`, `--refresh`.

### 10.7 Repeatable evaluation

`python main.py extract-eval` builds a deterministic, stratified sample of 20
patient notices (`data/evaluation/notice_sample.csv`), creates the separate
human annotation sheet (`manual_reference.csv`, one row per notice × mandatory
section) and scores the extractor. Until a human has filled that sheet, the
report uses a clearly labelled **provisional** keyword reference
(`provisional_reference.csv`) and says so at the top of
`data/evaluation/report.md`. Metrics: status accuracy, FOUND
precision/recall/F1, exact-quote containment, text similarity, numeric
preservation and page accuracy — overall and per section. Rerun with
`--refresh-sample` to redraw the sample; annotations already entered for the
same sample/section are never overwritten.

## 11. Patient notices

`python main.py notices` looks for the **patient notice** of every medication
(notice patient, notice d'information, package leaflet, patient information
leaflet) — never an RCP/SmPC.

- **Discovery** — the Algerian manufacturers first (the official portal
  publishes RCPs only), then the notices carried by the documents already
  collected: the ANSM product pages embed the _Notice patient_, the US labels
  end with a _PATIENT INFORMATION_ section.
- **Discrimination** — a document is only accepted when it carries the
  patient-notice markers; the RCP markers make it a professional summary, and
  the order of the markers decides when a label contains both.
- **Matching** — against the products the official nomenclature records for
  the medicine (brand, strength, form): `EXACT_MATCH`, `PARTIAL_MATCH` (same
  substance, different brand/strength/form), `COMBINATION_MATCH` (the notice
  adds another substance) or `UNVERIFIED`. A partial or combination match is
  never attached as an exact one.
- **Storage** — `data/metadata/notices.csv` (document id, medication id,
  document type NOTICE, original filename, source, source URL, direct URL,
  manufacturer, country, language, strength, form, revision date, collection
  date, registration number, collection method, verification status, local
  path), the notice text under `data/raw/<medicine-slug>/notices/`, and the link
  written into the medication record (`notice_document_id`, `notice_status`,
  `notice_source` in `data/input/medicines.csv`).

The existing RCP records are never modified.

## 12. Human-use check

`python main.py check-usage` answers one question about every collected
document: **is this a medicine for human consumption?** The project is about
medicines for people, so a veterinary product or a regulatory act has no
place in the corpus.

The classifier combines four kinds of evidence (`src/validation/usage.py`):

| evidence                             | examples                                                                           | verdict                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| **decisive veterinary statements**   | "not for use in humans", "for use in horses only", "réservé à l'usage vétérinaire" | `VETERINARY` (high confidence) → **quarantined** |
| **the structure of a SmPC / notice** | "DENOMINATION DU MEDICAMENT", "INDICATIONS AND USAGE", "CONTRAINDICATIONS"         | `HUMAN_MEDICINE`                                 |
| **register extracts**                | the national nomenclature, the BDPM register files                                 | `REGISTER_RECORD`                                |
| **regulatory acts**                  | "rappel de lot", "arrêté n°…" without SmPC structure                               | `NOT_A_MEDICINE_DOCUMENT`                        |

A veterinary document is quarantined (moved to `data/quarantine/`, the row
marked `rejected`), and the **collection pipeline blocks it before storage** —
a veterinary label can never enter the corpus again, even on a re-run.
The animal wording that appears in every SmPC ("espèces animales" in the
pre-clinical section, "licensed veterinarian" in a warning) is only a
_weak_ signal: it sends the document to the review queue, it never
quarantines it.

Report: `data/reports/usage_report.csv` — one row per document
(document id, medicine id, source, type, title, **usage status**, confidence,
the evidence that decided it, file path, source URL, check date).

Today: **432 HUMAN_MEDICINE**, **122 REGISTER_RECORD**, **1 VETERINARY**
(quarantined), 0 administrative, 0 undetermined — 555 documents checked.

The single veterinary document was **MED025__SRC_DAILYMED__DOC007**
("GENTAMICIN SULFATE SOLUTION [HUVEPHARMA INC]", DailyMed) — the label says
"for use in horses only / not for use in humans". It has been taken out of the
corpus: the file is in `data/quarantine/`, its provenance row stays in
`documents.csv` marked `rejected` (555 rows, 552 verified, 422 files).
Quarantining is idempotent — a second run of the check keeps the name and the
path, it never renames a document.

## 13. Next stages (not implemented here)

Name normalisation (brand/INN/ATC/variants/ambiguity flags — the name map and
the synonym table are the seed), retrieval over `sections.csv` (BM25 vs
semantic vectors, compared quantitatively), source reconciliation, cited
answering with the Gemini model, numeric verification, and the evaluation
sets (≥30 questions, ≥40 name variants, ≥10 real disagreements).
