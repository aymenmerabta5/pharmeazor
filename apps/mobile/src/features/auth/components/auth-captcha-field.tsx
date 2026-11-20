"use client";

import * as React from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { Text } from "@/components/ui/text";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import {
  createTurnstileHtml,
  parseTurnstileBridgeMessage,
  TURNSTILE_ACTION,
  turnstileBaseUrl,
  turnstileSiteKey,
} from "../turnstile";
import type { AuthCaptchaState } from "../use-auth-captcha";

/**
 * Hosts the Cloudflare Turnstile challenge in a WebView.
 *
 * Turnstile has no native SDK, so the widget runs as a small local document
 * served from the public app origin. Tokens arrive through `postMessage` and
 * are handed back to the form's captcha state.
 */
export function AuthCaptchaField({
  captcha,
}: {
  captcha: AuthCaptchaState;
}): React.JSX.Element | null {
  const t = useSurfaceTranslations("auth");
  const locale = useSurfaceLocale();
  const { acceptToken, rejectChallenge } = captcha;

  const html = React.useMemo(() => {
    if (!turnstileSiteKey) return "";
    return createTurnstileHtml({
      siteKey: turnstileSiteKey,
      action: TURNSTILE_ACTION,
      language: locale,
    });
  }, [locale]);

  const onMessage = React.useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const message = parseTurnstileBridgeMessage(event.nativeEvent.data);
      if (!message) return;
      if (message.type === "token") {
        acceptToken(message.token);
        return;
      }
      rejectChallenge();
    },
    [acceptToken, rejectChallenge],
  );

  if (!captcha.enabled) return null;

  return (
    <View className="gap-2">
      <View className="h-[70px] overflow-hidden rounded-md">
        <WebView
          key={captcha.attempt}
          source={{ html, baseUrl: turnstileBaseUrl }}
          originWhitelist={["https://challenges.cloudflare.com", turnstileBaseUrl]}
          javaScriptEnabled
          domStorageEnabled={false}
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          onMessage={onMessage}
          onError={() => rejectChallenge()}
          onHttpError={() => rejectChallenge()}
          accessibilityLabel={t("captcha.description")}
        />
      </View>
      {captcha.error ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          {t("captcha.error")}
        </Text>
      ) : (
        <Text className="text-xs text-muted-foreground">{t("captcha.description")}</Text>
      )}
    </View>
  );
}
