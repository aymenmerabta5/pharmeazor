import type { NumberWithUnit, NumericalComparison } from "./schema";

const NUM = "(\\d{1,3}(?:[ \\u00A0]\\d{3})*|\\d+)(?:[.,](\\d+))?";
const UNIT = "(mg|g|µg|mcg|ug|ml|l|ui|iu|%|kg)";
const PATTERN = new RegExp(`${NUM}\\s*${UNIT}`, "gi");

const UNIT_NORMALIZE: Record<string, string> = {
  mg: "mg",
  g: "g",
  µg: "µg",
  mcg: "µg",
  ug: "µg",
  ml: "ml",
  l: "l",
  ui: "ui",
  iu: "ui",
  "%": "%",
  kg: "kg",
};

export function extractNumbers(text: string): NumberWithUnit[] {
  const out: NumberWithUnit[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(PATTERN)) {
    const intPart = (m[1] ?? "").replace(/[ \u00A0]/g, "");
    const decPart = m[2] ?? "";
    const value = Number.parseFloat(decPart ? `${intPart}.${decPart}` : intPart);
    if (!Number.isFinite(value)) continue;
    const unit = UNIT_NORMALIZE[(m[3] ?? "").toLowerCase()];
    if (!unit) continue;
    const key = `${value}|${unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value, unit, raw: m[0] });
  }
  return out;
}

export function compareNumerical(
  reference: NumberWithUnit[],
  generated: NumberWithUnit[],
): NumericalComparison {
  const refByUnit = new Map<string, number[]>();
  const genByUnit = new Map<string, number[]>();
  for (const n of reference) {
    if (!refByUnit.has(n.unit)) refByUnit.set(n.unit, []);
    refByUnit.get(n.unit)!.push(n.value);
  }
  for (const n of generated) {
    if (!genByUnit.has(n.unit)) genByUnit.set(n.unit, []);
    genByUnit.get(n.unit)!.push(n.value);
  }

  const correct: NumberWithUnit[] = [];
  const wrong_value: NumericalComparison["wrong_value"] = [];
  const missed: NumberWithUnit[] = [];
  const unsupported: NumberWithUnit[] = [];

  const allUnits = new Set([...refByUnit.keys(), ...genByUnit.keys()]);
  for (const unit of allUnits) {
    const rv = refByUnit.get(unit) ?? [];
    const gv = genByUnit.get(unit) ?? [];
    if (rv.length === 0) {
      for (const v of gv) unsupported.push({ value: v, unit, raw: `${v} ${unit}` });
      continue;
    }
    if (gv.length === 0) {
      for (const v of rv) missed.push({ value: v, unit, raw: `${v} ${unit}` });
      continue;
    }
    const refSet = new Set(rv);
    const genSet = new Set(gv);
    const common = [...refSet].filter((v) => genSet.has(v));
    const refOnly = [...refSet].filter((v) => !genSet.has(v));
    const genOnly = [...genSet].filter((v) => !refSet.has(v));
    for (const v of common) correct.push({ value: v, unit, raw: `${v} ${unit}` });
    if (refOnly.length > 0) {
      wrong_value.push({ unit, expected: refOnly, generated: genOnly });
    }
    if (refOnly.length === 0 && genOnly.length > 0) {
      for (const v of genOnly) unsupported.push({ value: v, unit, raw: `${v} ${unit}` });
    }
  }

  return { correct, wrong_value, missed, unsupported };
}
