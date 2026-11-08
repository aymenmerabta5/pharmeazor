import type * as React from "react";
import { useEmailFlowForm } from "./use-email-flow-form";
import { EmailFlowForm } from "./components/verify-email-form";
export function VerifyEmailScreen(): React.JSX.Element {
  const state = useEmailFlowForm("verify-email");
  return <EmailFlowForm state={state} />;
}
