"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultLocale,
  isValidLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeDirection,
  localeLabels,
  locales,
  type Locale,
} from "../i18n/config";
import { useRouter } from "../i18n/navigation";

export interface LocaleSwitcherProps {
  className?: string;
}

function writeLocaleCookie(locale: Locale): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    localeCookieName +
    "=" +
    encodeURIComponent(locale) +
    "; Path=/; Max-Age=" +
    localeCookieMaxAge +
    "; SameSite=Lax" +
    secure;
}

/**
 * The active locale and the one way to change it.
 *
 * The header select and the full-screen menu both offer the choice. The cookie
 * write and the refresh live here so the two surfaces cannot drift on the
 * cookie name, the max-age, or the document direction.
 */
export function useLocalePreference() {
  const currentLocale = useLocale();
  const locale = isValidLocale(currentLocale) ? currentLocale : defaultLocale;
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  React.useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection[locale];
  }, [locale]);

  const choose = React.useCallback(
    (value: string) => {
      if (!isValidLocale(value) || value === locale) return;
      writeLocaleCookie(value);
      startTransition(() => {
        router.refresh();
      });
    },
    [locale, router],
  );

  return { locale, isPending, choose };
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps): React.JSX.Element {
  const t = useTranslations("localeSwitcher");
  const { locale, isPending, choose } = useLocalePreference();
  const items = locales.map((availableLocale) => ({
    label: localeLabels[availableLocale],
    value: availableLocale,
  }));

  return (
    <div className={className} data-slot="locale-switcher">
      <Select items={items} value={locale} onValueChange={choose} disabled={isPending}>
        <SelectTrigger aria-label={t("label")} aria-busy={isPending}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {locales.map((availableLocale) => (
              <SelectItem key={availableLocale} value={availableLocale}>
                {t(availableLocale)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function LocaleSwitcherInline({ className }: LocaleSwitcherProps): React.JSX.Element {
  return <LocaleSwitcher className={className} />;
}
