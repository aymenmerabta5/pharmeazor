"use client";
import type * as React from "react";
import { useEmailFlowForm } from "./use-email-flow-form";
import { EmailFlowView } from "./components/verify-email-form";
export function VerifyEmailScreen(): React.JSX.Element {
  const state = useEmailFlowForm("verify-email");
  return <EmailFlowView state={state} />;
}
