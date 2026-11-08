"use client";

import { Toaster as SonnerToaster, type ToasterProps as SonnerToasterProps } from "sonner";
import { useTheme } from "next-themes";

export type ToasterProps = SonnerToasterProps;

export function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "system";

  return (
    <SonnerToaster
      theme={theme}
      className="toaster group !z-[var(--layer-toast)]"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-lg group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-popover",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:leading-6",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
