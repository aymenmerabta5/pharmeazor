"use client";
import type * as React from "react";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SettingsField, SettingsFeedback } from "./settings-field";

import type { PasswordForm } from "../use-password-form";
export function PasswordView({ model }: { model: PasswordForm }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { form } = model;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("password.title")}</CardTitle>
        <CardDescription>{t("password.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <form.Field name="currentPassword">
          {(field) => (
            <SettingsField
              field={field}
              label={t("password.currentPasswordLabel")}
              secureTextEntry
            />
          )}
        </form.Field>
        <form.Field name="newPassword">
          {(field) => (
            <SettingsField field={field} label={t("password.newPasswordLabel")} secureTextEntry />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, pending]) => (
            <Button disabled={!canSubmit || pending} onPress={() => void form.handleSubmit()}>
              <Text>{t(pending ? "password.submitting" : "password.submit")}</Text>
            </Button>
          )}
        </form.Subscribe>
        <SettingsFeedback
          error={model.error}
          success={model.success ? t("password.successMessage") : undefined}
        />
      </CardContent>
    </Card>
  );
}
