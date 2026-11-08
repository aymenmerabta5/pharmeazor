import * as React from "react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getSurfaceTranslations } from "@/lib/translations.server";

export async function generateMetadata(): Promise<{ title: string; description: string }> {
  const t = await getSurfaceTranslations("metadata");
  return { title: t("maintenanceTitle"), description: t("maintenanceDescription") };
}

async function MaintenanceContent(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("errors");
  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-lg flex-col items-start gap-3 px-5 py-10 text-start sm:px-8 sm:py-14">
      <p className="text-sm font-medium text-muted-foreground">{t("maintenance.status")}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{t("maintenance.title")}</h1>
      <p className="max-w-[60ch] text-sm leading-6 text-muted-foreground">
        {t("maintenance.description")}
      </p>
      <details className="mt-5 w-full rounded-lg border border-border/70 bg-card">
        <summary className="cursor-pointer rounded-lg px-5 py-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("maintenance.administratorAccess")}
        </summary>
        <div className="border-t border-border/70 p-5">
          <form action="/maintenance/access" method="post" rel="noreferrer">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="maintenance-token">{t("maintenance.accessLabel")}</FieldLabel>
                <Input
                  id="maintenance-token"
                  name="token"
                  type="password"
                  required
                  minLength={32}
                  maxLength={512}
                  autoComplete="off"
                />
              </Field>
              <Button className="w-auto self-start" type="submit">
                {t("maintenance.accessAction")}
              </Button>
            </FieldGroup>
          </form>
        </div>
      </details>
    </main>
  );
}

function MaintenanceFallback(): React.JSX.Element {
  return (
    <main
      className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-lg flex-col gap-4 px-5 py-10 sm:px-8 sm:py-14"
      aria-busy="true"
    >
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-32 w-full" />
    </main>
  );
}

export default function MaintenancePage(): React.JSX.Element {
  return (
    <Suspense fallback={<MaintenanceFallback />}>
      <MaintenanceContent />
    </Suspense>
  );
}
