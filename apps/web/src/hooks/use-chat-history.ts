"use client";
import * as React from "react";
import {
  CHAT_HISTORY_STORAGE_KEY,
  parseChatHistory,
  recordChatHistory,
  serializeChatHistory,
  type ChatHistoryEntry,
} from "@/lib/chat-history";

/**
 * Search-history workflow shared by the welcome and chat surfaces.
 *
 * Owns the browser-storage lifetime: it hydrates once per mount, exposes the
 * entries the sidebar renders, and persists every recorded question so the
 * other surface reads the same history when it mounts.
 */
export function useChatHistory() {
  const [entries, setEntries] = React.useState<ChatHistoryEntry[]>([]);

  React.useEffect(() => {
    setEntries(parseChatHistory(window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY)));
  }, []);

  const record = React.useCallback((query: string) => {
    setEntries((previous) => {
      const next = recordChatHistory(previous, query, Date.now());
      try {
        window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, serializeChatHistory(next));
      } catch {
        // Storage can be unavailable (private mode, quota): keep the list in memory.
      }
      return next;
    });
  }, []);

  return { entries, record };
}
