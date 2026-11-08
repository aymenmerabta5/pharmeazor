"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";

export function AgentPrompt({
  busy,
  input,
  onInputChange,
  onSend,
}: {
  busy: boolean;
  input: string;
  onInputChange(input: string): void;
  onSend(): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="agent-message">{t("messageLabel")}</FieldLabel>
          <div className="flex gap-3">
            <Input
              id="agent-message"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={busy ? t("workingPlaceholder") : t("messagePlaceholder")}
              disabled={busy}
              className="min-w-0 flex-1"
            />
            <Button className="shrink-0" type="submit" disabled={busy || !input.trim()}>
              {busy ? t("working") : t("send")}
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </form>
  );
}
