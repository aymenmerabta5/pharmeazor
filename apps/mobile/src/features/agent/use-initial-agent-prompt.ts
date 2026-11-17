import { useEffect, useRef } from "react";
import type { AgentSend } from "./use-agent-conversation";

/**
 * Sends a question that arrived from the home screen exactly once.
 *
 * The same prompt can return when the user taps the same suggestion again, but
 * that is a new mount and deserves a new answer. Within one mount the ref
 * prevents a re-render or a changed `send` identity from sending it twice.
 * Nothing is sent until the authenticated scope is ready, because an anonymous
 * run would be dropped and the prompt would be lost.
 *
 * `onConsumed` runs before the send so the route can drop the parameter. The
 * assistant tab stays mounted while the user visits other tabs; without that
 * clear, coming back would replay a question that was already answered.
 */
export function useInitialAgentPrompt(
  initialPrompt: string | undefined,
  send: AgentSend,
  pending: boolean,
  enabled: boolean,
  onConsumed?: () => void,
): void {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const prompt = initialPrompt?.trim();
    if (!prompt || !enabled || pending || sent.current === prompt) return;
    sent.current = prompt;
    onConsumed?.();
    void send(prompt);
  }, [enabled, initialPrompt, onConsumed, pending, send]);
}
