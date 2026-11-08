"use client";
import type * as React from "react";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SettingsField, SettingsFeedback } from "./settings-field";

import type { ProfileForm } from "../use-profile-form";
export function ProfileView({
  email,
  model,
}: {
  email: string;
  model: ProfileForm;
}): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { form } = model;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.title")}</CardTitle>
        <CardDescription>{email}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <form.Field name="name">
          {(field) => <SettingsField field={field} label={t("profile.nameLabel")} />}
        </form.Field>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, pending]) => (
            <Button disabled={!canSubmit || pending} onPress={() => void form.handleSubmit()}>
              <Text>{t(pending ? "profile.submitting" : "profile.submit")}</Text>
            </Button>
          )}
        </form.Subscribe>
        <SettingsFeedback
          error={model.error}
          success={model.success ? t("profile.successMessage") : undefined}
        />
      </CardContent>
    </Card>
  );
}
