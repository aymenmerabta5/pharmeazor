"use client";

import type * as React from "react";
import { usePathname } from "next/navigation";
import { BillingBodySkeleton } from "@/features/account-billing/components/billing-skeleton";
import {
  AdminUsersSkeleton,
  CreateUserSkeleton,
} from "@/features/admin-users/components/admin-users-skeleton";
import { AgentSkeleton } from "@/features/agent/components/agent-skeleton";
import {
  AuthCardSkeleton,
  AuthSkeleton,
  TwoFactorSkeleton,
} from "@/features/auth/components/auth-skeleton";
import { ResetPasswordLoading } from "@/features/auth/reset-password-screen";
import { CheckoutLoading, CheckoutReturnLoading } from "@/features/checkout/components/skeletons";
import { DashboardSkeleton } from "@/features/dashboard/components/dashboard-skeleton";
import { LandingSkeleton } from "@/features/home/components/landing-skeleton";
import { WorkspaceBodySkeleton } from "@/features/identity-workspace/components/workspace-skeleton";
import { AdminQueueSkeleton } from "@/features/manual-payments/components/admin-queue-skeleton";
import { PricingSkeleton } from "@/features/pricing/components/pricing-skeleton";
import {
  SettingsBodySkeleton,
  SettingsRouteSkeleton,
} from "@/features/settings/components/settings-skeleton";
import { StorageSkeleton } from "@/features/storage/components/storage-skeleton";
import { MaintenanceSkeleton } from "./maintenance-skeleton";
import { LoadingScreen } from "./loading";

/**
 * Route-shaped loading UI for the auth boundary.
 *
 * The boundary sits above the route tree, so it cannot rely on a segment's
 * `loading.tsx` while the client session resolves. Mapping the pathname to the
 * same skeleton the route exports keeps the first paint identical to the page
 * that is about to mount.
 */
export function RouteSkeleton(): React.JSX.Element {
  const pathname = usePathname() ?? "/";
  if (pathname === "/") return <LandingSkeleton />;
  if (pathname === "/dashboard") return <DashboardSkeleton />;
  if (pathname === "/agent") return <AgentSkeleton />;
  if (pathname === "/pricing") return <PricingSkeleton />;
  if (pathname === "/storage") return <StorageSkeleton />;
  if (pathname === "/maintenance") return <MaintenanceSkeleton />;
  if (pathname === "/2fa") return <TwoFactorSkeleton />;
  if (pathname === "/settings")
    return (
      <SettingsRouteSkeleton>
        <SettingsBodySkeleton />
      </SettingsRouteSkeleton>
    );
  if (pathname === "/settings/billing")
    return (
      <SettingsRouteSkeleton>
        <BillingBodySkeleton />
      </SettingsRouteSkeleton>
    );
  if (pathname === "/settings/workspace")
    return (
      <SettingsRouteSkeleton>
        <WorkspaceBodySkeleton />
      </SettingsRouteSkeleton>
    );
  if (pathname === "/admin/users/create") return <CreateUserSkeleton />;
  if (pathname === "/admin/users" || pathname === "/admin") return <AdminUsersSkeleton />;
  if (pathname === "/admin/payments") return <AdminQueueSkeleton />;
  if (pathname === "/checkout/success" || pathname === "/checkout/cancel")
    return <CheckoutReturnLoading />;
  if (pathname === "/checkout") return <CheckoutLoading />;
  if (pathname === "/auth/sign-in" || pathname === "/auth/sign-up") return <AuthSkeleton />;
  if (pathname === "/auth/reset-password") return <ResetPasswordLoading />;
  if (pathname.startsWith("/auth/")) return <AuthCardSkeleton />;
  return <LoadingScreen />;
}
