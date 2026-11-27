/**
 * Deterministic normalisation for knowledge-graph entities.
 *
 * Two folds are kept apart on purpose:
 *
 * - `foldKgText` lowercases and strips accents for matching mentions. It is
 *   also used for entity keys.
 * - `foldRegisterKey` reproduces the registry importer's fold (uppercase,
 *   accent-stripped, whitespace collapsed) so a product key computed here is
 *   identical to the one `import-registry.ts` writes.
 *
 * The tokenizer returns offsets into the original string. Every mention span
 * is validated against those offsets before it reaches the database.
 */

const LEGAL_SUFFIXES = new Set([
  "spa",
  "sarl",
  "sa",
  "sas",
  "sasu",
  "snc",
  "gmbh",
  "ltd",
  "limited",
  "llc",
  "inc",
  "plc",
  "ag",
  "nv",
  "bv",
  "srl",
  "co",
  "company",
  "corp",
  "corporation",
]);

const ORGANIZATION_PREFIXES = new Set(["laboratoire", "laboratoires", "labo", "ste", "societe"]);

const INGREDIENT_SALT_SUFFIXES = new Set([
  "dichlorhydrate",
  "chlorhydrate",
  "hydrochloride",
  "dihydrochloride",
  "bromhydrate",
  "hydrobromide",
  "sodium",
  "sodique",
  "potassium",
  "potassique",
  "calcium",
  "calcique",
  "magnesium",
  "magnesien",
  "maleate",
  "maleique",
  "tartrate",
  "citrate",
  "mesylate",
  "mesilate",
  "besylate",
  "fumarate",
  "succinate",
  "phosphate",
  "sulfate",
  "sulphate",
  "acetate",
  "hydrate",
  "monohydrate",
  "dihydrate",
  "trihydrate",
  "anhydre",
  "anhydrous",
  "base",
  "sel",
]);

export interface KgToken {
  readonly raw: string;
  readonly norm: string;
  /** UTF-16 code-unit start offset into the original text. */
  readonly start: number;
  /** Exclusive UTF-16 code-unit end offset into the original text. */
  readonly end: number;
}

export interface DosageFormDefinition {
  readonly key: string;
  readonly label: string;
  readonly patterns: readonly string[];
}

/**
 * Canonical pharmaceutical forms. Patterns are folded fragments; the longest
 * matching pattern wins, so "comprime pellicule secable" never collapses to
 * the generic "comprime".
 */
export const DOSAGE_FORMS: readonly DosageFormDefinition[] = [
  {
    key: "comprime_pellicule_secable",
    label: "Comprimé pelliculé sécable",
    patterns: ["comprime pellicule secable", "comp pelli sec", "comprimes pellicules secables"],
  },
  {
    key: "comprime_pellicule",
    label: "Comprimé pelliculé",
    patterns: ["comprime pellicule", "comp pelli", "comprimes pellicules"],
  },
  {
    key: "comprime_secable",
    label: "Comprimé sécable",
    patterns: ["comprime secable", "comp sec", "comprimes secables"],
  },
  {
    key: "comprime_lp",
    label: "Comprimé à libération prolongée",
    patterns: ["comprime lp", "comprime liberation prolongee", "comp lp"],
  },
  {
    key: "comprime",
    label: "Comprimé",
    patterns: ["comprime", "comp", "comprimes", "tablet", "tablets"],
  },
  {
    key: "gelule",
    label: "Gélule",
    patterns: ["gelule", "gles", "gelules", "capsule", "capsules"],
  },
  {
    key: "suspension_buvable",
    label: "Suspension buvable",
    patterns: ["suspension buvable", "susp buv", "suspension orale"],
  },
  {
    key: "solution_buvable",
    label: "Solution buvable",
    patterns: ["solution buvable", "sol buv", "solution orale"],
  },
  {
    key: "solution_injectable",
    label: "Solution injectable",
    patterns: ["solution injectable", "sol inj", "injectable", "injection"],
  },
  {
    key: "poudre_solution_buvable",
    label: "Poudre pour solution buvable",
    patterns: ["poudre pour solution buvable", "pdre p sol buv", "poudre solution buvable"],
  },
  {
    key: "poudre_suspension_buvable",
    label: "Poudre pour suspension buvable",
    patterns: ["poudre pour suspension buvable", "pdre p susp buv", "poudre suspension buvable"],
  },
  {
    key: "suppositoire",
    label: "Suppositoire",
    patterns: ["suppositoire", "suppo", "suppositoires"],
  },
  {
    key: "creme",
    label: "Crème",
    patterns: ["creme", "cream"],
  },
  {
    key: "pommade",
    label: "Pommade",
    patterns: ["pommade", "ointment"],
  },
  {
    key: "gel",
    label: "Gel",
    patterns: ["gel dermique", "gel"],
  },
  {
    key: "collyre",
    label: "Collyre",
    patterns: ["collyre", "eye drops"],
  },
  {
    key: "ovule",
    label: "Ovule",
    patterns: ["ovule", "ovules"],
  },
  {
    key: "sirop",
    label: "Sirop",
    patterns: ["sirop", "syrup"],
  },
  {
    key: "granule",
    label: "Granulé",
    patterns: ["granule", "granules"],
  },
  {
    key: "sachet",
    label: "Sachet",
    patterns: ["sachet", "sachets"],
  },
  {
    key: "spray",
    label: "Spray",
    patterns: ["spray", "aerosol"],
  },
  {
    key: "patch",
    label: "Patch",
    patterns: ["patch", "dispositif transdermique"],
  },
  {
    key: "solution_perfusion",
    label: "Solution pour perfusion",
    patterns: ["solution pour perfusion", "sol perfusion", "perfusion"],
  },
];

