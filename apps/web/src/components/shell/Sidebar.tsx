"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
  { href: "/admin", label: "Admin" },
];
export function DashboardSidebar(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-4 border-e py-6 pe-4 md:flex">
      <div className="px-2 font-semibold tracking-tight">GhostInit</div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              className={cn("justify-start", active && "bg-accent font-medium")}
              render={<Link href={item.href}>{item.label}</Link>}
            />
          );
        })}
      </nav>
    </aside>
  );
}
export function useSidebar(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = React.useState(false);
  return { collapsed, toggle: () => setCollapsed((v) => !v) };
}
