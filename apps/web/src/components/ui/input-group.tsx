"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="input-group"
      className={cn(
        "flex min-w-0 items-center rounded-md border border-input bg-card text-card-foreground shadow-control ring-offset-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
InputGroup.displayName = "InputGroup";

export const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    data-slot="input-group-input"
    className={cn(
      "flex h-10 w-full min-w-0 bg-transparent px-3 py-2 text-base leading-6 placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed md:text-sm",
      className,
    )}
    {...props}
  />
));
InputGroupInput.displayName = "InputGroupInput";

export const InputGroupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="input-group-textarea"
    className={cn(
      "flex min-h-28 w-full min-w-0 resize-y bg-transparent px-3 py-2.5 text-base leading-6 placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed md:text-sm",
      className,
    )}
    {...props}
  />
));
InputGroupTextarea.displayName = "InputGroupTextarea";

export const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="input-group-addon"
    className={cn(
      "flex shrink-0 items-center px-1 text-sm text-muted-foreground [&>[data-slot=button]]:size-8",
      className,
    )}
    {...props}
  />
));
InputGroupAddon.displayName = "InputGroupAddon";
