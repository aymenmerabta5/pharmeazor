"use client";
import type * as React from "react";
import type { NameConfirmationProps } from "./types";
import { useNameConfirmation } from "./use-name-confirmation";
import { NameConfirmationView } from "./components/name-confirmation-view";
export function NameConfirmationAlertDialog(props: NameConfirmationProps): React.JSX.Element {
  return <NameConfirmationView {...props} model={useNameConfirmation(props)} />;
}
