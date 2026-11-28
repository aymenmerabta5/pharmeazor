"use client";
import * as React from "react";
import type { ClientSessionState } from "eve/client";
import { useAppForm, useStore } from "@/components/ui/form";
import { useAgentSession } from "./queries";
import { requestAgentConversationTitle, sendAgentPrompt } from "./mutations";
import {
  conversationTitle,
  fallbackConversationTitle,
  groupAgentConversations,
  lastUserText,
  type AgentConversationSummary,
} from "./model";

export interface AgentConversationInitial {
  readonly conversations: readonly AgentConversationSummary[];
  readonly session: ClientSessionState | null;
}

export function useAgentConversation(initialQuestion?: string, initial?: AgentConversationInitial) {
  const [conversations, setConversations] = React.useState<AgentConversationSummary[]>(() => [
    ...(initial?.conversations ?? []),
  ]);
  const [activeId, setActiveId] = React.useState<string | null>(
    initial?.session?.sessionId ?? null,
  );
  const firstPromptRef = React.useRef<string | null>(null);
  const titledRef = React.useRef(
    new Set<string>(initial?.session ? [initial.session.sessionId] : []),
  );
  const applyTitle = React.useCallback((conversation: AgentConversationSummary | null) => {
    if (!conversation?.title) return;
    setConversations((previous) =>
      previous.map((item) =>
        item.id === conversation.id ? { ...item, title: conversation.title } : item,
      ),
    );
  }, []);

  const handleSessionChange = React.useCallback(
    (session: ClientSessionState | undefined) => {
      if (!session) {
        setActiveId(null);
        return;
      }
      const id = session.sessionId;
      setActiveId(id);
      const prompt = firstPromptRef.current;
      if (!prompt || titledRef.current.has(id)) return;
      titledRef.current.add(id);
      // Keep the address pointing at the session so a refresh restores this
      // transcript. replaceState updates the router without a navigation.
      window.history.replaceState(null, "", "/agent?c=" + encodeURIComponent(id));
      const fallback = fallbackConversationTitle(prompt);
      setConversations((previous) =>
        previous.some((conversation) => conversation.id === id)
          ? previous
          : [{ id, title: fallback, updatedAt: new Date().toISOString() }, ...previous],
      );
      void requestAgentConversationTitle({ eveSessionId: id, prompt })
        .then(applyTitle)
        .catch(() => undefined);
    },
    [applyTitle],
  );

  const agent = useAgentSession({
    ...(initial?.session ? { initialSession: initial.session, resume: true } : {}),
    onSessionChange: handleSessionChange,
  });
  // Eve reports outstanding work as "busy" or "resuming"; the transcript marker follows the
  // assistant message Eve is still streaming.
  const busy = agent.status !== "idle";
  const streaming = agent.messages.some((message) => message.metadata?.status === "streaming");
  const send = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    // A resumed session already has a title; handleSessionChange ignores this
    // value for it. A new session uses the first prompt it sees.
    firstPromptRef.current ??= trimmed;
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
      const sending = send(value.input);
      form.reset();
      await sending;
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
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
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
      firstPromptRef.current = null;
      setActiveId(null);
      form.reset();
      window.history.replaceState(null, "", "/agent");
    },
    busy,
    messages: agent.messages,
    streaming,
    error: agent.error,
    title: activeConversation?.title ?? conversationTitle(agent.messages),
    history: {
      conversations,
      groups: groupAgentConversations(conversations),
      activeId,
      hasSession: activeId !== null || agent.session !== undefined,
    },
  };
}
