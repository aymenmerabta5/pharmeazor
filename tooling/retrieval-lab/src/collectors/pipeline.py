"""The collection pipeline: compliance gate -> method choice -> validate -> store.

Rules that are enforced here (from the workflow document):
  * nothing is requested before the compliance gate allows it,
  * every saved file keeps its provenance (source, URL, date, language, authority),
  * a rerun must not create duplicate documents or orphan files,
  * a document that fails validation is quarantined, never silently accepted,
  * collection never rewrites medical content.
"""
import hashlib
import mimetypes
import shutil
import time
import uuid
from pathlib import Path

from config import (
    CACHE_DIR, MANUAL_ACTIONS_CSV, ROOT, DOCUMENT_COLUMNS,
    AUTHORITY_OFFICIAL_ALGERIAN, FOREIGN_CAP_WHEN_OFFICIAL,
    OFFICIAL_EXTRA_DOCUMENTS,
)
from src.compliance.registry import AUTOMATED, MANUAL, SourceRegistry
from src.collectors import http as httpc
from src.collectors.playwright_collector import run_recipe
from src.discovery import registry as discovery_registry
from src.discovery.base import DiscoveryError
from src.storage.naming import document_path, free_path, label_from_values
from src.storage.store import DocumentStore, write_table
from src.utils.logging_setup import get_logger
from src.utils import audit
from src.utils.rate_limit import RateLimiter
from src.utils.text import dci_components, dci_head, dci_required_components
from src.validation.validate import (
    check_http_result, check_medicine_relevance, document_title, extension_for,
    extract_text, quarantine_file, verify_file_integrity,
)
from src.validation.usage import VETERINARY, classify_usage

log = get_logger("pharmeazor.pipeline")

TMP_DIR = CACHE_DIR / "tmp"
MANUAL_ACTION_COLUMNS = ["medicine_id", "source_id", "url", "instruction",
                         "recorded_at", "status", "notes"]

# statuses that only say "nothing collected here (yet)"; they are replaced as
# soon as a real document or a newer decision exists
PLACEHOLDER_STATUSES = [
    "no_results", "discovery_failed", "failed", "blocked_by_validation",
    "no_document_links", "REVIEW_REQUIRED", "MANUAL", "EXCLUDED",
]


def _record_manual_action(medicine: dict, source_id: str, url: str,
                          reason: str, src_meta: dict) -> None:
    """Write down the manual steps a human still has to do (handoff list)."""
    import pandas as pd

    instruction = reason
    if source_id == "SANTE_MSP":
        from src.discovery.sante import MANUAL_INSTRUCTION
        instruction = MANUAL_INSTRUCTION
    row = {
        "medicine_id": medicine.get("medicine_id", ""),
        "source_id": source_id,
        "url": url,
        "instruction": instruction,
        "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "status": "to_do",
        "notes": src_meta.get("notes", ""),
    }
    if MANUAL_ACTIONS_CSV.exists():
        existing = pd.read_csv(MANUAL_ACTIONS_CSV, dtype=str, keep_default_na=False)
        if not ((existing["medicine_id"] == row["medicine_id"])
                & (existing["source_id"] == row["source_id"])).any():
            existing = pd.concat([existing, pd.DataFrame([row])], ignore_index=True)
    else:
        existing = pd.DataFrame([row])
    write_table(MANUAL_ACTIONS_CSV, existing[MANUAL_ACTION_COLUMNS])


