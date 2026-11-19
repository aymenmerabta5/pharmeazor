"""HTML reading for the ANSM product pages and generic HTML notices."""
import re
from pathlib import Path

from src.extraction.models import Block, Page, ParsedDocument
from src.extraction.text_utils import is_html_mojibake, json_dumps
from src.utils.encoding import read_text_auto


def _heading_level(node) -> int:
    for cls in node.get("class") or []:
        match = re.search(r"Titre(\d)$", cls, re.IGNORECASE)
        if match:
            return int(match.group(1))
    name = (node.name or "").lower()
    if re.fullmatch(r"h[1-6]", name):
        return int(name[1])
    return 1


def _table_rows(table) -> list[list[str]]:
    rows = []
    for tr in table.find_all("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
        if any(cells):
            rows.append(cells)
    return rows


def _content_blocks(node, page_number: int) -> list[Block]:
    blocks: list[Block] = []
    if getattr(node, "name", None) == "table":
        rows = _table_rows(node)
        if rows:
            blocks.append(Block(
                text="\n".join(" | ".join(row) for row in rows),
                page=page_number, kind="table", table_rows=rows,
                source="html_table",
            ))
        return blocks
    if getattr(node, "name", None) in ("script", "style", "noscript"):
        return blocks
    if getattr(node, "name", None) == "tr":
        cells = [cell.get_text(" ", strip=True)
                 for cell in node.find_all(["th", "td"])]
        if any(cells):
            blocks.append(Block(text=" | ".join(cells), page=page_number,
                                kind="table", table_rows=[cells],
                                source="html_table"))
        return blocks
    text = node.get_text(" ", strip=True) if getattr(node, "name", None) else str(node).strip()
    text = re.sub(r"\s+", " ", text).strip()
    if text:
        blocks.append(Block(text=text, page=page_number, kind="text",
                            source="html"))
    return blocks


def read_html(path: Path, heading_prefix: str = "") -> ParsedDocument:
    """Read an HTML document in document order.

    `heading_prefix` is ``AmmAnnexeTitre`` for an RCP and ``AmmNoticeTitre``
    for a patient notice on the ANSM pages.  Empty means generic h1-h6.
    """
    from bs4 import BeautifulSoup

    raw = read_text_auto(Path(path))
    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    if heading_prefix:
        headings = soup.find_all(class_=re.compile(r"^" + re.escape(heading_prefix)))
    else:
        headings = soup.find_all(re.compile(r"^h[1-6]$"))

    blocks: list[Block] = []
    if headings:
        # An ANSM product page can carry both the RCP (`AmmAnnexeTitre*`) and
        # the patient notice (`AmmNoticeTitre*`).  Never let the professional
        # reader walk into the notice, or the reverse.
        other_prefix = ""
        if heading_prefix.startswith("AmmAnnexeTitre"):
            other_prefix = "AmmNoticeTitre"
        for node in headings:
            title = re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()
            title = re.sub(r"\s*Redirection vers le haut de page.*$", "", title,
                           flags=re.IGNORECASE).strip()
            if not title:
                continue
            blocks.append(Block(
                text=title, page=1, kind="heading", level=_heading_level(node),
                heading_title=title, source="html_class",
            ))
            for sibling in node.next_siblings:
                if getattr(sibling, "name", None) is None:
                    text = str(sibling).strip()
                    if text:
                        blocks.append(Block(text=re.sub(r"\s+", " ", text),
                                            page=1, source="html"))
                    continue
                classes = sibling.get("class") or []
                if any(str(cls).startswith(heading_prefix) for cls in classes):
                    break
                if other_prefix and any(str(cls).startswith(other_prefix)
                                        for cls in classes):
                    break
                if sibling.name in ("script", "style", "noscript"):
                    continue
                blocks.extend(_content_blocks(sibling, 1))
    else:
        # generic HTML: headings and the text/table around them
        for node in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
            title = re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()
            if title:
                blocks.append(Block(text=title, page=1, kind="heading",
                                    level=_heading_level(node),
                                    heading_title=title, source="html_class"))
            for sibling in node.next_siblings:
                if getattr(sibling, "name", None) in ("h1", "h2", "h3", "h4", "h5", "h6"):
                    break
                if getattr(sibling, "name", None):
                    if sibling.name in ("script", "style", "noscript"):
                        continue
                    blocks.extend(_content_blocks(sibling, 1))

    full_text = soup.get_text("\n", strip=True)
    tables = [block.table_rows for block in blocks if block.kind == "table"]
    return ParsedDocument(
        path=str(path),
        suffix=path.suffix.lower(),
        pages=[Page(number=1, text=full_text, printed_label="", blocks=blocks)],
        page_type="HTML",
        encoding_warning="mojibake detected in the stored HTML" if is_html_mojibake(full_text) else "",
        tables=tables,
    )
