"""Reader for the official Algerian national nomenclature.

File: the "NOMENCLATURE NATIONALE DES PRODUITS PHARMACEUTIQUES" workbook
(Ministère de l'Industrie Pharmaceutique), downloaded by hand and passed with
``import-nomenclature --file``. It is operator-supplied data and is not part of
the repository.

Sheets
------
* "Nomenclature Aout 2026" - the products currently registered
* "Non Renouvelés"        - products whose authorisation was not renewed
* "Retraits"              - withdrawn products

Columns of the main sheet (row 16 is the header):
    A N° | B N° ENREGISTREMENT | C CODE | D DENOMINATION COMMUNE
    INTERNATIONALE | E NOM DE MARQUE | F FORME | G DOSAGE | H CONDITIONNEMENT
    I LISTE | J/K P1 P2 | L OBS | M LABORATOIRES DETENTEUR | N PAYS
    O/P DATES D'ENREGISTREMENT | Q TYPE | R STATUT | S DUREE DE STABILITE

This module answers the question of the professor's list: *is the active
ingredient present in the Algerian nomenclature, and under which brand names?*
"""
import datetime
import re

from src.medicines.xlsx import find_header, read_rows, sheet_names
from src.utils.text import contains_token, dci_required_components, normalize

HEADER_MARKERS = ["DENOMINATION COMMUNE INTERNATIONALE", "NOM DE MARQUE"]

# column letter -> semantic name
COLUMNS = {
    "A": "number",
    "B": "registration_number",
    "C": "code",
    "D": "dci",
    "E": "brand",
    "F": "form",
    "G": "dosage",
    "H": "packaging",
    "I": "list",
    "L": "observation",
    "M": "holder",
    "N": "country",
    "O": "registration_date_initial",
    "P": "registration_date_final",
    "Q": "type",
    "R": "status",
    "S": "stability",
}


def _excel_date(value: str) -> str:
    """Excel serial date -> ISO date."""
    if not value or not value.replace(".", "", 1).isdigit():
        return value
    try:
        serial = float(value)
    except ValueError:
        return value
    if serial < 20000 or serial > 60000:
        return value
    try:
        day = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))
        return day.isoformat()
    except (OverflowError, ValueError):
        return value


def _read_sheet(path, sheet_name: str) -> list:
    rows = read_rows(path, sheet_name)
    header = find_header(rows, HEADER_MARKERS)
    if header < 0:
        return []
    records = []
    for row in rows[header + 1:]:
        record = {}
        for letter, name in COLUMNS.items():
            record[name] = row.get(letter, "")
        if not record.get("brand") and not record.get("dci"):
            continue
        record["registration_date_initial"] = _excel_date(record.get("registration_date_initial", ""))
        record["registration_date_final"] = _excel_date(record.get("registration_date_final", ""))
        records.append(record)
    return records


class Nomenclature:
    """The official nomenclature, indexed by DCI."""

    def __init__(self, path):
        import zipfile

        self.path = str(path)
        self.sheets = sheet_names(zipfile.ZipFile(self.path))
        self.main = _read_sheet(self.path, self.sheets[0])
        self.non_renewed_records = []
        self.withdrawn_records = []
        for name in self.sheets[1:]:
            records = _read_sheet(self.path, name)
            if "non" in name.lower():
                self.non_renewed_records.extend(records)
            else:
                self.withdrawn_records.extend(records)
        self._withdrawn_keys = {(r.get("code", ""), r.get("brand", ""))
                                for r in self.withdrawn_records}
        self._non_renewed_keys = {(r.get("code", ""), r.get("brand", ""))
                                  for r in self.non_renewed_records}

    # ------------------------------------------------------------- matching
    @staticmethod
    def _matches(dci: str, components: list) -> bool:
        """Does the register's DCI cover every substance of the medicine?"""
        low = normalize(dci)
        if not low:
            return False
        # "PARACETAMOL/CODEINE", "SULFAMETHOXAZOLE + TRIMETHOPRIME", ...
        parts = [normalize(part) for part in re.split(r"[/+,]", low)]
        flat = " ".join(parts)
        for component in components:
            if not component:
                continue
            if not (contains_token(flat, component)
                    or any(contains_token(part, component) for part in parts)):
                return False
        return True

    def products_for(self, medicine: dict) -> list:
        """All registered products whose DCI covers the medicine's substances."""
        components = [normalize(c) for c in dci_required_components(medicine)]
        if not components:
            return []
        return [record for record in self.main
                if self._matches(record.get("dci", ""), components)]

    def historical_for(self, medicine: dict) -> list:
        """Products that were registered but are withdrawn / not renewed."""
        components = [normalize(c) for c in dci_required_components(medicine)]
        if not components:
            return []
        out = []
        for record in self.withdrawn_records + self.non_renewed_records:
            if self._matches(record.get("dci", ""), components):
                out.append(record)
        return out

    def status_of(self, record: dict) -> str:
        key = (record.get("code", ""), record.get("brand", ""))
        if key in self._withdrawn_keys:
            return "retrait"
        if key in self._non_renewed_keys:
            return "non renouvele"
        return "enregistre"

    def summary(self, medicine: dict) -> dict:
        products = self.products_for(medicine)
        historical = self.historical_for(medicine)
        brands, holders, strengths, forms = [], [], [], []
        statuses = []
        for record in products:
            brand = record.get("brand", "").strip()
            if brand and brand not in brands:
                brands.append(brand)
            holder = record.get("holder", "").strip()
            if holder and holder not in holders:
                holders.append(holder)
            dosage = record.get("dosage", "").strip()
            if dosage and dosage not in strengths:
                strengths.append(dosage)
            form = record.get("form", "").strip()
            if form and form not in forms:
                forms.append(form)
            status = self.status_of(record)
            if status not in statuses:
                statuses.append(status)
        if products:
            present = "oui"
        elif historical:
            present = "a verifier"   # it was registered before, but not any more
        else:
            present = "non"
        return {
            "present": present,
            "products": len(products),
            "brands": brands,
            "holders": holders,
            "strengths": strengths,
            "forms": forms,
            "statuses": statuses,
            "records": products,
            "historical": historical,
        }
