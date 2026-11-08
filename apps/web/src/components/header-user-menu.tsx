"use client";

import * as React from "react";
import type { WorkspaceDestination } from "@/features/app-shell/navigation-model";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSurfaceTranslations } from "@/lib/translations";

export interface HeaderUser {
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

function getInitials(user: HeaderUser | null): string {
  if (user?.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return user?.email?.slice(0, 2).toUpperCase() ?? "U";
}

export function HeaderUserMenu({
  user,
  onNavigate,
  onSignOut,
}: {
  user: HeaderUser | null;
  onNavigate(destination: WorkspaceDestination): void;
  onSignOut(): Promise<void>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("userMenu")} />
        }
      >
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="truncate font-medium">{user?.name ?? t("fallbackUser")}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user?.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onNavigate("/dashboard")}>
            {t("dashboard")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate("/agent")}>{t("agent")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate("/storage")}>{t("storage")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate("/pdf")}>{t("pdf")}</DropdownMenuItem>

          <DropdownMenuItem onClick={() => onNavigate("/billing")}>{t("billing")}</DropdownMenuItem>

          <DropdownMenuItem onClick={() => onNavigate("/settings")}>
            {t("settings")}
          </DropdownMenuItem>
          {user?.role === "admin" ? (
            <DropdownMenuItem onClick={() => onNavigate("/admin/users")}>
              {t("users")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => void onSignOut()}>{t("signOut")}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
