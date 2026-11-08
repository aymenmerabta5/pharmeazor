import type * as React from "react";
import { useEmailFlowForm } from "./use-email-flow-form";
import { EmailFlowForm } from "./components/magic-link-form";
export function MagicLinkScreen(): React.JSX.Element {
  const state = useEmailFlowForm("magic-link");
  return <EmailFlowForm state={state} />;
}
