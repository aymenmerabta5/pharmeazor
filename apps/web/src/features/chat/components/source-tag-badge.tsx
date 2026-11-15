"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SourceTag } from "../model";

/** Provenance badge for one cited source. */
export function SourceTagBadge({ tag }: { tag: SourceTag }): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  const labels: Record<SourceTag, string> = {
    official: t("sourceOfficial"),
    foreign: t("sourceForeign"),
    differs: t("sourceDiffers"),
  };
  return <span className={`ph-source-tag ph-source-tag-${tag}`}>{labels[tag]}</span>;
}
