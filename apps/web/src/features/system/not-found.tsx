import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getSurfaceTranslations } from "@/lib/translations.server";

async function NotFoundContent(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("errors");
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-background px-5 py-10 sm:px-8">
      <Card className="w-full max-w-[440px] border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle as="h1" className="text-3xl tracking-tight">
            {t("notFound.title")}
          </CardTitle>
          <CardDescription className="max-w-[60ch]">{t("notFound.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            render={<Link href="/" />}
            nativeButton={false}
            aria-label={t("notFound.backHome")}
          >
            {t("notFound.backHome")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export function NotFoundScreen(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <main
          className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-background px-5 py-10 sm:px-8"
          aria-busy="true"
        />
      }
    >
      <NotFoundContent />
    </Suspense>
  );
}
