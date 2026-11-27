"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps): React.JSX.Element {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      // React 19 warns when a client component renders a script tag. The
      // pre-hydration theme bootstrap lives in the server-rendered layout, so
      // the provider's copy is inert and must not be treated as JavaScript.
      scriptProps={{ type: "application/json" }}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
