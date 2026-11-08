"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import { useShellActions } from "./use-shell-actions";

export function SignOutButton(): React.JSX.Element {
  const { onSignOut } = useShellActions();
  const t = useSurfaceTranslations("header");
  return (
    <Button variant="outline" onClick={() => void onSignOut()}>
      {t("signOut")}
    </Button>
  );
}
