"use client";

import * as React from "react";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "../../lib/utils";

export const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof BaseAvatar.Root>
>(({ className, ...props }, ref) => (
  <BaseAvatar.Root
    ref={ref}
    data-slot="avatar"
    className={cn(
      "relative flex size-10 shrink-0 overflow-hidden rounded-full border border-border",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";

export const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ComponentPropsWithoutRef<typeof BaseAvatar.Image>
>(({ className, ...props }, ref) => (
  <BaseAvatar.Image
    ref={ref}
    data-slot="avatar-image"
    className={cn("aspect-square size-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof BaseAvatar.Fallback>
>(({ className, ...props }, ref) => (
  <BaseAvatar.Fallback
    ref={ref}
    data-slot="avatar-fallback"
    className={cn(
      "flex size-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";
