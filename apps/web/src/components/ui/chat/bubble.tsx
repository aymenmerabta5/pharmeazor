"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

const bubbleVariants = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-foreground",
  tinted: "bg-accent text-accent-foreground",
  outline: "border bg-background",
  ghost: "bg-transparent",
  destructive: "bg-destructive text-destructive-foreground",
} as const;

export interface BubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof bubbleVariants;
  align?: "start" | "end";
}
export const Bubble = React.forwardRef<HTMLDivElement, BubbleProps>(
  ({ variant = "muted", align = "start", className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="bubble"
      data-align={align}
      className={cn(
        "w-fit max-w-full rounded-xl px-3 py-2 text-sm",
        bubbleVariants[variant],
        align === "end" && "ms-auto",
        className,
      )}
      {...props}
    />
  ),
);
Bubble.displayName = "Bubble";

export const BubbleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="bubble-content"
      className={cn("whitespace-pre-wrap", className)}
      {...props}
    />
  ),
);
BubbleContent.displayName = "BubbleContent";
