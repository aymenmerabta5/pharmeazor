"use client";

import * as React from "react";
import { toast } from "sonner";
import type { UseCopyReturn } from "@repo/kernel";

export function useCopy(): UseCopyReturn {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to copy");
      toast.error("Failed to copy");
      return false;
    }
  }, []);

  return { copy, copied, error };
}
