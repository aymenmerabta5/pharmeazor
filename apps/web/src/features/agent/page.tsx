"use client";
import type * as React from "react";
import type { ClientSessionState } from "eve/client";
import { AgentWorkspace } from "./components/agent-workspace";
import type { AgentConversationSummary } from "./model";
import { useAgentAccount } from "./use-agent-account";
import { useAgentConversation } from "./use-agent-conversation";
import { useAgentRail } from "./use-agent-rail";

export function AgentPage({
  initialQuestion,
  initialConversations = [],
  initialSession = null,
}: {
  /** Deep-link question from the route, if the visitor arrived with one. */
  initialQuestion?: string;
  /** Saved conversations loaded by the server for the signed-in owner. */
  initialConversations?: readonly AgentConversationSummary[];
  /** Durable session to resume when the route names a saved conversation. */
  initialSession?: ClientSessionState | null;
}): React.JSX.Element {
  const conversation = useAgentConversation(initialQuestion, {
    conversations: initialConversations,
    session: initialSession,
  });
  const account = useAgentAccount();
  const rail = useAgentRail();
  return <AgentWorkspace conversation={conversation} account={account} rail={rail} />;
}
