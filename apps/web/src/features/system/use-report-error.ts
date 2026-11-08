"use client";
import { useEffect } from "react";
export function useReportError(error: unknown): void {
  useEffect(() => {
    console.error(error);
  }, [error]);
}
