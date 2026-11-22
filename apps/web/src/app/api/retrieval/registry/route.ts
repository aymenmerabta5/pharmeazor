import { handleRegistryLookup } from "@repo/api/retrieval";

/**
 * Internal server-to-server product-register lookup for the Eve harness.
 *
 * The harness signs the body with `EVE_INTERNAL_AUTH_SECRET`; this route never
 * serves browser traffic and resolves the caller from that signed envelope.
 */
export async function POST(request: Request): Promise<Response> {
  return await handleRegistryLookup(request);
}
