"use client";
import type * as React from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { useStorageWorkspace } from "../use-storage-workspace";
import { useTranslations } from "@/lib/i18n";

export function StorageWorkspace({
  objectId,
  setObjectId,
  name,
  setName,
  text,
  setText,
  downloaded,
  status,
  isPending,
  upload,
  download,
  remove,
}: ReturnType<typeof useStorageWorkspace>): React.JSX.Element {
  const t = useTranslations("storage");
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-[760px] self-center gap-5 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold tracking-tight">{t("title")}</Text>
          <Text className="text-sm text-muted-foreground">{t("description")}</Text>
        </View>
        {isPending ? <Text accessibilityRole="alert">{t("pending")}</Text> : null}
        <Card>
          <CardHeader>
            <CardTitle>{t("upload")}</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <Text>{t("fileName")}</Text>
            <Input editable={!isPending} value={name} onChangeText={setName} maxLength={255} />
            <Text>{t("textContent")}</Text>
            <Input
              multiline
              className="min-h-24 py-3"
              editable={!isPending}
              value={text}
              onChangeText={setText}
            />
            <Button disabled={isPending} onPress={upload}>
              <Text>{t("upload")}</Text>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("download")}</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <Text>{t("objectId")}</Text>
            <Input editable={!isPending} value={objectId} onChangeText={setObjectId} />
            <View className="flex-row flex-wrap gap-2">
              <Button disabled={isPending} variant="outline" onPress={download}>
                <Text>{t("download")}</Text>
              </Button>
              <Button disabled={isPending} variant="destructive" onPress={remove}>
                <Text>{t("remove")}</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
        {status ? <Text accessibilityRole="alert">{status}</Text> : null}
        {downloaded ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("downloaded")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Text selectable>{downloaded}</Text>
            </CardContent>
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}
