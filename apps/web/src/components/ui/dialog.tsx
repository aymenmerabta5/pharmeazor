"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSurfaceTranslations } from "../../lib/translations";

export const Dialog = BaseDialog.Root;
export const DialogPortal = BaseDialog.Portal;
export const DialogTrigger = BaseDialog.Trigger;

export const DialogBackdrop = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 z-[var(--layer-overlay)] bg-scrim duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 motion-reduce:animate-none!",
      className,
    )}
    {...props}
  />
));
DialogBackdrop.displayName = "DialogBackdrop";

export const DialogClose = BaseDialog.Close;

function DialogCloseLabel(): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  return <span className="sr-only">{t("close")}</span>;
}

export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> & { showCloseButton?: boolean }
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <BaseDialog.Portal>
    <DialogBackdrop />
    <BaseDialog.Popup
      ref={ref}
      data-slot="dialog-content"
      className={cn(
        "fixed start-[50%] top-[50%] z-[var(--layer-modal)] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-modal duration-150 rtl:translate-x-[50%] data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none! sm:p-7",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <BaseDialog.Close
          data-slot="dialog-close"
          className="absolute end-4 top-4 flex size-8 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&_svg]:size-4"
        >
          <X aria-hidden />
          <DialogCloseLabel />
        </BaseDialog.Close>
      )}
    </BaseDialog.Popup>
  </BaseDialog.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("flex flex-col gap-2 pe-6 text-start", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn("flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseDialog.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn("text-xl font-semibold leading-snug tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";
