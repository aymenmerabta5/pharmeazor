import type * as React from "react";
import { useRouter } from "expo-router";
import { useAgentScope } from "./use-agent-scope";
import { useAgentConversation } from "./use-agent-conversation";
import { useInitialAgentPrompt } from "./use-initial-agent-prompt";
import { useScrollToEnd } from "./use-scroll-to-end";
import { AgentView } from "./components/agent-view";
import { AgentPrompt } from "./agent-prompt";
import type { AgentSuggestion } from "./model";
import { useTranslations } from "@/lib/i18n";

const SUGGESTION_KEYS = ["interactions", "equivalents", "dosage", "safety"] as const;

export function AgentScreen({
  initialPrompt,
  onInitialPromptConsumed,
}: {
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
}): React.JSX.Element {
  const scope = useAgentScope();
  const router = useRouter();
  return (
    <AgentSession
      key={scope.key}
      phase={scope.phase}
      subscribed={scope.subscribed}
      entitlementPending={scope.entitlementPending}
      entitlementError={scope.entitlementError}
      onRetryEntitlement={scope.retryEntitlement}
      account={{
        initials: scope.initials,
        name: scope.name,
        email: scope.email,
        planName: scope.planName,
      }}
      onManagePlan={() => router.push("/billing")}
      initialPrompt={initialPrompt}
      onInitialPromptConsumed={onInitialPromptConsumed}
    />
  );
}

function AgentSession({
  phase,
  subscribed,
  entitlementPending,
  entitlementError,
  onRetryEntitlement,
  account,
  onManagePlan,
  initialPrompt,
  onInitialPromptConsumed,
}: {
  phase: "pending" | "authenticated" | "anonymous";
  subscribed: boolean;
  entitlementPending: boolean;
  entitlementError: boolean;
  onRetryEntitlement(): void;
  account: {
    initials: string;
    name: string | null;
    email: string | null;
    planName: string | null;
  };
  onManagePlan(): void;
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
}): React.JSX.Element {
  const t = useTranslations("agent");
  const welcomeT = useTranslations("welcome");
  const conversation = useAgentConversation(t("waiting"), t("requestError"));
  const scrollRef = useScrollToEnd(conversation.messages, conversation.pending);
  useInitialAgentPrompt(
    initialPrompt,
    conversation.send,
    conversation.pending,
    phase === "authenticated" && subscribed,
    onInitialPromptConsumed,
  );
  const suggestions: AgentSuggestion[] = SUGGESTION_KEYS.map((key) => ({
    key,
    label: welcomeT(`suggestions.${key}.label`),
    question: welcomeT(`suggestions.${key}.question`),
  }));
  return (
    <AgentView
      messages={conversation.messages}
      error={conversation.error}
      isPending={phase === "pending"}
      isAuthenticated={phase === "authenticated"}
      planPending={entitlementPending}
      planError={entitlementError}
      onRetryPlan={onRetryEntitlement}
      subscribed={subscribed}
      account={account}
      onManagePlan={onManagePlan}
      pending={conversation.pending}
      suggestions={suggestions}
      scrollRef={scrollRef}
      onSuggestion={(question) => void conversation.send(question)}
      composer={<AgentPrompt send={conversation.send} pending={conversation.pending} />}
      t={t}
    />
  );
}
