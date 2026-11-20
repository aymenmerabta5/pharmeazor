"""Format-aware extraction of the three real source shapes in the corpus.

Nothing here writes to the raw corpus. Each extractor returns structured
``Block`` objects; rendering to Markdown happens once, in ``render_markdown``.
That separation is what lets the same section taxonomy serve PDF, HTML and
derived documents.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf
from bs4 import BeautifulSoup, Tag

from .sections import (
    KEY_CODES,
    classify_heading,
    heading_depth,
    heading_title,
    is_dose_line,
    is_orphan_number,
    is_toc_line,
)
from .text_utils import (
    clean_inline,
    clean_paragraph,
    dehyphenate_join,
    is_bullet,
    is_page_number,
    is_running_header,
    normalize_key,
    strip_bullet,
)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Block:
    kind: str  # heading | para | bullet | table
    text: str
    level: int = 0
    code: str = "other"
    raw_heading: str = ""


@dataclass
class ExtractedPart:
    part_id: str
    title: str
    blocks: list[Block]
    method: str
    text_revision_date: str | None = None
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_GENERIC_TITLE_HEADINGS = {
    "other information",
    "questions or comments",
    "principal display panel",
    "package description",
    "product information",
    "drug facts",
}

_GENERIC_UPPER_HEADINGS = {
    "BOXED WARNING",
    "WARNING",
    "HOW SUPPLIED",
    "LABORATORY TESTS",
    "DRUG ABUSE",
    "LABOR AND DELIVERY",
    "NURSING MOTHERS",
    "PEDIATRIC USE",
    "GERIATRIC USE",
    "TERATOGENIC EFFECTS",
    "NONTERATOGENIC EFFECTS",
    "CARCINOGENESIS MUTAGENESIS IMPAIRMENT OF FERTILITY",
    "CLINICAL STUDIES",
    "ANIMAL PHARMACOLOGY",
    "CLINICAL PHARMACOLOGY",
    "DESCRIPTION",
    "CONTRAINDICATIONS",
    "PRECAUTIONS",
    "ADVERSE REACTIONS",
    "OVERDOSAGE",
    "DOSAGE AND ADMINISTRATION",
    "INDICATIONS AND USAGE",
    "PATIENT COUNSELING INFORMATION",
    "MEDICATION GUIDE",
}

_BOILERPLATE_RE = re.compile(
    r"^(?:redirection vers le haut de page|retour aux r[eé]sultats|imprimer|"
    r"aller au glossaire|cliquez ici|ouvrir la page de d[eé]tail|haut de page|"
    r"partager|copier le lien|sommaire|table des mati[eè]res|"
    r"derni[eè]re mise [aà] jour le .*)$",
    re.IGNORECASE,
)
_HYPHEN_ONLY_RE = re.compile(r"^[-–—_=*.\s]+$")
_TABLE_LINE_RE = re.compile(r"^\s*\|.*\|\s*$")


def _is_upper_heading(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if len(letters) < 3:
        return False
    upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
    if upper_ratio < 0.85:
        return False
    if len(text) > 110 or text[-1] in ".,;":
        return False
    if text.count("|") >= 2:
        return False
    key = normalize_key(text)
    if key in _GENERIC_UPPER_HEADINGS:
        return True
    if key.startswith("warning "):
        return True
    return classify_heading(text) != "other"


def _heading_candidate(text: str) -> tuple[bool, int, str, str]:
    """Return ``(is_heading, level, canonical_code, display_text)``."""
    candidate = clean_inline(text)
    if not candidate or len(candidate) > 170:
        return False, 0, "other", candidate
    if _TABLE_LINE_RE.match(candidate):
        return False, 0, "other", candidate
    # Body references such as "WARNINGS).", "PRECAUTIONS)," and
    # "pregnancy." are not headings.
    if candidate.endswith((".", ",", ";")) or (
        candidate.endswith(")") and len(candidate) > 20
    ):
        return False, 0, "other", candidate
    if candidate.rstrip().endswith((" and", " or")):
        return False, 0, "other", candidate
    # A wrapped body sentence such as "CLINICAL PHARMACOLOGY (12.3),
    # CLINICAL STUDIES (14.1), and WARNINGS AND" is not a heading.
    if len(candidate) > 40 and re.search(r"\(\d+(?:\.\d+)?\)", candidate):
        return False, 0, "other", candidate
    if is_dose_line(candidate) and classify_heading(candidate) == "other":
        return False, 0, "other", candidate

    code = classify_heading(candidate)
    depth = heading_depth(candidate)
    _, _, numbered_title = _split_number(candidate)
    if depth >= 2 and numbered_title and not numbered_title[0].isalpha():
        return False, 0, "other", candidate
    if code != "other":
        return True, max(1, depth), code, heading_title(candidate)
    if _is_upper_heading(candidate):
        return True, 1, "other", heading_title(candidate)
    if normalize_key(candidate) in _GENERIC_TITLE_HEADINGS:
        return True, 1, "other", heading_title(candidate)
    # Modern PLR subsection: "5.1 Fetal Toxicity".  A numbered top-level line
    # is only accepted when it maps to a known section, otherwise "1. Take one
    # tablet" would become a heading.
    if depth >= 2 and len(candidate) <= 130 and candidate[-1] not in ".,;:":
        if numbered_title and numbered_title[0].isalpha() and len(numbered_title.split()) >= 2:
            return True, depth, "other", heading_title(candidate)
    return False, 0, "other", candidate


def _split_number(text: str) -> tuple[str, int, str]:
    from .sections import strip_heading_number

    return strip_heading_number(text)


def _drop_noise_line(line: str) -> bool:
    line = clean_inline(line)
    if not line:
        return False
    if is_page_number(line) or is_running_header(line):
        return True
    if _BOILERPLATE_RE.match(line):
        return True
    if _HYPHEN_ONLY_RE.match(line):
        return True
    if is_toc_line(line):
        return True
    if line.lower().startswith("sections or subsections omitted"):
        return True
    if re.match(
        r"^annexe\s+[ivx\d]+\s*[-–—:]?\s*r[eé]sum[eé]\s+des\s+caract[eé]ristiques",
        line,
        re.IGNORECASE,
    ):
        return True
    return False


def _flush_paragraph(buffer: list[str], blocks: list[Block]) -> None:
    if not buffer:
        return
    text = clean_paragraph(" ".join(buffer))
    if text:
        blocks.append(Block("para", text))
    buffer.clear()


def _strip_running_lines(pages: list[list[str]]) -> tuple[list[list[str]], int]:
    """Remove running headers/footers and page numbers from PDF pages."""
    if len(pages) < 2:
        return pages, 0
    counts: Counter[str] = Counter()
    for page in pages:
        for line in {clean_inline(item) for item in page if clean_inline(item)}:
            if len(line) <= 120:
                counts[line] += 1
    threshold = max(2, int(len(pages) * 0.4 + 0.5))
    repeated = {
        line
        for line, count in counts.items()
        if count >= threshold
        and len(line) <= 120
        and classify_heading(line) == "other"
        and not _is_upper_heading(line)
    }
    repeated_patterns = {re.sub(r"\d+", "#", line) for line in repeated}
    cleaned: list[list[str]] = []
    removed = 0
    for page_index, page in enumerate(pages):
        kept: list[str] = []
        for line in page:
            line = clean_inline(line)
            if not line:
                continue
            # Keep running headers on the first page: this is where the
            # product name/strength/form live in many ANPP PDFs. Removing them
            # everywhere was erasing the only copy of the commercial title.
            if page_index > 0 and (
                line in repeated or re.sub(r"\d+", "#", line) in repeated_patterns
            ):
                removed += 1
                continue
            if _drop_noise_line(line):
                removed += 1
                continue
            kept.append(line)
        cleaned.append(kept)
    return cleaned, removed


def _daily_med_body_start(lines: list[str]) -> list[str]:
    """Drop the DailyMed highlights summary and the full-PI contents block.

    A modern label is ``HIGHLIGHTS`` (summary) followed by
    ``FULL PRESCRIBING INFORMATION: CONTENTS*`` (a section list) then the real
    full PI.  Slicing at the first ``FULL PRESCRIBING INFORMATION`` match is
    wrong because it hits the contents header and leaves the table of contents
    behind, whose all-caps entries then look like duplicate sections.
    """
    upper = [line.upper().strip() for line in lines]
    contents = next(
        (
            i
            for i, line in enumerate(upper)
            if "FULL PRESCRIBING INFORMATION" in line and "CONTENTS" in line
        ),
        None,
    )
    if contents is not None:
        for i in range(contents + 1, len(lines)):
            if upper[i] == "FULL PRESCRIBING INFORMATION":
                return lines[i + 1 :]
        for i in range(contents + 1, len(lines)):
            if re.match(r"^1\s+INDICATIONS", lines[i].strip(), re.IGNORECASE):
                return lines[i:]
    full = next(
        (i for i, line in enumerate(upper) if line == "FULL PRESCRIBING INFORMATION"),
        None,
    )
    if full is not None:
        return lines[full + 1 :]
    highlights = next(
        (i for i, line in enumerate(upper) if "HIGHLIGHTS OF PRESCRIBING INFORMATION" in line),
        None,
    )
    if highlights is not None:
        for i in range(highlights, min(highlights + 160, len(lines))):
            if re.match(r"^1\s+INDICATIONS", lines[i].strip(), re.IGNORECASE):
                return lines[i:]
    return lines


def _daily_med_body_end(lines: list[str], *, has_full_pi: bool) -> list[str]:
    """Cut the packaging/display-panel tail from a DailyMed PDF.

    The tail repeats the same drug-facts text across dozens of package images
    ("Product Information", "Inactive Ingredients", "Package Description").
    It is not prescribing information and creates empty, duplicate sections.
    OTC drug-facts labels keep their "Uses"/"Directions" before the principal
    display panel, so the aggressive active-ingredient cut is only safe for
    full prescribing information documents.
    """
    for index, line in enumerate(lines):
        if index < 40:
            continue
        upper = line.strip().upper()
        if upper in {"PACKAGE DESCRIPTION", "PRINCIPAL DISPLAY PANEL"}:
            return lines[:index]
        if has_full_pi and index > 100 and (
            upper.startswith("PRODUCT INFORMATION")
            or upper.startswith("ACTIVE INGREDIENTS:")
            or upper.startswith("INACTIVE INGREDIENTS:")
        ):
            return lines[:index]
    return lines


def _pdf_blocks(pages: list[list[str]], source_id: str) -> tuple[list[Block], int]:
    pages, removed = _strip_running_lines(pages)
    lines: list[str] = []
    for page in pages:
        lines.extend(page)
        lines.append("")
    if source_id == "DAILYMED":
        has_full_pi = any(
            line.strip().upper() == "FULL PRESCRIBING INFORMATION" for line in lines[:500]
        )
        lines = _daily_med_body_start(lines)
        lines = _daily_med_body_end(lines, has_full_pi=has_full_pi)

    blocks: list[Block] = []
    paragraph: list[str] = []
    current_bullet: list[str] | None = None
    current_level = 0

    def flush_bullet() -> None:
        nonlocal current_bullet
        if current_bullet:
            text = strip_bullet(clean_inline(" ".join(current_bullet)))
            if text:
                blocks.append(Block("bullet", text))
        current_bullet = None

    i = 0
    while i < len(lines):
        raw = clean_inline(lines[i])
        i += 1
        if not raw:
            _flush_paragraph(paragraph, blocks)
            flush_bullet()
            continue
        if _drop_noise_line(raw):
            continue

        # Headings split by a page break: "4.1-" then the title on the next line.
        combined = raw
        if is_orphan_number(raw):
            lookahead = i
            while lookahead < len(lines) and not clean_inline(lines[lookahead]):
                lookahead += 1
            if lookahead < len(lines):
                next_line = clean_inline(lines[lookahead])
                if next_line and len(next_line) <= 120 and not is_bullet(next_line):
                    combined = f"{raw} {next_line}"
                    i = lookahead + 1

        is_heading, level, code, display = _heading_candidate(combined)
        if is_heading:
            _flush_paragraph(paragraph, blocks)
            flush_bullet()
            if source_id == "ANPP_RCP" and heading_depth(combined) == 0:
                # "Posologie" inside "4.2 Posologie et mode d'administration"
                # is a subsection, not a new top-level section.
                level = min(4, current_level + 1) if current_level else 1
            current_level = level
            if not blocks or blocks[-1].kind != "heading" or blocks[-1].text != display:
                blocks.append(Block("heading", display, level=level, code=code, raw_heading=combined))
            continue

        if is_bullet(raw):
            _flush_paragraph(paragraph, blocks)
            flush_bullet()
            current_bullet = [raw]
            continue
        if current_bullet is not None:
            current_bullet.append(raw)
            if len(" ".join(current_bullet)) > 600:
                flush_bullet()
            continue
        paragraph.append(raw)
        if len(" ".join(paragraph)) > 1300:
            _flush_paragraph(paragraph, blocks)

    _flush_paragraph(paragraph, blocks)
    flush_bullet()
    return blocks, removed


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


def _clean_title(text: str) -> str:
    text = clean_inline(text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*[-–—]\s*$", "", text)
    return text[:220]


def _anpp_title(blocks: list[Block], fallback: str, brand: str, strength: str) -> str:
    for index, block in enumerate(blocks):
        if block.kind != "heading" or block.code != "denomination":
            continue
        start_level = block.level
        pieces: list[str] = []
        for follow in blocks[index + 1 : index + 30]:
            if follow.kind == "heading":
                # A new top-level section (2. Composition) ends the title block.
                if follow.level <= start_level and follow.code != "denomination":
                    break
                continue
            text = clean_inline(follow.text)
            if not text:
                continue
            # The PDF glues "1-1 Dénomination commerciale ... : <product>
            # <strength> <form> 1-2 Dénomination commune ... : <DCI>" into one
            # paragraph. Strip the leading subheading and cut at the next one.
            text = re.sub(
                r"^\d+\s*[-.]\s*\d+\s+D[ée]nomination[^:]*:\s*",
                "",
                text,
                flags=re.IGNORECASE,
            )
            text = re.split(
                r"\s+\d+\s*[-.]\s*\d+\s+D[ée]nomination", text, maxsplit=1
            )[0]
            text = clean_inline(text)
            if not text or len(text) > 400:
                continue
            # The 1.1/1.2 subheadings are not the product name, and a DCI
            # line ("Ciprofloxacine.") is not either.
            if re.match(r"^\d+\s*[-.]\s*\d+", text):
                continue
            if "denomination" in normalize_key(text):
                continue
            if text.lower().startswith(("la substance active", "les excipients", "paracetamol ....")):
                continue
            pieces.append(text)
            if len(pieces) >= 3 or re.search(
                r"(comprim|g[eé]lule|sirop|solution|poudre|cr[eè]me|suppositoire|ampoule)",
                text,
                re.I,
            ):
                break
        if pieces:
            return _clean_title(" — ".join(pieces))
    if brand and brand.lower() not in {"nan", "none"}:
        return _clean_title(f"{brand} {strength or ''}".strip())
    return _clean_title(fallback or "Document sans titre")


def _daily_med_title(fallback: str) -> str:
    title = _clean_title(fallback)
    if " [" in title:
        title = title.split(" [", 1)[0]
    if " - " in title:
        title = title.split(" - ", 1)[0]
    return _clean_title(title or "Document sans titre")


def extract_pdf(
    path: Path,
    *,
    source_id: str,
    language: str,
    fallback_title: str = "",
    brand: str = "",
    strength: str = "",
) -> ExtractedPart:
    document = pymupdf.open(path)
    pages: list[list[str]] = []
    total_chars = 0
    for page in document:
        text = page.get_text("text")
        total_chars += len(text)
        pages.append(text.splitlines())
    page_count = max(1, document.page_count)
    blocks, removed = _pdf_blocks(pages, source_id)
    warnings: list[str] = []
    if total_chars / page_count < 200:
        warnings.append(
            f"low_text_density:{total_chars / page_count:.0f}_chars_per_page; OCR may be required"
        )
    if source_id == "ANPP_RCP":
        title = _anpp_title(blocks, fallback_title, brand, strength)
        part_id = "smpc"
    else:
        title = _daily_med_title(fallback_title)
        part_id = "label"
    return ExtractedPart(
        part_id=part_id,
        title=title,
        blocks=blocks,
        method="pymupdf:text",
        warnings=warnings + ([f"removed_{removed}_running_lines"] if removed else []),
    )


# ---------------------------------------------------------------------------
# BDPM HTML
# ---------------------------------------------------------------------------

_SKIP_ANCESTORS = {
    "fr-sidemenu",
    "fr-collapse",
    "fr-no-print",
    "fr-tooltip",
    "fr-modal",
    "script",
    "style",
    "noscript",
    "button",
}

_HEADING_CLASS_RE = re.compile(r"Amm(?:Annexe|Notice)Titre(?P<level>\d?)$")
_BULLET_CLASS_RE = re.compile(r"(?:ListePuces|Liste[A-Za-z]*Puces)")
_BODY_CLASS_RE = re.compile(
    r"^(?:AmmCorpsTexte|AmmComposition|AmmNoticeTexte|AmmNoticeAdresse|AmmNoticeInformation|AmmNotice)"
)


def _has_skipped_ancestor(tag: Tag) -> bool:
    for parent in tag.parents:
        if parent.name in {"script", "style", "noscript", "button"}:
            return True
        classes = set(parent.get("class") or [])
        if classes & _SKIP_ANCESTORS:
            return True
    return False


def _fix_dropcaps(text: str) -> str:
    """Repair BDPM's decorative drop caps: ``C hez`` -> ``Chez``."""
    return re.sub(r"^([A-ZÀ-Ý]) (?=[a-zà-ÿ])", r"\1", clean_inline(text))


