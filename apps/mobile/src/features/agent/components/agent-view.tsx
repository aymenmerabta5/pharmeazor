import type * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChatMessage } from "../model";
import type { NamespaceTranslate } from "@/lib/i18n";
export interface AgentViewProps {
  isPending: boolean;
  isAuthenticated: boolean;
  error: string | null;
  messages: readonly ChatMessage[];
  composer: React.ReactNode;
  t: NamespaceTranslate<"agent">;
}
export function AgentView({
  isPending,
  isAuthenticated,
  error,
  messages,
  composer,
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
            <Link href="/(auth)/sign-in" asChild>
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
    <View className="flex-1 bg-background p-4">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("mobileDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 gap-3">
          <ScrollView
            accessibilityLabel={t("conversationLabel")}
            accessibilityLiveRegion="polite"
            className="flex-1 rounded-xl border p-3"
          >
            {messages.length === 0 ? (
              <Text className="py-8 text-center text-muted-foreground">{t("empty")}</Text>
            ) : (
              messages.map((message) => (
                <View
                  key={message.id}
                  className={message.role === "user" ? "mb-2 items-end" : "mb-2 items-start"}
                >
                  <Card
                    className={
                      message.role === "user"
                        ? "max-w-[85%] border-primary bg-primary"
                        : "max-w-[85%] bg-muted"
                    }
                  >
                    <CardContent className="p-3">
                      <Text
                        className={
                          message.role === "user" ? "text-primary-foreground" : "text-foreground"
                        }
                      >
                        {message.text}
                      </Text>
                    </CardContent>
                  </Card>
                </View>
              ))
            )}
          </ScrollView>
          {error ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {error}
            </Text>
          ) : null}
          {composer}
        </CardContent>
      </Card>
    </View>
  );
}
