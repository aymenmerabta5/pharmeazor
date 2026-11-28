export interface ChatMessage {
  readonly id: number;
  readonly role: "assistant" | "user";
  readonly text: string;
}
export interface AgentSuggestion {
  readonly key: string;
  readonly label: string;
  readonly question: string;
}
export type ConversationEvent = { kind: "user" | "assistant"; id: number; text: string };

const PLAN_TIER_NAMES: Readonly<Record<string, string>> = {
  basic: "Basic",
  standard: "Standard",
  pro: "Pro",
};

/** Turn a stored plan id into the short name shown beside the account. */
export function planDisplayName(planId: string | null | undefined): string | null {
  const value = planId?.trim();
  if (!value) return null;
  const tier = value.endsWith("-yearly") ? value.slice(0, -"-yearly".length) : value;
  if (PLAN_TIER_NAMES[tier]) return PLAN_TIER_NAMES[tier];
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The entitlement that opens the assistant.
 *
 * A live subscription is the ordinary path. An administrator is sponsored by
 * the platform, matching the server admission policy, so the mobile surface
 * does not send that role to the upgrade card.
 */
export function resolveAgentEntitlement(input: {
  readonly isAdmin: boolean;
  readonly livePlanId: string | null;
}): { readonly planId: string | null; readonly subscribed: boolean } {
  if (input.livePlanId) return { planId: input.livePlanId, subscribed: true };
  return input.isAdmin
    ? { planId: "sponsored", subscribed: true }
    : { planId: null, subscribed: false };
}
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
