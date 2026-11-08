"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export function StatsCard({
  title,
  value,
  description,
  trend,
}: {
  title: string;
  value: string | number;
  description?: string;
  trend?: "up" | "down" | "neutral";
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex items-baseline justify-between">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {trend ? (
          <Badge
            variant={trend === "up" ? "secondary" : trend === "down" ? "destructive" : "outline"}
          >
            {trend}
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}
