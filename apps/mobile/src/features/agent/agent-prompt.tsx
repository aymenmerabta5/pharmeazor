import type * as React from "react";
import { useAgentPrompt } from "./use-agent-prompt";
import { AgentPromptView } from "./components/agent-prompt";
import type { AgentSend } from "./use-agent-conversation";
import { useTranslations } from "@/lib/i18n";
export function AgentPrompt({
  send,
  pending,
}: {
  send: AgentSend;
  pending: boolean;
}): React.JSX.Element {
  const t = useTranslations("agent");
  const form = useAgentPrompt(send, t("requestError"));
  return (
    <AgentPromptView
      form={form}
      pending={pending}
      label={t("messageLabel")}
      placeholder={t("messagePlaceholder")}
      working={t("working")}
      submitLabel={t("send")}
    />
  );
}
