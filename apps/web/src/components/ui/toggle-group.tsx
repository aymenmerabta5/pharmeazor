"use client";

import * as React from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "../../lib/utils";

export interface ToggleGroupProps extends React.ComponentPropsWithoutRef<typeof BaseToggleGroup> {
  spacing?: number;
}

export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, spacing = 1, style, ...props }, ref) => (
    <BaseToggleGroup
      ref={ref}
      data-slot="toggle-group"
      style={{ gap: spacing * 4, ...style }}
      className={cn(
        "inline-flex max-w-full items-center justify-center rounded-lg border border-border bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
ToggleGroup.displayName = "ToggleGroup";

export const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Toggle>
>(({ className, ...props }, ref) => (
  <Toggle
    ref={ref}
    data-slot="toggle-group-item"
    className={cn(
      "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-control data-[active]:bg-card data-[active]:text-foreground data-[active]:shadow-control",
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = "ToggleGroupItem";
