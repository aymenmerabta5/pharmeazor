/**
 * Search history shared by the welcome and chat surfaces.
 *
 * Pure model: parsing, validation, grouping and de-duplication only. Reading
 * and writing browser storage belongs to the `useChatHistory` workflow hook.
 */

/** One searched question. The trimmed query is also the entry's identity. */
export interface ChatHistoryEntry {
  /** The searched question, trimmed. */
  query: string;
  /** Epoch milliseconds of the most recent search for this question. */
  createdAt: number;
}

/** Entries split the way the sidebar renders them, newest first. */
export interface ChatHistoryGroups {
  today: ChatHistoryEntry[];
  earlier: ChatHistoryEntry[];
}

/** localStorage key that persists the history across surfaces. */
export const CHAT_HISTORY_STORAGE_KEY = "pharmeazor.chat-history.v1";

/** Entries beyond this count are dropped, oldest first, when recording. */
export const CHAT_HISTORY_LIMIT = 50;

function isEntry(value: unknown): value is ChatHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ChatHistoryEntry>;
  return (
    typeof candidate.query === "string" &&
    candidate.query.trim().length > 0 &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt)
  );
}

/** Reads stored history, ignoring anything unreadable or repeated. */
export function parseChatHistory(raw: string | null | undefined): ChatHistoryEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const entries: ChatHistoryEntry[] = [];
  for (const value of parsed) {
    if (!isEntry(value)) continue;
    const query = value.query.trim();
    // Stored newest first, so the first occurrence is the freshest one.
    if (seen.has(query)) continue;
    seen.add(query);
    entries.push({ query, createdAt: value.createdAt });
    if (entries.length >= CHAT_HISTORY_LIMIT) break;
  }
  return entries;
}

/** Serializes entries for storage, capped at the retention limit. */
export function serializeChatHistory(entries: ChatHistoryEntry[]): string {
  return JSON.stringify(entries.slice(0, CHAT_HISTORY_LIMIT));
}

/**
 * Returns the history with `query` recorded first. Repeating a question
 * refreshes that entry instead of duplicating it.
 */
export function recordChatHistory(
  entries: ChatHistoryEntry[],
  query: string,
  now: number,
): ChatHistoryEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return entries;
  const rest = entries.filter((entry) => entry.query !== trimmed);
  return [{ query: trimmed, createdAt: now }, ...rest].slice(0, CHAT_HISTORY_LIMIT);
}

/** Splits entries into the two groups the sidebar renders, newest first. */
export function groupChatHistory(
  entries: ChatHistoryEntry[],
  now: number = Date.now(),
): ChatHistoryGroups {
  const groups: ChatHistoryGroups = { today: [], earlier: [] };
  for (const entry of entries) {
    groups[isSameLocalDay(entry.createdAt, now) ? "today" : "earlier"].push(entry);
  }
  return groups;
}

function isSameLocalDay(left: number, right: number): boolean {
  const first = new Date(left);
  const second = new Date(right);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}
