"use client";
import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { useSignInForm } from "./use-sign-in-form";
import { SignInForm } from "./components/sign-in-form";

export function SignInScreen(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const state = useSignInForm();
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {t("signIn.backHome")}
        </Link>
        <SignInForm state={state} />
        <p className="mx-auto max-w-[48ch] text-center text-xs leading-5 text-muted-foreground">
          {t("signIn.securityNote")}
        </p>
      </div>
    </main>
  );
}
