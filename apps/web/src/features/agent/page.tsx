"use client";
import type * as React from "react";
import { AgentWorkspace } from "./components/agent-workspace";
import { useAgentAccount } from "./use-agent-account";
import { useAgentConversation } from "./use-agent-conversation";
import { useAgentRail } from "./use-agent-rail";

export function AgentPage({
  initialQuestion,
}: {
  /** Deep-link question from the route, if the visitor arrived with one. */
  initialQuestion?: string;
}): React.JSX.Element {
  const conversation = useAgentConversation(initialQuestion);
  const account = useAgentAccount();
  const rail = useAgentRail();
  return <AgentWorkspace conversation={conversation} account={account} rail={rail} />;
}
