import type * as React from "react";
import { ActivityIndicator, type ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentSuggestion, ChatMessage } from "../model";
import { AgentConversation } from "./agent-conversation";
import { AgentEmpty } from "./agent-empty";
import type { NamespaceTranslate } from "@/lib/i18n";

export interface AgentViewProps {
  isPending: boolean;
  isAuthenticated: boolean;
  error: string | null;
  messages: readonly ChatMessage[];
  pending: boolean;
  suggestions: readonly AgentSuggestion[];
  composer: React.ReactNode;
  scrollRef: React.RefObject<ScrollView | null>;
  onSuggestion: (question: string) => void;
  t: NamespaceTranslate<"agent">;
}

export function AgentView({
  isPending,
  isAuthenticated,
  error,
  messages,
  pending,
  suggestions,
  composer,
  scrollRef,
  onSuggestion,
  t,
}: AgentViewProps): React.JSX.Element {
  if (isPending)
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!isAuthenticated) {
    return (
      <View className="flex-1 justify-center bg-background p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("signInTitle")}</CardTitle>
            <CardDescription>{t("signInDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/auth/sign-in" asChild>
              <Button>
                <Text>{t("signIn")}</Text>
              </Button>
            </Link>
          </CardContent>
        </Card>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {messages.length === 0 ? (
        <AgentEmpty suggestions={suggestions} onSuggestion={onSuggestion} error={error} t={t} />
      ) : (
        <AgentConversation
          messages={messages}
          pending={pending}
          error={error}
          scrollRef={scrollRef}
          t={t}
        />
      )}
      <View className="border-t border-border bg-background px-3 pb-2 pt-2">{composer}</View>
    </View>
  );
}
