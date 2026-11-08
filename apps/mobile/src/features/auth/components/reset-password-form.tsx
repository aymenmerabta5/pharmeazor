import type * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSurfaceTranslations } from "@/lib/translations";
import { AuthFrame } from "./auth-frame";
import { NativeFormField as AuthTextField } from "@/components/form-fields/native-field";
import type { ResetPasswordFormState } from "../types";

export function ResetPasswordForm({ state }: { state: ResetPasswordFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form } = state;
  return (
    <AuthFrame
      title={t("resetPassword.title")}
      description={t("resetPassword.description")}
      footer={
        <Link href="/sign-in" asChild>
          <Button variant="ghost">
            <Text>{t("resetPassword.backSignIn")}</Text>
          </Button>
        </Link>
      }
    >
      {state.error ? (
        <Alert variant="destructive" accessibilityRole="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {!state.token ? (
        <Link href="/forgot-password" asChild>
          <Button variant="outline">
            <Text>{t("resetPassword.requestNewLink")}</Text>
          </Button>
        </Link>
      ) : (
        <form.Subscribe selector={(value) => value.isSubmitting}>
          {(pending) => (
            <View className="gap-4">
              <form.Field name="newPassword">
                {(field) => (
                  <AuthTextField
                    label={t("resetPassword.newPasswordLabel")}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    errors={field.state.meta.errors}
                    disabled={pending}
                    secureTextEntry
                    maxLength={64}
                  />
                )}
              </form.Field>
              <form.Field name="confirmPassword">
                {(field) => (
                  <AuthTextField
                    label={t("resetPassword.confirmPasswordLabel")}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    errors={field.state.meta.errors}
                    disabled={pending}
                    secureTextEntry
                    maxLength={64}
                  />
                )}
              </form.Field>
              <Button disabled={pending} onPress={() => void form.handleSubmit()}>
                <Text>{t("resetPassword.submit")}</Text>
              </Button>
            </View>
          )}
        </form.Subscribe>
      )}
    </AuthFrame>
  );
}
