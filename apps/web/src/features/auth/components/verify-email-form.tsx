"use client";
import * as React from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { EmailFlowFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";

export function EmailFlowView({ state }: { state: EmailFlowFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form, error, sent } = state;
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <Card className="w-full max-w-[440px] border-0 bg-transparent p-0 shadow-none">
        <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
          <p className="text-sm font-medium text-muted-foreground">{t("emailFlow.kicker")}</p>
          <CardTitle as="h1" className="text-3xl tracking-tight">
            {t("emailFlow.verifyEmail.title")}
          </CardTitle>
          <CardDescription>{t("emailFlow.verifyEmail.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("emailFlow.requestErrorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {sent ? (
            <Alert>
              <AlertTitle>{t("emailFlow.requestedTitle")}</AlertTitle>
              <AlertDescription>{t("emailFlow.verifyEmailSuccess")}</AlertDescription>
            </Alert>
          ) : null}
          <form.AppForm>
            <Form form={form} className="flex flex-col gap-5">
              <FieldGroup>
                <form.AppField name="email">
                  {(field) => (
                    <field.TextField
                      label={t("emailFlow.emailLabel")}
                      placeholder={t("emailFlow.emailPlaceholder")}
                      type="email"
                      autoComplete="email"
                      required
                    />
                  )}
                </form.AppField>
              </FieldGroup>
              <form.SubmitButton className="h-10 w-full" pendingLabel={t("emailFlow.sending")}>
                {t("emailFlow.sendLink")}
              </form.SubmitButton>
            </Form>
          </form.AppForm>
          <div className="border-t border-border/70 pt-5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <Link href="/sign-in">{t("emailFlow.backSignIn")}</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
