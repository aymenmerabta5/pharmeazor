"use client";
import * as React from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "../../lib/utils";
import { buttonVariants } from "./button";
export const AlertDialog = BaseAlertDialog.Root;
export const AlertDialogTrigger = BaseAlertDialog.Trigger;
export const AlertDialogPortal = BaseAlertDialog.Portal;
export const AlertDialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Backdrop
    ref={ref}
    data-slot="alert-dialog-overlay"
    className={cn("fixed inset-0 z-[var(--layer-overlay)] bg-scrim", className)}
    {...props}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";
export const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Popup>
>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Portal>
    <AlertDialogOverlay />
    <BaseAlertDialog.Popup
      ref={ref}
      data-slot="alert-dialog-content"
      className={cn(
        "fixed start-1/2 top-1/2 z-[var(--layer-modal)] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-modal duration-150 rtl:translate-x-1/2 sm:p-7",
        className,
      )}
      {...props}
    />
  </BaseAlertDialog.Portal>
));
AlertDialogContent.displayName = "AlertDialogContent";
export const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="alert-dialog-header"
    className={cn("flex flex-col gap-2 text-start", className)}
    {...props}
  />
);
export const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="alert-dialog-footer"
    className={cn("flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
export const AlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Title
    ref={ref}
    data-slot="alert-dialog-title"
    className={cn("text-xl font-semibold leading-snug tracking-tight", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = "AlertDialogTitle";
export const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Description
    ref={ref}
    data-slot="alert-dialog-description"
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";
export const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Close> & { variant?: string }
>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Close ref={ref} className={cn(buttonVariants(), className)} {...props} />
));
AlertDialogAction.displayName = "AlertDialogAction";
export const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Close>
>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Close
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), className)}
    {...props}
  />
));
AlertDialogCancel.displayName = "AlertDialogCancel";
