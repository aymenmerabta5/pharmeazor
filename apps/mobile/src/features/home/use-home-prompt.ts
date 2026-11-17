import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";

/**
 * The home prompt is a shortcut into the assistant, not a second chat.
 *
 * Submitting stores nothing locally: the question travels as a route
 * parameter, the assistant owns the conversation, and the home screen stays a
 * clean starting point when the user comes back.
 */
export function useHomePrompt() {
  const router = useRouter();

  function ask(question: string): void {
    const prompt = question.trim();
    if (!prompt) return;
    router.push({ pathname: "/assistant", params: { prompt } });
  }

  const form = useForm({
    defaultValues: { message: "" },
    onSubmit: ({ value }) => {
      ask(value.message);
    },
  });

  return { form, ask };
}

export type HomePromptForm = ReturnType<typeof useHomePrompt>["form"];
