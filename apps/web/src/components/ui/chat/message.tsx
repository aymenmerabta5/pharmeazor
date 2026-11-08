"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export const MessageGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="message-group"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  ),
);
MessageGroup.displayName = "MessageGroup";

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}
export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ align = "start", className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="message"
      data-align={align}
      className={cn("flex w-full gap-3", align === "end" && "justify-end", className)}
      {...props}
    />
  ),
);
Message.displayName = "Message";

export const MessageAvatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} data-slot="message-avatar" {...props} />,
);
MessageAvatar.displayName = "MessageAvatar";

export const MessageContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="message-content"
    className={cn("flex max-w-[80%] flex-col gap-1", className)}
    {...props}
  />
));
MessageContent.displayName = "MessageContent";

export const MessageHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="message-header"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  ),
);
MessageHeader.displayName = "MessageHeader";

export const MessageFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="message-footer"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  ),
);
MessageFooter.displayName = "MessageFooter";
