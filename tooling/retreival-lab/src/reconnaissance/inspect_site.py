"""Playwright reconnaissance only.  Never a mandatory first step per document.

The compliance gate must allow inspection before this module is used: the
recon command evaluates the target URL first and refuses to open a browser
unless the decision is AUTOMATED.
"""
import json
from datetime import datetime
from urllib.parse import urljoin

from config import USER_AGENT, RECON_DIR


def recon(url: str, source_id: str, headless: bool = True, timeout_ms: int = 45000) -> dict:
    from playwright.sync_api import sync_playwright

    RECON_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = RECON_DIR / f"{source_id}_{stamp}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        try:
            ctx = browser.new_context(user_agent=USER_AGENT, locale="fr-FR")
            page = ctx.new_page()
            response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass

            links = page.eval_on_selector_all(
                "a[href]",
                "els => els.map(e => ({text: (e.innerText||'').trim().slice(0,120), href: e.href}))",
            )
            inputs = page.eval_on_selector_all(
                "input, select, button",
                "els => els.map(e => ({tag: e.tagName, type: e.type||'', name: e.name||'', id: e.id||'', text: (e.innerText||'').trim().slice(0,60)}))",
            )
            note = {
                "source_id": source_id,
                "entry_url": url,
                "final_url": page.url,
                "status_code": response.status if response else None,
                "title": page.title(),
                "captured_at": datetime.now().isoformat(timespec="seconds"),
                "document_links": [l for l in links
                                   if any(k in l["href"].lower() for k in (".pdf", "/download/"))][:200],
                "all_links_sample": links[:200],
                "form_controls": inputs[:60],
                "screenshot": str(base.with_suffix(".png")),
                "recommended_method": "",
                "observed_restrictions": "",
                "notes": "",
            }
            page.screenshot(path=str(base.with_suffix(".png")), full_page=True)
            ctx.close()
        finally:
            try:
                browser.close()
            except Exception:
                pass

    out = base.with_suffix(".json")
    out.write_text(json.dumps(note, indent=2, ensure_ascii=False), encoding="utf-8")
    return note