const DOSAGE_FORM_BY_PATTERN = DOSAGE_FORMS.flatMap((definition) =>
  definition.patterns.map((pattern) => ({ definition, pattern })),
).sort((left, right) => right.pattern.length - left.pattern.length);

const COUNTRY_ALIASES: ReadonlyArray<readonly [string, string, string]> = [
  ["dz", "algeria", "Algeria"],
  ["algerie", "algeria", "Algeria"],
  ["algeria", "algeria", "Algeria"],
  ["fr", "france", "France"],
  ["france", "france", "France"],
  ["us", "united_states", "United States"],
  ["usa", "united_states", "United States"],
  ["united states", "united_states", "United States"],
  ["etats unis", "united_states", "United States"],
  ["eu", "europe", "Europe"],
  ["europe", "europe", "Europe"],
  ["european union", "europe", "Europe"],
  ["ma", "morocco", "Morocco"],
  ["maroc", "morocco", "Morocco"],
  ["morocco", "morocco", "Morocco"],
  ["tn", "tunisia", "Tunisia"],
  ["tunisie", "tunisia", "Tunisia"],
  ["tunisia", "tunisia", "Tunisia"],
  ["jordan", "jordan", "Jordan"],
  ["jordanie", "jordan", "Jordan"],
  ["saudi arabia", "saudi_arabia", "Saudi Arabia"],
  ["arabie saoudite", "saudi_arabia", "Saudi Arabia"],
  ["switzerland", "switzerland", "Switzerland"],
  ["suisse", "switzerland", "Switzerland"],
  ["italy", "italy", "Italy"],
  ["italie", "italy", "Italy"],
];

const DOCUMENT_TYPES: ReadonlyArray<readonly [string, string]> = [
  ["smpc", "smpc"],
  ["rcp", "rcp"],
  ["resume des caracteristiques du produit", "smpc"],
  ["notice", "notice"],
  ["patient information", "notice"],
  ["label", "label"],
  ["labelling", "label"],
  ["nomenclature", "nomenclature"],
  ["structured reference", "structured_reference"],
  ["structured_reference", "structured_reference"],
];

const LANGUAGE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["fr", "fr"],
  ["francais", "fr"],
  ["french", "fr"],
  ["en", "en"],
  ["anglais", "en"],
  ["english", "en"],
  ["ar", "ar"],
  ["arabe", "ar"],
  ["arabic", "ar"],
];

/** Lowercase, accent-stripped, whitespace-collapsed text for matching. */
export function foldKgText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Registry-importer fold: uppercase, accent-stripped, whitespace collapsed. */
export function foldRegisterKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function compactRegisterKey(value: string): string {
  return foldRegisterKey(value).replace(/\s+/g, "");
}

/** Lowercase fold with every non-letter/non-digit removed. */
export function compactKgText(value: string): string {
  return foldKgText(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

export function slugKey(value: string): string {
  const folded = foldKgText(value)
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return folded || "unknown";
}

/** Tokens with offsets into the original string. Punctuation splits tokens. */
export function tokenizeWithOffsets(text: string): KgToken[] {
  const tokens: KgToken[] = [];
  const pattern = /[\p{L}\p{N}]+/gu;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    tokens.push({ raw, norm: foldKgText(raw), start, end: start + raw.length });
  }
  return tokens;
}

/** Remove dosage/strength fragments from a brand label. */
export function stripStrengthTokens(value: string): string {
  return value
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|cl|l|ui|iu|%)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBrandKey(value: string): string {
  const stripped = stripStrengthTokens(value);
  const key = slugKey(stripped);
  return key === "unknown" ? slugKey(value) : key;
}

/** Drop a trailing salt/hydrate form when a real base name remains. */
export function normalizeIngredientKey(value: string): string {
  const words = foldKgText(value)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1];
    if (!last || !INGREDIENT_SALT_SUFFIXES.has(last)) break;
    words.pop();
  }
  const key = words.join(" ");
  return key || foldKgText(value);
}

