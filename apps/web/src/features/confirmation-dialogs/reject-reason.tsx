"use client";
import type * as React from "react";
import type { RejectReasonProps } from "./types";
import { useRejectReason } from "./use-reject-reason";
import { RejectReasonView } from "./components/reject-reason-view";
export function RejectReasonDialog(props: RejectReasonProps): React.JSX.Element {
  return <RejectReasonView {...props} model={useRejectReason(props)} />;
}
