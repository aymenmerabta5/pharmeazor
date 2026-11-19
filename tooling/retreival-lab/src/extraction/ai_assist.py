"""Optional Gemini-assisted section recovery.

The AI stage is **opt-in and disabled by default**.  It only runs when the
operator has explicitly configured an approved model:

    PHARMEAZOR_GEMINI_MODEL=<approved-model-name>
    GEMINI_API_KEY=<key>            (or GOOGLE_API_KEY)

No model name is guessed or substituted.  The model is asked for a *quote*, not
for a summary, and every quote is located in the original document before it is
accepted.  A quote that cannot be found verbatim is discarded.  Accepted
passages are always marked ``AI_ASSISTED`` and ``review_required``.

The response is cached under ``data/.cache/extraction_ai`` keyed by the model,
the document hash and the section, so a re-run makes no new request.
"""
from dataclasses import dataclass
import hashlib
import json
import os
import re
from pathlib import Path

from src.extraction.text_utils import repair_for_match

DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta"
CACHE_DIR = Path("data") / ".cache" / "extraction_ai"

_SECTION_PROMPT = """You are extracting one section from a medicine document.
Return ONLY a JSON object, no markdown.

The document is reproduced below. Find the section whose heading means:
"{label}" (canonical key: {key}).

Rules:
1. Quote the section body EXACTLY as it appears, character for character.
   Never translate, summarise, correct spelling, normalise units or join
   separate passages with anything you wrote yourself.
2. Do not include the heading in the quote unless it is part of the body.
3. If the document does not contain the section, return:
   {{"found": false, "heading": "", "quote": "", "page_hint": null}}
4. If it does, return:
   {{"found": true, "heading": "<the original heading>", "quote": "<exact body>", "page_hint": <printed page number or null>}}
5. Never use medical knowledge from outside the document.

DOCUMENT:
{document}
"""


@dataclass
class AISuggestion:
    heading: str
    quote: str
    page_hint: int | None
    model: str
    cache_hit: bool = False


def settings() -> dict:
    """Read the explicit AI configuration from the environment (no defaults)."""
    model = (os.environ.get("PHARMEAZOR_GEMINI_MODEL") or "").strip()
    key = (os.environ.get("GEMINI_API_KEY")
           or os.environ.get("GOOGLE_API_KEY") or "").strip()
    endpoint = (os.environ.get("PHARMEAZOR_GEMINI_ENDPOINT")
                or DEFAULT_ENDPOINT).rstrip("/")
    return {"model": model, "api_key": key, "endpoint": endpoint,
            "configured": bool(model and key)}


def status() -> dict:
    config = settings()
    if not config["model"]:
        reason = "PHARMEAZOR_GEMINI_MODEL is not set"
    elif not config["api_key"]:
        reason = "GEMINI_API_KEY / GOOGLE_API_KEY is not set"
    else:
        reason = "configured"
    return {**config, "available": config["configured"], "reason": reason,
            "cache_dir": str(CACHE_DIR)}


def _cache_path(model: str, document_sha: str, section_key: str) -> Path:
    key = hashlib.sha256(
        f"{model}|{document_sha}|{section_key}".encode("utf-8")
    ).hexdigest()
    return CACHE_DIR / f"{key}.json"


def _read_cache(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_cache(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _parse_json(text: str) -> dict | None:
    value = (text or "").strip()
    value = re.sub(r"^```(?:json)?\s*", "", value)
    value = re.sub(r"\s*```$", "", value)
    try:
        parsed = json.loads(value)
    except ValueError:
        match = re.search(r"\{.*\}", value, re.S)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
        except ValueError:
            return None
    return parsed if isinstance(parsed, dict) else None


def locate_verbatim(quote: str, source_text: str) -> str:
    """Return the exact source slice matching ``quote`` (whitespace-flexible).

    An empty string means the quote is not present.  The returned text is the
    publisher's original wording, not the model's rendering of it.
    """
    quote = (quote or "").strip()
    if not quote or not source_text:
        return ""
    tokens = [token for token in re.split(r"\s+", quote) if token]
    if not tokens:
        return ""
    pattern = r"\s+".join(re.escape(token) for token in tokens)
    try:
        match = re.search(pattern, source_text, re.IGNORECASE)
    except re.error:
        return ""
    return match.group(0) if match else ""


def _request(model: str, api_key: str, endpoint: str, prompt: str) -> str:
    import requests

    url = f"{endpoint}/models/{model}:generateContent?key={api_key}"
    response = requests.post(
        url,
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        },
        timeout=180,
    )
    response.raise_for_status()
    payload = response.json()
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    parts = (candidates[0].get("content") or {}).get("parts") or []
    return "".join(part.get("text", "") for part in parts)


def assist_section(document_text: str, section_key: str, section_label: str,
                   document_id: str = "", document_sha: str = "",
                   use_cache: bool = True) -> AISuggestion | None:
    """Ask the configured model for one section and verify its quote.

    Returns ``None`` when AI is not configured, the section is not found, or
    the returned quote cannot be verified against the document.
    """
    config = settings()
    if not config["configured"]:
        return None
    document_sha = document_sha or hashlib.sha256(
        (document_text or "").encode("utf-8")).hexdigest()
    cache = _cache_path(config["model"], document_sha, section_key)
    cached = _read_cache(cache) if use_cache else None
    if cached is not None:
        if not cached.get("found"):
            return None
        quote = locate_verbatim(cached.get("quote", ""), document_text)
        if not quote:
            return None
        return AISuggestion(
            heading=locate_verbatim(cached.get("heading", ""), document_text),
            quote=quote,
            page_hint=cached.get("page_hint"),
            model=config["model"],
            cache_hit=True,
        )

    prompt = _SECTION_PROMPT.format(
        label=section_label, key=section_key,
        document=(document_text or "")[:600000],
    )
    try:
        raw = _request(config["model"], config["api_key"],
                       config["endpoint"], prompt)
    except Exception:
        return None
    parsed = _parse_json(raw)
    if parsed is None:
        return None

    found = bool(parsed.get("found"))
    quote = locate_verbatim(parsed.get("quote", ""), document_text) if found else ""
    heading = locate_verbatim(parsed.get("heading", ""), document_text) if found else ""
    page_hint = parsed.get("page_hint")
    try:
        page_hint = int(page_hint) if page_hint is not None else None
    except (TypeError, ValueError):
        page_hint = None

    _write_cache(cache, {
        "found": bool(found and quote),
        "heading": heading,
        "quote": quote,
        "page_hint": page_hint,
        "model": config["model"],
        "document_id": document_id,
        "section_key": section_key,
        "verified": bool(found and quote),
    })
    if not quote:
        return None
    return AISuggestion(heading=heading, quote=quote, page_hint=page_hint,
                        model=config["model"], cache_hit=False)


def ai_note(suggestion: AISuggestion) -> str:
    return (f"AI-assisted proposal ({suggestion.model}); the quote was verified "
            "verbatim against the source and still needs human confirmation")
