import type * as React from "react";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-control",
        className,
      )}
    >
      <Leaf className="size-[58%]" strokeWidth={2.1} />
    </span>
  );
}

export function BrandWordmark({
  size = "default",
}: {
  size?: "default" | "large";
}): React.JSX.Element {
  const large = size === "large";
  return (
    <span dir="ltr" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
      <BrandMark className={large ? "size-11 rounded-2xl" : undefined} />
      <span
        className={cn(
          "font-semibold tracking-tight text-primary",
          large ? "text-2xl" : "text-[17px]",
        )}
      >
        pharmeazor
      </span>
    </span>
  );
}
