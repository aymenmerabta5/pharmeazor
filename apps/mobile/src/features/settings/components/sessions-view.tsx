"use client";
import type * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SettingsFeedback } from "./settings-field";

import { ActivityIndicator } from "react-native";
import type { IdentitySessions } from "../use-identity-sessions";
export function SessionsView({ model }: { model: IdentitySessions }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sessions.title")}</CardTitle>
        <CardDescription>{t("sessions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <SettingsFeedback error={model.error ? t("sessions.genericError") : null} />
        {model.isLoading ? (
          <ActivityIndicator />
        ) : model.readSucceeded && model.sessions.length === 0 ? (
          <Text className="text-sm text-muted-foreground">{t("sessions.empty")}</Text>
        ) : (
          model.sessions.map((session) => (
            <View key={session.id} className="gap-2 rounded-xl border p-3">
              <Text>{session.userAgent ?? t("sessions.unknownDevice")}</Text>
              {session.id === model.currentSessionId ? (
                <Text>{t("sessions.current")}</Text>
              ) : (
                <Button
                  disabled={model.pendingSessionId === session.id}
                  variant="outline"
                  onPress={() => model.revokeSession(session.id)}
                >
                  <Text>{t("sessions.revoke")}</Text>
                </Button>
              )}
            </View>
          ))
        )}
        <Button variant="outline" disabled={model.isRefreshing} onPress={model.refresh}>
          <Text>{t("sessions.refresh")}</Text>
        </Button>
        <Button
          variant="outline"
          disabled={model.isRevokingOthers || model.sessions.length < 2}
          onPress={model.revokeOtherSessions}
        >
          <Text>{t("sessions.revokeOthers")}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
