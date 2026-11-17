import { createGroq } from "@ai-sdk/groq";
import { defineAgent, type EveLanguageModel } from "eve";

// Groq is a direct provider: the key stays server-side and the model is
// resolved in code instead of through the Vercel AI Gateway.
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const model: EveLanguageModel = groq.languageModel("openai/gpt-oss-120b");

export default defineAgent({
  model,
  // AI Gateway has no metadata for a direct provider model, so eve needs the
  // window to decide when to compact. Groq reports 131,072 tokens for
  // openai/gpt-oss-120b.
  modelContextWindowTokens: 131_072,
});
