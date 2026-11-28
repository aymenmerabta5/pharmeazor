import * as React from "react";
import { View } from "react-native";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminSkeleton } from "@/features/admin-users/components/admin-skeleton";
import { AgentSkeleton } from "@/features/agent/components/agent-skeleton";
import { AppShellSkeleton } from "@/features/app-shell/components/app-shell-skeleton";
import { AuthSkeleton } from "@/features/auth/components/auth-skeleton";
import { BillingSkeleton } from "@/features/billing/components/billing-skeleton";
import { DashboardSkeleton } from "@/features/dashboard/components/dashboard-skeleton";
import { HomeSkeleton } from "@/features/home/components/home-skeleton";
import { WorkspaceSkeleton } from "@/features/identity-workspace/components/workspace-skeleton";
import { MarketingSkeleton } from "@/features/marketing/components/marketing-skeleton";
import { PdfSkeleton } from "@/features/pdf/components/pdf-skeleton";
import { ProfileSkeleton } from "@/features/profile/components/profile-skeleton";
import { SettingsSkeleton } from "@/features/settings/components/settings-skeleton";
import { StorageSkeleton } from "@/features/storage/components/storage-skeleton";
import { WalletSkeleton } from "@/features/wallet/components/wallet-skeleton";
import { useRequestedPathname } from "./use-requested-pathname";

const TAB_ROUTES = new Set(["/home", "/assistant", "/wallet", "/profile"]);

function TabSkeleton({ pathname }: { pathname: string }): React.JSX.Element {
  if (pathname === "/home") return <HomeSkeleton />;
  if (pathname === "/assistant") return <AgentSkeleton />;
  if (pathname === "/wallet") return <WalletSkeleton />;
  return <ProfileSkeleton />;
}

function PageSkeleton({ pathname }: { pathname: string }): React.JSX.Element {
  if (pathname === "/dashboard") return <DashboardSkeleton />;
  if (pathname === "/agent") return <AgentSkeleton />;
  if (pathname === "/settings") return <SettingsSkeleton />;
  if (pathname === "/workspace") return <WorkspaceSkeleton />;
  if (pathname === "/admin") return <AdminSkeleton />;
  if (pathname === "/billing") return <BillingSkeleton />;
  if (pathname === "/storage") return <StorageSkeleton />;
  if (pathname === "/pdf") return <PdfSkeleton />;
  return <NotFoundSkeleton />;
}

/** The unmatched-route screen: a short message with one way back. */
function NotFoundSkeleton(): React.JSX.Element {
  return (
    <ScreenSkeleton scroll={false}>
      <View className="flex-1 items-center justify-center gap-3 p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-3 h-10 w-32 rounded-lg" />
      </View>
    </ScreenSkeleton>
  );
}

/**
 * Route-shaped loading UI for the native auth boundary.
 *
 * The root layout gates every screen on the canonical query scope, so a
 * segment cannot render its own pending state while the session resolves.
 * Mapping the requested path to the same skeleton the screen uses keeps the
 * first paint identical to the destination and leaves the header and tabs in
 * place.
 */
export function RouteSkeleton(): React.JSX.Element {
  const pathname = useRequestedPathname();
  if (pathname === "/") return <MarketingSkeleton />;
  if (pathname === "/2fa") {
    return (
      <AppShellSkeleton>
        <AuthSkeleton safeArea={false} />
      </AppShellSkeleton>
    );
  }
  if (pathname.startsWith("/auth/")) return <AuthSkeleton />;
  if (TAB_ROUTES.has(pathname)) {
    return (
      <AppShellSkeleton tabs>
        <TabSkeleton pathname={pathname} />
      </AppShellSkeleton>
    );
  }
  return (
    <AppShellSkeleton>
      <PageSkeleton pathname={pathname} />
    </AppShellSkeleton>
  );
}
