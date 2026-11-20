"use client";

import type * as React from "react";
import Link from "next/link";
import { AuthCaptchaField } from "./auth-captcha-field";
import { AuthOAuthButtons } from "./oauth-buttons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BrandMark } from "@/components/brand-wordmark";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SignUpFormState } from "../types";

export function SignUpForm({ state }: { state: SignUpFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form, error, methods, captcha } = state;
  return (
    <Card className="rounded-3xl border-border/80 bg-card p-6 shadow-surface sm:p-8">
      <CardHeader className="items-center gap-4 p-0 pb-7 text-center sm:p-0 sm:pb-7">
        <BrandMark className="size-12 rounded-2xl" />
        <div className="flex flex-col gap-1.5">
          <CardTitle as="h1" className="text-2xl sm:text-[1.75rem]">
            {t("signUp.title")}
          </CardTitle>
          <CardDescription className="max-w-[34ch]">{t("signUp.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("signUp.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AuthOAuthButtons
          googleLabel={t("signUp.oauthGoogle")}
          appleLabel={t("signUp.oauthApple")}
          separatorLabel={t("signUp.or")}
          onSelect={methods.onOAuth}
          disabled={methods.pending}
        />
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-5">
            <FieldGroup className="gap-4">
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    label={t("signUp.nameLabel")}
                    placeholder={t("signUp.namePlaceholder")}
                    autoComplete="name"
                    required
                    maxLength={50}
                  />
                )}
              </form.AppField>
              <form.AppField name="email">
                {(field) => (
                  <field.TextField
                    type="email"
                    label={t("signUp.emailLabel")}
                    placeholder={t("signUp.emailPlaceholder")}
                    autoComplete="email"
                    required
                  />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.PasswordField
                    label={t("signUp.passwordLabel")}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={64}
                  />
                )}
              </form.AppField>
            </FieldGroup>
            <AuthCaptchaField captcha={captcha} />
            <form.SubmitButton
              disabled={methods.pending}
              className="h-11 w-full rounded-xl text-sm font-semibold"
              pendingLabel={t("signUp.submitting")}
            >
              {t("signUp.submit")}
            </form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
      <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5">
        <p className="text-center text-sm text-muted-foreground">
          {t("signUp.signInPrompt")}{" "}
          <Link
            href="/auth/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signUp.signInLink")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
