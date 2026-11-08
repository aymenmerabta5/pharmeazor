import type * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSurfaceTranslations } from "@/lib/translations";
import { AuthFrame } from "./auth-frame";
import { NativeFormField as AuthTextField } from "@/components/form-fields/native-field";
import type { SignUpFormState } from "../types";

export function SignUpForm({ state }: { state: SignUpFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { methods, form } = state;
  const error = state.error ?? methods.error;
  return (
    <AuthFrame
      title={t("signUp.title")}
      description={t("signUp.description")}
      footer={
        <View className="flex-row flex-wrap justify-between gap-3">
          <Link href="/" asChild>
            <Button variant="ghost">
              <Text>{t("signUp.backHome")}</Text>
            </Button>
          </Link>
          <Link href="/sign-in" asChild>
            <Button variant="ghost">
              <Text>{t("signUp.signInLink")}</Text>
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
                <Text>{t("signUp.oauthGoogle")}</Text>
              </Button>
              <Button
                variant="outline"
                disabled={pending || methods.pending}
                onPress={() => void methods.onOAuth("github")}
              >
                <Text>{t("signUp.oauthGitHub")}</Text>
              </Button>
            </View>
            <form.Field name="name">
              {(input) => (
                <AuthTextField
                  label={t("signUp.nameLabel")}
                  value={input.state.value}
                  onChange={input.handleChange}
                  onBlur={input.handleBlur}
                  errors={input.state.meta.errors}
                  disabled={pending || methods.pending}
                  maxLength={50}
                />
              )}
            </form.Field>
            <form.Field name="email">
              {(input) => (
                <AuthTextField
                  label={t("signUp.emailLabel")}
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
                  label={t("signUp.passwordLabel")}
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
              <Text>{t("signUp.submit")}</Text>
            </Button>
            <Text className="text-xs text-muted-foreground">
              {t("signUp.termsPrefix")} {t("signUp.securityNote")}
            </Text>
          </View>
        )}
      </form.Subscribe>
    </AuthFrame>
  );
}
