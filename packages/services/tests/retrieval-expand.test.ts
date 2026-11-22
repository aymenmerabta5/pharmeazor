import { describe, expect, it } from "bun:test";

import { retrieval } from "@repo/services";

const { MAX_EXPANDED_TERMS, aliasCandidateKeys, expandQueryTerms } = retrieval;

type AliasMatch = retrieval.AliasMatch;

function match(overrides: Partial<AliasMatch> & { aliasNorm: string }): AliasMatch {
  return {
    aliasRaw: overrides.aliasNorm.toUpperCase(),
    dciNorms: [],
    dciLabels: [],
    ambiguous: false,
    ...overrides,
  };
}

describe("alias candidate keys", () => {
  it("covers every contiguous span up to four tokens", () => {
    const keys = aliasCandidateKeys(["dolko", "500", "mg"]);

    expect(keys).toContain("dolko");
    expect(keys).toContain("dolko 500");
    expect(keys).toContain("dolko 500 mg");
    expect(keys).toContain("500 mg");
  });

  it("caps the key list for a long query", () => {
    const terms = Array.from({ length: 400 }, (_, index) => `t${index}`);
    expect(aliasCandidateKeys(terms).length).toBeLessThanOrEqual(512);
  });
});

describe("brand query expansion", () => {
  it("appends the substance and keeps the brand's own weight", () => {
    const expansion = expandQueryTerms(
      ["dolko", "500"],
      [match({ aliasNorm: "dolko", dciNorms: ["paracetamol"] })],
    );

    expect(expansion.terms).toEqual(["dolko", "500", "paracetamol"]);
    expect(expansion.expandedTerms).toEqual(["paracetamol"]);
    expect(expansion.ambiguousAliases).toEqual([]);
  });

  it("does not append a term the query already contains", () => {
    const expansion = expandQueryTerms(
      ["paracetamol", "dolko"],
      [match({ aliasNorm: "dolko", dciNorms: ["paracetamol"] })],
    );

    expect(expansion.terms).toEqual(["paracetamol", "dolko"]);
    expect(expansion.expandedTerms).toEqual([]);
  });

  it("refuses to expand a brand that covers two substances", () => {
    const expansion = expandQueryTerms(
      ["coparamol"],
      [
        match({
          aliasNorm: "coparamol",
          aliasRaw: "COPARAMOL",
          dciNorms: ["paracetamol", "paracetamol codeine"],
          ambiguous: true,
        }),
      ],
    );

    expect(expansion.terms).toEqual(["coparamol"]);
    expect(expansion.expandedTerms).toEqual([]);
    expect(expansion.ambiguousAliases).toEqual(["COPARAMOL"]);
  });

  it("treats a multi-substance match as ambiguous even without the flag", () => {
    const expansion = expandQueryTerms(
      ["coparamol"],
      [
        match({
          aliasNorm: "coparamol",
          dciNorms: ["paracetamol", "paracetamol codeine"],
          ambiguous: false,
        }),
      ],
    );

    expect(expansion.expandedTerms).toEqual([]);
    expect(expansion.ambiguousAliases).toHaveLength(1);
  });

  it("bounds the appended token budget", () => {
    const expansion = expandQueryTerms(
      ["brand"],
      [
        match({
          aliasNorm: "brand",
          dciNorms: ["one two three four five six"],
        }),
      ],
    );

    expect(expansion.expandedTerms).toHaveLength(MAX_EXPANDED_TERMS);
    expect(expansion.terms).toEqual(["brand", "one", "two", "three", "four"]);
  });

  it("prefers the longest matching alias", () => {
    const expansion = expandQueryTerms(
      ["dolko", "500", "mg"],
      [
        match({ aliasNorm: "dolko", dciNorms: ["paracetamol"] }),
        match({ aliasNorm: "dolko 500", dciNorms: ["paracetamol codeine"] }),
      ],
    );

    expect(expansion.expandedTerms).toEqual(["paracetamol", "codeine"]);
    expect(expansion.terms.filter((term) => term === "paracetamol")).toHaveLength(1);
  });

  it("leaves an unknown query untouched", () => {
    const expansion = expandQueryTerms(["unknown", "brand"], []);

    expect(expansion.terms).toEqual(["unknown", "brand"]);
    expect(expansion.expandedTerms).toEqual([]);
    expect(expansion.ambiguousAliases).toEqual([]);
  });
});
