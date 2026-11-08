"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandWordmark } from "./brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceIdentity } from "./workspace-identity";
import { WorkspaceNavigation } from "./workspace-navigation";

export function WorkspaceNavigationTrigger({
  pathname,
  identity,
}: {
  pathname: string;
  identity: WorkspaceIdentity;
}): React.JSX.Element {
  const owner = identity.status === "authenticated" ? identity.user.email : identity.status;
  return (
    <WorkspaceNavigationSheet
      key={JSON.stringify([pathname, owner])}
      pathname={pathname}
      identity={identity}
    />
  );
}

function WorkspaceNavigationSheet({
  pathname,
  identity,
}: {
  pathname: string;
  identity: WorkspaceIdentity;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const t = useSurfaceTranslations("header");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label={t("openNavigation")}
          />
        }
      >
        <PanelLeft className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="start"
        className="flex w-[min(320px,calc(100%-32px))] flex-col gap-6 bg-sidebar p-5"
        aria-describedby={undefined}
      >
        <SheetTitle className="pe-8">
          <BrandWordmark />
        </SheetTitle>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkspaceNavigation
            pathname={pathname}
            identity={identity}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
