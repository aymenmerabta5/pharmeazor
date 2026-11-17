import type * as React from "react";
import { ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { usePlatformI18n, useTranslations } from "@/lib/i18n";
import { HomeHero } from "./components/home-hero";
import { HomePrompt } from "./components/home-prompt";
import { HomeSuggestions } from "./components/home-suggestions";
import { HomeTools } from "./components/home-tools";
import { useHomeIdentity } from "./queries";
import { useHomePrompt } from "./use-home-prompt";

const SUGGESTION_KEYS = ["interactions", "equivalents", "dosage", "safety"] as const;

const TOOL_KEYS = [
  { key: "wallet", label: "openWallet", href: "/wallet" },
  { key: "assistant", label: "openAssistant", href: "/assistant" },
  { key: "pdf", label: "openPdf", href: "/pdf" },
  { key: "storage", label: "openStorage", href: "/storage" },
] as const;

/**
 * The signed-in home screen.
 *
 * It answers three questions in one glance: who am I, what can I ask, and
 * where else can I go. The prompt owns the typed question; suggestions call
 * the same route directly.
 */
export function HomeScreen(): React.JSX.Element {
  const t = useTranslations("welcome");
  const { direction } = usePlatformI18n();
  const { user } = useHomeIdentity();
  const { form, ask } = useHomePrompt();

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";
  const suggestions = SUGGESTION_KEYS.map((key) => ({
    key,
    label: t(`suggestions.${key}.label`),
    question: t(`suggestions.${key}.question`),
  }));
  const tools = TOOL_KEYS.map((tool) => ({
    key: tool.key,
    label: t(tool.label),
    href: tool.href,
  }));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pb-8 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      <HomeHero
        greeting={firstName ? t("greeting", { name: firstName }) : t("greetingNoName")}
        title={t("title")}
        description={t("description")}
        prompt={
          <HomePrompt
            form={form}
            label={t("inputLabel")}
            placeholder={t("inputPlaceholder")}
            sendLabel={t("send")}
            rtl={direction === "rtl"}
            onSend={() => void form.handleSubmit()}
          />
        }
      />
      <HomeSuggestions title={t("tryAsking")} items={suggestions} onSelect={ask} />
      <HomeTools title={t("toolsTitle")} items={tools} />
      <HomeDisclaimer text={t("disclaimer")} />
    </ScrollView>
  );
}

function HomeDisclaimer({ text }: { text: string }): React.JSX.Element {
  return <Text className="px-2 text-center text-xs leading-5 text-muted-foreground">{text}</Text>;
}
