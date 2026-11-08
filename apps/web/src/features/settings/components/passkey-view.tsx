"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import type { PasskeyManagement, PasskeyEditor } from "../use-passkey-management";
import type { PasskeySummary } from "../model";

export function PasskeyView({
  model,
  children,
}: {
  model: PasskeyManagement;
  children: React.ReactNode;
}): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const common = useSurfaceTranslations("common");
  const { form } = model;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle as="h2">{t("passkeys.title")}</CardTitle>
          {model.readSucceeded || model.passkeys.length > 0 ? (
            <Badge variant="secondary">{model.passkeys.length}</Badge>
          ) : null}
        </div>
        <CardDescription className="max-w-[65ch]">{t("passkeys.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {model.error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("passkeys.errorTitle")}</AlertTitle>
            <AlertDescription>{model.error}</AlertDescription>
            <Button variant="outline" disabled={model.refreshing} onClick={model.retry}>
              {common("retry")}
            </Button>
          </Alert>
        ) : null}
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-3">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label={t("passkeys.namePlaceholder")}
                  placeholder={t("passkeys.namePlaceholder")}
                  maxLength={64}
                />
              )}
            </form.AppField>
            <form.SubmitButton
              className="w-auto self-start"
              pendingLabel={t("passkeys.registering")}
            >
              {t("passkeys.register")}
            </form.SubmitButton>
          </Form>
        </form.AppForm>
        {model.loading ? (
          <div role="status" aria-label={common("loading")} aria-busy={true}>
            <Skeleton className="h-24 w-full" />
          </div>
        ) : model.passkeys.length ? (
          <div className="divide-y rounded-lg border">{children}</div>
        ) : model.readSucceeded ? (
          <p className="text-sm text-muted-foreground">{t("passkeys.empty")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PasskeyRowView({
  model,
  passkey,
}: {
  model: PasskeyEditor;
  passkey: PasskeySummary;
}): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const locale = useSurfaceLocale();
  const { form } = model;
  const deviceLabel = passkey.backedUp
    ? t("passkeys.backedUp")
    : passkey.deviceType === "singleDevice"
      ? t("passkeys.deviceBound")
      : passkey.deviceType === "multiDevice"
        ? t("passkeys.backupEligible")
        : t("passkeys.unknownDevice");
  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-center">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{passkey.name ?? t("passkeys.unnamed")}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("passkeys.createdAt", {
              date: new Date(passkey.createdAt).toLocaleDateString(locale),
            })}
          </p>
        </div>
        <Badge variant="outline">{deviceLabel}</Badge>
      </div>
      <div className="flex flex-col gap-3">
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-3">
            <form.AppField name="name">
              {(field) => (
                <field.TextField label={t("passkeys.renameLabel")} required maxLength={64} />
              )}
            </form.AppField>
            <div className="flex flex-wrap gap-2">
              <form.SubmitButton size="sm" variant="outline" disabled={model.pending}>
                {t("passkeys.rename")}
              </form.SubmitButton>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={model.pending}
                onClick={() => void model.remove()}
              >
                {t("passkeys.delete")}
              </Button>
            </div>
          </Form>
        </form.AppForm>
        {model.error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("passkeys.errorTitle")}</AlertTitle>
            <AlertDescription>{model.error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
