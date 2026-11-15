"use client";
import type * as React from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";

export function AgentComposer({
  input,
  onInputChange,
  onSend,
  busy,
}: {
  input: string;
  onInputChange(value: string): void;
  onSend(): void;
  busy: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <form
      className="agent-composer flex w-full items-center gap-2 rounded-2xl border border-border/80 bg-card p-2 ps-5 transition-[border-color,box-shadow] focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <label htmlFor="agent-prompt" className="sr-only">
        {t("messageLabel")}
      </label>
      <Input
        id="agent-prompt"
        dir="auto"
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        placeholder={busy ? t("workingPlaceholder") : t("homePlaceholder")}
        autoComplete="off"
        enterKeyHint="send"
        aria-busy={busy}
        className="h-[60px] flex-1 rounded-none border-0 bg-transparent px-0 pe-2 text-[0.9375rem] leading-6 shadow-none placeholder:text-muted-foreground/85 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 md:text-[0.9375rem]"
      />
      <Button
        type="submit"
        size="icon"
        disabled={busy}
        aria-label={t("send")}
        className="size-11 shrink-0 rounded-xl border-0 bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <ArrowUp className="size-5" strokeWidth={2.2} aria-hidden />
        )}
      </Button>
    </form>
  );
}
