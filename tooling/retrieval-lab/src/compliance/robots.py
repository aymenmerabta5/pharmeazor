"""robots.txt fetch + parse with caching.

NOTE: a positive robots.txt result is NOT legal permission; it never replaces
the human terms-of-use review recorded in sources.csv.  A missing or
unreachable robots.txt is treated as "not reviewed" (REVIEW_REQUIRED), never as
"allowed".
"""
import json
import time

import requests
from urllib.robotparser import RobotFileParser

from config import (
    ROBOTS_CACHE, ROBOTS_CACHE_TTL_H, USER_AGENT,
    CONNECT_TIMEOUT, READ_TIMEOUT,
)


def _load_cache() -> dict:
    if ROBOTS_CACHE.exists():
        try:
            return json.loads(ROBOTS_CACHE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_cache(cache: dict):
    ROBOTS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    ROBOTS_CACHE.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def _looks_like_html(text: str) -> bool:
    head = (text or "").lstrip()[:200].lower()
    return head.startswith("<!doctype html") or head.startswith("<html")


def summarize_rules(text: str) -> str:
    """Compact, human-readable summary of the rules that apply to our agent."""
    if not text:
        return "no robots.txt content"
    lines = []
    active = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            active = value in ("*",) or USER_AGENT.lower().startswith(value.lower())
        elif key in ("allow", "disallow") and active:
            if key == "disallow" and not value:
                # an empty Disallow means "nothing is disallowed"
                continue
            lines.append(f"{key}: {value or '/'}")
        elif key == "crawl-delay" and active:
            lines.append(f"crawl-delay: {value}")
    return "; ".join(lines) if lines else "no rules applying to our user-agent"


def parse_crawl_delay(text: str) -> float:
    if not text:
        return 0.0
    best = 0.0
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        key, _, value = line.partition(":")
        if key.strip().lower() == "crawl-delay":
            try:
                best = max(best, float(value.strip()))
            except ValueError:
                continue
    return best


def check_robots(robots_url: str, target_url: str) -> dict:
    """Returns {status, can_fetch, error, fetched_at, rules, crawl_delay}."""
    if not robots_url:
        return {
            "status": "no_robots_url", "can_fetch": False,
            "error": "no robots.txt recorded for this source - review required",
            "fetched_at": "", "rules": "", "crawl_delay": 0.0,
        }

    cache = _load_cache()
    entry = cache.get(robots_url)
    fresh = entry and (time.time() - entry.get("fetched_at_ts", 0)) < ROBOTS_CACHE_TTL_H * 3600

    if not fresh:
        try:
            r = requests.get(
                robots_url,
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                headers={"User-Agent": USER_AGENT},
                allow_redirects=True,
            )
            now = time.strftime("%Y-%m-%dT%H:%M:%S")
            if r.status_code == 200:
                text = r.text
                if _looks_like_html(text):
                    entry = {
                        "status": "no_robots_txt_html_response", "text": "",
                        "fetched_at_ts": time.time(), "fetched_at": now,
                    }
                else:
                    entry = {
                        "status": "http_200", "text": text,
                        "fetched_at_ts": time.time(), "fetched_at": now,
                    }
            elif r.status_code in (404, 410):
                entry = {
                    "status": f"http_{r.status_code}", "text": "",
                    "fetched_at_ts": time.time(), "fetched_at": now,
                }
            else:
                return {
                    "status": f"http_{r.status_code}", "can_fetch": False,
                    "error": "unexpected robots status - review required",
                    "fetched_at": now, "rules": "", "crawl_delay": 0.0,
                }
            cache[robots_url] = entry
            _save_cache(cache)
        except Exception as exc:
            return {
                "status": "fetch_error", "can_fetch": False,
                "error": f"robots.txt unreachable: {exc}",
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "rules": "", "crawl_delay": 0.0,
            }

    text = entry.get("text", "")
    rules = summarize_rules(text)
    delay = parse_crawl_delay(text)

    if entry["status"] in ("http_404", "http_410"):
        # No robots.txt published: nothing is disallowed, but a human still has
        # to record the terms-of-use review before we automate.
        return {
            "status": entry["status"], "can_fetch": True, "error": "",
            "fetched_at": entry["fetched_at"], "rules": rules, "crawl_delay": delay,
        }
    if entry["status"] == "no_robots_txt_html_response":
        return {
            "status": entry["status"], "can_fetch": True, "error": "",
            "fetched_at": entry["fetched_at"], "rules": rules, "crawl_delay": delay,
        }

    rp = RobotFileParser()
    rp.parse(text.splitlines())
    try:
        allowed = rp.can_fetch(USER_AGENT, target_url)
    except Exception as exc:
        return {
            "status": entry["status"], "can_fetch": False,
            "error": f"robots parse error: {exc}",
            "fetched_at": entry["fetched_at"], "rules": rules, "crawl_delay": delay,
        }

    return {
        "status": entry["status"], "can_fetch": allowed, "error": "",
        "fetched_at": entry["fetched_at"], "rules": rules, "crawl_delay": delay,
    }
