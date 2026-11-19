"""Playwright collector: used only where JavaScript or browser interaction is
genuinely needed (e.g. the ANPP RCP search).

The browser is driven by a small *recipe* (a list of steps) so that a source
adapter can describe its own search flow once and reuse it for every
medicine.  Every recipe step is a plain dict, so recipes can be stored in the
source registry / config instead of hard-coded in the collector.
"""
import hashlib
from pathlib import Path

from config import USER_AGENT, MAX_FILE_MB


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def run_recipe(url: str, recipe: list, dest_path: Path,
               timeout_ms: int = 60000) -> dict:
    """Execute a recipe and download the resulting document.

    Recipe steps:
      {"action": "fill",   "selector": "#query", "value": "enalapril"}
      {"action": "click",  "selector": "button:has-text('Rechercher')"}
      {"action": "press",  "key": "Enter"}
      {"action": "wait",   "ms": 3000}
      {"action": "collect","selector": "a[href]", "attr": "href",
       "text_contains": "enalapril"}          -> adds URLs to the result set
      {"action": "download","selector": "a[href$='.pdf']"} -> downloads the
                                                           first matching file
    """
    from playwright.sync_api import sync_playwright

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest_path.with_name(dest_path.name + ".part")
    found_urls: list = []
    search_results: dict = {}
    downloaded = False
    final_url = url
    status_code = 200
    content_type = ""
    wants_document = any(step.get("action") == "download" for step in (recipe or []))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            ctx = browser.new_context(user_agent=USER_AGENT, locale="fr-FR",
                                      accept_downloads=True)
            page = ctx.new_page()
            response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            if response is not None:
                status_code = response.status
                content_type = (response.headers or {}).get("content-type", "")
            final_url = page.url

            for step in recipe or []:
                action = step.get("action")
                if action == "fill":
                    page.fill(step["selector"], step.get("value", ""), timeout=timeout_ms)
                elif action == "type":
                    page.click(step["selector"])
                    page.type(step["selector"], step.get("value", ""),
                              delay=step.get("delay", 80))
                elif action == "search":
                    # several queries in one browser session: some registries
                    # index their names case-sensitively
                    button = step.get("button", "button[type='submit']")
                    for value in step.get("values", []):
                        page.fill(step["selector"], value, timeout=timeout_ms)
                        page.click(button, timeout=timeout_ms)
                        page.wait_for_timeout(step.get("wait", 3000))
                        hrefs = page.eval_on_selector_all(
                            step.get("link_selector", "a[href]"),
                            "els => els.map(e => ({h: e.getAttribute('%s'), t: (e.innerText||'').trim()}))"
                            % step.get("attr", "href"),
                        )
                        found = []
                        for item in hrefs:
                            value_href = item.get("h")
                            if value_href and value_href not in found:
                                found.append(value_href)
                                if value_href not in found_urls:
                                    found_urls.append(value_href)
                        search_results[value] = found
                elif action == "click":
                    page.click(step["selector"], timeout=timeout_ms)
                elif action == "press":
                    page.keyboard.press(step.get("key", "Enter"))
                elif action == "wait":
                    page.wait_for_timeout(step.get("ms", 2000))
                elif action == "collect":
                    hrefs = page.eval_on_selector_all(
                        step["selector"],
                        "els => els.map(e => ({h: e.getAttribute('%s'), t: (e.innerText||'').trim()}))"
                        % step.get("attr", "href"),
                    )
                    needle = (step.get("text_contains") or "").lower()
                    for item in hrefs:
                        value = item.get("h")
                        if not value:
                            continue
                        if needle and needle not in f"{item.get('t','')} {value}".lower():
                            continue
                        if value not in found_urls:
                            found_urls.append(value)
                elif action == "download":
                    with page.expect_download(timeout=timeout_ms) as dl:
                        page.click(step["selector"], timeout=timeout_ms)
                    download = dl.value
                    download.save_as(str(tmp))
                    downloaded = True
                    final_url = download.url if hasattr(download, "url") else final_url
                elif action == "screenshot":
                    page.screenshot(path=step["path"], full_page=True)

            if not downloaded:
                # the page itself is the document (e.g. a direct PDF URL)
                content = page.content()
                if content.startswith("%PDF"):
                    tmp.write_bytes(content.encode("latin-1", errors="ignore"))
                    downloaded = True
        finally:
            try:
                browser.close()
            except Exception:
                pass

    if not downloaded:
        if not wants_document:
            # discovery-only recipe: the interesting result is the link list
            return {
                "status_code": status_code,
                "content_type": content_type,
                "final_url": final_url,
                "file_size": 0,
                "sha256": "",
                "found_urls": found_urls,
                "search_results": search_results,
            }
        tmp.unlink(missing_ok=True)
        raise RuntimeError("recipe produced no document")

    size = tmp.stat().st_size
    if size > MAX_FILE_MB * 1024 * 1024:
        tmp.unlink(missing_ok=True)
        raise ValueError(f"file exceeds {MAX_FILE_MB} MB limit")
    tmp.replace(dest_path)

    return {
        "status_code": status_code,
        "content_type": content_type or "application/octet-stream",
        "final_url": final_url,
        "file_size": size,
        "sha256": _sha256(dest_path),
        "found_urls": found_urls,
        "search_results": search_results,
    }
