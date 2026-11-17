import type * as React from "react";
import { usePlatformI18n, useTranslations } from "@/lib/i18n";
import { useAgentPrompt } from "./use-agent-prompt";
import { AgentPromptView } from "./components/agent-prompt";
import type { AgentSend } from "./use-agent-conversation";

export function AgentPrompt({
  send,
  pending,
}: {
  send: AgentSend;
  pending: boolean;
}): React.JSX.Element {
  const t = useTranslations("agent");
  const { direction } = usePlatformI18n();
  const form = useAgentPrompt(send, t("requestError"));
  return (
    <AgentPromptView
      form={form}
      pending={pending}
      label={t("messageLabel")}
      placeholder={t("messagePlaceholder")}
      working={t("working")}
      submitLabel={t("send")}
      rtl={direction === "rtl"}
    />
  );
}
