import type { useAgentSession } from "./queries";

export function sendAgentPrompt(agent: ReturnType<typeof useAgentSession>, input: string) {
  return agent.send(input);
}
