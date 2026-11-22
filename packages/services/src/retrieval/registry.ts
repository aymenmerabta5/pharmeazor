/**
 * The Algerian product register as a lookup surface.
 *
 * Registration status, dispensing schedule, holder and pack are facts. They are
 * exactly the facts that similarity search answers badly: a vector index
 * returns passages that *talk about* a product, while "is DOLKO still
 * registered" needs a row. So this module is a deterministic lookup, not a
 * retrieval arm, and it deliberately has no embedding, no scoring and no
 * ranking by similarity.
 *
 * The register is also not a clinical source. It states that a product is
 * registered, who holds it, and how it is dispensed; it never states an
 * indication or a dose. Every result carries that boundary as a notice so the
 * agent cannot present a register row as a dosing recommendation.
 */

import type { RegistryLookupInput, RegistryProduct, RegistryQueryKind } from "./contracts";
import type { RegistryPort } from "./ports";

export const REGISTRY_DISCLAIMER =
  "Register facts only: registration status, dispensing schedule, holder, pack and withdrawal. " +
  "A register row is not an indication, a dose, or a clinical recommendation.";

export const REGISTRY_LIMITS = {
  maxQueryChars: 128,
  minQueryChars: 2,
  defaultLimit: 10,
  maxLimit: 25,
} as const;

/**
 * Fold a register value for matching: strip accents, uppercase, collapse
 * whitespace. The register spells the same substance `PARACÉTAMOL` and
 * `PARACETAMOL`; a lookup must not depend on which sheet a row came from.
 */
export function foldRegistryText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The same fold with whitespace removed, for registration numbers. */
export function compactRegistryText(value: string | null | undefined): string {
  return foldRegistryText(value).replace(/\s+/g, "");
}

const QUERY_KINDS: readonly RegistryQueryKind[] = ["auto", "brand", "substance", "registration"];

/** Registration numbers carry slashes and spaces; brand queries do not. */
const REGISTRATION_PATTERN = /^[0-9][0-9A-Z/ .-]{1,63}$/;

export interface RegistryLookupRequest {
  readonly query: string;
  /** Defaults to `auto`, which searches brand and substance together. */
  readonly kind?: RegistryQueryKind;
  readonly limit?: number;
  /**
   * Withdrawn products are returned by default. A withdrawal is a safety fact,
   * not noise: hiding it would let a delisted brand read as available.
   */
  readonly includeWithdrawn?: boolean;
}

export interface RegistryLookupResult {
  readonly query: string;
  readonly kind: RegistryQueryKind;
  readonly products: readonly RegistryProduct[];
  /** Rows matching the query, before the page limit. */
  readonly total: number;
  /** True when the register held more rows than the limit returned. */
  readonly truncated: boolean;
  readonly includeWithdrawn: boolean;
  readonly disclaimer: string;
}

export interface RegistryService {
  lookup(request: RegistryLookupRequest): Promise<RegistryLookupResult>;
}

export interface RegistryServiceDependencies {
  readonly registry: RegistryPort;
  readonly warn?: (message: string, detail?: unknown) => void;
}

export interface RegistryErrorShape {
  readonly code: "REGISTRY_INVALID_REQUEST" | "REGISTRY_UNAVAILABLE";
  readonly message: string;
}

export class RegistryError extends Error implements RegistryErrorShape {
  readonly code: RegistryErrorShape["code"];

  constructor(code: RegistryErrorShape["code"], message: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}

export function isRegistryError(value: unknown): value is RegistryError {
  return value instanceof RegistryError;
}

function normalizeKind(value: RegistryQueryKind | undefined): RegistryQueryKind {
  if (value === undefined) return "auto";
  if (!QUERY_KINDS.includes(value)) {
    throw new RegistryError("REGISTRY_INVALID_REQUEST", `Unknown registry query kind: ${value}`);
  }
  return value;
}

function normalizeQuery(value: unknown): string {
  if (typeof value !== "string") {
    throw new RegistryError("REGISTRY_INVALID_REQUEST", "query must be a string");
  }
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length < REGISTRY_LIMITS.minQueryChars) {
    throw new RegistryError(
      "REGISTRY_INVALID_REQUEST",
      `query must be at least ${REGISTRY_LIMITS.minQueryChars} characters`,
    );
  }
  if (collapsed.length > REGISTRY_LIMITS.maxQueryChars) {
    throw new RegistryError(
      "REGISTRY_INVALID_REQUEST",
      `query must be at most ${REGISTRY_LIMITS.maxQueryChars} characters`,
    );
  }
  return collapsed;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return REGISTRY_LIMITS.defaultLimit;
  if (!Number.isInteger(value) || value < 1 || value > REGISTRY_LIMITS.maxLimit) {
    throw new RegistryError(
      "REGISTRY_INVALID_REQUEST",
      `limit must be an integer between 1 and ${REGISTRY_LIMITS.maxLimit}`,
    );
  }
  return value;
}

export function normalizeRegistryRequest(request: RegistryLookupRequest): RegistryLookupInput {
  const query = normalizeQuery(request.query);
  const kind = normalizeKind(request.kind);
  return {
    query,
    kind,
    limit: normalizeLimit(request.limit),
    includeWithdrawn: request.includeWithdrawn !== false,
    registrationShaped: REGISTRATION_PATTERN.test(foldRegistryText(query)),
  };
}

export function createRegistryService(dependencies: RegistryServiceDependencies): RegistryService {
  return {
    async lookup(request) {
      const input = normalizeRegistryRequest(request);
      let products: readonly RegistryProduct[];
      let total: number;
      let truncated: boolean;
      try {
        const page = await dependencies.registry.lookupProducts(input);
        products = page.products;
        total = page.total;
        truncated = page.truncated;
      } catch (cause) {
        if (isRegistryError(cause)) throw cause;
        dependencies.warn?.("Registry lookup failed", cause);
        throw new RegistryError(
          "REGISTRY_UNAVAILABLE",
          "The product register is unavailable. Do not answer from memory.",
        );
      }
      return {
        query: input.query,
        kind: input.kind,
        products,
        total,
        truncated,
        includeWithdrawn: input.includeWithdrawn,
        disclaimer: REGISTRY_DISCLAIMER,
      };
    },
  };
}
