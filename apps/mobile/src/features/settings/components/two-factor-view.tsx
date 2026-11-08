"use client";
import type * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SettingsField, SettingsFeedback } from "./settings-field";

import type { TwoFactorSettings } from "../use-two-factor-settings";
export function TwoFactorView({ model }: { model: TwoFactorSettings }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { enableForm, verifyForm, disableForm } = model;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("twoFactor.title")}</CardTitle>
        <CardDescription>
          {t(model.enabled ? "twoFactor.enabled" : "twoFactor.disabled")}
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <SettingsFeedback error={model.error} />
        {model.enabled ? (
          <View className="gap-3">
            <disableForm.Field name="password">
              {(field) => (
                <SettingsField field={field} label={t("twoFactor.passwordLabel")} secureTextEntry />
              )}
            </disableForm.Field>
            <disableForm.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting] as const}
            >
              {([canSubmit, pending]) => (
                <Button
                  disabled={!canSubmit || pending}
                  onPress={() => void disableForm.handleSubmit()}
                >
                  <Text>{t(pending ? "twoFactor.disabling" : "twoFactor.disable")}</Text>
                </Button>
              )}
            </disableForm.Subscribe>
          </View>
        ) : model.totpUri ? (
          <View className="gap-3">
            <Text>{t("twoFactor.scanDescription")}</Text>
            <Text selectable className="font-mono text-xs">
              {model.totpUri}
            </Text>
            {model.backupCodes ? (
              <View>
                <Text>{t("twoFactor.backupCodesTitle")}</Text>
                <Text selectable>{model.backupCodes.join("\n")}</Text>
                <Text>{t("twoFactor.backupCodesDescription")}</Text>
              </View>
            ) : null}
            <verifyForm.Field name="code">
              {(field) => <SettingsField field={field} label={t("twoFactor.codeLabel")} />}
            </verifyForm.Field>
            <verifyForm.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting] as const}
            >
              {([canSubmit, pending]) => (
                <Button
                  disabled={!canSubmit || pending}
                  onPress={() => void verifyForm.handleSubmit()}
                >
                  <Text>{t(pending ? "twoFactor.verifying" : "twoFactor.verify")}</Text>
                </Button>
              )}
            </verifyForm.Subscribe>
          </View>
        ) : (
          <View className="gap-3">
            <enableForm.Field name="password">
              {(field) => (
                <SettingsField field={field} label={t("twoFactor.passwordLabel")} secureTextEntry />
              )}
            </enableForm.Field>
            <enableForm.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting] as const}
            >
              {([canSubmit, pending]) => (
                <Button
                  disabled={!canSubmit || pending}
                  onPress={() => void enableForm.handleSubmit()}
                >
                  <Text>{t(pending ? "twoFactor.preparing" : "twoFactor.enable")}</Text>
                </Button>
              )}
            </enableForm.Subscribe>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
