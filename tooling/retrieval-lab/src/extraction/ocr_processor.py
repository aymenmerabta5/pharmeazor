"""Optional OCR for scanned PDFs.

The current corpus has a selectable text layer on every page, so OCR is not
triggered during the normal run.  The implementation is kept for future
scanned documents and never imports Tesseract unless a page actually needs it.
"""
from dataclasses import dataclass
from pathlib import Path


class OCRError(RuntimeError):
    pass


@dataclass
class OCRResult:
    text: str
    confidence: float | None
    languages: str


def _pytesseract():
    try:
        import pytesseract
    except Exception as exc:  # pragma: no cover - depends on the host
        raise OCRError(
            "pytesseract is not installed; install pytesseract and Pillow "
            "(see requirements.txt) plus the Tesseract binary to read scanned PDFs"
        ) from exc
    return pytesseract


def installed_languages() -> list[str]:
    try:
        return sorted(_pytesseract().get_languages(config=""))
    except Exception:
        return []


def choose_languages(requested: str = "fra+ara+eng") -> str:
    """Pick installed Tesseract languages, preserving the requested order."""
    wanted = [part.strip() for part in (requested or "").split("+") if part.strip()]
    installed = installed_languages()
    if not installed:
        return requested or "eng"
    chosen = [code for code in wanted if code in installed]
    if not chosen:
        chosen = ["eng"] if "eng" in installed else [installed[0]]
    return "+".join(chosen)


def ocr_pdf_page(page, languages: str = "fra+ara+eng", dpi: int = 300) -> OCRResult:
    """OCR one PyMuPDF page and return text, mean confidence and languages."""
    pytesseract = _pytesseract()
    try:
        from PIL import Image
        import io
    except Exception as exc:  # pragma: no cover
        raise OCRError("Pillow is required for OCR") from exc

    chosen = choose_languages(languages)
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    image = Image.open(io.BytesIO(pix.tobytes("png")))
    data = pytesseract.image_to_data(
        image, lang=chosen, output_type=pytesseract.Output.DICT,
        config="--psm 3",
    )

    lines: dict[tuple, list[str]] = {}
    confidences = []
    for index, word in enumerate(data.get("text", [])):
        token = (word or "").strip()
        if not token:
            continue
        try:
            confidence = float(data["conf"][index])
        except (KeyError, TypeError, ValueError):
            confidence = -1
        if confidence >= 0:
            confidences.append(confidence)
        key = (data["block_num"][index], data["par_num"][index],
               data["line_num"][index])
        lines.setdefault(key, []).append(token)

    text = "\n".join(" ".join(words) for _, words in sorted(lines.items()))
    mean = round(sum(confidences) / len(confidences), 2) if confidences else None
    return OCRResult(text=text, confidence=mean, languages=chosen)


def ocr_image(path: Path, languages: str = "fra+ara+eng") -> OCRResult:
    """OCR a standalone image (used by tests and future notice downloads)."""
    pytesseract = _pytesseract()
    from PIL import Image

    chosen = choose_languages(languages)
    image = Image.open(path)
    data = pytesseract.image_to_data(
        image, lang=chosen, output_type=pytesseract.Output.DICT,
        config="--psm 3",
    )
    words, confidences = [], []
    for index, word in enumerate(data.get("text", [])):
        token = (word or "").strip()
        if not token:
            continue
        words.append(token)
        try:
            confidence = float(data["conf"][index])
        except (KeyError, TypeError, ValueError):
            confidence = -1
        if confidence >= 0:
            confidences.append(confidence)
    mean = round(sum(confidences) / len(confidences), 2) if confidences else None
    return OCRResult(text=" ".join(words), confidence=mean, languages=chosen)
