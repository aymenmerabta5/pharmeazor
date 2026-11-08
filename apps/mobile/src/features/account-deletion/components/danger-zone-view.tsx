"use client";
import type * as React from "react";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SettingsField, SettingsFeedback } from "@/features/settings/components/settings-field";

import type { AccountDeletion } from "../use-account-deletion";
export function DangerZoneView({ model }: { model: AccountDeletion }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { form } = model;
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>{t("danger.title")}</CardTitle>
        <CardDescription>{t("danger.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <SettingsFeedback error={model.error} />
        <form.Field name="password">
          {(field) => (
            <SettingsField field={field} label={t("native.confirmPassword")} secureTextEntry />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, pending]) => (
            <Button
              disabled={model.pending || !canSubmit || pending}
              onPress={() => void form.handleSubmit()}
            >
              <Text>{t(pending ? "danger.deleting" : "danger.delete")}</Text>
            </Button>
          )}
        </form.Subscribe>
      </CardContent>
    </Card>
  );
}
