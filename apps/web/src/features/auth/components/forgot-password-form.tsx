"use client";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
import type { ForgotPasswordFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";

export function ForgotPasswordView({
  state,
}: {
  state: ForgotPasswordFormState;
}): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form, error, success } = state;
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {t("forgotPassword.backHome")}
        </Link>
        <Card className="border-0 bg-transparent p-0 shadow-none">
          <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
            <CardTitle as="h1" className="text-3xl tracking-tight">
              {t("forgotPassword.title")}
            </CardTitle>
            <CardDescription className="max-w-[60ch]">
              {t("forgotPassword.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>{t("forgotPassword.errorTitle")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {success ? (
              <Alert>
                <AlertTitle>{t("forgotPassword.successTitle")}</AlertTitle>
                <AlertDescription>{t("forgotPassword.successMessage")}</AlertDescription>
              </Alert>
            ) : null}
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-6">
                <FieldGroup>
                  <form.AppField name="email">
                    {(field) => (
                      <field.TextField
                        type="email"
                        label={t("forgotPassword.emailLabel")}
                        description={t("forgotPassword.emailDescription")}
                        placeholder={t("forgotPassword.emailPlaceholder")}
                        autoComplete="email"
                        required
                      />
                    )}
                  </form.AppField>
                </FieldGroup>
                <form.SubmitButton
                  className="h-10 w-full"
                  pendingLabel={t("forgotPassword.submitting")}
                >
                  {t("forgotPassword.submit")}
                </form.SubmitButton>
              </Form>
            </form.AppForm>
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5">
            <div className="flex w-full flex-wrap justify-between gap-3 text-sm">
              <Link
                href="/sign-in"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("forgotPassword.backSignIn")}
              </Link>
              <Link
                href="/sign-up"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("forgotPassword.createAccount")}
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
