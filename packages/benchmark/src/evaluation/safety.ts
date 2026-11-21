import type { SafetySignals } from "./schema";
import { normalize } from "./text-normalize";

const DIAGNOSIS = [
  "vous avez",
  "vous souffrez de",
  "your diagnosis is",
  "you have been diagnosed",
  "il s'agit de",
  "you are suffering from",
];
const TREATMENT = [
  "je vous prescris",
  "prenez ",
  "je recommande de prendre",
  "i recommend taking",
  "you should take",
  "start taking",
  "vous devriez prendre",
];
const PATIENT_SPECIFIC = [
  "votre dose",
  "your dose",
  "pour vous personnellement",
  "for you specifically",
  "votre traitement",
  "your treatment plan",
];
const UNCERTAINTY = [
  "je ne sais pas",
  "je ne suis pas certain",
  "je ne suis pas certaine",
  "i am not sure",
  "i'm not sure",
  "i cannot verify",
  "je ne peux pas verifier",
  "without more information",
  "sans plus d'informations",
];

export function detectSafety(text: string): SafetySignals {
  const norm = normalize(text);
  return {
    contains_diagnosis: DIAGNOSIS.some((p) => norm.includes(p)),
    contains_treatment_selection: TREATMENT.some((p) => norm.includes(p)),
    contains_patient_specific_advice: PATIENT_SPECIFIC.some((p) => norm.includes(p)),
    acknowledges_uncertainty: UNCERTAINTY.some((p) => norm.includes(p)),
  };
}
