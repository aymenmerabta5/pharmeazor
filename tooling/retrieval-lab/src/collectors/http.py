"""Requests + BeautifulSoup collectors (static HTML and public direct file URLs)."""
import hashlib
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import (
    USER_AGENT, CONNECT_TIMEOUT, READ_TIMEOUT, MAX_RETRIES,
    BACKOFF_FACTOR, CHUNK_SIZE, MAX_FILE_MB, BLOCKED_STATUSES,
    MAX_LINKS_PER_PAGE,
)

FILE_EXTENSIONS = (".pdf", ".doc", ".docx", ".html", ".htm", ".txt", ".csv", ".zip")
DOC_EXTENSIONS = (".pdf", ".doc", ".docx", ".txt", ".csv")


def build_session() -> requests.Session:
    retry = Retry(
        total=MAX_RETRIES, connect=MAX_RETRIES, read=MAX_RETRIES, status=MAX_RETRIES,
        backoff_factor=BACKOFF_FACTOR,
        status_forcelist=(429, 500, 502, 503, 504),   # 401/403 are never retried
        allowed_methods=frozenset(["GET", "HEAD"]),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    s = requests.Session()
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_maxsize=4))
    s.mount("http://", HTTPAdapter(max_retries=retry, pool_maxsize=4))
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    })
    return s


def is_file_url(url: str) -> bool:
    path = (urlsplit(url).path or "").lower()
    return path.endswith(FILE_EXTENSIONS)


def content_type_of(url: str, session=None) -> str:
    """HEAD probe so extensionless download endpoints are classified correctly."""
    sess = session or build_session()
    try:
        r = sess.head(url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                      allow_redirects=True)
        ctype = (r.headers.get("Content-Type") or "").lower()
        return ctype.split(";")[0].strip()
    except Exception:
        return ""


def fetch_html(session, url: str) -> dict:
    r = session.get(url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), allow_redirects=True)
    if r.status_code in BLOCKED_STATUSES:
        raise RuntimeError(f"HTTP {r.status_code} - access denied, not retrying")
    r.raise_for_status()
    return {
        "status_code": r.status_code,
        "content_type": (r.headers.get("Content-Type") or "").split(";")[0].strip(),
        "final_url": r.url,
        "text": r.text,
    }


def find_document_links(html: str, base_url: str, patterns=(".pdf",),
                        max_links: int = MAX_LINKS_PER_PAGE) -> list:
    """Links to documents, same host only, capped so we never bulk-download."""
    from src.compliance.registry import host_of, host_matches

    soup = BeautifulSoup(html, "html.parser")
    base_host = host_of(base_url)
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("mailto:", "javascript:", "#")):
            continue
        url = urljoin(base_url, href)
        if url in seen:
            continue
        low = url.lower()
        if not any(p in low for p in patterns):
            continue
        if base_host and not host_matches(host_of(url), base_host):
            continue
        seen.add(url)
        out.append({
            "url": url,
            "text": a.get_text(" ", strip=True)[:160],
            "file_type": Path(urlsplit(url).path).suffix.lower().lstrip("."),
        })
        if len(out) >= max_links:
            break
    return out


def download_file(session, url: str, dest_path: Path) -> dict:
    """Stream to a .part file, then atomically rename.  Returns metadata."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest_path.with_name(dest_path.name + ".part")
    h = hashlib.sha256()
    size = 0
    try:
        with session.get(url, stream=True, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                         allow_redirects=True) as r:
            if r.status_code in BLOCKED_STATUSES:
                raise RuntimeError(f"HTTP {r.status_code} - access denied, not retrying")
            r.raise_for_status()
            content_type = (r.headers.get("Content-Type") or "").split(";")[0].strip()
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(CHUNK_SIZE):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > MAX_FILE_MB * 1024 * 1024:
                        raise ValueError(f"file exceeds {MAX_FILE_MB} MB limit")
                    h.update(chunk)
                    f.write(chunk)
            final_url = r.url
            status_code = r.status_code
        tmp.replace(dest_path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return {
        "status_code": status_code,
        "content_type": content_type,
        "final_url": final_url,
        "file_size": size,
        "sha256": h.hexdigest(),
    }
