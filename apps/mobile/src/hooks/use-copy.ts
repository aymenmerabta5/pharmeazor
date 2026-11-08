import * as React from "react";
import * as Clipboard from "expo-clipboard";
import type { UseCopyReturn } from "@repo/kernel";

export function useCopy(): UseCopyReturn {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    setError(null);
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
      return false;
    }
  }, []);

  return { copy, copied, error };
}
