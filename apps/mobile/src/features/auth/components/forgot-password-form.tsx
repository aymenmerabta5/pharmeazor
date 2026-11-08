import type * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSurfaceTranslations } from "@/lib/translations";
import { AuthFrame } from "./auth-frame";
import { NativeFormField as AuthTextField } from "@/components/form-fields/native-field";
import type { ForgotPasswordFormState } from "../types";

export function ForgotPasswordForm({
  state,
}: {
  state: ForgotPasswordFormState;
}): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form } = state;
  return (
    <AuthFrame
      title={t("forgotPassword.title")}
      description={t("forgotPassword.description")}
      footer={
        <Link href="/sign-in" asChild>
          <Button variant="ghost">
            <Text>{t("forgotPassword.backSignIn")}</Text>
          </Button>
        </Link>
      }
    >
      {state.error ? (
        <Alert variant="destructive" accessibilityRole="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <Alert accessibilityRole="alert">
          <AlertDescription>{t("forgotPassword.successMessage")}</AlertDescription>
        </Alert>
      ) : null}
      <form.Subscribe selector={(value) => value.isSubmitting}>
        {(pending) => (
          <View className="gap-4">
            <form.Field name="email">
              {(field) => (
                <AuthTextField
                  label={t("forgotPassword.emailLabel")}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                  disabled={pending}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}
            </form.Field>
            <Button disabled={pending} onPress={() => void form.handleSubmit()}>
              <Text>{t("forgotPassword.submit")}</Text>
            </Button>
          </View>
        )}
      </form.Subscribe>
    </AuthFrame>
  );
}
