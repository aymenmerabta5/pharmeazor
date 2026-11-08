"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface AttachmentProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: "idle" | "uploading" | "processing" | "error" | "done";
}
export const AttachmentGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-group"
    className={cn("flex flex-wrap gap-2", className)}
    {...props}
  />
));
AttachmentGroup.displayName = "AttachmentGroup";

export const Attachment = React.forwardRef<HTMLDivElement, AttachmentProps>(
  ({ state = "idle", className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="attachment"
      data-state={state}
      className={cn("flex items-center gap-3 rounded-lg border p-3", className)}
      {...props}
    />
  ),
);
Attachment.displayName = "Attachment";

export const AttachmentMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} data-slot="attachment-media" className={cn("shrink-0", className)} {...props} />
));
AttachmentMedia.displayName = "AttachmentMedia";

export const AttachmentContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-content"
    className={cn("min-w-0 flex-1", className)}
    {...props}
  />
));
AttachmentContent.displayName = "AttachmentContent";

export const AttachmentTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-title"
    className={cn("truncate text-sm font-medium", className)}
    {...props}
  />
));
AttachmentTitle.displayName = "AttachmentTitle";

export const AttachmentDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-description"
    className={cn("text-xs text-muted-foreground", className)}
    {...props}
  />
));
AttachmentDescription.displayName = "AttachmentDescription";

export const AttachmentActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="attachment-actions"
    className={cn("flex items-center gap-1", className)}
    {...props}
  />
));
AttachmentActions.displayName = "AttachmentActions";
