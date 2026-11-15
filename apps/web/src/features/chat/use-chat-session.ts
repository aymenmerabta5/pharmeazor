"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useChatHistory } from "@/hooks/use-chat-history";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { createAssistantReply, createUserMessage, type ChatMessage } from "./model";

/** Delay before the demo assistant reply lands. */
const REPLY_DELAY_MS = 900;

/**
 * Chat conversation workflow.
 *
 * Owns the message log, the composer value, the pending reply timer and the
 * history entry the conversation is attached to. The composition file only
 * wires returned values to views.
 */
export function useChatSession() {
  const searchParams = useSearchParams();
  const history = useChatHistory();
  const [activeQuery, setActiveQuery] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const replyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledInitialQuery = React.useRef(false);

  React.useEffect(
    () => () => {
      if (replyTimer.current !== null) clearTimeout(replyTimer.current);
    },
    [],
  );

  const send = React.useCallback(
    (text?: string) => {
      const question = (text ?? input).trim();
      if (!question || busy) return;

      const createdAt = Date.now();
      setInput("");
      setBusy(true);
      setMessages((previous) => [...previous, createUserMessage(question, createdAt)]);
      // The shared history is built from what is actually searched for.
      history.record(question);
      setActiveQuery((current) => current ?? question);

      replyTimer.current = setTimeout(() => {
        setMessages((previous) => [...previous, createAssistantReply(createdAt)]);
        setBusy(false);
        replyTimer.current = null;
      }, REPLY_DELAY_MS);
    },
    [busy, history, input],
  );

  const initialQuery = searchParams.get("q");
  React.useEffect(() => {
    if (!initialQuery || handledInitialQuery.current) return;
    handledInitialQuery.current = true;
    send(initialQuery);
  }, [initialQuery, send]);

  const newQuestion = React.useCallback(() => {
    setActiveQuery(null);
    setMessages([]);
    setInput("");
  }, []);

  const selectEntry = React.useCallback((entry: ChatHistoryEntry) => {
    setActiveQuery(entry.query);
    // Saved transcripts are not persisted yet, so the panel starts empty.
    setMessages([]);
  }, []);

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
