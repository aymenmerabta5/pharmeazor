"use client";
import type * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import type { DashboardUser } from "../types";

const CHECKS = [
  ["checks.architecture", "bun run check"],
  ["checks.typecheck", "bun run typecheck"],
  ["checks.lint", "bun run lint:all"],
] as const;

export function ChecksCard({ user }: { user?: DashboardUser | null } = {}): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <section className="min-w-0 lg:col-span-5">
      <h3 className="text-base font-semibold tracking-tight">{t("checks.title")}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("checks.instructions")}</p>
      <div className="mt-5 space-y-4 rounded-lg border bg-code p-4">
        {CHECKS.map(([name, command]) => (
          <div key={name}>
            <p className="text-xs text-muted-foreground">{t(name)}</p>
            <code className="mt-1 block break-all font-mono text-xs leading-6 text-code-foreground">
              $ {command}
            </code>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("checks.reviewResults")}</p>
      {user?.role === "admin" ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          render={<Link href="/admin" />}
          nativeButton={false}
        >
          {t("checks.openAdmin")}
        </Button>
      ) : null}
    </section>
  );
}