def _blank_row(medicine: dict, source_id: str, url: str = "") -> dict:
    row = {c: "" for c in DOCUMENT_COLUMNS}
    row.update({
        "medicine_id": medicine.get("medicine_id", ""),
        "search_term": medicine.get("inn", ""),
        "matched_inn": medicine.get("inn", ""),
        "brand_name": "",
        "strength_form": "",
        "source_id": source_id,
        "source_url": url,
        "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })
    return row


def _download_to_temp(session, url: str, method: str, local_path: str = "") -> tuple:
    """Download into a temporary file.  Returns (temp_path, metadata).

    A candidate that already has a byte-identical local copy (the shared BDPM
    register, fetched once by discovery) is copied instead of re-downloaded:
    the URL and its compliance decision stay the same, only the transfer is
    skipped.
    """
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    # ``download_file`` appends its own ".part", so the seed must not end in one.
    tmp = TMP_DIR / f"{uuid.uuid4().hex}.tmp"
    if local_path:
        source = Path(local_path)
        if source.is_file() and source.stat().st_size > 0:
            shutil.copyfile(source, tmp)
            data = tmp.read_bytes()
            return tmp, {
                "status_code": 200,
                "content_type": mimetypes.guess_type(source.name)[0] or "application/octet-stream",
                "final_url": url,
                "file_size": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "from_cache": True,
            }
    if method == "playwright":
        res = run_recipe(url, [], tmp)
    else:
        res = httpc.download_file(session, url, tmp)
    return tmp, res


def _persist(store: DocumentStore, medicine: dict, source_id: str, candidate,
             tmp: Path, res: dict, check_id: str, src_meta: dict) -> dict:
    """Move the temporary file into the corpus (or reuse a byte-identical file)."""
    sha = res["sha256"]
    existing = store.find_file_by_hash(sha)
    if existing:
        tmp.unlink(missing_ok=True)
        final_path = existing
        reused = True
    else:
        ext = (candidate.extra.get("file_type")
               or extension_for(res, candidate.url))
        document_id = store.next_document_id(medicine["medicine_id"], source_id)
        label = label_from_values(candidate.brand_name, candidate.title,
                                  candidate.extra.get("holder", ""))
        final_path = free_path(document_path(
            medicine, source_id, document_id, suffix=f".{ext}", label=label))
        final_path.parent.mkdir(parents=True, exist_ok=True)
        tmp.replace(final_path)
        reused = False
    res = dict(res)
    res["file_path"] = final_path
    res["reused"] = reused
    return res


def _store_row(store: DocumentStore, medicine: dict, source_id: str, candidate,
               res: dict, check_id: str, src_meta: dict, relevance: str,
               note: str, title: str = "") -> dict:
    row = _blank_row(medicine, source_id, candidate.url)
    row.update({
        "document_id": store.next_document_id(medicine["medicine_id"], source_id),
        "title": title or candidate.title or "",
        "brand_name": candidate.brand_name,
        "final_url": res.get("final_url", candidate.url),
        "collection_method": candidate.method,
        "file_path": str(Path(res["file_path"]).relative_to(ROOT).as_posix()),
        "content_type": res.get("content_type", ""),
        "file_size": str(res.get("file_size", "")),
        "sha256": res.get("sha256", ""),
        "compliance_check_id": check_id,
        "allowed_scope": src_meta.get("allowed_scope", ""),
        "collection_status": "collected",
        "relevance_status": relevance,
        "reviewer_notes": note,
        "document_type": candidate.document_type,
        "language": candidate.language or src_meta.get("language", ""),
        "country": candidate.country or src_meta.get("country", ""),
        "publication_date": candidate.publication_date,
        "holder": candidate.extra.get("holder", ""),
        "strength_form": candidate.strength_form or "",
    })
    if candidate.note:
        row["reviewer_notes"] = (note + " | " if note else "") + candidate.note
    _record(store, row)
    return row


def _expected_identity(medicine: dict, candidate) -> dict:
    """What the identity check may require of a document.

    Only what the *document* declares can be required: the commercial name
    and the strength it states, plus the substances of the medicine.  The
    Algerian brand name of the medicine must not be required in a foreign
    document.
    """
    return {
        "inn": medicine.get("inn", ""),
        "name": medicine.get("name", ""),
        "brand_name": candidate.brand_name,
        "strength": candidate.strength_form,
        "country": candidate.country or medicine.get("country", ""),
        "dci_components": dci_components(medicine),
        "dci_required": dci_required_components(medicine),
        "dci_head": dci_head(medicine),
    }


def _record(store: DocumentStore, row: dict) -> bool:
    """Add a row unless an identical one already exists (idempotent reruns).

    Two rows are identical when they describe the same medicine, source,
    status, URL and (for collected files) the same content hash.
    """
    df = store.df
    mask = (
        (df["medicine_id"] == row["medicine_id"])
        & (df["source_id"] == row["source_id"])
        & (df["collection_status"] == row["collection_status"])
        & (df["source_url"] == row["source_url"])
    )
    if row.get("sha256"):
        mask &= (df["sha256"] == row["sha256"])
    if mask.any():
        # the same document may already be known: refresh its metadata
        # (title, holder, notes) instead of adding a duplicate row
        for field in ("title", "holder", "strength_form", "reviewer_notes", "relevance_status"):
            value = str(row.get(field, "") or "")
            if value and value != str(df.loc[mask, field].iloc[-1] or ""):
                store.update(df.loc[mask, "document_id"].iloc[-1], **{field: value})
        return False

    if row.get("collection_status") == "collected":
        # a real document supersedes the earlier placeholders of that source
        store.drop_where(row["medicine_id"], row["source_id"], PLACEHOLDER_STATUSES)
    else:
        # a newer decision supersedes the older placeholder of that source
        # (e.g. no_results -> REVIEW_REQUIRED when the source is approved)
        store.drop_where(row["medicine_id"], row["source_id"],
                         [s for s in PLACEHOLDER_STATUSES
                          if s != row["collection_status"]])

    store.add(row)
    return True


def _authority_level(registry: SourceRegistry, source_id: str) -> str:
    src = registry.get(source_id) or {}
    level = str(src.get("authority_level") or "").strip()
    return level[0] if level and level[0].isdigit() else ""


def _has_official_document(store: DocumentStore, medicine_id: str,
                           official_ids: set) -> bool:
    if not official_ids or store.df.empty:
        return False
    sub = store.df[(store.df["medicine_id"] == medicine_id)
                   & (store.df["collection_status"] == "collected")
                   & (store.df["relevance_status"] == "verified")]
    return bool(set(sub["source_id"]) & official_ids)


def collect_medicine(medicine: dict, source_ids: list, registry: SourceRegistry,
                     store: DocumentStore, limiter: RateLimiter, session=None,
                     refresh: bool = False, max_per_source: int = 4) -> list:
    """Collect every source for one medicine.  Returns the document rows."""
    if session is None:
        session = httpc.build_session()
    rows = []

    official_ids = {sid for sid in source_ids
                    if _authority_level(registry, sid) == AUTHORITY_OFFICIAL_ALGERIAN}
    # the official Algerian source has priority: foreign sources are a
    # complement and stop early once an official document is in the corpus
    has_official = _has_official_document(store, medicine["medicine_id"], official_ids)

    for source_id in source_ids:
        src_meta = registry.get(source_id) or {}
        is_official = source_id in official_ids
        if is_official:
            # the official source is indexed by brand: it may legitimately
            # hold several documents per medicine
            cap = max_per_source + OFFICIAL_EXTRA_DOCUMENTS
        elif has_official:
            cap = min(max_per_source, FOREIGN_CAP_WHEN_OFFICIAL)
        else:
            cap = max_per_source
        probe = discovery_registry.probe_url(source_id)
        decision = registry.evaluate(source_id, probe, reviewer="collector")
        log.info("gate %s %s -> %s (%s)", medicine["medicine_id"], source_id,
                 decision.decision, decision.reason)
        audit.log_attempt(
            medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
            target_url=probe, method="gate", status="gate",
            check_id=decision.check_id, decision=decision.decision,
            reason=decision.reason,
        )

        if decision.decision != AUTOMATED:
            row = _blank_row(medicine, source_id, probe)
            row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
            row["collection_status"] = decision.decision
            row["compliance_check_id"] = decision.check_id
            row["reviewer_notes"] = decision.reason
            _record(store, row)
            rows.append(row)
            if decision.decision == MANUAL:
                _record_manual_action(medicine, source_id, probe, decision.reason, src_meta)
            continue

        # ---- discovery -------------------------------------------------
        try:
            candidates = discovery_registry.discover(
                source_id, medicine, session, limiter, max_results=cap)
        except DiscoveryError as exc:
            row = _blank_row(medicine, source_id, probe)
            row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
            row["collection_status"] = "discovery_failed"
            row["compliance_check_id"] = decision.check_id
            row["error"] = str(exc)
            row["reviewer_notes"] = str(exc)
            _record(store, row)
            rows.append(row)
            audit.log_attempt(
                medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                target_url=probe, method="discovery", status="discovery_failed",
                check_id=decision.check_id, error=str(exc),
            )
            log.warning("discovery failed %s %s: %s", medicine["medicine_id"], source_id, exc)
            continue

        if not candidates:
            row = _blank_row(medicine, source_id, probe)
            row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
            row["collection_status"] = "no_results"
            row["compliance_check_id"] = decision.check_id
            row["reviewer_notes"] = f"no document found on {source_id} for {medicine.get('inn','')}"
            _record(store, row)
            rows.append(row)
            audit.log_attempt(
                medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                target_url=probe, method="discovery", status="no_results",
                check_id=decision.check_id,
            )
            continue

        # ---- collect each candidate -------------------------------------
        for candidate in candidates:
            url = candidate.url
            existing = store.find_same(medicine["medicine_id"], source_id, url)
            if not existing.empty and not refresh:
                prior = existing.iloc[-1]
                if prior["collection_status"] == "collected":
                    row = _blank_row(medicine, source_id, url)
                    row["document_id"] = prior["document_id"]
                    row["collection_status"] = "duplicate_skipped"
                    row["sha256"] = prior["sha256"]
                    row["file_path"] = prior["file_path"]
                    row["compliance_check_id"] = decision.check_id
                    row["reviewer_notes"] = "already collected from this source URL (rerun)"
                    rows.append(row)
                    audit.log_attempt(
                        medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                        target_url=url, method=candidate.method, status="duplicate_skipped",
                        check_id=decision.check_id, file_path=prior["file_path"],
                        sha256=prior["sha256"],
                    )
                    log.info("duplicate skipped %s (%s)", url, medicine["medicine_id"])
                    continue

            file_decision = registry.evaluate(source_id, url, reviewer="collector")
            if file_decision.decision != AUTOMATED:
                row = _blank_row(medicine, source_id, url)
                row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
                row["collection_status"] = file_decision.decision
                row["compliance_check_id"] = file_decision.check_id
                row["reviewer_notes"] = file_decision.reason
                _record(store, row)
                rows.append(row)
                audit.log_attempt(
                    medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                    target_url=url, method=candidate.method, status=file_decision.decision,
                    check_id=file_decision.check_id, reason=file_decision.reason,
                )
                continue

            limiter.wait(url.split("/")[2])
            started = time.time()
            try:
                tmp, res = _download_to_temp(session, url, candidate.method,
                                             candidate.local_path)
            except Exception as exc:
                row = _blank_row(medicine, source_id, url)
                row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
                row["collection_status"] = "failed"
                row["compliance_check_id"] = file_decision.check_id
                row["error"] = str(exc)
                _record(store, row)
                rows.append(row)
                audit.log_attempt(
                    medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                    target_url=url, method=candidate.method, status="download_failed",
                    check_id=file_decision.check_id, error=str(exc),
                    duration_ms=int((time.time() - started) * 1000),
                )
                log.error("download failed %s: %s", url, exc)
                continue

            ok, why = check_http_result(res)
            if not ok:
                tmp.unlink(missing_ok=True)
                row = _blank_row(medicine, source_id, url)
                row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
                row["collection_status"] = "blocked_by_validation"
                row["relevance_status"] = "rejected"
                row["error"] = why
                row["compliance_check_id"] = file_decision.check_id
                _record(store, row)
                rows.append(row)
                audit.log_attempt(
                    medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                    target_url=url, method=candidate.method, status="blocked_by_validation",
                    check_id=file_decision.check_id, error=why,
                    sha256=res.get("sha256", ""),
                    duration_ms=int((time.time() - started) * 1000),
                )
                continue

            res = _persist(store, medicine, source_id, candidate, tmp, res,
                           file_decision.check_id, src_meta)
            file_ok, issue = verify_file_integrity(res["file_path"], res, candidate.document_type)
            if not file_ok:
                quarantined = quarantine_file(res["file_path"], issue)
                row = _blank_row(medicine, source_id, url)
                row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
                row["collection_status"] = "blocked_by_validation"
                row["relevance_status"] = "rejected"
                row["error"] = issue
                row["file_path"] = str(quarantined.relative_to(ROOT).as_posix())
                row["compliance_check_id"] = file_decision.check_id
                _record(store, row)
                rows.append(row)
                audit.log_attempt(
                    medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                    target_url=url, method=candidate.method, status="blocked_by_validation",
                    check_id=file_decision.check_id, error=issue,
                    file_path=row["file_path"], sha256=res.get("sha256", ""),
                    duration_ms=int((time.time() - started) * 1000),
                )
                log.warning("validation blocked %s: %s", url, issue)
                continue

            text = extract_text(res["file_path"])
            extra_meta = discovery_registry.document_metadata(source_id, res["file_path"])
            if extra_meta.get("publication_date"):
                candidate.publication_date = extra_meta["publication_date"]
            if extra_meta.get("holder"):
                candidate.extra["holder"] = extra_meta["holder"]
            if extra_meta.get("strength_form"):
                candidate.strength_form = extra_meta["strength_form"]
            title = extra_meta.get("title") or candidate.title or ""
            if not title or title.startswith("ANPP RCP -"):
                title = document_title(res["file_path"], text) or title

            # a veterinary product does not belong in a human-medicine corpus
            # (only an explicit statement blocks the document; a weak animal
            # wording goes to the review queue with the other documents)
            usage = classify_usage(text, title, candidate.document_type)
            if usage["status"] == VETERINARY and usage["confidence"] == "high":
                quarantined = quarantine_file(res["file_path"], usage["evidence"])
                row = _blank_row(medicine, source_id, url)
                row["document_id"] = store.next_document_id(medicine["medicine_id"], source_id)
                row["collection_status"] = "blocked_by_validation"
                row["relevance_status"] = "rejected"
                row["error"] = usage["evidence"]
                row["file_path"] = str(quarantined.relative_to(ROOT).as_posix())
                row["compliance_check_id"] = file_decision.check_id
                _record(store, row)
                rows.append(row)
                log.warning("veterinary document blocked %s: %s", url, usage["evidence"])
                continue

            relevance, note = check_medicine_relevance(
                text, _expected_identity(medicine, candidate))
            note = (note + " | " if note else "") + (f"source: {source_id}")

            row = _store_row(store, medicine, source_id, candidate, res,
                             file_decision.check_id, src_meta, relevance, note,
                             title=title)
            rows.append(row)
            audit.log_attempt(
                medicine_id=medicine.get("medicine_id", ""), source_id=source_id,
                target_url=url, method=candidate.method, status=f"collected:{relevance}",
                check_id=file_decision.check_id, file_path=row["file_path"],
                sha256=res.get("sha256", ""), file_size=res.get("file_size", ""),
                content_type=res.get("content_type", ""), reason=note,
                duration_ms=int((time.time() - started) * 1000),
            )
            log.info("collected %s -> %s [%s]", url, row["document_id"], relevance)

    return rows
