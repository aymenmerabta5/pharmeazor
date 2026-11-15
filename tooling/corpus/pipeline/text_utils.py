"""Small, dependency-light text utilities shared by every extractor."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import date, datetime
from typing import Any

# Characters that PDF/HTML sources use for the same thing.
_DASHES = dict.fromkeys(map(ord, "\u2010\u2011\u2012\u2013\u2014\u2015\u2212"), "-")
_QUOTES = {
    ord("\u2018"): "'",
    ord("\u2019"): "'",
    ord("\u201a"): "'",
    ord("\u201b"): "'",
    ord("\u201c"): '"',
    ord("\u201d"): '"',
    ord("\u201e"): '"',
    ord("\u201f"): '"',
}
_SPACES = dict.fromkeys(map(ord, "\u00a0\u2007\u2009\u200a\u202f"), " ")
_ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)

_BULLET_RE = re.compile(r"^(?:[•·▪◦‣∙]|[-–—])\s+")
_NUMBERED_LIST_RE = re.compile(r"^\d{1,3}[.)]\s+\S")
_DOT_LEADER_RE = re.compile(r"\.{4,}\s*\d*\s*$")
_PAGE_NUMBER_RE = re.compile(
    r"^(?:page\s*)?\d{1,4}(?:\s*(?:/|of|sur)\s*\d{1,4})?$", re.IGNORECASE
)
_RUNNING_RE = re.compile(
    r"^(?:reference\s*id|ref(?:erence)?\s*(?:id|no)|lot|batch)\s*[:#]?\s*\w+$",
    re.IGNORECASE,
)


def fix_mojibake(text: str) -> str:
    """Repair UTF-8 text that was decoded as Latin-1 by an upstream collector.

    The source CSV contains a few ``Base de DonnÃ©es`` titles. Applying the
    inverse transform only when the tell-tale sequences are present keeps
    legitimate French text (which can contain ``Ã`` in uppercase) untouched.
    """
    if not text:
        return text
    text = str(text)
    hints = ("Ã©", "Ã¨", "Ãª", "Ã ", "Ã§", "Ã»", "Ã®", "Ã´", "â€™", "â€œ", "â€“")
    if any(h in text for h in hints):
        try:
            text = text.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return text


def normalize_unicode(text: str) -> str:
    """Normalize typography while preserving the meaning of clinical text."""
    if not text:
        return ""
    text = fix_mojibake(text)
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_SPACES).translate(_ZERO_WIDTH)
    text = text.replace("\u00ad", "")  # soft hyphen
    text = text.replace("\u2026", "...")
    text = text.translate(_DASHES).translate(_QUOTES)
    # Control characters except newline/tab.
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    return text


def clean_inline(text: str) -> str:
    """One logical line: no leading/trailing space, no repeated spaces."""
    text = normalize_unicode(text)
    text = text.replace("\t", " ")
    text = re.sub(r"[ ]{2,}", " ", text)
    return text.strip(" \r\n")


def clean_paragraph(text: str) -> str:
    """A paragraph may keep internal newlines, but they become soft breaks."""
    text = normalize_unicode(text)
    lines = [clean_inline(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    return " ".join(lines)


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def normalize_key(text: str) -> str:
    """Aggressive key used for matching headings and medicine names."""
    if text is None:
        return ""
    text = str(text)
    if text.strip().lower() in {"nan", "none", "nat"}:
        return ""
    text = fix_mojibake(text)
    text = strip_accents(text).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def word_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", normalize_key(text))


def is_bullet(line: str) -> bool:
    return bool(_BULLET_RE.match(line) or _NUMBERED_LIST_RE.match(line))


def strip_bullet(line: str) -> str:
    return _BULLET_RE.sub("", line, count=1).strip()


def is_page_number(line: str) -> bool:
    return bool(_PAGE_NUMBER_RE.match(line.strip()))


def is_running_header(line: str) -> bool:
    return bool(_RUNNING_RE.match(line.strip()))


def is_dot_leader(line: str) -> bool:
    return bool(_DOT_LEADER_RE.search(line.strip()))


def dehyphenate_join(left: str, right: str) -> str:
    """Join two hard-wrapped lines, undoing PDF end-of-line hyphenation."""
    left = left.rstrip()
    right = right.lstrip()
    if not left:
        return right
    if not right:
        return left
    if left.endswith("-") and right[:1].islower():
        return left[:-1] + right
    return f"{left} {right}"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: str, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def stable_id(*parts: Any) -> str:
    payload = "|".join(str(part) for part in parts)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d %B %Y",
    "%d %b %Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%B %Y",
    "%b %Y",
    "%Y",
)


def normalize_date(value: Any, *, dayfirst: bool = True) -> str | None:
    """Return an ISO date (YYYY-MM-DD) or None. Never guesses wildly."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = clean_inline(str(value))
    if not text or text.lower() in {"nan", "none", "nat", "n/a", "na"}:
        return None
    text = text.replace("Sept", "Sep")
    # Strip a time component after a T or a space.
    iso_candidate = text.split("T")[0].strip()
    for candidate in (iso_candidate, text):
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(candidate, fmt).date().isoformat()
            except ValueError:
                continue
    # DD/MM/YYYY with a trailing time.
    match = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", text)
    if match:
        day, month, year = (int(part) for part in match.groups())
        if dayfirst:
            try:
                return date(year, month, day).isoformat()
            except ValueError:
                pass
        try:
            return date(year, day, month).isoformat()
        except ValueError:
            return None
    return None
