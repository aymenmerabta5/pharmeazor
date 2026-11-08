"use client";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import type { ResetPasswordFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";

export function ResetPasswordForm({ state }: { state: ResetPasswordFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form, token, error } = state;

  return (
    <div className="flex w-full max-w-[440px] flex-col gap-8">
      <Card className="border-0 bg-transparent p-0 shadow-none">
        <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
          <CardTitle as="h1" className="text-3xl tracking-tight">
            {t("resetPassword.title")}
          </CardTitle>
          <CardDescription className="max-w-[60ch]">
            {t("resetPassword.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
          {error ? (
            <Alert variant={token ? "destructive" : "default"}>
              <AlertTitle>
                {token ? t("resetPassword.errorTitle") : t("resetPassword.invalidLinkTitle")}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {!token ? (
            <div className="flex flex-col gap-4">
              <p className="max-w-[65ch] text-sm text-muted-foreground">
                {t("resetPassword.invalidLinkDescription")}
              </p>
              <Button render={<Link href="/forgot-password" />} nativeButton={false}>
                {t("resetPassword.requestNewLink")}
              </Button>
            </div>
          ) : (
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-6">
                <FieldGroup>
                  <form.AppField name="newPassword">
                    {(field) => (
                      <field.PasswordField
                        label={t("resetPassword.newPasswordLabel")}
                        description={t("resetPassword.newPasswordDescription")}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={64}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="confirmPassword">
                    {(field) => (
                      <field.PasswordField
                        label={t("resetPassword.confirmPasswordLabel")}
                        description={t("resetPassword.confirmPasswordDescription")}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={64}
                      />
                    )}
                  </form.AppField>
                </FieldGroup>
                <form.SubmitButton
                  className="h-10 w-full"
                  pendingLabel={t("resetPassword.submitting")}
                >
                  {t("resetPassword.submit")}
                </form.SubmitButton>
              </Form>
            </form.AppForm>
          )}
        </CardContent>
        <CardFooter className="mt-6 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
            {t("resetPassword.backSignIn")}
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
