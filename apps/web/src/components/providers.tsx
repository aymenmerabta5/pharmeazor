"use client";

import * as React from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
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
        <QueryAuthCacheBoundary queryClient={client}>
          <PostHogProvider>
            <React.Suspense fallback={null}>
              <PostHogPageView />
            </React.Suspense>
            {children}
            <Toaster richColors position="bottom-right" />
          </PostHogProvider>
        </QueryAuthCacheBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export const Providers = AppProviders;