def _cell_text(cell: Tag) -> str:
    text = _fix_dropcaps(cell.get_text(" ", strip=True))
    return clean_inline(text).replace("|", "\\|")


def table_to_markdown(table: Tag) -> str:
    rows: list[list[str]] = []
    for row in table.find_all("tr"):
        cells = [_cell_text(cell) for cell in row.find_all(["th", "td"], recursive=False)]
        if not any(cells):
            continue
        rows.append(cells)
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    if width == 1:
        return "\n".join(f"- {row[0]}" for row in rows if row[0])
    header = rows[0]
    if not any(header):
        header = [f"Colonne {i + 1}" for i in range(width)]
        body = rows
    else:
        body = rows[1:]
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in body)
    return "\n".join(lines)


def _html_blocks(panel: Tag) -> tuple[list[Block], str | None]:
    blocks: list[Block] = []
    revision: str | None = None
    for element in panel.find_all(["p", "table"], recursive=True):
        if _has_skipped_ancestor(element):
            continue
        if element.name == "p" and element.find_parent("table") is not None:
            continue
        if element.name == "table":
            markdown = table_to_markdown(element)
            if markdown:
                blocks.append(Block("table", markdown))
            continue

        classes = [str(item) for item in (element.get("class") or [])]
        text = element.get_text(" ", strip=True)
        text = clean_inline(re.sub(r"Redirection vers le haut de page", "", text, flags=re.I))
        text = _fix_dropcaps(text)
        if not text:
            continue
        if "DateNotif" in classes:
            revision = text
            continue
        if text.lower().startswith("dernière mise à jour le"):
            continue
        heading_match = next((_HEADING_CLASS_RE.match(cls) for cls in classes if _HEADING_CLASS_RE.match(cls)), None)
        if heading_match:
            # AmmAnnexeTitre4 is also used for long emphasised paragraphs.
            # Those are body text, not headings.
            if len(text) > 120 or text.endswith((".", ",", ";")):
                blocks.append(Block("para", clean_paragraph(text)))
                continue
            level = int(heading_match.group("level") or 1)
            code = classify_heading(text)
            display = heading_title(text)
            if not blocks or blocks[-1].kind != "heading" or blocks[-1].text != display:
                blocks.append(Block("heading", display, level=level, code=code, raw_heading=text))
            continue
        # BDPM uses bold paragraphs (not heading tags) for leaflet
        # subheadings such as "Ne prenez jamais", "Autres médicaments" and
        # "Grossesse et allaitement". Some are plain AmmCorpsTexte, so match
        # the strong section-start patterns as well as the bold class.
        if len(text) <= 220 and not text.endswith("."):
            code = classify_heading(text)
            key = normalize_key(text)
            if code != "other" and (
                any("Gras" in cls for cls in classes)
                or re.match(
                    r"^(ne prenez jamais|faites attention|autres medicaments|"
                    r"prise d autres medicaments|grossesse et allaitement|"
                    r"conduite de vehicules|declaration des effets|"
                    r"avertissements et precautions)\b",
                    key,
                )
            ):
                display = heading_title(text)
                if not blocks or blocks[-1].kind != "heading" or blocks[-1].text != display:
                    blocks.append(Block("heading", display, level=3, code=code, raw_heading=text))
                continue
        if any(_BULLET_CLASS_RE.search(cls) for cls in classes) or element.name == "li":
            for line in text.splitlines():
                line = strip_bullet(clean_inline(line))
                if line:
                    blocks.append(Block("bullet", line))
            continue
        if any(_BODY_CLASS_RE.match(cls) for cls in classes) or not classes:
            blocks.append(Block("para", clean_paragraph(text)))
    return blocks, revision


