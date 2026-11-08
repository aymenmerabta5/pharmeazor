"use client";

import type * as React from "react";
import Link from "next/link";
import { SignInMethods } from "./sign-in-methods";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { SignInFormState } from "../types";

export function SignInForm({ state }: { state: SignInFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form, error, methods } = state;
  return (
    <Card className="border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
        <CardTitle as="h1" className="text-3xl tracking-tight">
          {t("signIn.title")}
        </CardTitle>
        <CardDescription className="max-w-[60ch]">{t("signIn.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("signIn.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <SignInMethods state={methods} />
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-6">
            <FieldGroup>
              <form.AppField name="email">
                {(field) => (
                  <field.TextField
                    type="email"
                    label={t("signIn.emailLabel")}
                    description={t("signIn.emailDescription")}
                    placeholder={t("signIn.emailPlaceholder")}
                    autoComplete="email"
                    required
                  />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.PasswordField
                    label={t("signIn.passwordLabel")}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    maxLength={64}
                  />
                )}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton
              disabled={methods.pending}
              className="h-10 w-full"
              pendingLabel={t("signIn.submitting")}
            >
              {t("signIn.submit")}
            </form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
      <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5">
        <div className="flex w-full flex-wrap gap-3 justify-between text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("signIn.forgotPassword")}
          </Link>
          <Link
            href="/sign-up"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("signIn.createAccountLink")}
          </Link>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-x-5 gap-y-2 text-xs">
          <Link
            href="/magic-link"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("signIn.magicLink")}
          </Link>
          <Link
            href="/verify-email"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("signIn.verifyEmail")}
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
