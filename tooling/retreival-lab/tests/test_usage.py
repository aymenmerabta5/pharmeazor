"""Human-use classification tests (including the boilerplate trap)."""
import pytest

from src.validation.usage import (
    HUMAN_MEDICINE, NOT_A_MEDICINE_DOCUMENT, REGISTER_RECORD, UNDETERMINED,
    VETERINARY, classify_usage,
)

HUMAN_SMPC = """
Résumé des caractéristiques du produit
1. DENOMINATION DU MEDICAMENT
PARACETAMOL 500 mg, comprimé
4.1. Indications thérapeutiques : douleurs modérées
4.2. Posologie et mode d'administration : 1 comprimé par prise
4.3. Contre-indications : hypersensibilité
5.3 Données de sécurité préclinique
Les études de toxicité chez l'animal n'ont pas été menées.
Aucune donnée n'est disponible.
"""

VETERINARY_SMPC = """
SUMMARY OF PRODUCT CHARACTERISTICS
Product name: GENTAMICIN SULFATE SOLUTION
for use in horses only
not for use in humans
Do not administer to food producing animals without veterinary advice.
"""


class TestUsageClassification:
    def test_a_human_smpc_is_human(self):
        verdict = classify_usage(HUMAN_SMPC, "PARACETAMOL 500 mg")
        assert verdict["status"] == HUMAN_MEDICINE

    def test_a_veterinary_product_is_veterinary(self):
        verdict = classify_usage(VETERINARY_SMPC, "GENTAMICIN SULFATE SOLUTION")
        assert verdict["status"] == VETERINARY
        assert verdict["confidence"] == "high"

    def test_animal_boilerplate_does_not_make_a_document_veterinary(self):
        # "études chez l'animal" and "espèces animales" are standard SmPC text
        text = HUMAN_SMPC + "\nEspèces animales étudiées : aucune.\n"
        verdict = classify_usage(text, "PARACETAMOL 500 mg")
        assert verdict["status"] == HUMAN_MEDICINE

    def test_a_mention_of_a_veterinarian_does_not_qualify(self):
        text = ("DESCRIPTION " + HUMAN_SMPC
                + "\nIf you are a veterinarian, consult your pharmacist.\n")
        verdict = classify_usage(text, "PARACETAMOL 500 mg")
        assert verdict["status"] == HUMAN_MEDICINE

    def test_a_register_extract_is_a_register_record(self):
        verdict = classify_usage("61266250\tPARACETAMOL 500 mg, comprimé\n",
                                "BDPM CIS_bdpm.txt", "nomenclature")
        assert verdict["status"] == REGISTER_RECORD

    def test_an_administrative_act_is_not_a_medicine_document(self):
        text = ("RAPPEL DE LOT 2024-08-15 : les lots suivants sont rappeles. "
                "Numero de lot 12345, reference produit ABC.")
        verdict = classify_usage(text, "Rappel de lot")
        assert verdict["status"] == NOT_A_MEDICINE_DOCUMENT

    def test_a_scanned_document_is_undetermined(self):
        verdict = classify_usage("", "")
        assert verdict["status"] == UNDETERMINED

    def test_an_otc_listing_is_human(self):
        text = ("AC FAST- paracetamol capsule, coated\nGRIMANN SA DE CV\n"
                "Disclaimer: Most OTC drugs are not reviewed and approved by FDA, "
                "however they may be marketed if they comply with applicable "
                "regulations and policies.")
        verdict = classify_usage(text, "AC FAST")
        assert verdict["status"] == HUMAN_MEDICINE
