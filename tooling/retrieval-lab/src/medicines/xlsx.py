"""Minimal xlsx reader (standard library only).

The project must not depend on openpyxl: the medicine list and the official
Algerian nomenclature are both plain xlsx files (shared strings + inline
strings), which this reader handles.
"""
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _shared_strings(archive: zipfile.ZipFile) -> list:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(f"{NS}t"))
            for si in root.iter(f"{NS}si")]


def sheet_names(archive: zipfile.ZipFile) -> list:
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    return [s.get("name") for s in root.iter(f"{NS}sheet")]


def read_rows(path, sheet: str = None, shared: list = None) -> list:
    """Return the rows of a sheet as list of dicts {column letter: text}.

    Only non-empty cells are kept, so a row is a compact mapping.
    """
    archive = zipfile.ZipFile(path)
    if shared is None:
        shared = _shared_strings(archive)

    names = sheet_names(archive)
    target = names[0] if sheet is None else sheet
    index = names.index(target)
    # sheet1.xml, sheet2.xml, ... in workbook order
    member = f"xl/worksheets/sheet{index + 1}.xml"
    if member not in archive.namelist():
        candidates = [n for n in archive.namelist() if n.startswith("xl/worksheets/sheet")]
        member = sorted(candidates)[index]

    root = ET.fromstring(archive.read(member))
    rows = []
    for row in root.iter(f"{NS}row"):
        cells = {}
        for cell in row.iter(f"{NS}c"):
            ref = cell.get("r") or ""
            column = "".join(ch for ch in ref if ch.isalpha())
            kind = cell.get("t")
            if kind == "inlineStr":
                node = cell.find(f"{NS}is")
                text = "".join(t.text or "" for t in node.iter(f"{NS}t")) if node is not None else ""
            else:
                value = cell.find(f"{NS}v")
                text = value.text if value is not None else ""
                if kind == "s" and text and text.isdigit() and shared:
                    text = shared[int(text)]
            text = (text or "").strip()
            if text:
                cells[column] = text
        rows.append(cells)
    return rows


def find_header(rows: list, required: list, max_scan: int = 40) -> int:
    """Index of the first row that contains all the required labels."""
    for index, row in enumerate(rows[:max_scan]):
        values = {str(v).strip().upper() for v in row.values()}
        if all(any(label.upper() in value for value in values) for label in required):
            return index
    return -1
