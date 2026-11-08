"use client";
import type * as React from "react";
import { StorageWorkspace } from "./components/storage-workspace";
import { useStorageWorkspace } from "./use-storage-workspace";
export function StoragePage(): React.JSX.Element {
  return <StorageWorkspace {...useStorageWorkspace()} />;
}
