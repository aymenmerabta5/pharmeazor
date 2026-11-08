import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineAgent, type EveLanguageModel } from "eve";

// OpenRouter is a direct provider: the key stays server-side and the model is
// resolved in code instead of through the Vercel AI Gateway.
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  appName: "PharmEazor",
});

const model: EveLanguageModel = openrouter.chat("openrouter/free");

export default defineAgent({
  model,
  // AI Gateway has no metadata for a direct provider model, so eve needs the
  // window to decide when to compact. openrouter/free reports 200k tokens.
  modelContextWindowTokens: 200_000,
});
