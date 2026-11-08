"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
export function DashboardMasthead({
  title,
  description,
  badge,
}: {
  title: string;
  description?: string;
  badge?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 border-b pb-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      {description ? (
        <p className="text-sm text-muted-foreground max-w-[65ch]">{description}</p>
      ) : null}
    </div>
  );
}
