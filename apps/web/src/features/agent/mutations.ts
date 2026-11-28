import type { AgentConversationSummary } from "./model";
import type { useAgentSession } from "./queries";

// The accepted Eve delivery is an internal receipt; this feature settles it through the
// conversation view, so the mutation deliberately exposes no vendor type.
export function sendAgentPrompt(
  agent: ReturnType<typeof useAgentSession>,
  input: string,
): Promise<unknown> {
  return agent.send(input);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConversation(value: unknown): AgentConversationSummary | null {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" ? value.id : null;
  const title = typeof value.title === "string" ? value.title : null;
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : null;
  return id && updatedAt ? { id, title, updatedAt } : null;
}

/**
 * Asks the server to generate and persist the title for a freshly created
 * session. Failure is not fatal: the first prompt already labels the history.
 */
export async function requestAgentConversationTitle(input: {
  readonly eveSessionId: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
}): Promise<AgentConversationSummary | null> {
  const response = await fetch("/api/agent/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eveSessionId: input.eveSessionId, prompt: input.prompt }),
    signal: input.signal,
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  return isObject(body) ? parseConversation(body.conversation) : null;
}
