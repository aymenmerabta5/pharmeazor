import { designSystemContract } from "@repo/ui/contract";
import * as React from "react";
import type { Metadata } from "next";
import { AppProviders } from "../components/providers";
import { AppShell } from "../components/app-shell";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { connection } from "next/server";
import { getSurfaceTranslations } from "../lib/translations.server";
import { StandaloneLocaleLoadingFallback } from "../lib/translations.standalone";
import { localeDirection, type Locale } from "../i18n/routing";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getSurfaceTranslations("metadata");
  return { title: t("siteTitle"), description: t("siteDescription") };
}

const localeBootstrapScript =
  '(function(){try{var match=document.cookie.match(/(?:^|; )NEXT_LOCALE=([^;]*)/);var locale=match?decodeURIComponent(match[1]):"en";if(locale!=="en"&&locale!=="fr"&&locale!=="ar")locale="en";document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";}catch{}})();';

async function LocalizedApp({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  await connection();
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  const localeDocumentScript =
    "document.documentElement.lang=" +
    JSON.stringify(locale) +
    ";document.documentElement.dir=" +
    JSON.stringify(localeDirection[locale]) +
    ";";
  return (
    <>
      <script id="locale-request" dangerouslySetInnerHTML={{ __html: localeDocumentScript }} />
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </NextIntlClientProvider>
    </>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script id="locale-bootstrap" dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        <React.Suspense fallback={<StandaloneLocaleLoadingFallback />}>
          <LocalizedApp>{children}</LocalizedApp>
        </React.Suspense>
      </body>
    </html>
  );
}

const configuredDesignSystemApp = designSystemContract.apps.find(
  (candidate) => candidate.id === "web",
);
const configuredDesignSystemAdapter = designSystemContract.adapters.find(
  (candidate) => candidate.id === "next",
);
if (
  configuredDesignSystemApp?.adapter !== "next" ||
  configuredDesignSystemAdapter?.version !== 1 ||
  configuredDesignSystemAdapter?.status !== "applicable"
) {
  throw new Error("GhostInit design-system invariant: web/next/v1");
}
