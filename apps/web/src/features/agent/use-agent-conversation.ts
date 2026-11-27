"use client";
import * as React from "react";
import { useAppForm, useStore } from "@/components/ui/form";
import { useAgentSession } from "./queries";
import { sendAgentPrompt } from "./mutations";
import { conversationTitle, lastUserText } from "./model";

export function useAgentConversation(initialQuestion?: string) {
  const agent = useAgentSession();
  // Eve reports outstanding work as "busy" or "resuming"; the transcript marker follows the
  // assistant message Eve is still streaming.
  const busy = agent.status !== "idle";
  const streaming = agent.messages.some((message) => message.metadata?.status === "streaming");
  const send = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    try {
      await sendAgentPrompt(agent, trimmed);
    } catch {
      /* Eve owns the stream error shown by the feature. */
    }
  };
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
  const handledInitialQuestion = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Eve reports "busy" or "resuming" while it restores a durable session.
    // Sending during that window is dropped, so wait until it is idle and only
    // then mark the question handled.
    if (!initialQuestion || busy) return;
    if (handledInitialQuestion.current === initialQuestion) return;
    handledInitialQuestion.current = initialQuestion;
    form.reset();
    void send(initialQuestion);
    window.history.replaceState(null, "", "/agent");
  }, [busy, initialQuestion, form, send]);
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
    draftSuggestion: (question: string) => {
      form.setFieldValue("input", question);
    },
    ask: (question: string) => {
      form.reset();
      void send(question);
    },
    retry: () => {
      const question = lastUserText(agent.messages);
      if (question) void send(question);
    },
    newChat: () => {
      agent.newSession();
      form.reset();
    },
    busy,
    messages: agent.messages,
    streaming,
    error: agent.error,
    title: conversationTitle(agent.messages),
  };
}
