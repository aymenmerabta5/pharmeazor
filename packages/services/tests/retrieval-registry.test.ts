import { describe, expect, it } from "bun:test";

import { retrieval } from "@repo/services";

const {
  REGISTRY_DISCLAIMER,
  REGISTRY_LIMITS,
  RegistryError,
  compactRegistryText,
  createRegistryService,
  foldRegistryText,
  normalizeRegistryRequest,
} = retrieval;

type RegistryLookupInput = retrieval.RegistryLookupInput;
type RegistryPage = retrieval.RegistryPage;
type RegistryPort = retrieval.RegistryPort;
type RegistryProduct = retrieval.RegistryProduct;

function product(overrides: Partial<RegistryProduct> = {}): RegistryProduct {
  return {
    registrationNumber: "285/11 H 078/21",
    brand: "YASMINE",
    dci: "ETHINYLESTRADIOL + DROSPIRENONE",
    dciCode: "G03AA12",
    form: "COMPRIME PELLICULE",
    dosage: "3MG/0,03MG",
    pack: "B/21",
    schedule: "LISTE I",
    holder: "HIKMA",
    holderCountry: "ALGERIE",
    productType: "GE",
    registrationStatus: "registered",
    withdrawalDate: null,
    withdrawalReason: null,
    shelfLife: "36 MOIS",
    isCombination: true,
    inScope: true,
    medicineIds: ["MED001"],
    ...overrides,
  };
}

function port(page: Partial<RegistryPage> = {}): RegistryPort & {
  readonly calls: RegistryLookupInput[];
} {
  const calls: RegistryLookupInput[] = [];
  return {
    calls,
    async lookupProducts(input) {
      calls.push(input);
      return {
        products: page.products ?? [product()],
        total: page.total ?? 1,
        truncated: page.truncated ?? false,
      };
    },
  };
}

describe("registry text folding", () => {
  it("folds accents so both register spellings match", () => {
    expect(foldRegistryText("PARACÉTAMOL")).toBe("PARACETAMOL");
    expect(foldRegistryText("paracétamol")).toBe("PARACETAMOL");
    expect(foldRegistryText("paracetamol")).toBe("PARACETAMOL");
  });

  it("collapses whitespace and case", () => {
    expect(foldRegistryText("  doliprane   enfant  ")).toBe("DOLIPRANE ENFANT");
  });

  it("compacts registration numbers so spacing does not matter", () => {
    expect(compactRegistryText("352/01 A 003/06/22")).toBe("352/01A003/06/22");
    expect(compactRegistryText("352/01a003/06/22")).toBe("352/01A003/06/22");
  });

  it("treats a missing value as an empty string", () => {
    expect(foldRegistryText(null)).toBe("");
    expect(compactRegistryText(undefined)).toBe("");
  });
});

describe("registry request normalization", () => {
  it("defaults to an auto lookup that keeps withdrawn products", () => {
    const input = normalizeRegistryRequest({ query: "DOLIPRANE" });

    expect(input.kind).toBe("auto");
    expect(input.limit).toBe(REGISTRY_LIMITS.defaultLimit);
    expect(input.includeWithdrawn).toBe(true);
    expect(input.registrationShaped).toBe(false);
  });

  it("recognises a registration number", () => {
    expect(normalizeRegistryRequest({ query: "352/01 A 003/06/22" }).registrationShaped).toBe(true);
  });

  it("does not mistake a brand for a registration number", () => {
    expect(normalizeRegistryRequest({ query: "DOLKO" }).registrationShaped).toBe(false);
    expect(normalizeRegistryRequest({ query: "VITAMINE D3" }).registrationShaped).toBe(false);
  });

  it("collapses whitespace before measuring the query", () => {
    expect(normalizeRegistryRequest({ query: "  DOLKO   ENFANT " }).query).toBe("DOLKO ENFANT");
  });

  it("rejects a query that is too short", () => {
    expect(() => normalizeRegistryRequest({ query: " D " })).toThrow(RegistryError);
  });

  it("rejects a query past the transport limit", () => {
    const query = "A".repeat(REGISTRY_LIMITS.maxQueryChars + 1);
    expect(() => normalizeRegistryRequest({ query })).toThrow(RegistryError);
  });

  it("rejects a limit outside the allowed range", () => {
    expect(() => normalizeRegistryRequest({ query: "DOLKO", limit: 0 })).toThrow(RegistryError);
    expect(() => normalizeRegistryRequest({ query: "DOLKO", limit: 26 })).toThrow(RegistryError);
    expect(() => normalizeRegistryRequest({ query: "DOLKO", limit: 2.5 })).toThrow(RegistryError);
  });

  it("rejects an unknown query kind", () => {
    expect(() => normalizeRegistryRequest({ query: "DOLKO", kind: "nonsense" as "auto" })).toThrow(
      RegistryError,
    );
  });
});

describe("registry service", () => {
  it("returns the register page, the total, and the disclaimer", async () => {
    const registry = port({ total: 308, truncated: true });
    const service = createRegistryService({ registry });

    const result = await service.lookup({ query: "paracétamol", kind: "substance", limit: 3 });

    expect(result.query).toBe("paracétamol");
    expect(result.kind).toBe("substance");
    expect(result.total).toBe(308);
    expect(result.truncated).toBe(true);
    expect(result.products).toHaveLength(1);
    expect(result.disclaimer).toBe(REGISTRY_DISCLAIMER);
  });

  it("passes the normalized request to the port", async () => {
    const registry = port();
    const service = createRegistryService({ registry });

    await service.lookup({ query: "  DOLKO ", includeWithdrawn: false });

    expect(registry.calls[0]).toEqual({
      query: "DOLKO",
      kind: "auto",
      limit: REGISTRY_LIMITS.defaultLimit,
      includeWithdrawn: false,
      registrationShaped: false,
    });
  });

  it("reports an empty page as an empty answer, not an error", async () => {
    const registry = port({ products: [], total: 0, truncated: false });
    const service = createRegistryService({ registry });

    const result = await service.lookup({ query: "NOT-A-REAL-BRAND" });

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("turns an unexpected port failure into a do-not-answer-from-memory error", async () => {
    const warnings: string[] = [];
    const service = createRegistryService({
      registry: {
        async lookupProducts() {
          throw new Error("connection refused");
        },
      },
      warn: (message) => warnings.push(message),
    });

    const failure = service.lookup({ query: "DOLKO" });

    await expect(failure).rejects.toBeInstanceOf(RegistryError);
    await expect(failure).rejects.toMatchObject({ code: "REGISTRY_UNAVAILABLE" });
    expect(warnings).toHaveLength(1);
  });

  it("passes a registry error through instead of masking it", async () => {
    const service = createRegistryService({
      registry: {
        async lookupProducts() {
          throw new RegistryError("REGISTRY_INVALID_REQUEST", "bad query");
        },
      },
    });

    await expect(service.lookup({ query: "DOLKO" })).rejects.toMatchObject({
      code: "REGISTRY_INVALID_REQUEST",
    });
  });
});
