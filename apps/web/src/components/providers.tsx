"use client";

import * as React from "react";
import { QueryClientProvider, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider, PostHogPageView } from "@repo/analytics/client";

import { QueryAuthCacheBoundary } from "./query-auth-boundary";

export interface AppProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient }: AppProvidersProps): React.JSX.Element {
  const client = queryClient ?? getQueryClient();
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <PostHogProvider>
          <React.Suspense fallback={null}>
            <PostHogPageView />
          </React.Suspense>
          {children}
          <Toaster richColors position="bottom-right" />
        </PostHogProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * Gates route content on the canonical auth scope.
 *
 * It sits inside the app shell so the header and sidebar can paint while the
 * client session resolves; only the route area shows the route-shaped skeleton.
 */
export function AppPageBoundary({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  return <QueryAuthCacheBoundary queryClient={queryClient}>{children}</QueryAuthCacheBoundary>;
}

export const Providers = AppProviders;
