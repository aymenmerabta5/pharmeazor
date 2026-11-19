"""Text decoding that does not mangle UTF-8 pages on a Windows console."""
from pathlib import Path

CHARSETS = ("utf-8", "cp1252", "latin-1")


def read_text_auto(path: Path, encoding: str = "") -> str:
    """Read a text file, trying UTF-8 first (the registers and the ANSM pages
    are UTF-8) and falling back to the French Windows codepage."""
    raw = Path(path).read_bytes()
    if encoding:
        try:
            return raw.decode(encoding, errors="replace")
        except LookupError:
            pass
    for charset in CHARSETS:
        try:
            return raw.decode(charset)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")
