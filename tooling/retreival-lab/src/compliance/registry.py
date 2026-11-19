"""Source registry + compliance gate (four explicit decisions).

The gate is the only thing allowed to let an automated request out of the
process.  Every rule below implements the workflow document:
  * the compliance review comes before any automated visit,
  * robots.txt is a crawler instruction, not legal permission (the human
    terms-of-use review in sources.csv is required as well),
  * unknown / conflicting / expired rules => REVIEW_REQUIRED, never "go".
"""
import time
from dataclasses import dataclass
from fnmatch import fnmatch
from urllib.parse import urlsplit

import pandas as pd

from config import (
    SOURCES_CSV, CHECKS_CSV, SOURCE_COLUMNS, CHECK_COLUMNS,
    MANUAL_ONLY_TARGETS, EXCLUDED_DOMAINS, SEED_SOURCES,
    AUTOMATED, MANUAL, EXCLUDED, REVIEW_REQUIRED,
)
from src.compliance.robots import check_robots
from src.storage.store import read_table, write_table


# --------------------------------------------------------------------- utils
def host_of(url: str) -> str:
    """Hostname only: no credentials, no port, no trailing dot, lowercase."""
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""
    return host.rstrip(".")


def host_matches(host: str, base: str) -> bool:
    """host == base or a subdomain of base (never a substring match)."""
    host, base = (host or "").lower(), (base or "").lower().strip()
    if not host or not base:
        return False
    return host == base or host.endswith("." + base)


def path_of(url: str) -> str:
    try:
        return urlsplit(url).path or "/"
    except ValueError:
        return "/"


@dataclass
class Decision:
    decision: str
    reason: str
    check_id: str = ""
    robots_status: str = ""
    robots_can_fetch: str = ""
    robots_rules: str = ""


def _matches_manual_only(url: str) -> str:
    host, path = host_of(url), path_of(url)
    for rule in MANUAL_ONLY_TARGETS:
        if fnmatch(host, rule["host_glob"]) and path.startswith(rule["path_prefix"]):
            return rule["reason"]
    return ""


def _domain_excluded(url: str) -> str:
    host = host_of(url)
    bare = host[4:] if host.startswith("www.") else host
    for bad in EXCLUDED_DOMAINS:
        if bare == bad or host == bad or host.endswith("." + bad):
            return f"domain '{host}' is on the excluded list (forums/blogs/social)."
    return ""


def _in_scope(url: str, base_domain: str, allowed_scope: str) -> bool:
    host, path = host_of(url), path_of(url)
    base = (base_domain or "").strip().lower()
    if not base:
        return False
    if not host_matches(host, base):
        return False
    scope = (allowed_scope or "").strip()
    if scope in ("", "*", "/"):
        return True
    prefixes = [s.strip() for s in scope.split(",") if s.strip()]
    return any(path.startswith(p) for p in prefixes)


def _review_expired(src: dict) -> str:
    nxt = (src.get("next_review_date") or "").strip()
    if not nxt:
        return ""
    try:
        due = time.strptime(nxt, "%Y-%m-%d")
    except ValueError:
        return ""
    if time.mktime(due) < time.time():
        return f"source review expired on {nxt} - re-review the terms before collecting"
    return ""


