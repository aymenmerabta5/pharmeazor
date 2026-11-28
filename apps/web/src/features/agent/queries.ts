import { useEveAgent, type UseEveAgentOptions } from "eve/react";

/**
 * The Eve client appends `/eve/v1/*` to its base URL. Pointing the base at the
 * canonical `/api/agent/harness/v1` facade keeps browser traffic on the
 * application-owned harness path; the facade normalizes the framework suffix.
 *
 * Keep streaming state, subscriptions and cancellation owned by the Eve SDK.
 */
export function useAgentSession(options: Omit<UseEveAgentOptions, "baseUrl"> = {}) {
  return useEveAgent({ ...options, baseUrl: "/api/agent/harness/v1" });
}
