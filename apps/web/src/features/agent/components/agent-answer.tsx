"use client";
import type * as React from "react";
import { Copy, Plus, RefreshCw, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import { answerDisplayText, answerSections, extractSources } from "../model";
import { AgentFollowUps } from "./agent-follow-ups";
import { AgentMarkdown } from "./agent-markdown";
import { AgentSources } from "./agent-sources";

export function AgentAnswer({
  text,
  isLast,
  busy,
  onAsk,
  onRetry,
}: {
  text: string;
  isLast: boolean;
  busy: boolean;
  onAsk(question: string): void;
  onRetry(): void;
}): React.JSX.Element | null {
  const t = useSurfaceTranslations("agent");
  const display = answerSections(text);
  const sources = extractSources(text);
  if (!display.headline && !display.body) return null;

  const copyAnswer = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(answerDisplayText(text));
      toast.success(t("answerCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <div className="flex gap-3 sm:gap-4">
      <span
        aria-hidden
        className="mt-1 hidden size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:flex"
      >
        <Plus className="size-4" strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        {display.headline ? (
          <h2
            dir="auto"
            className="text-[1.7rem] font-bold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[1.9rem]"
          >
            {display.headline}
          </h2>
        ) : null}
        {display.body ? (
          <AgentMarkdown
            text={display.body}
            streaming={busy && isLast}
            className={display.headline ? "mt-4" : undefined}
          />
        ) : null}
        <AgentSources sources={sources} />
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("patientContextNote")}</p>
        <div className="mt-4 flex items-center gap-1 text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={t("copyAnswer")}
            onClick={() => void copyAnswer()}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={t("markHelpful")}
            onClick={() => toast.success(t("feedbackThanks"))}
          >
            <ThumbsUp className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={t("retryAnswer")}
            disabled={busy}
            onClick={onRetry}
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        </div>
        {isLast && !busy ? <AgentFollowUps onAsk={onAsk} busy={busy} /> : null}
      </div>
    </div>
  );
}
