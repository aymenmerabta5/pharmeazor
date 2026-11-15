import type * as React from "react";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

/** The leaf tile used in the rail and above the greeting. */
export function AgentBrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "agent-brand-mark inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] text-primary-foreground",
        className,
      )}
    >
      <Leaf className={cn("size-[56%]", iconClassName)} strokeWidth={1.85} />
    </span>
  );
}
