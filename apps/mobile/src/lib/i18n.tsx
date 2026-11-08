import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { I18nManager, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
  isLocale,
  locales,
  localeDirection,
  translate,
  type Locale,
  type PlatformI18nContext,
  type TranslationKey,
  type TranslationValues,
  type TranslationNamespace,
  type NamespaceTranslationKey,
  type NamespaceTranslate,
} from "./i18n-model";
export { isLocale, locales, localeDirection, translate } from "./i18n-model";
export type {
  Locale,
  LocaleDirection,
  PlatformI18nContext,
  TranslationKey,
  TranslationValues,
  TranslationNamespace,
  NamespaceTranslationKey,
  NamespaceTranslate,
} from "./i18n-model";

const I18nContext = React.createContext<PlatformI18nContext | null>(null);

const STORAGE_KEY = "ghostinit:locale";

function deviceLocale(): Locale {
  const language = Localization.getLocales()[0]?.languageCode;
  return isLocale(language) ? language : "en";
}

function applyNativeDirection(locale: Locale): void {
  const rtl = localeDirection[locale] === "rtl";
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
}

export function PlatformI18nProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [locale, setLocaleState] = React.useState<Locale>(deviceLocale);
  const userSelected = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || userSelected.current || !isLocale(stored)) return;
        applyNativeDirection(stored);
        setLocaleState(stored);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setLocale = React.useCallback(async (nextLocale: Locale): Promise<void> => {
    userSelected.current = true;
    applyNativeDirection(nextLocale);
    setLocaleState(nextLocale);
    await AsyncStorage.setItem(STORAGE_KEY, nextLocale).catch(() => undefined);
  }, []);

  const t = React.useCallback(
    (key: TranslationKey, values?: TranslationValues) => translate(locale, key, values),
    [locale],
  );
  const direction = localeDirection[locale];
  const value = React.useMemo<PlatformI18nContext>(
    () => ({ locale, direction, setLocale, t }),
    [direction, locale, setLocale, t],
  );
  return (
    <I18nContext.Provider value={value}>
      <View style={{ flex: 1, direction }}>{children}</View>
    </I18nContext.Provider>
  );
}

export function usePlatformI18n(): PlatformI18nContext {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error("usePlatformI18n must be used within PlatformI18nProvider");
  return context;
}

export function useTranslations<Namespace extends TranslationNamespace>(
  namespace: Namespace,
): NamespaceTranslate<Namespace> {
  const { t } = usePlatformI18n();
  return React.useCallback(
    (key: NamespaceTranslationKey<Namespace>, values?: TranslationValues) =>
      t((namespace + "." + key) as TranslationKey, values),
    [namespace, t],
  );
}

export function LocaleSwitcher(): React.JSX.Element {
  const { locale, setLocale } = usePlatformI18n();
  const t = useTranslations("localeSwitcher");
  return (
    <View accessibilityRole="radiogroup" className="flex-row items-center gap-1">
      {locales.map((candidate) => (
        <Button
          key={candidate}
          accessibilityRole="radio"
          accessibilityLabel={t(candidate)}
          accessibilityState={{ selected: locale === candidate }}
          size="sm"
          variant={locale === candidate ? "default" : "outline"}
          onPress={() => void setLocale(candidate)}
        >
          {candidate.toUpperCase()}
        </Button>
      ))}
    </View>
  );
}
