export interface ChatMessage {
  readonly id: number;
  readonly role: "assistant" | "user";
  readonly text: string;
}
export type ConversationEvent = { kind: "user" | "assistant"; id: number; text: string };
export function conversationReducer(
  messages: readonly ChatMessage[],
  event: ConversationEvent,
): readonly ChatMessage[] {
  if (event.kind === "user") return [...messages, { id: event.id, role: "user", text: event.text }];
  return messages.some((message) => message.id === event.id)
    ? messages.map((message) =>
        message.id === event.id ? { ...message, text: event.text } : message,
      )
    : [...messages, { id: event.id, role: "assistant", text: event.text }];
}
