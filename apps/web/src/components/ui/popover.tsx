"use client";

import * as React from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "../../lib/utils";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverPortal = BasePopover.Portal;

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Popup> & {
    sideOffset?: number;
    align?: "center" | "start" | "end";
  }
>(({ className, sideOffset = 4, align = "center", ...props }, ref) => (
  <BasePopover.Portal>
    <BasePopover.Positioner
      sideOffset={sideOffset}
      align={align}
      className="z-[var(--layer-popover)]"
    >
      <BasePopover.Popup
        ref={ref}
        data-slot="popover-content"
        className={cn(
          "w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-4 text-sm leading-6 text-popover-foreground shadow-popover outline-none duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none!",
          className,
        )}
        {...props}
      />
    </BasePopover.Positioner>
  </BasePopover.Portal>
));
PopoverContent.displayName = "PopoverContent";

export const PopoverTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Title>
>(({ className, ...props }, ref) => (
  <BasePopover.Title
    ref={ref}
    data-slot="popover-title"
    className={cn("font-semibold leading-6", className)}
    {...props}
  />
));
PopoverTitle.displayName = "PopoverTitle";

export const PopoverDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Description>
>(({ className, ...props }, ref) => (
  <BasePopover.Description
    ref={ref}
    data-slot="popover-description"
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
PopoverDescription.displayName = "PopoverDescription";
