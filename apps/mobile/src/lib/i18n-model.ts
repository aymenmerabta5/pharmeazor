import arMessages from "../i18n/messages/ar.json";
import enMessages from "../i18n/messages/en.json";
import frMessages from "../i18n/messages/fr.json";

export const locales = ["en", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];
export type LocaleDirection = "ltr" | "rtl";
type Messages = typeof enMessages;
type TranslationPath<Value> = {
  [Key in keyof Value & string]: Value[Key] extends string
    ? Key
    : Value[Key] extends Record<string, unknown>
      ? `${Key}.${TranslationPath<Value[Key]>}`
      : never;
}[keyof Value & string];
export type TranslationKey = TranslationPath<Messages>;
export type TranslationNamespace = keyof Messages & string;
export type NamespaceTranslationKey<Namespace extends TranslationNamespace> = TranslationPath<
  Messages[Namespace]
>;
export type NamespaceTranslate<Namespace extends TranslationNamespace> = (
  key: NamespaceTranslationKey<Namespace>,
  values?: TranslationValues,
) => string;
export type TranslationValues = Readonly<Record<string, string | number>>;

const messagesByLocale: Readonly<Record<Locale, Messages>> = {
  en: enMessages,
  fr: frMessages,
  ar: arMessages,
};
export const localeDirection: Readonly<Record<Locale, LocaleDirection>> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

function messageAt(messages: Messages, key: string): string | undefined {
  let value: unknown = messages;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = Reflect.get(value, segment);
  }
  return typeof value === "string" ? value : undefined;
}

function interpolate(message: string, values?: TranslationValues): string {
  if (!values) return message;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key: string) =>
    key in values ? String(values[key]) : token,
  );
}

export function translate(locale: Locale, key: TranslationKey, values?: TranslationValues): string {
  const localized = messageAt(messagesByLocale[locale], key);
  const fallback = messageAt(enMessages, key);
  return interpolate(localized ?? fallback ?? key, values);
}

export interface PlatformI18nContext {
  locale: Locale;
  direction: LocaleDirection;
  setLocale(locale: Locale): Promise<void>;
  t(key: TranslationKey, values?: TranslationValues): string;
}