def extract_bdpm_html(path: Path) -> list[ExtractedPart]:
    soup = BeautifulSoup(path.read_bytes().decode("utf-8", errors="replace"), "lxml")
    product_title = ""
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5"]):
        text = clean_inline(heading.get_text(" ", strip=True))
        if text and "Base de Données" not in text and "Paramètres d" not in text:
            product_title = text
            break
    if not product_title and soup.title:
        product_title = clean_inline(soup.title.get_text(" ", strip=True))

    parts: list[ExtractedPart] = []
    rcp = soup.find(id="tabpanel-rcp-panel")
    notice = soup.find(id="tabpanel-notice-panel")
    fiche = soup.find(id="tabpanel-fiche-info-panel")

    if rcp:
        blocks, revision = _html_blocks(rcp)
        if blocks:
            parts.append(
                ExtractedPart(
                    part_id="rcp",
                    title=_clean_title(product_title),
                    blocks=blocks,
                    method="bdpm:html:rcp",
                    text_revision_date=revision,
                )
            )
    if notice:
        blocks, _ = _html_blocks(notice)
        if blocks:
            parts.append(
                ExtractedPart(
                    part_id="notice",
                    title=_clean_title(f"{product_title} — Notice patient"),
                    blocks=blocks,
                    method="bdpm:html:notice",
                )
            )
    if not parts and fiche:
        blocks, _ = _html_blocks(fiche)
        if blocks:
            parts.append(
                ExtractedPart(
                    part_id="fiche_info",
                    title=_clean_title(product_title),
                    blocks=blocks,
                    method="bdpm:html:fiche_info",
                    warnings=["rcp_and_notice_panels_missing; used fiche info summary"],
                )
            )
    return parts


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------

