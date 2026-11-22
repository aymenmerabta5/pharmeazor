import {
  parseRetrievalSearchResponse,
  type RetrievalWireChunk,
  type RetrievalWireResponse,
} from "@repo/contracts";

import { signedInternalPost } from "./internal-request.ts";

/**
 * Client for the application's internal retrieval route.
 *
 * The retrieval service lives behind `server-only` in the Next.js process, so
 * the harness cannot import it. The signed envelope lives in
 * `./internal-request.ts`, shared with the register lookup.
 *
 * The response shape is not parsed here. `@repo/contracts` owns the wire
 * contract, and the application builds the same object from the same types, so
 * a field added on one side cannot drift from the other.
 */

const SEARCH_PATH = "/api/retrieval/search";

export type RetrievalClientChunk = RetrievalWireChunk;
export type RetrievalClientResult = RetrievalWireResponse;

export interface RetrievalClientRequest {
  readonly query: string;
  readonly limit?: number;
  readonly medicineIds?: readonly string[];
  readonly sectionCodes?: readonly string[];
  readonly languages?: readonly string[];
  readonly sourceIds?: readonly string[];
}

export async function searchMedicalCorpus(
  principalId: string,
  input: RetrievalClientRequest,
): Promise<RetrievalClientResult> {
  const payload = await signedInternalPost({
    path: SEARCH_PATH,
    label: "Medical corpus retrieval",
    principalId,
    payload: {
      query: input.query,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.medicineIds?.length ? { medicineIds: input.medicineIds } : {}),
      ...(input.sectionCodes?.length ? { sectionCodes: input.sectionCodes } : {}),
      ...(input.languages?.length ? { languages: input.languages } : {}),
      ...(input.sourceIds?.length ? { sourceIds: input.sourceIds } : {}),
    },
  });

  return parseRetrievalSearchResponse(payload);
}
