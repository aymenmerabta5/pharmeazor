"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-5 text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 data-[invalid=true]:text-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";
