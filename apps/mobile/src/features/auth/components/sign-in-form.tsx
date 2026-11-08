import type * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSurfaceTranslations } from "@/lib/translations";
import { AuthFrame } from "./auth-frame";
import { NativeFormField as AuthTextField } from "@/components/form-fields/native-field";
import type { SignInFormState } from "../types";

export function SignInForm({ state }: { state: SignInFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { methods, form } = state;
  const error = state.error ?? methods.error;
  return (
    <AuthFrame
      title={t("signIn.title")}
      description={t("signIn.description")}
      footer={
        <View className="flex-row flex-wrap justify-between gap-3">
          <Link href="/" asChild>
            <Button variant="ghost">
              <Text>{t("signIn.backHome")}</Text>
            </Button>
          </Link>
          <Link href="/sign-up" asChild>
            <Button variant="ghost">
              <Text>{t("signIn.createAccountLink")}</Text>
            </Button>
          </Link>
        </View>
      }
    >
      {error ? (
        <Alert accessibilityRole="alert" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form.Subscribe selector={(value) => value.isSubmitting}>
        {(pending) => (
          <View className="gap-4">
            <View className="gap-3">
              <Button
                variant="outline"
                disabled={pending || methods.pending}
                onPress={() => void methods.onOAuth("google")}
              >
                <Text>{t("signIn.oauthGoogle")}</Text>
              </Button>
              <Button
                variant="outline"
                disabled={pending || methods.pending}
                onPress={() => void methods.onOAuth("github")}
              >
                <Text>{t("signIn.oauthGitHub")}</Text>
              </Button>
            </View>
            <form.Field name="email">
              {(input) => (
                <AuthTextField
                  label={t("signIn.emailLabel")}
                  value={input.state.value}
                  onChange={input.handleChange}
                  onBlur={input.handleBlur}
                  errors={input.state.meta.errors}
                  disabled={pending || methods.pending}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(input) => (
                <AuthTextField
                  label={t("signIn.passwordLabel")}
                  value={input.state.value}
                  onChange={input.handleChange}
                  onBlur={input.handleBlur}
                  errors={input.state.meta.errors}
                  disabled={pending || methods.pending}
                  secureTextEntry
                  maxLength={64}
                />
              )}
            </form.Field>
            <Button disabled={pending || methods.pending} onPress={() => void form.handleSubmit()}>
              <Text>{t("signIn.submit")}</Text>
            </Button>
            <View className="flex-row flex-wrap gap-2">
              <Link href="/forgot-password" asChild>
                <Button variant="ghost">
                  <Text>{t("signIn.forgotPassword")}</Text>
                </Button>
              </Link>
              <Link href="/magic-link" asChild>
                <Button variant="ghost">
                  <Text>{t("signIn.magicLink")}</Text>
                </Button>
              </Link>
              <Link href="/verify-email" asChild>
                <Button variant="ghost">
                  <Text>{t("signIn.verifyEmail")}</Text>
                </Button>
              </Link>
            </View>
          </View>
        )}
      </form.Subscribe>
    </AuthFrame>
  );
}
