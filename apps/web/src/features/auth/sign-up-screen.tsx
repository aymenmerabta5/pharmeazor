"use client";
import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSignUpForm } from "./use-sign-up-form";
import { SignUpForm } from "./components/sign-up-form";

export function SignUpScreen(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const state = useSignUpForm();
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {t("signUp.backHome")}
        </Link>
        <SignUpForm state={state} />
        <p className="mx-auto max-w-[48ch] text-center text-xs leading-5 text-muted-foreground">
          {t("signUp.termsPrefix")} {t("signUp.securityNote")}
        </p>
      </div>
    </main>
  );
}
