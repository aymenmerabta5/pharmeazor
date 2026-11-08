"use client";
import { useAppForm, useStore } from "@/components/ui/form";
import { useAgentSession } from "./queries";
import { sendAgentPrompt } from "./mutations";

export function useAgentConversation() {
  const agent = useAgentSession();
  // Eve reports outstanding work as "busy" or "resuming"; the transcript marker follows the
  // assistant message Eve is still streaming.
  const busy = agent.status !== "idle";
  const streaming = agent.messages.some((message) => message.metadata?.status === "streaming");
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
    messages: agent.messages,
    streaming,
    error: agent.error,
  };
}
