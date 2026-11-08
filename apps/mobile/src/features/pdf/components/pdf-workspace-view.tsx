"use client";
import type * as React from "react";
import { ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { usePdfWorkspace } from "../use-pdf-workspace";
import { useTranslations } from "@/lib/i18n";

export function PdfWorkspaceView({
  template,
  setTemplate,
  templateOptions,
  loading,
  error,
  download,
}: ReturnType<typeof usePdfWorkspace>): React.JSX.Element {
  const t = useTranslations("pdf");
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-[760px] self-center gap-5 p-5">
        <View className="flex-row items-center justify-between">
          <View className="gap-1">
            <Text className="text-2xl font-bold tracking-tight">{t("mobileTitle")}</Text>
            <Text className="text-sm text-muted-foreground">{t("mobileDescription")}</Text>
          </View>
          <Link href="/dashboard" asChild>
            <Button variant="outline">
              <Text>{t("dashboard")}</Text>
            </Button>
          </Link>
        </View>
        <Card>
          <CardHeader>
            <CardTitle>{t("template")}</CardTitle>
            <CardDescription>{t("templateDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="flex-row flex-wrap gap-2">
              {templateOptions.map((item) => (
                <Button
                  key={item.value}
                  variant={item.value === template ? "default" : "outline"}
                  onPress={() => setTemplate(item.value)}
                >
                  <Text>{item.label}</Text>
                </Button>
              ))}
            </View>
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {t("generationError")}
              </Text>
            ) : null}
            <Button disabled={loading} isLoading={loading} onPress={download}>
              <Text>{loading ? t("generating") : t("generateShare")}</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
