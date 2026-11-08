"use client";
import { useAppForm, useStore } from "@/components/ui/form";
import { useAgentSession } from "./queries";
import { sendAgentPrompt } from "./mutations";

export function useAgentConversation() {
  const agent = useAgentSession();
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const form = useAppForm({
    defaultValues: { input: "" },
    onSubmit: async ({ value }): Promise<void> => {
      if (!value.input.trim() || busy) return;
      const sending = sendAgentPrompt(agent, value.input);
      form.reset();
      try {
        await sending;
      } catch {
        /* Eve owns the stream error shown by the feature. */
      }
    },
  });
  const input = useStore(form.store, (state) => state.values.input);
  const setInput = (value: string): void => {
    form.setFieldValue("input", value);
  };
  return {
    input,
    setInput,
    submit: () => {
      void form.handleSubmit();
    },
    busy,
    messages: agent.data.messages,
    streaming: agent.status === "streaming",
    error: agent.error,
  };
}
