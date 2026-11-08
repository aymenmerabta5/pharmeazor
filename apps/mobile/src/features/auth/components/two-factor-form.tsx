import type * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSurfaceTranslations } from "@/lib/translations";
import { AuthFrame } from "./auth-frame";
import { NativeFormField as AuthTextField } from "@/components/form-fields/native-field";
import type { TwoFactorFormState } from "../types";

import { Input } from "@/components/ui/input";
export function TwoFactorForm({
  state,
  totpUri,
}: {
  state: TwoFactorFormState;
  totpUri: string;
}): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form } = state;
  return (
    <AuthFrame
      title={t("twoFactor.title")}
      description={t(
        state.useBackupCode ? "twoFactor.backupCodeDescription" : "twoFactor.description",
      )}
      footer={
        <Link href="/sign-in" asChild>
          <Button variant="ghost">
            <Text>{t("twoFactor.backSignIn")}</Text>
          </Button>
        </Link>
      }
    >
      {state.error ? (
        <Alert variant="destructive" accessibilityRole="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {totpUri ? (
        <View className="gap-2">
          <Text>{t("twoFactor.setupUriLabel")}</Text>
          <Input
            accessibilityLabel={t("twoFactor.setupUriLabel")}
            value={totpUri}
            editable={false}
            selectTextOnFocus
          />
        </View>
      ) : null}
      <form.Subscribe selector={(value) => value.isSubmitting}>
        {(pending) => (
          <View className="gap-4">
            <form.Field name="code">
              {(field) => (
                <AuthTextField
                  label={t(
                    state.useBackupCode ? "twoFactor.backupCodeLabel" : "twoFactor.codeLabel",
                  )}
                  value={field.state.value}
                  onChange={(value) =>
                    field.handleChange(
                      state.useBackupCode ? value : value.replace(/[^0-9]/g, "").slice(0, 6),
                    )
                  }
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                  disabled={pending}
                  keyboardType={state.useBackupCode ? "default" : "number-pad"}
                  maxLength={state.useBackupCode ? undefined : 6}
                  autoCapitalize="none"
                />
              )}
            </form.Field>
            <Button disabled={pending} onPress={() => void form.handleSubmit()}>
              <Text>{t("twoFactor.submit")}</Text>
            </Button>
            {!totpUri ? (
              <Button variant="ghost" disabled={pending} onPress={state.toggleMethod}>
                <Text>
                  {t(
                    state.useBackupCode
                      ? "twoFactor.useAuthenticatorCode"
                      : "twoFactor.useBackupCode",
                  )}
                </Text>
              </Button>
            ) : null}
          </View>
        )}
      </form.Subscribe>
    </AuthFrame>
  );
}
