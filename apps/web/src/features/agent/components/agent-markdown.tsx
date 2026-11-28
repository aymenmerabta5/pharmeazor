"use client";
import type * as React from "react";
import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

const plugins = { code };

/**
 * Assistant answers arrive as Markdown while the model is still streaming.
 * Streamdown closes unterminated fences/tables on the fly, renders GFM, and
 * highlights fenced code with Shiki. Raw HTML is sanitised by the package.
 */
export function AgentMarkdown({
  text,
  streaming = false,
  className,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <Streamdown
      className={cn(
        "agent-markdown whitespace-normal text-[0.95rem] leading-7 text-foreground/90",
        className,
      )}
      plugins={plugins}
      dir="auto"
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      parseIncompleteMarkdown
      lineNumbers={false}
      codeBlockMaxHeight={0}
      tableMaxHeight={0}
    >
      {text}
    </Streamdown>
  );
}
