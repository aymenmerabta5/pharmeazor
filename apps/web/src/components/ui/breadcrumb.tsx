"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSurfaceTranslations } from "../../lib/translations";

export const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & { separator?: React.ReactNode }
>(function Breadcrumb({ className, ...props }, ref) {
  const t = useSurfaceTranslations("common");
  return (
    <nav
      ref={ref}
      aria-label={t("breadcrumb")}
      data-slot="breadcrumb"
      className={cn("", className)}
      {...props}
    />
  );
});
Breadcrumb.displayName = "Breadcrumb";

export const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.OlHTMLAttributes<HTMLOListElement>
>(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    data-slot="breadcrumb-list"
    className={cn(
      "flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5",
      className,
    )}
    {...props}
  />
));
BreadcrumbList.displayName = "BreadcrumbList";

export const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  React.LiHTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-slot="breadcrumb-item"
    className={cn("inline-flex items-center gap-1.5", className)}
    {...props}
  />
));
BreadcrumbItem.displayName = "BreadcrumbItem";

export interface BreadcrumbLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  ref?: React.Ref<HTMLAnchorElement>;
}

export function BreadcrumbLink({
  className,
  ref,
  ...props
}: BreadcrumbLinkProps): React.JSX.Element {
  return (
    <a
      ref={ref}
      data-slot="breadcrumb-link"
      className={cn("transition-colors hover:text-foreground", className)}
      {...props}
    />
  );
}

export const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="breadcrumb-page"
    role="link"
    aria-disabled="true"
    aria-current="page"
    className={cn("font-normal text-foreground", className)}
    {...props}
  />
));
BreadcrumbPage.displayName = "BreadcrumbPage";

export const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLLIElement>) => (
  <li
    data-slot="breadcrumb-separator"
    role="presentation"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {children ?? <ChevronRight className="rtl:rotate-180" aria-hidden />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";
