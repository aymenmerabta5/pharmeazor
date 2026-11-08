"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

export function ThemeToggle(): React.JSX.Element {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useSurfaceTranslations("theme");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled aria-label={t("toggle")}>
        <span className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
      aria-label={t("toggle")}
    >
      <Sun
        className="size-4 rotate-0 scale-100 transition-transform motion-reduce:transition-none dark:-rotate-90 dark:scale-0"
        data-icon="inline-start"
        aria-hidden
      />
      <Moon
        className="absolute size-4 rotate-90 scale-0 transition-transform motion-reduce:transition-none dark:rotate-0 dark:scale-100"
        data-icon="inline-start"
        aria-hidden
      />
      <span className="sr-only">{t("toggle")}</span>
    </Button>
  );
}