_HEADING_LINE_RE = re.compile(r"^(#{2,5})\s+(.*)$")


def _prune_empty_headings(blocks: list[Block]) -> list[Block]:
    """Remove headings that have neither body text nor a child section.

    BDPM templates emit ``11. DOSIMETRIE`` for every product, even when the
    section is empty. Those headings would become empty chunks.
    """
    pruned = list(blocks)
    changed = True
    while changed:
        changed = False
        for index, block in enumerate(pruned):
            if block.kind != "heading":
                continue
            # Never remove a clinically required heading. Some PDFs (especially
            # OTC drug-facts labels) place the section text out of order, so an
            # apparently empty "Uses" is still a real section marker.
            if block.code in KEY_CODES:
                continue
            cursor = index + 1
            has_body = False
            while cursor < len(pruned) and pruned[cursor].kind != "heading":
                if pruned[cursor].text.strip():
                    has_body = True
                cursor += 1
            if not has_body and (
                cursor >= len(pruned) or pruned[cursor].level <= block.level
            ):
                del pruned[index]
                changed = True
                break
    return pruned


def _drop_boilerplate(
    text: str, patterns: tuple[re.Pattern[str], ...]
) -> str:
    """Remove configured boilerplate lines before the text is normalized."""
    if not patterns:
        return text
    kept = [
        line
        for line in text.splitlines()
        if line.strip() and not any(pattern.search(line) for pattern in patterns)
    ]
    return "\n".join(kept)


