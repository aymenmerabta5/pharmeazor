import { useEffect, useReducer, useRef } from "react";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { invokeAgent, type EveSessionCursor } from "./mutations";
import { conversationReducer } from "./model";
export function useAgentConversation(waitingMessage: string, errorMessage: string) {
  const [messages, dispatch] = useReducer(conversationReducer, []);
  const sequence = useRef(0);
  const session = useRef<EveSessionCursor | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const request = useAuthOwnedMutation(async (message: string, isCurrent) => {
    const userId = ++sequence.current;
    const assistantId = ++sequence.current;
    dispatch({ kind: "user", id: userId, text: message });
    const active = new AbortController();
    controller.current = active;
    try {
      const result = await invokeAgent(message, session.current, {
        signal: active.signal,
        onText: (text) => {
          if (isCurrent() && !active.signal.aborted)
            dispatch({ kind: "assistant", id: assistantId, text });
        },
      });
      if (!isCurrent() || active.signal.aborted) return;
      session.current = result.session;
      if (!result.message) dispatch({ kind: "assistant", id: assistantId, text: waitingMessage });
    } finally {
      if (controller.current === active) controller.current = null;
    }
  });
  return {
    messages,
    send: request.run,
    pending: request.isPending,
    error: request.error ? errorMessage : null,
  };
}
export type AgentSend = ReturnType<typeof useAgentConversation>["send"];
