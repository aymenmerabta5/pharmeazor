import type * as React from "react";
import { useAgentScope } from "./use-agent-scope";
import { useAgentConversation } from "./use-agent-conversation";
import { AgentView } from "./components/agent-view";
import { AgentPrompt } from "./agent-prompt";
import { useTranslations } from "@/lib/i18n";
export function AgentScreen(): React.JSX.Element {
  const scope = useAgentScope();
  return <AgentSession key={scope.key} phase={scope.phase} />;
}
function AgentSession({
  phase,
}: {
  phase: "pending" | "authenticated" | "anonymous";
}): React.JSX.Element {
  const t = useTranslations("agent");
  const conversation = useAgentConversation(t("waiting"), t("requestError"));
  return (
    <AgentView
      messages={conversation.messages}
      error={conversation.error}
      isPending={phase === "pending"}
      isAuthenticated={phase === "authenticated"}
      composer={<AgentPrompt send={conversation.send} pending={conversation.pending} />}
      t={t}
    />
  );
}
