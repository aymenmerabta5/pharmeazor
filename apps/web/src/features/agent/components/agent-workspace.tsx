"use client";
import type * as React from "react";
import type { useAgentAccount } from "../use-agent-account";
import type { useAgentConversation } from "../use-agent-conversation";
import type { useAgentRail } from "../use-agent-rail";
import { AgentChat } from "./agent-chat";
import { AgentConversationSidebar } from "./agent-conversation-sidebar";
import { AgentHero } from "./agent-hero";
import { AgentRail } from "./agent-rail";
import { AgentTopbar } from "./agent-topbar";

export function AgentWorkspace({
  conversation,
  account,
  rail,
}: {
  conversation: ReturnType<typeof useAgentConversation>;
  account: ReturnType<typeof useAgentAccount>;
  rail: ReturnType<typeof useAgentRail>;
}): React.JSX.Element {
  return (
    <div className="agent-shell flex h-dvh overflow-hidden bg-background text-foreground">
      {conversation.messages.length > 0 ? (
        <AgentConversationSidebar conversation={conversation} account={account} />
      ) : rail.collapsed ? null : (
        <AgentRail conversation={conversation} account={account} onCollapse={rail.toggle} />
      )}
      <main className="flex h-dvh min-w-0 flex-1 flex-col">
        {conversation.messages.length > 0 ? (
          <AgentChat conversation={conversation} />
        ) : (
          <>
            <AgentTopbar
              planName={account.planName}
              planPending={account.planPending}
              collapsed={rail.collapsed}
              onExpand={rail.toggle}
            />
            <AgentHero conversation={conversation} />
          </>
        )}
      </main>
    </div>
  );
}
