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

export interface AgentSource {
  readonly key: string;
  readonly label: string;
  readonly url: string;
  readonly host: string;
}

const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const bareUrlPattern = /https?:\/\/[^\s<>()"']+/g;

function sourceHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Extract the links an answer cites, without inventing provenance. */
export function extractSources(text: string): AgentSource[] {
  const sources = new Map<string, AgentSource>();
  for (const match of text.matchAll(markdownLinkPattern)) {
    const url = match[2];
    if (!url || sources.has(url)) continue;
    const label = match[1]?.trim() || sourceHost(url);
    sources.set(url, { key: url, label, url, host: sourceHost(url) });
  }
  for (const url of text.match(bareUrlPattern) ?? []) {
    if (sources.has(url)) continue;
    sources.set(url, { key: url, label: sourceHost(url), url, host: sourceHost(url) });
  }
  return [...sources.values()].slice(0, 8);
}

/** Hide raw Markdown links and bare URLs; the source list carries those links. */
export function answerDisplayText(text: string): string {
  return text
    .replace(markdownLinkPattern, "$1")
    .replace(bareUrlPattern, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Split an answer into the headline sentence and the supporting text. */
export function answerSections(text: string): { headline: string; body: string } {
  const display = answerDisplayText(text);
  if (!display) return { headline: "", body: "" };
  const firstParagraph = display.split(/\n{2,}/)[0]?.trim() ?? display;
  const sentence = firstParagraph.match(/^(.{1,120}?[.!?])(?:\s|$)/)?.[1];
  const headline =
    sentence ??
    (firstParagraph.length > 120 ? firstParagraph.slice(0, 117).trimEnd() + "…" : firstParagraph);
  const body = display.startsWith(headline) ? display.slice(headline.length).trim() : display;
  return { headline, body };
}

export function userMessages(messages: readonly AgentMessageLike[]): AgentMessageLike[] {
  return messages.filter((message) => message.role === "user");
}

export function lastUserText(messages: readonly AgentMessageLike[]): string | null {
  const users = userMessages(messages);
  const text = users.length > 0 ? messageText(users[users.length - 1]!) : "";
  return text || null;
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
  const sentence = text.match(/^(.{1,80}?[.!?])(?:\s|$)/)?.[1] ?? text;
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1).trimEnd()}…` : sentence;
}
