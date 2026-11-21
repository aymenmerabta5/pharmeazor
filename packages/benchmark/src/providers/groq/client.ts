import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import type { GenerationConfig } from "../../config/generation";

export interface ChatRequest {
  system: string;
  user: string;
  generation: GenerationConfig;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatResult {
  content: string;
  usage: ChatUsage;
  finish_reason: string;
  request_id: string;
  latency_ms: number;
}

/**
 * Minimal Groq client interface. Implementations must be swappable so
 * unit tests can use a fake without touching `@ai-sdk/groq`.
 */
export interface GroqClient {
  chat(request: ChatRequest): Promise<ChatResult>;
}

class AiSdkGroqClient implements GroqClient {
  private readonly groq;

  constructor(apiKey: string) {
    this.groq = createGroq({ apiKey });
  }

  async chat({ system, user, generation }: ChatRequest): Promise<ChatResult> {
    const startedAt = Date.now();

    // TODO(P3-verify): confirm `providerOptions.groq.reasoningEffort` is the
    // correct key for the installed @ai-sdk/groq version and the current
    // GPT-OSS API. If the field is rejected or ignored, this block is the
    // single place to change.
    const { text, usage, finishReason, response } = await generateText({
      model: this.groq(generation.model_id),
      system,
      prompt: user,
      maxOutputTokens: generation.max_output_tokens,
      providerOptions: {
        groq: {
          reasoningEffort: generation.reasoning_effort,
        },
      },
    });

    return {
      content: text,
      usage: {
        prompt_tokens: usage?.inputTokens,
        completion_tokens: usage?.outputTokens,
        total_tokens: usage?.totalTokens,
      },
      finish_reason: String(finishReason ?? "unknown"),
      request_id: response?.id ?? "",
      latency_ms: Date.now() - startedAt,
    };
  }
}

export function createGroqClient(apiKey: string): GroqClient {
  return new AiSdkGroqClient(apiKey);
}
