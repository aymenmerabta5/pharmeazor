"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Welcome-page question workflow.
 *
 * Owns the draft question, the pending navigation state and every transition
 * into the chat surface so the composition file only wires callbacks to views.
 */
export function useWelcomeChat() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const openChat = React.useCallback(
    (question: string) => {
      setBusy(true);
      router.push(`/agent?q=${encodeURIComponent(question)}`);
    },
    [router],
  );

  const send = React.useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    openChat(trimmed);
  }, [openChat, query]);

  const suggest = React.useCallback(
    (question: string) => {
      openChat(question);
    },
    [openChat],
  );

  const startNew = React.useCallback(() => {
    router.push("/agent");
  }, [router]);

  return { query, setQuery, busy, send, suggest, startNew };
}
