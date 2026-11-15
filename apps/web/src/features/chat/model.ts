/**
 * Chat surface model.
 *
 * Pure types and the deterministic demo reply the surface renders. State,
 * effects, timers and storage belong to `use-chat-session` and
 * `useChatHistory`.
 */

export type SourceTag = "official" | "foreign" | "differs";

/** One cited source rendered under an assistant answer. */
export interface ChatSource {
  id: number;
  name: string;
  excerpt: string;
  tag: SourceTag;
  date: string;
  retained: boolean;
}

/** One message in the conversation log. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  answerLabel?: string;
  tags?: string[];
  sources?: ChatSource[];
  followUps?: string[];
  disclaimer?: string;
}

/** The question the user just sent. */
export function createUserMessage(question: string, createdAt: number): ChatMessage {
  return {
    id: `msg-${createdAt}-user`,
    role: "user",
    content: question.trim(),
  };
}

/**
 * The assistant reply the demo surface shows while no retrieval pipeline is
 * wired. Every identifier is fixed so the layout stays stable between sends.
 */
export function createAssistantReply(createdAt: number): ChatMessage {
  return {
    id: `msg-${createdAt}-assistant`,
    role: "assistant",
    answerLabel: "Yes, with monitoring.",
    tags: ["Precaution of use", "Figures verified"],
    content:
      "The interaction is classed as precaution of use [1]. The official leaflet carries the same warning [2]. One professional site words it differently, so the official source was kept [3].",
    sources: [
      {
        id: 1,
        name: "ANSM Thesaurus",
        excerpt: "[Exact passage]",
        tag: "foreign",
        date: "12 Nov 2026",
        retained: true,
      },
      {
        id: 2,
        name: "ANPP leaflet",
        excerpt: "[Exact passage]",
        tag: "official",
        date: "12 Nov 2026",
        retained: true,
      },
      {
        id: 3,
        name: "Professional site",
        excerpt: "[Divergent wording]",
        tag: "differs",
        date: "12 Nov 2026",
        retained: false,
      },
    ],
    disclaimer: "Patient context not assessed. The decision remains yours.",
    followUps: [
      "Which registered equivalents exist if it is out of stock?",
      "What precautions apply for an elderly patient?",
      "Do two sources disagree on the maximum dose?",
    ],
  };
}
