"use client";
import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
export const Checkbox = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root>
>(({ className, ...props }, ref) => (
  <BaseCheckbox.Root
    ref={ref}
    data-slot="checkbox"
    className={cn(
      "peer mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-card shadow-control ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground",
      className,
    )}
    {...props}
  >
    <BaseCheckbox.Indicator className="flex items-center justify-center text-current [&_svg]:size-3">
      <Check aria-hidden />
    </BaseCheckbox.Indicator>
  </BaseCheckbox.Root>
));
Checkbox.displayName = "Checkbox";
