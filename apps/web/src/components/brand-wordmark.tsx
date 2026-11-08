import type * as React from "react";

export function BrandWordmark(): React.JSX.Element {
  return (
    <span
      dir="ltr"
      className="inline-flex shrink-0 items-baseline whitespace-nowrap text-[15px] font-semibold tracking-tight"
    >
      <span className="text-primary">Ghost</span>
      <span className="text-secondary-foreground">Init</span>
    </span>
  );
}