/** Split a combination label into its distinct substances. */
export function splitSubstances(value: string): string[] {
  return value
    .split(/\s*(?:\/|\+|;|,|\bet\b|\band\b)\s*/iu)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeOrganizationKey(value: string): string {
  const words = foldKgText(value)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 0 && ORGANIZATION_PREFIXES.has(words[0] ?? "")) words.shift();
  while (words.length > 0 && LEGAL_SUFFIXES.has(words[words.length - 1] ?? "")) words.pop();
  const key = words.join(" ");
  return key || foldKgText(value);
}

export function normalizeDosageForm(value: string): {
  readonly key: string;
  readonly label: string;
} {
  const folded = foldKgText(value)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const { definition, pattern } of DOSAGE_FORM_BY_PATTERN) {
    if (folded === pattern || folded.includes(pattern)) {
      return { key: definition.key, label: definition.label };
    }
  }
  const key = slugKey(value);
  return { key, label: value.trim() };
}

export function normalizeStrength(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .replace(/[µμ]/g, "U")
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .trim();
}

export function normalizePackaging(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .trim();
}

export function normalizeSchedule(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const upper = foldRegisterKey(raw);
  if (upper.startsWith("STUPEFIANT")) return "STUPEFIANT";
  if (/^L+ISTE\s+I{2}$/.test(upper.replace(/\s+/g, " "))) return "LISTE II";
  if (/^L+ISTE\s+I$/.test(upper.replace(/\s+/g, " "))) return "LISTE I";
  return /^[A-Z][A-Z ]+$/.test(upper) ? upper : null;
}

export function normalizeProductType(value: string): "GE" | "RE" | "BIO" | null {
  const upper = value.trim().toUpperCase();
  return upper === "GE" || upper === "RE" || upper === "BIO" ? upper : null;
}

export function normalizeRegistrationStatus(
  value: string,
): "registered" | "withdrawn" | "non_renewed" | "unknown" {
  const folded = foldKgText(value).replace(/_/g, " ");
  if (folded === "enregistre" || folded === "registered" || folded === "enregistree") {
    return "registered";
  }
  if (folded === "retrait" || folded === "withdrawn" || folded === "retire") return "withdrawn";
  if (folded === "non renouvele" || folded === "non renewed" || folded === "non renouvelee") {
    return "non_renewed";
  }
  return "unknown";
}

export function normalizeJurisdiction(value: string): {
  readonly key: string;
  readonly label: string;
} | null {
  const folded = foldKgText(value)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!folded || /\d/.test(folded)) return null;
  for (const [alias, key, label] of COUNTRY_ALIASES) {
    if (folded === alias) return { key, label };
  }
  return { key: slugKey(value), label: value.trim() };
}

export function normalizeDocumentType(value: string): string | null {
  const folded = foldKgText(value).replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!folded) return null;
  for (const [alias, code] of DOCUMENT_TYPES) {
    if (folded === alias) return code;
  }
  return slugKey(value);
}

export function normalizeLanguage(value: string): string | null {
  const folded = foldKgText(value).trim();
  if (!folded) return null;
  for (const [alias, code] of LANGUAGE_ALIASES) {
    if (folded === alias) return code;
  }
  return /^[a-z]{2}$/.test(folded) ? folded : null;
}

const CONDITION_LEADING_STOPWORDS = new Set([
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "des",
  "de",
  "du",
  "d",
  "the",
  "a",
  "an",
  "of",
  "et",
  "ou",
  "and",
  "or",
]);

/** Normalised key for an extracted condition or population phrase. */
export function normalizeConditionKey(value: string): string {
  const words = foldKgText(value)
    .replace(/[^\p{L}\p{N}% ]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 0 && CONDITION_LEADING_STOPWORDS.has(words[0] ?? "")) words.shift();
  return words.join(" ");
}

/** Human-readable condition label, with the cue and leading articles removed. */
export function cleanConditionLabel(value: string, maxChars = 120): string {
  let label = value
    .replace(/^[\s:;,.\-–—]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = label.split(" ");
  while (words.length > 0 && CONDITION_LEADING_STOPWORDS.has(foldKgText(words[0] ?? ""))) {
    words.shift();
  }
  label = words.join(" ").replace(/[\s:;,.\-–—]+$/u, "");
  if (label.length > maxChars) return label.slice(0, maxChars).trim();
  return label;
}

export function displayJurisdiction(key: string): string {
  for (const [, candidate, label] of COUNTRY_ALIASES) {
    if (candidate === key) return label;
  }
  return key.replace(/_/g, " ");
}

export function displaySchedule(key: string): string {
  return key.replace(/_/g, " ");
}
