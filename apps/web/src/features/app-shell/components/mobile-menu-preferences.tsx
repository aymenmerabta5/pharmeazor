"use client";
import * as React from "react";
import { useTheme } from "next-themes";
import { ChevronDown } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { useLocalePreference } from "@/components/locale-switcher";
import { locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

/**
 * Language and appearance.
 *
 * The active language is one row; the three choices appear only after a tap,
 * so the menu stays short. Appearance is small enough to offer inline. The
 * same typographic rhythm as the destinations keeps the menu from turning into
 * a settings panel: the active choice holds the foreground, the rest step back.
 */
export function MobileMenuPreferences(): React.JSX.Element {
  const locale = useSurfaceTranslations("localeSwitcher");
  const settings = useSurfaceTranslations("settings");
  const { locale: activeLocale, isPending, choose } = useLocalePreference();
  const { theme, setTheme } = useTheme();
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const choices: readonly { value: ThemeChoice; label: string }[] = [
    { value: "light", label: settings("themeLight") },
    { value: "dark", label: settings("themeDark") },
    { value: "system", label: settings("themeSystem") },
  ];

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        aria-expanded={languageOpen}
        aria-controls="mobile-menu-languages"
        onClick={() => setLanguageOpen((current) => !current)}
        className="ph-menu-row flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-0 text-xl leading-7 tracking-tight text-foreground transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{locale("label")}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {locale(activeLocale)}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform duration-200 motion-reduce:transition-none",
              languageOpen && "rotate-180",
            )}
          />
        </span>
      </button>

      {languageOpen ? (
        <div
          id="mobile-menu-languages"
          role="radiogroup"
          aria-label={locale("label")}
          className="flex animate-in flex-col ps-4 pt-1 duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          {locales.map((candidate) => {
            const active = activeLocale === candidate;
            return (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={active}
                aria-busy={isPending}
                disabled={isPending}
                onClick={() => {
                  if (!active) choose(candidate);
                  setLanguageOpen(false);
                }}
                className={cn(
                  "ph-menu-row flex min-h-11 items-center rounded-lg px-0 text-start text-lg leading-7 tracking-tight transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "font-medium text-foreground" : "text-muted-foreground hover:opacity-70",
                )}
              >
                {locale(candidate)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-5">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {settings("themeLabel")}
        </p>
        <div
          role="radiogroup"
          aria-label={settings("themeLabel")}
          className="flex flex-wrap gap-x-6"
        >
          {choices.map((choice) => {
            const active = theme === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(choice.value)}
                className={cn(
                  "ph-menu-row flex min-h-11 items-center text-xl leading-7 tracking-tight transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "font-medium text-foreground" : "text-muted-foreground hover:opacity-70",
                )}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
