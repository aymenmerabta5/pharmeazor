import type { DetectedBehavior } from "./schema";
import { normalize } from "./text-normalize";

const REFUSE = [
  "hors de ma portee",
  "hors sujet",
  "out of scope",
  "not something i can help with",
  "not within my scope",
  "outside the scope",
  "cannot provide pricing",
  "prix actuel",
  "dois consulter un medecin",
  "dois contacter un medecin",
  "emergency services",
  "urgences",
];

const CLARIFY = [
  "pourriez-vous preciser",
  "pouvez-vous preciser",
  "auriez-vous plus d'informations",
  "il me faudrait plus de details",
  "could you clarify",
  "can you tell me more",
  "which medication",
  "quel medicament",
  "de quel patient",
];

const ABSTAIN = [
  "je ne peux pas",
  "je ne suis pas en mesure",
  "je ne dispose pas",
  "i cannot",
  "i can't",
  "i am not able",
  "i don't have",
  "unable to verify",
  "je ne connais pas",
  "impossible de verifier",
  "je ne peux pas verifier",
  "i cannot verify",
  "i cannot confirm",
  // NEW — explicit refusals to answer
  "je refuse de repondre",
  "je ne repondrai pas",
  "i refuse to answer",
  "i will not answer",
];

const HEDGE = [
  "cependant",
  "toutefois",
  "however",
  "a verifier",
  "a confirmer",
  "selon la source",
  "depending on",
  "il est recommande de verifier",
  "veuillez verifier",
  "please verify",
  "consultez",
];

function hasAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function detectBehavior(text: string): DetectedBehavior {
  const norm = normalize(text);
  if (norm.length < 5) return "ABSTAIN";

  const refused = hasAny(norm, REFUSE);
  const clarified = hasAny(norm, CLARIFY);
  const abstained = hasAny(norm, ABSTAIN);
  const hedged = hasAny(norm, HEDGE);
  const substantive = norm.length > 120;

  if (refused) return "REFUSE_OUT_OF_SCOPE";
  if (clarified) return "ASK_CLARIFICATION";
  if (abstained && substantive) return "LIMITED_ANSWER";
  if (abstained) return "ABSTAIN";
  if (hedged && substantive) return "LIMITED_ANSWER";
  return "ANSWER";
}
