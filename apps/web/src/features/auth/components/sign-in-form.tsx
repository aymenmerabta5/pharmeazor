"use client";

import type * as React from "react";
import Link from "next/link";
import { SignInMethods } from "./sign-in-methods";
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
import type { SignInFormState } from "../types";

export function SignInForm({ state }: { state: SignInFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form, error, methods } = state;
  return (
    <Card className="rounded-3xl border-border/80 bg-card p-6 shadow-surface sm:p-8">
      <CardHeader className="items-center gap-4 p-0 pb-7 text-center sm:p-0 sm:pb-7">
        <BrandMark className="size-12 rounded-2xl" />
        <div className="flex flex-col gap-1.5">
          <CardTitle as="h1" className="text-2xl sm:text-[1.75rem]">
            {t("signIn.title")}
          </CardTitle>
          <CardDescription className="max-w-[34ch]">{t("signIn.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("signIn.errorTitle")}</AlertTitle>
            <AlertDescription>
              {error}{" "}
              {state.needsVerification ? (
                <Link
                  href="/verify-email"
                  className="font-medium underline underline-offset-4 hover:text-destructive/80"
                >
                  {t("signIn.verifyEmail")}
                </Link>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <SignInMethods state={methods} />
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-5">
            <FieldGroup className="gap-4">
              <form.AppField name="email">
                {(field) => (
                  <field.TextField
                    type="email"
                    label={t("signIn.emailLabel")}
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
              className="h-11 w-full rounded-xl text-sm font-semibold"
              pendingLabel={t("signIn.submitting")}
            >
              {t("signIn.submit")}
            </form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
      <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t("signIn.forgotPassword")}
          </Link>
          <Link
            href="/sign-up"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signIn.createAccountLink")}
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
