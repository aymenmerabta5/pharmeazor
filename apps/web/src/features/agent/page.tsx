"use client";
import type * as React from "react";
import { AgentWorkspace } from "./components/agent-workspace";
import { useAgentConversation } from "./use-agent-conversation";

export function AgentPage(): React.JSX.Element {
  return <AgentWorkspace {...useAgentConversation()} />;
}
