"use client";

import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "../../lib/utils";

export const TooltipProvider = BaseTooltip.Provider;
export const Tooltip = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;
export const TooltipPortal = BaseTooltip.Portal;

export interface TooltipContentProps extends React.ComponentPropsWithoutRef<
  typeof BaseTooltip.Popup
> {
  /** Base UI puts `sideOffset` on the Positioner, not the Popup. */
  sideOffset?: number;
}

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, sideOffset = 4, ...props }, ref) => (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={sideOffset} className="z-[var(--layer-tooltip)]">
        <BaseTooltip.Popup
          ref={ref}
          data-slot="tooltip-content"
          className={cn(
            "max-w-xs overflow-hidden rounded-md border border-border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-popover duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 motion-reduce:animate-none!",
            className,
          )}
          {...props}
        />
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  ),
);
TooltipContent.displayName = "TooltipContent";
