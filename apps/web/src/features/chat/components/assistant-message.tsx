"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ChatMessage } from "../model";
import { AnswerActions } from "./answer-actions";
import { AnswerDot } from "./answer-dot";
import { AnswerSources } from "./answer-sources";
import { FollowUps } from "./follow-ups";

/** One assistant answer: headline, tags, body, sources and follow-ups. */
export function AssistantMessage({ message }: { message: ChatMessage }): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  return (
    <div className="ph-msg-assistant">
      {message.answerLabel ? (
        <div className="ph-answer-headline">
          <AnswerDot />
          <h2 className="ph-answer-title">{message.answerLabel}</h2>
        </div>
      ) : null}

      {message.tags?.length ? (
        <div className="ph-answer-tags">
          {message.tags.map((tag) => (
            <span key={tag} className="ph-answer-tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <p className="ph-answer-body">{message.content}</p>

      {message.sources?.length ? <AnswerSources sources={message.sources} /> : null}

      {message.disclaimer ? <p className="ph-patient-context">{t("patientContext")}</p> : null}

      <AnswerActions />

      {message.followUps?.length ? <FollowUps questions={message.followUps} /> : null}
    </div>
  );
}