def _drop_sections(
    blocks: list[Block], codes: frozenset[str]
) -> list[Block]:
    """Remove a dropped heading and every block under it.

    The section ends at the next heading of the same or a higher level, so a
    nested ``4.1`` inside a dropped ``4`` disappears with its parent while the
    following ``5`` survives.
    """
    if not codes:
        return blocks
    kept: list[Block] = []
    skip_level: int | None = None
    for block in blocks:
        if block.kind == "heading":
            if skip_level is not None and block.level <= skip_level:
                skip_level = None
            if skip_level is None and block.code in codes:
                skip_level = block.level
                continue
        if skip_level is not None:
            continue
        kept.append(block)
    return kept


def render_markdown(
    title: str,
    blocks: list[Block],
    *,
    provenance: str | None = None,
    drop_line_patterns: tuple[re.Pattern[str], ...] = (),
    drop_section_codes: frozenset[str] = frozenset(),
) -> tuple[str, list[dict[str, object]]]:
    """Render blocks to a clean Markdown body and return section offsets."""
    title = _clean_title(title or "Document sans titre")
    blocks = _drop_sections(blocks, drop_section_codes)
    blocks = _prune_empty_headings(blocks)
    lines: list[str] = [f"# {title}", ""]
    if provenance:
        lines.extend([f"> {clean_inline(provenance)}", ""])
    heading_positions: list[tuple[int, Block]] = []

    previous_blank = True
    for block in blocks:
        text = _drop_boilerplate(block.text, drop_line_patterns)
        if not text:
            continue
        if block.kind in {"para", "bullet"}:
            text = clean_paragraph(text)
        elif block.kind == "heading":
            text = clean_inline(text)
        if not text:
            continue
        if block.kind == "heading":
            level = min(4, max(1, block.level or 1))
            line = "#" * (level + 1) + " " + text
            if not previous_blank:
                lines.append("")
            heading_positions.append((len(lines), block))
            lines.append(line)
            lines.append("")
            previous_blank = True
        elif block.kind == "bullet":
            if not previous_blank:
                lines.append("")
            for item in text.splitlines():
                item = strip_bullet(clean_inline(item))
                if item:
                    lines.append(f"- {item}")
            lines.append("")
            previous_blank = True
        elif block.kind == "table":
            if not previous_blank:
                lines.append("")
            lines.extend(text.splitlines())
            lines.append("")
            previous_blank = True
        else:
            if not previous_blank:
                lines.append("")
            lines.append(text)
            lines.append("")
            previous_blank = True

    # Trim trailing blank lines, keep exactly one final newline.
    while len(lines) > 1 and not lines[-1]:
        lines.pop()
    body = "\n".join(lines) + "\n"

    # Character offsets for each heading section (for the manifest sidecar).
    line_starts: list[int] = []
    offset = 0
    for line in body.splitlines(keepends=True):
        line_starts.append(offset)
        offset += len(line)
    sections: list[dict[str, object]] = []
    for position, (line_index, block) in enumerate(heading_positions):
        start = line_starts[min(line_index, len(line_starts) - 1)]
        end = len(body)
        for later_line, later_block in heading_positions[position + 1 :]:
            if later_block.level <= block.level:
                end = line_starts[min(later_line, len(line_starts) - 1)]
                break
        section_text = body[start:end].strip()
        sections.append(
            {
                "code": block.code,
                "heading": clean_inline(block.text),
                "level": block.level,
                "start_char": start,
                "end_char": end,
                "chars": len(section_text),
            }
        )
    return body, sections
