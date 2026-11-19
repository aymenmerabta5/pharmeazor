"""Central configuration for the PHARMEAZOR collection pipeline.

Authority levels follow the Project 2 brief:
    1  official Algerian (ANPP SmPC / package leaflets)
    2  official Algerian ministry nomenclature
    3  foreign institutional reference (ANSM, DailyMed, EMA, BDPM)
    4  Algerian professional website (secondary, must be labelled)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
INPUT_DIR = DATA_DIR / "input"
RAW_DIR = DATA_DIR / "raw"
QUARANTINE_DIR = DATA_DIR / "quarantine"
META_DIR = DATA_DIR / "metadata"
REPORTS_DIR = DATA_DIR / "reports"
LOG_DIR = DATA_DIR / "logs"
RECON_DIR = DATA_DIR / "recon"
CACHE_DIR = DATA_DIR / ".cache"

SOURCES_CSV   = META_DIR / "sources.csv"
DOCUMENTS_CSV = META_DIR / "documents.csv"
CHECKS_CSV    = META_DIR / "compliance_checks.csv"
MEDICINES_CSV = INPUT_DIR / "medicines.csv"
TARGETS_CSV   = INPUT_DIR / "targets.csv"
ROBOTS_CACHE  = CACHE_DIR / "robots_cache.json"
FILE_RENAMES_CSV = META_DIR / "file_renames.csv"
EXTRACTIONS_CSV = META_DIR / "extractions.csv"
EXTRACTED_SECTIONS_CSV = META_DIR / "extracted_sections.csv"
EXTRACTION_COVERAGE_CSV = REPORTS_DIR / "extraction_coverage.csv"
EXTRACTION_FAILURES_CSV = REPORTS_DIR / "extraction_failures.csv"
EVAL_DIR = DATA_DIR / "evaluation"
EVAL_SAMPLE_CSV = EVAL_DIR / "notice_sample.csv"
EVAL_REFERENCE_CSV = EVAL_DIR / "manual_reference.csv"
EVAL_PROVISIONAL_CSV = EVAL_DIR / "provisional_reference.csv"
EVAL_SCORES_CSV = EVAL_DIR / "section_scores.csv"
EVAL_METRICS_CSV = EVAL_DIR / "metrics.csv"
EVAL_REPORT_MD = EVAL_DIR / "report.md"

# Generated reports are separate from the provenance/entity tables: they can
# be regenerated at any time and are never the source of truth.
COVERAGE_REPORT_CSV    = REPORTS_DIR / "coverage_report.csv"
NOTICE_REPORT_CSV      = REPORTS_DIR / "notice_report.csv"
USAGE_REPORT_CSV       = REPORTS_DIR / "usage_report.csv"
PENDING_REVIEW_CSV     = REPORTS_DIR / "pending_review.csv"
NEEDS_ATTENTION_CSV    = REPORTS_DIR / "needs_attention.csv"
MANUAL_ACTIONS_CSV     = REPORTS_DIR / "manual_actions.csv"
SOURCE_HEALTH_CSV      = REPORTS_DIR / "source_health.csv"
BRAND_GAP_CSV          = REPORTS_DIR / "brand_gap.csv"
SECTION_COVERAGE_CSV   = REPORTS_DIR / "section_coverage.csv"
PROFESSORS_LIST_CSV    = REPORTS_DIR / "professors_list.csv"

# --- HTTP behaviour -------------------------------------------------------
USER_AGENT       = "PharmeazorAcademicBot/1.0 (+contact: team@univ.dz)"
CONNECT_TIMEOUT  = 10
READ_TIMEOUT     = 30
MAX_RETRIES      = 2                     # transient failures only (429/5xx)
BACKOFF_FACTOR   = 5
CHUNK_SIZE       = 64 * 1024
MAX_FILE_MB      = 25
DEFAULT_DELAY_S  = 3.0                   # per-domain polite delay
ROBOTS_CACHE_TTL_H = 24
MAX_LINKS_PER_PAGE = 25                 # never bulk-download a whole index page

# --- HTTP status handling -------------------------------------------------
BLOCKED_STATUSES = (401, 403, 407, 451)   # never retried, never bypassed

# --- Table schemas --------------------------------------------------------
SOURCE_COLUMNS = [
    "source_id", "source_name", "base_domain", "country", "language",
    "source_type", "authority_level", "authority_notes", "jurisdiction",
    "robots_url", "robots_checked_at", "robots_rules", "terms_url",
    "terms_checked_at", "terms_conclusion", "reviewer", "allowed_mode",
    "allowed_scope", "crawl_delay_s", "review_status", "last_reviewed_at",
    "next_review_date", "notes",
]

DOCUMENT_COLUMNS = [
    "document_id", "medicine_id", "search_term", "matched_inn", "brand_name",
    "title", "document_type", "language", "country", "strength_form", "holder",
    "source_id", "source_url", "final_url", "collection_method", "collected_at",
    "publication_date", "file_path", "content_type", "file_size", "sha256",
    "compliance_check_id", "allowed_scope", "collection_status",
    "relevance_status", "reviewer_notes", "error",
]

CHECK_COLUMNS = [
    "check_id", "source_id", "target_url", "checked_at",
    "robots_status", "robots_can_fetch", "terms_conclusion",
    "decision", "reason", "reviewer",
]

MEDICINE_COLUMNS = [
    "medicine_id", "name", "inn", "inn_variants", "dci_components", "brand_name",
    "strength_form", "atc", "class", "list_number", "source_file",
    "in_algerian_nomenclature", "remarks",
    "notice_document_id", "notice_status", "notice_source", "notice_collected_at",
]

TARGET_COLUMNS = [
    "medicine_id", "source_id", "url", "document_type", "search_term",
    "matched_inn", "brand_name", "strength", "language", "country",
    "requires_js", "reviewer",
]

# --- Extraction tables (additive; the provenance tables above are untouched) --
EXTRACTION_PIPELINE_VERSION = "1.0"

EXTRACTION_COLUMNS = [
    "document_id", "parent_document_id", "medicine_id", "document_type",
    "source_document_type", "source_id", "source_url", "language", "file_path",
    "source_sha256", "page_count", "page_type", "extraction_status",
    "extraction_method", "ocr_used", "ocr_languages", "ocr_confidence",
    "ai_used", "review_required", "sections_found", "sections_required_found",
    "sections_total", "pipeline_version", "extracted_at", "notes",
]

EXTRACTED_SECTION_COLUMNS = [
    "document_id", "parent_document_id", "medicine_id", "document_type",
    "source_document_type", "source_id", "source_url", "language", "file_path",
    "source_sha256", "section_key", "section_label", "required", "status",
    "original_heading", "content", "content_sha256", "content_chars",
    "page_start", "page_end", "pages", "printed_pages", "extraction_method",
    "review_required", "validation_status", "numeric_check", "table_count",
    "tables_json", "notes", "extracted_at",
]

EVAL_SAMPLE_COLUMNS = [
    "sample_id", "document_id", "medication_id", "source_id", "language",
    "file_path", "selection_reason", "sampled_at", "reviewer", "notes",
]

EVAL_REFERENCE_COLUMNS = [
    "sample_id", "document_id", "section_key", "reference_status",
    "reference_heading", "reference_quote", "page_start", "page_end",
    "printed_pages", "reviewer", "reviewed_at", "notes",
]

EVAL_SCORE_COLUMNS = [
    "sample_id", "document_id", "section_key", "expected_status",
    "predicted_status", "status_match", "content_exact_match",
    "content_similarity", "numbers_match", "page_match", "predicted_method",
    "notes",
]

# --- Authority levels -----------------------------------------------------
AUTHORITY_OFFICIAL_ALGERIAN = "1"
AUTHORITY_OFFICIAL_NOMENCLATURE = "2"
AUTHORITY_FOREIGN_INSTITUTIONAL = "3"
AUTHORITY_ALGERIAN_PROFESSIONAL = "4"

AUTHORITY_NAMES = {
    AUTHORITY_OFFICIAL_ALGERIAN: "official Algerian (ANPP)",
    AUTHORITY_OFFICIAL_NOMENCLATURE: "official Algerian nomenclature",
    AUTHORITY_FOREIGN_INSTITUTIONAL: "foreign institutional reference",
    AUTHORITY_ALGERIAN_PROFESSIONAL: "Algerian professional website (secondary)",
}

# --- Compliance decisions -------------------------------------------------
AUTOMATED = "AUTOMATED"
MANUAL = "MANUAL"
EXCLUDED = "EXCLUDED"
REVIEW_REQUIRED = "REVIEW_REQUIRED"

# --- Manual-only targets (project brief: the official Algerian nomenclature
# --- list page must never be automated) ------------------------------------
MANUAL_ONLY_TARGETS = [
    {
        "host_glob": "*.msp.dz",
        "path_prefix": "/nomenclature",
        "reason": "Official Algerian nomenclature list page - manual download only (project brief).",
    },
    {
        "host_glob": "msp.dz",
        "path_prefix": "/nomenclature",
        "reason": "Official Algerian nomenclature list page - manual download only (project brief).",
    },
    {
        "host_glob": "sante.gov.dz",
        "path_prefix": "/nomenclature",
        "reason": "Official Algerian nomenclature list page - manual download only (project brief).",
    },
    {
        "host_glob": "www.sante.gov.dz",
        "path_prefix": "/nomenclature",
        "reason": "Official Algerian nomenclature list page - manual download only (project brief).",
    },
]

EXCLUDED_DOMAINS = [
    "facebook.com", "twitter.com", "x.com", "reddit.com",
    "blogspot.com", "wordpress.com", "youtube.com", "quora.com",
]

# --- Seed source registry -------------------------------------------------
# allowed_scope lists the path prefixes that were reviewed for automation.
# review_status stays "pending" until a human records a terms review, so a
# fresh install never automates anything by accident.
SEED_SOURCES = [
    {
        "source_id": "ANPP_RCP",
        "source_name": "ANPP - Resume des caracteristiques du produit (RCP)",
        "base_domain": "rcp.anpp.dz",
        "country": "DZ", "language": "fr",
        "source_type": "official_agency",
        "authority_level": AUTHORITY_OFFICIAL_ALGERIAN,
        "authority_notes": "Priority source 1: official Algerian SmPC portal (ANPP).",
        "jurisdiction": "Algeria",
        "robots_url": "https://rcp.anpp.dz/robots.txt",
        "terms_url": "https://rcp.anpp.dz/",
        "allowed_mode": AUTOMATED,
        "allowed_scope": "/",
        "crawl_delay_s": 3.0,
    },
    {
        "source_id": "ANPP_SITE",
        "source_name": "ANPP - Agence Nationale des Produits Pharmaceutiques",
        "base_domain": "anpp.dz",
        "country": "DZ", "language": "fr/ar",
        "source_type": "official_agency",
        "authority_level": AUTHORITY_OFFICIAL_ALGERIAN,
        "authority_notes": "Priority source 1: official Algerian agency documents and product dossiers.",
        "jurisdiction": "Algeria",
        "robots_url": "https://anpp.dz/robots.txt",
        "terms_url": "https://anpp.dz/",
        "allowed_mode": AUTOMATED,
        "allowed_scope": "/wpfd_file/,/download/,/wp-sitemap",
        "crawl_delay_s": 3.0,
    },
    {
        "source_id": "SANTE_MSP",
        "source_name": "Ministere de la Sante - nomenclature des produits pharmaceutiques",
        "base_domain": "sante.gov.dz",
        "country": "DZ", "language": "fr",
        "source_type": "official_ministry",
        "authority_level": AUTHORITY_OFFICIAL_NOMENCLATURE,
        "authority_notes": "Priority source 2: official nomenclature (manual download only for the list page).",
        "jurisdiction": "Algeria",
        "robots_url": "https://sante.gov.dz/robots.txt",
        "terms_url": "https://sante.gov.dz/",
        "allowed_mode": MANUAL,
        "allowed_scope": "/",
        "crawl_delay_s": 3.0,
    },
    {
        "source_id": "BDPM_FR",
        "source_name": "Base de donnees publique des medicaments (France)",
        "base_domain": "base-donnees-publique.medicaments.gouv.fr",
        "country": "FR", "language": "fr",
        "source_type": "foreign_institutional",
        "authority_level": AUTHORITY_FOREIGN_INSTITUTIONAL,
        "authority_notes": "Priority source 3: French ministry open data (nomenclature + composition).",
        "jurisdiction": "France",
        "robots_url": "https://base-donnees-publique.medicaments.gouv.fr/robots.txt",
        "terms_url": "https://base-donnees-publique.medicaments.gouv.fr/mentions-legales",
        "allowed_mode": AUTOMATED,
        "allowed_scope": "/download/file/,/api/options_autocompilation,/medicament/,/telechargement",
        "crawl_delay_s": 3.0,
        "notes": "Official French ministry open data and product pages. The product "
                "pages (/medicament/<id>/extrait) carry the ANSM SmPC and the patient "
                "notice; the site also publishes the register extracts (/download/file/).",
    },
    {
        "source_id": "DAILYMED",
        "source_name": "DailyMed (U.S. National Library of Medicine)",
        "base_domain": "dailymed.nlm.nih.gov",
        "country": "US", "language": "en",
        "source_type": "foreign_institutional",
        "authority_level": AUTHORITY_FOREIGN_INSTITUTIONAL,
        "authority_notes": "Priority source 3: US FDA approved labelling (SPL).",
        "jurisdiction": "United States",
        "robots_url": "https://dailymed.nlm.nih.gov/robots.txt",
        "terms_url": "https://dailymed.nlm.nih.gov/about-dailymed/terms-conditions.html",
        "allowed_mode": AUTOMATED,
        "allowed_scope": "/dailymed/services/v2/,/dailymed/getFile.cfm",
        "crawl_delay_s": 3.0,
    },
    {
        "source_id": "EMA",
        "source_name": "European Medicines Agency (EPAR)",
        "base_domain": "ema.europa.eu",
        "country": "EU", "language": "en",
        "source_type": "foreign_institutional",
        "authority_level": AUTHORITY_FOREIGN_INSTITUTIONAL,
        "authority_notes": "Priority source 3: European product information.",
        "jurisdiction": "European Union",
        "robots_url": "https://www.ema.europa.eu/robots.txt",
        "terms_url": "https://www.ema.europa.eu/en/about-us/legal-notice",
        "allowed_mode": AUTOMATED,
        "allowed_scope": "/en/documents/product-information/,/sitemap.xml",
        "crawl_delay_s": 3.0,
    },
    {
        "source_id": "PHARMNET",
        "source_name": "Pharm'Net (Algerian professional website)",
        "base_domain": "pharmnet.dz",
        "country": "DZ", "language": "fr",
        "source_type": "algerian_professional",
        "authority_level": AUTHORITY_ALGERIAN_PROFESSIONAL,
        "authority_notes": "Priority source 4: secondary, must be labelled as non-official.",
        "jurisdiction": "Algeria",
        "robots_url": "https://www.pharmnet.dz/robots.txt",
        "terms_url": "https://www.pharmnet.dz/",
        "allowed_mode": MANUAL,
        "allowed_scope": "/",
        "crawl_delay_s": 4.0,
        "notes": "pharmnet.dz answered 'under maintenance' during reconnaissance; "
                "superseded by PHARMNET_CATALOG (pharmnet-dz.com).",
    },
    {
        "source_id": "PHARMNET_CATALOG",
        "source_name": "Pharm'Net catalogue of the Algerian nomenclature",
        "base_domain": "pharmnet-dz.com",
        "country": "DZ", "language": "fr",
        "source_type": "algerian_professional",
        "authority_level": AUTHORITY_ALGERIAN_PROFESSIONAL,
        "authority_notes": "Priority source 4: secondary mirror of the official Algerian "
                           "nomenclature; used as a NAME source (commercial name, DCI, "
                           "nomenclature code, registration number).",
        "jurisdiction": "Algeria",
        "robots_url": "https://pharmnet-dz.com/robots.txt",
        "terms_url": "https://pharmnet-dz.com/",
        "allowed_mode": AUTOMATED,
        "allowed_scope": "/",
        "crawl_delay_s": 4.0,
        "notes": "NAME SOURCE ONLY: the catalogue exposes no leaflets (notice_url is "
                "empty) and the site states that its interaction data is a demo set - "
                "excluded from the corpus by policy. The public catalogue request is "
                "the site's own read-only call, made with the publishable key that the "
                "site ships in its public page.",
    },
]

# --- Patient notice sources (Algerian manufacturers) ----------------------
# The official Algerian portal (rcp.anpp.dz) publishes RCPs only, so the
# patient notices have to be looked for on the manufacturers' own sites.
SEED_NOTICE_SOURCES = [
    {
        "source_id": "BEKER",
        "source_name": "Laboratoires BEKER (Algerian manufacturer)",
        "base_domain": "bekerlaboratoires.com",
        "country": "DZ",
        "language": "fr",
        "robots_url": "https://bekerlaboratoires.com/robots.txt",
        "terms_url": "https://bekerlaboratoires.com/",
        "product_sitemap": "https://bekerlaboratoires.com/product-sitemap.xml",
        "allowed_scope": "/produits/,/wp-content/uploads/",
    },
]

# Patterns that identify a patient notice link on a product page.
NOTICE_LINK_PATTERNS = [
    r"lire\s+la\s+notice",
    r"notice\s+patient",
    r"notice\s+d'information",
    r"patient\s+information",
    r"package\s+leaflet",
    r"\bpil\b",
]


# --- Discovery ------------------------------------------------------------
DISCOVERY_MODULES = {
    "ANPP_RCP": "src.discovery.anpp",
    "ANPP_SITE": "src.discovery.anpp",
    "SANTE_MSP": "src.discovery.sante",
    "BDPM_FR": "src.discovery.bdpm",
    "DAILYMED": "src.discovery.dailymed",
    "EMA": "src.discovery.ema",
    "PHARMNET": "src.discovery.pharmnet",
    "PHARMNET_CATALOG": "src.discovery.pharmnet_catalog",
}

# Sources that only provide names (no documents): they feed the name map.
NAME_ONLY_SOURCES = ["PHARMNET_CATALOG"]

# Number of brand queries sent to a source per medicine (politeness budget).
MAX_BRAND_QUERIES = 6

# Foreign sources are a complement: once an official document exists for a
# medicine, foreign sources are capped at this many documents.
FOREIGN_CAP_WHEN_OFFICIAL = 2

# The official Algerian source is indexed by brand, so it may legitimately
# yield several documents per medicine (one per product).  It gets this many
# documents on top of the per-source cap.
OFFICIAL_EXTRA_DOCUMENTS = 7
