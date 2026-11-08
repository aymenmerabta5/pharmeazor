import { useEveAgent } from "eve/react";

// Keep streaming state, subscriptions and cancellation owned by the Eve SDK.
export function useAgentSession() {
  return useEveAgent({ baseUrl: "/api/agent" });
}
