import "server-only";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const TITLE_TIMEOUT_MS = 8_000;
const MAX_PROMPT_CHARS = 2_000;
const MAX_TITLE_CHARS = 64;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** A usable history label even when the model call is unavailable. */
export function fallbackConversationTitle(prompt: string): string {
  const text = normalize(prompt);
  if (!text) return "New conversation";
  return text.length > MAX_TITLE_CHARS ? `${text.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : text;
}

/**
 * Turns a model reply into a bounded history label.
 *
 * Titles are display text, not instructions: strip the framing models like to
 * add, keep one line, and cap the length so the sidebar never receives a
 * paragraph.
 */
export function sanitizeConversationTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = normalize(value);
  if (!text) return null;
  text = text.replace(/^title\s*:\s*/i, "").trim();
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  text = text.replace(/[.!?;:,]+$/, "").trim();
  if (!text) return null;
  return text.length > MAX_TITLE_CHARS ? `${text.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : text;
}

function titleFromGroqResponse(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const choices = Reflect.get(value, "choices");
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) return null;
  const message = Reflect.get(first, "message");
  if (typeof message !== "object" || message === null || Array.isArray(message)) return null;
  return sanitizeConversationTitle(Reflect.get(message, "content"));
}

/**
 * Asks the same Groq model that powers the agent for a short conversation
 * title. Failure is never fatal: the first prompt is already a useful label.
 */
export async function generateConversationTitle(prompt: string): Promise<string> {
  const fallback = fallbackConversationTitle(prompt);
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("REPLACE_WITH")) return fallback;

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You write short conversation titles for a pharmacy assistant. Reply with only the title, 3 to 6 words, in the language of the question, with no quotes and no trailing punctuation.",
          },
          {
            role: "user",
            content: `First question: ${normalize(prompt).slice(0, MAX_PROMPT_CHARS)}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.2,
        // gpt-oss is a reasoning model. Without a low effort budget it spends
        // the completion on hidden reasoning and returns empty content.
        reasoning_effort: "low",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
    });
    if (!response.ok) return fallback;
    return titleFromGroqResponse(await response.json()) ?? fallback;
  } catch {
    return fallback;
  }
}
