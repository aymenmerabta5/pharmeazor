"use client";

import type * as React from "react";
import { Button } from "@/components/ui/button";
import type { IdentityOAuthProvider } from "@/lib/auth-model";

function GoogleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function AppleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <path d="M16.36 12.78c.02 2.6 2.28 3.47 2.31 3.48-.02.06-.36 1.23-1.19 2.44-.72 1.04-1.46 2.08-2.63 2.1-1.15.02-1.52-.68-2.83-.68-1.32 0-1.73.66-2.82.7-1.13.04-1.99-1.12-2.71-2.16-1.47-2.13-2.6-6.02-1.09-8.65.75-1.31 2.1-2.14 3.56-2.16 1.11-.02 2.15.74 2.83.74.67 0 1.94-.92 3.27-.78.56.02 2.12.22 3.12 1.69-.08.05-1.86 1.09-1.84 3.24M14.2 5.3c.6-.73 1-1.74.89-2.75-.86.04-1.91.58-2.53 1.3-.56.64-1.05 1.68-.92 2.67.96.07 1.95-.49 2.56-1.22" />
    </svg>
  );
}

export interface AuthOAuthButtonsProps {
  googleLabel: string;
  appleLabel: string;
  separatorLabel: string;
  onSelect: (provider: IdentityOAuthProvider) => void | Promise<void>;
  disabled?: boolean;
}

export function AuthOAuthButtons({
  googleLabel,
  appleLabel,
  separatorLabel,
  onSelect,
  disabled = false,
}: AuthOAuthButtonsProps): React.JSX.Element {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl bg-card font-medium"
          disabled={disabled}
          onClick={() => void onSelect("google")}
        >
          <GoogleIcon />
          {googleLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl bg-card font-medium"
          disabled={disabled}
          onClick={() => void onSelect("apple")}
        >
          <AppleIcon />
          {appleLabel}
        </Button>
      </div>
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {separatorLabel}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
