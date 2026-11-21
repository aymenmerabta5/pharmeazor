import { describe, expect, it } from "bun:test";
import { retrieval } from "@repo/services";

const {
  AUTHORITY_PRECEDENCE,
  authorityDescriptor,
  authorityLabel,
  claimScopeForSource,
  compareAuthority,
  findAuthorityOverlaps,
  isOfficialAuthority,
  numericClaims,
} = retrieval;

function chunk(
  chunkId: string,
  medicineIds: readonly string[],
  authorityLevel: number,
  overrides: Partial<{
    sectionCodes: readonly string[];
    sourceId: string;
    sourceName: string;
    content: string;
  }> = {},
) {
  return {
    chunkId,
    medicineIds,
    sectionCodes: overrides.sectionCodes ?? ["dosage"],
    sourceId: overrides.sourceId ?? "SRC",
    sourceName: overrides.sourceName ?? "Source",
    authorityLevel,
    ...(overrides.content === undefined ? {} : { content: overrides.content }),
  };
}

describe("authority policy", () => {
  it("ranks the Algerian official sources above every other source", () => {
    expect(authorityDescriptor(1).official).toBe(true);
    expect(authorityDescriptor(2).official).toBe(false);
    expect(authorityDescriptor(3).official).toBe(false);
    expect(authorityDescriptor(4).official).toBe(false);
    expect(authorityLabel(1)).toContain("ANPP");
    expect(isOfficialAuthority(1)).toBe(true);
    expect(isOfficialAuthority(3)).toBe(false);
  });

  it("separates registration sources from clinical sources", () => {
    expect(claimScopeForSource("SANTE_MSP")).toBe("registration");
    expect(claimScopeForSource("PHARMNET_CATALOG")).toBe("registration");
    expect(claimScopeForSource("ANPP_RCP")).toBe("clinical");
    expect(claimScopeForSource("BDPM_FR")).toBe("clinical");
    expect(claimScopeForSource("an-unregistered-source")).toBe("clinical");
  });

  it("canonicalises numeric claims", () => {
    expect([...numericClaims("500 MG puis 1,5 g, 2 fois par jour")]).toEqual([
      "500 mg",
      "1.5 g",
      "2 fois",
    ]);
    expect([...numericClaims("no numbers here")]).toEqual([]);
  });

  it("treats lower numbers as higher authority", () => {
    expect(compareAuthority(1, 2)).toBeLessThan(0);
    expect(compareAuthority(3, 2)).toBeGreaterThan(0);
    expect(compareAuthority(2, 2)).toBe(0);
  });

  it("falls back to a secondary label for an unknown level", () => {
    expect(authorityDescriptor(99).official).toBe(false);
    expect(authorityLabel(99)).toBe("Unknown authority");
  });

  it("states the precedence rule in the prompt-ready constant", () => {
    expect(AUTHORITY_PRECEDENCE).toContain("lower wins");
    expect(AUTHORITY_PRECEDENCE).toContain("ANPP");
    expect(AUTHORITY_PRECEDENCE).toContain("Never let a level 3 or 4");
  });

  it("reports an overlap when sources of different authority cover the same section", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-dose", ["MED031"], 1, { sourceId: "ANPP_RCP", sourceName: "ANPP" }),
      chunk("bdpm-dose", ["MED031"], 3, { sourceId: "BDPM_FR", sourceName: "BDPM" }),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.preferredChunkId).toBe("anpp-dose");
    expect(overlaps[0]?.preferredAuthorityLevel).toBe(1);
    expect(overlaps[0]?.authorityGap).toBe(2);
    expect(overlaps[0]?.medicineIds).toEqual(["MED031"]);
    expect(overlaps[0]?.sectionCodes).toEqual(["dosage"]);
    expect(overlaps[0]?.entries.map((entry) => entry.chunkId)).toEqual(["anpp-dose", "bdpm-dose"]);
  });

  it("matches a multi-medicine clinical chunk against a single-medicine leaflet", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-dose", ["MED031"], 1, { sourceId: "ANPP_RCP", sourceName: "ANPP" }),
      chunk("dailymed-dose", ["MED031", "MED032", "MED033", "MED034"], 3, {
        sourceId: "DAILYMED",
        sourceName: "DailyMed",
      }),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.preferredChunkId).toBe("anpp-dose");
    expect(overlaps[0]?.medicineIds).toEqual(["MED031", "MED032", "MED033", "MED034"]);
  });

  it("does not compare a register row with a leaflet on a clinical section", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-dose", ["MED031"], 1, { sourceId: "ANPP_RCP", sourceName: "ANPP" }),
      chunk("msp-dose", ["MED031"], 1, { sourceId: "SANTE_MSP", sourceName: "Ministry" }),
    ]);

    expect(overlaps).toEqual([]);
  });

  it("ignores the catch-all section because it is not a shared claim", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-other", ["MED031"], 1, {
        sourceId: "ANPP_RCP",
        sectionCodes: ["other"],
      }),
      chunk("bdpm-other", ["MED031"], 3, {
        sourceId: "BDPM_FR",
        sectionCodes: ["other"],
      }),
    ]);

    expect(overlaps).toEqual([]);
  });

  it("reports the numbers that diverge between the two passages", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-dose", ["MED031"], 1, {
        sourceId: "ANPP_RCP",
        content: "La dose maximale est de 500 mg, 2 fois par jour.",
      }),
      chunk("bdpm-dose", ["MED031"], 3, {
        sourceId: "BDPM_FR",
        content: "La dose maximale est de 1000 mg, 3 fois par jour.",
      }),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.numbersCompared).toBe(true);
    expect(overlaps[0]?.numericDivergence).toEqual(["1000 mg", "2 fois", "3 fois", "500 mg"]);
  });

  it("reports no numeric divergence when the numbers agree", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-dose", ["MED031"], 1, {
        sourceId: "ANPP_RCP",
        content: "500 mg deux fois par jour.",
      }),
      chunk("bdpm-dose", ["MED031"], 3, {
        sourceId: "BDPM_FR",
        content: "500 mg deux fois par jour.",
      }),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.numbersCompared).toBe(true);
    expect(overlaps[0]?.numericDivergence).toEqual([]);
  });

  it("compares register lists without running the numeric heuristic", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("msp-register", ["MED031"], 1, {
        sourceId: "SANTE_MSP",
        sectionCodes: ["nomenclature_registered"],
        content: "**Doliprane 500 mg** · Liste: I · N° enregistrement: 123",
      }),
      chunk("pharmnet-register", ["MED031"], 2, {
        sourceId: "PHARMNET_CATALOG",
        sectionCodes: ["nomenclature_registered"],
        content: "**Doliprane 1000 mg** · Liste: I · N° enregistrement: 456",
      }),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.claimScope).toBe("registration");
    expect(overlaps[0]?.preferredChunkId).toBe("msp-register");
    expect(overlaps[0]?.numbersCompared).toBe(false);
    expect(overlaps[0]?.numericDivergence).toEqual([]);
  });

  it("puts numeric divergences before wording-only comparisons", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-text", ["MED031"], 1, {
        sourceId: "ANPP_RCP",
        sectionCodes: ["warnings"],
      }),
      chunk("bdpm-text", ["MED031"], 3, {
        sourceId: "BDPM_FR",
        sectionCodes: ["warnings"],
      }),
      chunk("anpp-dose", ["MED032"], 1, {
        sourceId: "ANPP_RCP",
        content: "500 mg par jour",
      }),
      chunk("bdpm-dose", ["MED032"], 3, {
        sourceId: "BDPM_FR",
        content: "1000 mg par jour",
      }),
    ]);

    expect(overlaps.map((overlap) => overlap.medicineIds[0])).toEqual(["MED032", "MED031"]);
  });

  it("matches packed chunks through any of their sections", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-dose", ["MED031"], 1, { sectionCodes: ["dosage"] }),
      chunk("bdpm-packed", ["MED031"], 3, { sectionCodes: ["indications", "dosage"] }),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.sectionCodes).toEqual(["dosage", "indications"]);
  });

  it("merges groups with the same passages into one hint", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("anpp-dose", ["MED031", "MED032"], 1),
      chunk("bdpm-dose", ["MED031", "MED032"], 3),
    ]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.medicineIds).toEqual(["MED031", "MED032"]);
  });

  it("does not report an overlap for the same authority level", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("bdpm-a", ["MED031"], 3, { sourceId: "BDPM_FR", sourceName: "BDPM" }),
      chunk("dailymed-a", ["MED031"], 3, { sourceId: "DAILYMED", sourceName: "DailyMed" }),
    ]);
    expect(overlaps).toEqual([]);
  });

  it("does not report an overlap across different sections or medicines", () => {
    const overlaps = findAuthorityOverlaps([
      chunk("a", ["MED031"], 1, { sectionCodes: ["dosage"] }),
      chunk("b", ["MED031"], 3, { sectionCodes: ["pregnancy"] }),
      chunk("c", ["MED032"], 3, { sectionCodes: ["dosage"] }),
    ]);
    expect(overlaps).toEqual([]);
  });

  it("ignores chunks with no medicine id", () => {
    const overlaps = findAuthorityOverlaps([chunk("a", [], 1), chunk("b", [], 3)]);
    expect(overlaps).toEqual([]);
  });

  it("orders the most authoritative conflict first and caps the hint list", () => {
    const inputs = Array.from({ length: 12 }, (_, index) => [
      chunk(`anpp-${index}`, [`MED${index}`], 1),
      chunk(`bdpm-${index}`, [`MED${index}`], 3),
    ]).flat();
    const overlaps = findAuthorityOverlaps(inputs);

    expect(overlaps).toHaveLength(8);
    expect(overlaps.every((overlap) => overlap.preferredAuthorityLevel === 1)).toBe(true);
  });
});
