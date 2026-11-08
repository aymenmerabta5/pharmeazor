import type { useAgentSession } from "./queries";

// The accepted Eve delivery is an internal receipt; this feature settles it through the
// conversation view, so the mutation deliberately exposes no vendor type.
export function sendAgentPrompt(
  agent: ReturnType<typeof useAgentSession>,
  input: string,
): Promise<unknown> {
  return agent.send(input);
}
