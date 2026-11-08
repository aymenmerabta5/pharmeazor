"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface MarkerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "separator" | "border";
}
export const Marker = React.forwardRef<HTMLDivElement, MarkerProps>(
  ({ variant = "default", className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="marker"
      data-variant={variant}
      className={cn(
        "flex items-center justify-center gap-3 py-2 text-xs text-muted-foreground",
        variant === "separator" &&
          "before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border",
        variant === "border" && "border-b",
        className,
      )}
      {...props}
    />
  ),
);
Marker.displayName = "Marker";

export const MarkerContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} data-slot="marker-content" {...props} />,
);
MarkerContent.displayName = "MarkerContent";
