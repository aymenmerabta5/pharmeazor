import { useForm } from "@tanstack/react-form";
import type { AgentSend } from "./use-agent-conversation";
export function useAgentPrompt(send: AgentSend, invalidMessage: string) {
  const form = useForm({
    defaultValues: { message: "" },
    validators: {
      onSubmit: ({ value }) =>
        value.message.trim() && value.message.length <= 65536 ? undefined : invalidMessage,
    },
    onSubmit: async ({ value }) => {
      const result = await send(value.message.trim());
      if (result.status === "success" && result.isCurrent()) form.reset();
    },
  });
  return form;
}
export type AgentPromptForm = ReturnType<typeof useAgentPrompt>;
