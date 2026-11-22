import {
  parseRetrievalRegistryResponse,
  type RetrievalWireRegistryProduct,
  type RetrievalWireRegistryResponse,
} from "@repo/contracts";

import { signedInternalPost } from "./internal-request.ts";

/**
 * Client for the application's internal product-register route.
 *
 * The register is a deterministic SQL lookup, not a retrieval arm: it answers
 * registration status, dispensing schedule, holder and withdrawal, which
 * similarity search cannot answer reliably. The wire contract is owned by
 * `@repo/contracts` and shared with the application, so the two sides cannot
 * drift.
 */

const REGISTRY_PATH = "/api/retrieval/registry";

export type RegistryClientProduct = RetrievalWireRegistryProduct;
export type RegistryClientResult = RetrievalWireRegistryResponse;

export interface RegistryClientRequest {
  readonly query: string;
  readonly kind?: "auto" | "brand" | "substance" | "registration";
  readonly limit?: number;
  readonly includeWithdrawn?: boolean;
}

export async function lookupProductRegister(
  principalId: string,
  input: RegistryClientRequest,
): Promise<RegistryClientResult> {
  const payload = await signedInternalPost({
    path: REGISTRY_PATH,
    label: "Product register lookup",
    principalId,
    payload: {
      query: input.query,
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.includeWithdrawn === undefined ? {} : { includeWithdrawn: input.includeWithdrawn }),
    },
  });

  return parseRetrievalRegistryResponse(payload);
}
