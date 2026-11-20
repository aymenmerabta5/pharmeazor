/**
 * Cloudflare Turnstile bridge for the native authentication surface.
 *
 * Turnstile has no native SDK. Cloudflare's documented mobile path is a
 * WebView whose document origin is a hostname allowed by the site key, so the
 * widget HTML is generated here and loaded with `baseUrl` set to the public
 * app origin. A placeholder site key disables the challenge, matching the
 * server, which disables its half when the secret is missing.
 */

import { env } from "@repo/config/expo";

/** Must match `TURNSTILE_ACTION` in `@repo/auth`'s server configuration. */
export const TURNSTILE_ACTION = "auth";

export function readTurnstileSiteKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("REPLACE_WITH")) return null;
  return trimmed;
}

export const turnstileSiteKey = readTurnstileSiteKey(env.EXPO_PUBLIC_TURNSTILE_SITE_KEY);

/**
 * Document origin for the WebView. It must be an origin whose hostname is
 * allowed in the Cloudflare widget; the web application origin is the natural
 * choice because it shares the auth deployment.
 */
export function readTurnstileBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("EXPO_PUBLIC_APP_URL must use HTTP(S) for Turnstile");
  }
  return parsed.origin;
}

export const turnstileBaseUrl = readTurnstileBaseUrl(env.EXPO_PUBLIC_APP_URL);

export type TurnstileBridgeMessage =
  | { type: "token"; token: string }
  | { type: "expired" }
  | { type: "error"; code?: string };

/** Parses a message posted by the challenge page, rejecting anything else. */
export function parseTurnstileBridgeMessage(value: string): TurnstileBridgeMessage | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const type = Reflect.get(parsed, "type");
    if (type === "token") {
      const token = Reflect.get(parsed, "token");
      return typeof token === "string" && token.length > 0 ? { type, token } : null;
    }
    if (type === "expired") return { type };
    if (type === "error") {
      const code = Reflect.get(parsed, "code");
      return typeof code === "string" ? { type, code } : { type };
    }
    return null;
  } catch {
    return null;
  }
}

function scriptLiteral(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Builds the self-contained challenge document loaded by the WebView. */
export function createTurnstileHtml(input: {
  siteKey: string;
  action: string;
  language: string;
}): string {
  const siteKey = scriptLiteral(input.siteKey);
  const action = scriptLiteral(input.action);
  const language = scriptLiteral(input.language);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    </style>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
  </head>
  <body>
    <div id="turnstile-widget"></div>
    <script>
      (function () {
        var siteKey = ${siteKey};
        var action = ${action};
        var language = ${language};
        function post(message) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          }
        }
        function render() {
          if (!window.turnstile) {
            window.setTimeout(render, 50);
            return;
          }
          try {
            window.turnstile.render("#turnstile-widget", {
              sitekey: siteKey,
              action: action,
              theme: "auto",
              language: language,
              callback: function (token) {
                post({ type: "token", token: token });
              },
              "expired-callback": function () {
                post({ type: "expired" });
              },
              "error-callback": function (code) {
                post({ type: "error", code: String(code) });
                return true;
              }
            });
          } catch (error) {
            post({ type: "error", code: "render" });
          }
        }
        render();
      })();
    </script>
  </body>
</html>`;
}
