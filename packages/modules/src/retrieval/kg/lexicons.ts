/**
 * Controlled vocabularies that the corpus itself supports.
 *
 * These are not model-generated labels. Each definition is a small set of
 * spellings found in the SmPCs, labels, and register, paired with a stable key
 * and a display label. The gazetteer matches the aliases literally after
 * accent folding.
 */

export interface LexiconDefinition {
  readonly key: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly confidence?: number;
}

export const ROUTE_DEFINITIONS: readonly LexiconDefinition[] = [
  {
    key: "oral",
    label: "Oral route",
    aliases: [
      "voie orale",
      "administration orale",
      "par voie orale",
      "orale",
      "oral",
      "per os",
      "oral route",
    ],
  },
  {
    key: "parenteral",
    label: "Parenteral route",
    aliases: [
      "voie parentérale",
      "voie parenterale",
      "parentéral",
      "parentéral",
      "injectable",
      "injection",
      "intraveineuse",
      "intraveineux",
      "intravenous",
      "intramusculaire",
      "intramuscular",
      "sous-cutanée",
      "sous-cutané",
      "subcutaneous",
    ],
  },
  {
    key: "topical",
    label: "Topical route",
    aliases: [
      "voie cutanée",
      "voie cutanee",
      "application cutanée",
      "application cutanee",
      "topique",
      "topical",
      "dermique",
      "dermal",
      "cutaneous",
    ],
  },
  {
    key: "rectal",
    label: "Rectal route",
    aliases: ["voie rectale", "rectale", "rectal", "rectum"],
  },
  {
    key: "ocular",
    label: "Ocular route",
    aliases: ["voie oculaire", "oculaire", "ocular", "collyre", "eye drops"],
  },
  {
    key: "nasal",
    label: "Nasal route",
    aliases: ["voie nasale", "nasale", "nasal", "intranasal"],
  },
  {
    key: "inhalation",
    label: "Inhalation route",
    aliases: ["voie inhalée", "voie inhalee", "inhalation", "inhalé", "inhale", "inhalée"],
  },
  {
    key: "transdermal",
    label: "Transdermal route",
    aliases: ["voie transdermique", "transdermique", "transdermal"],
  },
  {
    key: "sublingual",
    label: "Sublingual route",
    aliases: ["voie sublinguale", "sublinguale", "sublingual"],
  },
  {
    key: "vaginal",
    label: "Vaginal route",
    aliases: ["voie vaginale", "vaginale", "vaginal"],
  },
  {
    key: "auricular",
    label: "Auricular route",
    aliases: ["voie auriculaire", "auriculaire", "auricular", "otic"],
  },
];

export const POPULATION_DEFINITIONS: readonly LexiconDefinition[] = [
  {
    key: "adult",
    label: "Adults",
    aliases: ["adultes", "adulte", "adults", "adult"],
  },
  {
    key: "child",
    label: "Children",
    aliases: [
      "enfants",
      "enfant",
      "children",
      "child",
      "pédiatrique",
      "pediatrique",
      "pediatric",
      "paediatric",
      "pédiatrie",
      "pediatrie",
    ],
  },
  {
    key: "infant",
    label: "Infants",
    aliases: [
      "nourrissons",
      "nourrisson",
      "infants",
      "infant",
      "nouveau-nés",
      "nouveau-né",
      "nouveaux-nés",
      "newborns",
      "newborn",
    ],
  },
  {
    key: "adolescent",
    label: "Adolescents",
    aliases: ["adolescents", "adolescent", "adolescence"],
  },
  {
    key: "elderly",
    label: "Older adults",
    aliases: [
      "personnes âgées",
      "personne âgée",
      "sujets âgés",
      "sujet âgé",
      "elderly",
      "older adults",
      "geriatric",
      "gériatrique",
      "geriatrique",
    ],
  },
  {
    key: "pregnant_women",
    label: "Pregnant women",
    aliases: [
      "femmes enceintes",
      "femme enceinte",
      "pregnant women",
      "pregnant woman",
      "gestantes",
      "enceintes",
    ],
  },
  {
    key: "breastfeeding_women",
    label: "Breastfeeding women",
    aliases: [
      "femmes allaitantes",
      "femme allaitante",
      "breastfeeding women",
      "breast-feeding women",
      "nursing women",
      "allaitantes",
    ],
  },
  {
    key: "renal_impairment",
    label: "Renal impairment",
    aliases: [
      "insuffisance rénale",
      "insuffisance renale",
      "insuffisants rénaux",
      "renal impairment",
      "renal failure",
      "kidney impairment",
    ],
  },
  {
    key: "hepatic_impairment",
    label: "Hepatic impairment",
    aliases: [
      "insuffisance hépatique",
      "insuffisance hepatique",
      "insuffisants hépatiques",
      "hepatic impairment",
      "liver failure",
    ],
  },
  {
    key: "immunocompromised",
    label: "Immunocompromised patients",
    aliases: ["immunodéprimés", "immunodeprimes", "immunocompromised"],
  },
  {
    key: "diabetic",
    label: "Diabetic patients",
    aliases: ["diabétiques", "diabetiques", "diabetic"],
  },
];

export const REGULATORY_STATUS_DEFINITIONS: readonly LexiconDefinition[] = [
  {
    key: "registered",
    label: "Registered",
    aliases: ["enregistré", "enregistrée", "enregistrés", "registered", "enregistre"],
  },
  {
    key: "withdrawn",
    label: "Withdrawn",
    aliases: ["retiré", "retirée", "retirés", "retrait", "withdrawn", "withdrawal"],
  },
  {
    key: "non_renewed",
    label: "Non-renewed",
    aliases: [
      "non renouvelé",
      "non renouvelée",
      "non renouvelés",
      "non renouvelées",
      "non renewed",
      "lapsed",
    ],
  },
];

export const DOCUMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  smpc: "Summary of Product Characteristics",
  notice: "Patient information leaflet",
  label: "Labelling",
  nomenclature: "Nomenclature",
  structured_reference: "Structured reference",
};

export const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  fr: "French",
  en: "English",
  ar: "Arabic",
};

export const PRODUCT_TYPE_LABELS: Readonly<Record<string, string>> = {
  GE: "GE",
  RE: "RE",
  BIO: "BIO",
};

export const SOURCE_KIND_LABELS: Readonly<Record<string, string>> = {
  name_map: "Name map",
  nomenclature: "Nomenclature",
  brand_evidence: "Brand evidence",
  documents: "Document metadata",
  sources: "Source registry",
  manifest: "Corpus manifest",
  title: "Document title",
  chunk: "Document chunk",
  derived: "Derived",
};
