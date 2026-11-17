import { useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AgentScreen } from "@/features/agent/screen";

export default function AssistantRoute() {
  const params = useLocalSearchParams<{ prompt?: string | string[] }>();
  const router = useRouter();
  const prompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
  const clearPrompt = useCallback(() => {
    // The tab stays mounted while the user visits another tab, so the consumed
    // question has to leave the URL or returning would send it again.
    router.setParams({ prompt: "" });
  }, [router]);
  return <AgentScreen initialPrompt={prompt} onInitialPromptConsumed={clearPrompt} />;
}
