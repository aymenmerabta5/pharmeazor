import { describe, expect, it } from "bun:test";
import { extractNumbers, compareNumerical } from "../../src/evaluation/numerical";

describe("extractNumbers", () => {
  it("parses a simple dose", () => {
    const n = extractNumbers("Prendre 500 mg matin et soir.");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ value: 500, unit: "mg" });
  });
  it("parses comma decimal", () => {
    const n = extractNumbers("0,5 mg par jour");
    expect(n[0]).toMatchObject({ value: 0.5, unit: "mg" });
  });
  it("parses French thousand separator", () => {
    const n = extractNumbers("5 000 UI");
    expect(n[0]).toMatchObject({ value: 5000, unit: "ui" });
  });
  it("deduplicates identical values", () => {
    const n = extractNumbers("500 mg, encore 500 mg");
    expect(n).toHaveLength(1);
  });
});

describe("compareNumerical", () => {
  it("marks matching values as correct", () => {
    const c = compareNumerical(extractNumbers("500 mg"), extractNumbers("Prendre 500 mg"));
    expect(c.correct).toHaveLength(1);
    expect(c.missed).toHaveLength(0);
    expect(c.unsupported).toHaveLength(0);
    expect(c.wrong_value).toHaveLength(0);
  });
  it("marks wrong value with same unit", () => {
    const c = compareNumerical(extractNumbers("500 mg"), extractNumbers("Prendre 1000 mg"));
    expect(c.wrong_value).toHaveLength(1);
    expect(c.wrong_value[0]).toMatchObject({ unit: "mg", expected: [500], generated: [1000] });
  });
  it("marks missed value", () => {
    const c = compareNumerical(extractNumbers("500 mg"), extractNumbers("Prendre ce medicament."));
    expect(c.missed).toHaveLength(1);
  });
  it("marks unsupported value", () => {
    const c = compareNumerical(
      extractNumbers("500 mg"),
      extractNumbers("Prendre 500 mg, mais aussi 750 mg"),
    );
    expect(c.unsupported).toHaveLength(1);
    expect(c.unsupported[0]).toMatchObject({ value: 750 });
  });
  it("does not falsely mark different units as wrong", () => {
    const c = compareNumerical(extractNumbers("500 mg"), extractNumbers("500 µg"));
    expect(c.correct).toHaveLength(0);
    expect(c.wrong_value).toHaveLength(0);
    expect(c.missed).toHaveLength(1); // 500 mg missed
    expect(c.unsupported).toHaveLength(1); // 500 µg unsupported
  });
});
