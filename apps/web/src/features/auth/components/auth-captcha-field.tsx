"use client";

import type * as React from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { TURNSTILE_ACTION, turnstileSiteKey } from "../turnstile";
import type { AuthCaptchaState } from "../use-auth-captcha";

/**
 * Renders the Cloudflare challenge and reports its token to the form.
 *
 * The widget injects Cloudflare's script itself, so the form never manages
 * script tags. A missing site key hides the whole block and leaves the form
 * working, which matches the server's own opt-in behaviour.
 */
export function AuthCaptchaField({
  captcha,
}: {
  captcha: AuthCaptchaState;
}): React.JSX.Element | null {
  const t = useSurfaceTranslations("auth");
  const locale = useSurfaceLocale();
  if (!captcha.enabled || !turnstileSiteKey) return null;
  return (
    <div className="flex flex-col gap-2">
      <Turnstile
        ref={captcha.widgetRef}
        siteKey={turnstileSiteKey}
        options={{
          action: TURNSTILE_ACTION,
          theme: "auto",
          language: locale,
          size: "flexible",
          responseField: false,
        }}
        onSuccess={captcha.acceptToken}
        onExpire={captcha.expireToken}
        onError={captcha.rejectChallenge}
        className="min-h-[65px]"
        data-testid="auth-captcha"
      />
      {captcha.error ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {t("captcha.error")}
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">{t("captcha.description")}</p>
      )}
    </div>
  );
}
