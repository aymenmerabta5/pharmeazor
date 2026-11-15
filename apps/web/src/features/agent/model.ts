import type { SurfaceMessageKey } from "@/lib/translations";

export interface AgentMessageLike {
  readonly id: string;
  readonly role: string;
  readonly parts: readonly { readonly type: string; readonly text?: string }[];
}

export interface AgentSuggestionDefinition {
  readonly id: string;
  readonly labelKey: SurfaceMessageKey<"agent">;
  readonly questionKey: SurfaceMessageKey<"agent">;
}

/** The four starting points the assistant offers on an empty conversation. */
export const AGENT_SUGGESTIONS = [
  {
    id: "interactions",
    labelKey: "interactionsLabel",
    questionKey: "interactionsQuestion",
  },
  {
    id: "equivalents",
    labelKey: "equivalentsLabel",
    questionKey: "equivalentsQuestion",
  },
  {
    id: "dosage",
    labelKey: "dosageLabel",
    questionKey: "dosageQuestion",
  },
  {
    id: "safety",
    labelKey: "safetyLabel",
    questionKey: "safetyQuestion",
  },
] as const satisfies readonly AgentSuggestionDefinition[];

export interface AgentAccountIdentity {
  readonly name?: string | null;
  readonly email?: string | null;
}

/** Two-letter initials for the account avatar, with a brand fallback. */
export function accountInitials(user: AgentAccountIdentity | null | undefined): string {
  const name = user?.name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? "";
      const last = parts[parts.length - 1]?.[0] ?? "";
      return (first + last).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = user?.email?.trim();
  return email ? email.slice(0, 2).toUpperCase() : "PH";
}

/** Turn a stored plan id into the short product name shown in the badge. */
export function planDisplayName(planId: string | null | undefined): string | null {
  const value = planId?.trim();
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function messageText(message: AgentMessageLike): string {
  return message.parts
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("\n")
    .trim();
}

/** The first user question, shortened for the conversation history entry. */
export function conversationTitle(
  messages: readonly AgentMessageLike[],
  maxLength = 64,
): string | null {
  const question = messages.find((message) => message.role === "user");
  if (!question) return null;
  const text = messageText(question).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
