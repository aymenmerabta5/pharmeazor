"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSurfaceTranslations } from "../../lib/translations";

export const Sheet = BaseDialog.Root;
export const SheetTrigger = BaseDialog.Trigger;
export const SheetPortal = BaseDialog.Portal;
export const SheetClose = BaseDialog.Close;

function SheetCloseLabel(): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  return <span className="sr-only">{t("close")}</span>;
}

export const SheetOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    data-slot="sheet-overlay"
    className={cn(
      "fixed inset-0 z-[var(--layer-overlay)] bg-scrim duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 motion-reduce:animate-none!",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const sheetVariants = cva(
  "fixed z-[var(--layer-modal)] gap-5 overflow-y-auto bg-popover p-6 text-popover-foreground shadow-modal ease-out data-[open]:animate-in data-[closed]:animate-out data-[closed]:duration-150 data-[open]:duration-200 motion-reduce:animate-none!",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[closed]:slide-out-to-top data-[open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[closed]:slide-out-to-bottom data-[open]:slide-in-from-bottom",
        start:
          "inset-y-0 start-0 h-full w-3/4 border-e data-[closed]:slide-out-to-left data-[open]:slide-in-from-left rtl:data-[closed]:slide-out-to-right rtl:data-[open]:slide-in-from-right sm:max-w-sm",
        end: "inset-y-0 end-0 h-full w-3/4 border-s data-[closed]:slide-out-to-right data-[open]:slide-in-from-right rtl:data-[closed]:slide-out-to-left rtl:data-[open]:slide-in-from-left sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "end",
    },
  },
);

export interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof BaseDialog.Popup>,
    VariantProps<typeof sheetVariants> {
  showCloseButton?: boolean;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = "end", className, children, showCloseButton = true, ...props }, ref) => (
    <BaseDialog.Portal>
      <SheetOverlay />
      <BaseDialog.Popup
        ref={ref}
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <BaseDialog.Close
            data-slot="sheet-close"
            className="absolute end-4 top-4 flex size-8 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&_svg]:size-4"
          >
            <X aria-hidden />
            <SheetCloseLabel />
          </BaseDialog.Close>
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  ),
);
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-header"
    className={cn("flex flex-col gap-2 pe-6 text-start", className)}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

export const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-footer"
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseDialog.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn("text-xl font-semibold leading-snug tracking-tight text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
