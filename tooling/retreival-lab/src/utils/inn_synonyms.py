"""INN synonym table (French DCI -> other INN spellings).

The professor's list uses the French INN (DCI).  Foreign registers use the
English INN, so "paracetamol" is filed as "acetaminophen", "ibuprofene" as
"ibuprofen", and so on.  This table lets the collector find and validate the
same substance across registers, and it is the seed of the name-normalisation
component (brief, feature 3: connect brands, INNs, ATC codes and variants).

Keys are accent-stripped, lowercase French DCIs; values are the equivalent
INNs used in other registers.  Only genuine INN differences are listed -
spelling variants that accent-stripping already handles are not repeated.
"""

FRENCH_INN_SYNONYMS = {
    # analgesics / anti-inflammatories
    "paracetamol": ["acetaminophen"],
    "acide acetylsalicylique": ["acetylsalicylic acid", "aspirin"],
    "ibuprofene": ["ibuprofen"],
    "diclofenac": ["diclofenac sodium"],
    "ketoprofene": ["ketoprofen"],
    "naproxene": ["naproxen"],
    "meloxicam": ["meloxicam sodium"],
    "celecoxib": ["celecoxib"],
    "tramadol": ["tramadol hydrochloride"],
    "nefopam": ["nefopam hydrochloride"],
    "paracetamol codeine": ["acetaminophen codeine", "acetaminophen and codeine"],
    # antibiotics
    "amoxicilline": ["amoxicillin"],
    "acide clavulanique": ["clavulanic acid", "clavulanate"],
    "cefixime": ["cefixime"],
    "cefuroxime": ["cefuroxime"],
    "ceftriaxone": ["ceftriaxone sodium", "ceftriaxone disodium"],
    "azithromycine": ["azithromycin"],
    "clarithromycine": ["clarithromycin"],
    "ciprofloxacine": ["ciprofloxacin"],
    "levofloxacine": ["levofloxacin"],
    "doxycycline": ["doxycycline hyclate"],
    "sulfamethoxazole": ["sulfamethoxazole"],
    "trimethoprime": ["trimethoprim"],
    "metronidazole": ["metronidazole"],
    "gentamicine": ["gentamicin"],
    "clindamycine": ["clindamycin"],
    # antihypertensives
    "amlodipine": ["amlodipine besilate", "amlodipine"],
    "nifedipine": ["nifedipine"],
    "perindopril": ["perindopril erbumine", "perindopril arginine"],
    "ramipril": ["ramipril"],
    "enalapril": ["enalapril maleate"],
    "losartan": ["losartan potassium"],
    "valsartan": ["valsartan"],
    "bisoprolol": ["bisoprolol fumarate"],
    "atenolol": ["atenolol"],
    "nebivolol": ["nebivolol hydrochloride"],
    "hydrochlorothiazide": ["hydrochlorothiazide"],
    "indapamide": ["indapamide"],
    "spironolactone": ["spironolactone"],
    "methyldopa": ["methyldopa"],
}


def synonyms_for(inn: str) -> list:
    """Equivalent INN spellings of a DCI (normalised, accent-free)."""
    from src.utils.text import normalize

    key = normalize(inn)
    out = [key] if key else []
    for synonym in FRENCH_INN_SYNONYMS.get(key, []):
        norm = normalize(synonym)
        if norm and norm not in out:
            out.append(norm)
    return out
