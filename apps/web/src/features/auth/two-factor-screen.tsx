"use client";
import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { useTwoFactorForm } from "./use-two-factor-form";
import { TwoFactorForm } from "./components/two-factor-form";

export function TwoFactorScreen(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const state = useTwoFactorForm();
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {t("twoFactor.backHome")}
        </Link>
        <TwoFactorForm state={state} />
        <p className="mx-auto max-w-[48ch] text-center text-xs leading-5 text-muted-foreground">
          {t("twoFactor.securityNote")}
        </p>
      </div>
    </main>
  );
}
