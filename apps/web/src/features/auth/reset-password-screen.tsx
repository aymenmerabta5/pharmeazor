"use client";
import type * as React from "react";
import { useResetPasswordForm } from "./use-reset-password-form";
import { ResetPasswordForm } from "./components/reset-password-form";
import { ResetPasswordLoadingView } from "./components/reset-password-loading";
export function ResetPasswordScreen({
  token,
  queryError,
}: {
  token: string;
  queryError: string | null;
}): React.JSX.Element {
  const state = useResetPasswordForm(token, queryError);
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <ResetPasswordForm state={state} />
    </main>
  );
}
export function ResetPasswordLoading(): React.JSX.Element {
  return <ResetPasswordLoadingView />;
}
