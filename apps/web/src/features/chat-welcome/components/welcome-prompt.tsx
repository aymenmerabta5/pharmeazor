"use client";
import type * as React from "react";
import { ArrowUp } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

export function WelcomePrompt({
  value,
  onChange,
  onSend,
  busy,
}: {
  value: string;
  onChange(v: string): void;
  onSend(): void;
  busy: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("welcome");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="ph-welcome-prompt-wrap"
    >
      <div className="ph-welcome-prompt-inner">
        <label htmlFor="welcome-input" className="sr-only">
          {t("inputLabel")}
        </label>
        <input
          id="welcome-input"
          type="text"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          placeholder={t("inputPlaceholder")}
          className="ph-welcome-input"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          aria-label={t("send")}
          className="ph-welcome-send"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
