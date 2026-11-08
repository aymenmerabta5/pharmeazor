"use client";
import type * as React from "react";
import { useEmailFlowForm } from "./use-email-flow-form";
import { EmailFlowView } from "./components/magic-link-form";
export function MagicLinkScreen(): React.JSX.Element {
  const state = useEmailFlowForm("magic-link");
  return <EmailFlowView state={state} />;
}
