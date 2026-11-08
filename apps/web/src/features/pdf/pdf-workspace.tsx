"use client";
import type * as React from "react";
import { PdfWorkspaceView } from "./components/pdf-workspace-view";
import { usePdfWorkspace } from "./use-pdf-workspace";
export function PdfWorkspace(): React.JSX.Element {
  return <PdfWorkspaceView {...usePdfWorkspace()} />;
}
