"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-5 rounded-lg border border-border bg-card px-6 py-10 text-center text-balance sm:py-14",
        className,
      )}
      {...props}
    />
  ),
);
Empty.displayName = "Empty";

export const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2 text-center", className)}
      {...props}
    />
  ),
);
EmptyHeader.displayName = "EmptyHeader";

const emptyMediaVariants = cva(
  "mb-1 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

export const EmptyTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty-title"
      className={cn("text-lg font-semibold leading-snug tracking-tight", className)}
      {...props}
    />
  ),
);
EmptyTitle.displayName = "EmptyTitle";

export const EmptyDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="empty-description"
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
EmptyDescription.displayName = "EmptyDescription";

export const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className,
      )}
      {...props}
    />
  ),
);
EmptyContent.displayName = "EmptyContent";
