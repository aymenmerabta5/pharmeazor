"use client";
import * as React from "react";
import { useChatHistory } from "@/hooks/use-chat-history";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { createAssistantReply, createUserMessage, type ChatMessage } from "./model";

/** Delay before the demo assistant reply lands. */
const REPLY_DELAY_MS = 900;

/**
 * Chat conversation workflow.
 *
 * Owns the message log, the composer value, the pending reply timer and the
 * history entry the conversation is attached to. The route passes the deep-link
 * question in, so the surface renders the conversation state on the server
 * instead of waiting for a client-side search-param read.
 */
export function useChatSession(initialQuestion?: string) {
  const history = useChatHistory();
  const [activeQuery, setActiveQuery] = React.useState<string | null>(initialQuestion ?? null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pendingSince, setPendingSince] = React.useState<number | null>(null);
  const handledInitialQuery = React.useRef(false);

  const send = React.useCallback(
    (text?: string) => {
      const question = (text ?? input).trim();
      if (!question || busy) return;

      const createdAt = Date.now();
      setInput("");
      setBusy(true);
      setPendingSince(createdAt);
      setMessages((previous) => [...previous, createUserMessage(question, createdAt)]);
      // The shared history is built from what is actually searched for.
      history.record(question);
      setActiveQuery((current) => current ?? question);
    },
    [busy, history, input],
  );

  /**
   * The pending reply is a consequence of `busy`, so an effect owns the timer.
   *
   * Holding the timer in a ref made a remount fatal: the ref's guard survived
   * StrictMode's simulated unmount while its cleanup cleared the timeout, so
   * the surface stayed busy forever. An effect keyed on the pending state is
   * cancelled and rescheduled by a remount instead of lost.
   */
  React.useEffect(() => {
    if (!busy) return;
    const createdAt = pendingSince ?? Date.now();
    const timer = setTimeout(() => {
      setMessages((previous) => [...previous, createAssistantReply(createdAt)]);
      setPendingSince(null);
      setBusy(false);
    }, REPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy, pendingSince]);

  React.useEffect(() => {
    if (!initialQuestion || handledInitialQuery.current) return;
    handledInitialQuery.current = true;
    send(initialQuestion);
  }, [initialQuestion, send]);

  const newQuestion = React.useCallback(() => {
    setActiveQuery(null);
    setMessages([]);
    setInput("");
    if (initialQuestion) window.history.replaceState(null, "", "/");
  }, [initialQuestion]);

  const selectEntry = React.useCallback(
    (entry: ChatHistoryEntry) => {
      setActiveQuery(entry.query);
      // Saved transcripts are not persisted yet, so the panel starts empty.
      setMessages([]);
      if (initialQuestion) window.history.replaceState(null, "", "/");
    },
    [initialQuestion],
  );

  const activeEntry = history.entries.find((entry) => entry.query === activeQuery);

  return {
    activeQuery,
    activeTitle: activeEntry?.query ?? null,
    busy,
    entries: history.entries,
    input,
    messages,
    newQuestion,
    selectEntry,
    send,
    setInput,
  };
}
