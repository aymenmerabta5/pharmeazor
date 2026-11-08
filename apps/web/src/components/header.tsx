"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BrandWordmark } from "./brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";

export function HeaderBrand(): React.JSX.Element {
  return (
    <Link
      href="/"
      aria-label="GhostInit"
      className="inline-flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BrandWordmark />
    </Link>
  );
}

export function Header({
  workspace = false,
  title,
  navigation,
  children,
}: {
  workspace?: boolean;
  title?: string;
  navigation?: React.ReactNode;
  children?: React.ReactNode;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  return (
    <header className="sticky top-0 z-[var(--layer-navigation)] h-16 w-full border-b bg-card">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
        {workspace ? (
          <div className="flex min-w-0 items-center gap-3">
            {navigation}
            <span className="hidden text-sm text-muted-foreground sm:inline">{t("workspace")}</span>
            <ChevronRight
              className="hidden size-3.5 shrink-0 text-muted-foreground rtl:rotate-180 sm:block"
              aria-hidden
            />
            <span className="hidden truncate text-sm font-medium sm:inline">
              {title ?? t("workspace")}
            </span>
          </div>
        ) : (
          <HeaderBrand />
        )}
        {children}
      </div>
    </header>
  );
}