# ------------------------------------------------------------------ registry
class SourceRegistry:
    def __init__(self, sources_path=SOURCES_CSV, checks_path=CHECKS_CSV):
        self.sources_path = sources_path
        self.checks_path = checks_path
        self.sources = read_table(sources_path, SOURCE_COLUMNS)
        self.checks = read_table(checks_path, CHECK_COLUMNS)

    # ------------------------------------------------------------- lookups
    def get(self, source_id: str):
        sub = self.sources[self.sources["source_id"] == source_id]
        return None if sub.empty else sub.iloc[0].to_dict()

    def all(self) -> pd.DataFrame:
        return self.sources

    def delay_for(self, source_id: str) -> float:
        src = self.get(source_id) or {}
        try:
            delay = float(src.get("crawl_delay_s") or 0)
        except (TypeError, ValueError):
            delay = 0.0
        robots_delay = 0.0
        robots_url = (src.get("robots_url") or "").strip()
        if robots_url:
            info = check_robots(robots_url, f"https://{host_of(src.get('base_domain', ''))}/")
            robots_delay = float(info.get("crawl_delay") or 0)
        return max(delay, robots_delay)

    # ------------------------------------------------------------- writing
    def update_source(self, source_id: str, **fields):
        m = self.sources["source_id"] == source_id
        if not m.any():
            return False
        for key, value in fields.items():
            if key in self.sources.columns:
                self.sources.loc[m, key] = value
        write_table(self.sources_path, self.sources)
        return True

    def seed(self, force: bool = False) -> int:
        """Create the seed registry rows.  Fresh rows stay 'pending' review."""
        existing = set(self.sources["source_id"]) if not self.sources.empty else set()
        rows = []
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        for seed in SEED_SOURCES:
            if seed["source_id"] in existing and not force:
                continue
            row = {c: "" for c in SOURCE_COLUMNS}
            row.update(seed)
            row.setdefault("review_status", "pending")
            row["review_status"] = "pending" if not force else row.get("review_status", "pending")
            row["last_reviewed_at"] = ""
            row["next_review_date"] = ""
            row["reviewer"] = ""
            row["terms_conclusion"] = "pending"
            row["terms_checked_at"] = ""
            row["robots_checked_at"] = ""
            row["robots_rules"] = ""
            rows.append(row)
        if rows:
            self.sources = pd.concat(
                [self.sources, pd.DataFrame(rows)], ignore_index=True
            )[SOURCE_COLUMNS]
            write_table(self.sources_path, self.sources)
        return len(rows)

    # ------------------------------------------------------------- the gate
    def evaluate(self, source_id: str, target_url: str,
                 reviewer: str = "collector") -> Decision:
        """Run the compliance gate and record an audit row in compliance_checks.csv."""
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        decision, reason = REVIEW_REQUIRED, ""
        robots_status, robots_ok, robots_rules = "", "", ""

        src = self.get(source_id)
        manual_reason = _matches_manual_only(target_url)
        excluded_reason = _domain_excluded(target_url)

        if src is None:
            reason = f"source_id '{source_id}' not found in source registry."
        elif excluded_reason:
            decision, reason = EXCLUDED, excluded_reason
        elif manual_reason:
            decision, reason = MANUAL, manual_reason
        elif (src.get("allowed_mode") or "").upper() == EXCLUDED:
            decision, reason = EXCLUDED, "source registry marks this source as EXCLUDED."
        elif (src.get("allowed_mode") or "").upper() == MANUAL:
            # a human collects it: no automated-access approval is required,
            # but the source must still be registered and reviewed.
            decision, reason = MANUAL, "registry allows manual collection only for this source."
        elif (src.get("review_status") or "").lower() != "approved":
            reason = ("source review_status is not 'approved' "
                      f"(current: '{(src.get('review_status') or '').strip() or 'unset'}').")
        elif (src.get("terms_conclusion") or "").lower() != "permitted":
            reason = ("terms-of-use review is missing or not concluded as 'permitted' "
                      f"(current: '{(src.get('terms_conclusion') or '').strip() or 'unset'}').")
        elif _review_expired(src):
            reason = _review_expired(src)
        elif not _in_scope(target_url, src.get("base_domain", ""), src.get("allowed_scope", "")):
            reason = ("target URL is outside the reviewed allowed_scope for this source "
                      f"(host={host_of(target_url)}, path={path_of(target_url)}).")
        elif (src.get("allowed_mode") or "").upper() == AUTOMATED:
            info = check_robots(src.get("robots_url", ""), target_url)
            robots_status = info["status"]
            robots_ok = "yes" if info["can_fetch"] else "no"
            robots_rules = info.get("rules", "")
            if info.get("error"):
                reason = info["error"]
            elif not info["can_fetch"]:
                reason = "robots.txt disallows this target; do not automate. Resolve manually."
            else:
                decision = AUTOMATED
                reason = "automated collection permitted for this reviewed scope."
        else:
            reason = "allowed_mode is empty or unknown."

        check_id = f"CHK{len(self.checks) + 1:05d}"
        row = {
            "check_id": check_id, "source_id": source_id, "target_url": target_url,
            "checked_at": now, "robots_status": robots_status,
            "robots_can_fetch": robots_ok,
            "terms_conclusion": (src or {}).get("terms_conclusion", ""),
            "decision": decision, "reason": reason, "reviewer": reviewer,
        }
        self.checks = pd.concat([self.checks, pd.DataFrame([row])], ignore_index=True)[CHECK_COLUMNS]
        write_table(self.checks_path, self.checks)
        return Decision(decision, reason, check_id, robots_status, robots_ok, robots_rules)
