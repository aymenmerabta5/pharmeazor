import { useEffect, useRef } from "react";
import type { ScrollView } from "react-native";
import type { ChatMessage } from "./model";

/**
 * Auto-scrolls the conversation as text arrives.
 *
 * The container owns this effect so the conversation view stays a pure
 * presentation component. A cheap signature (message count, last bubble
 * length, and pending state) follows streaming without tracking every render.
 */
export function useScrollToEnd(messages: readonly ChatMessage[], pending: boolean) {
  const ref = useRef<ScrollView | null>(null);
  const last = messages[messages.length - 1];
  const signature = `${messages.length}:${last?.text.length ?? 0}:${pending ? 1 : 0}`;
  useEffect(() => {
    ref.current?.scrollToEnd({ animated: true });
  }, [signature]);
  return ref;
}
