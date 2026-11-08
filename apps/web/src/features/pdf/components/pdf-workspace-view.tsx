"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { usePdfWorkspace } from "../use-pdf-workspace";
import { useSurfaceTranslations } from "@/lib/translations";

export function PdfWorkspaceView({
  template,
  setTemplate,
  templateOptions,
  loading,
  error,
  download,
}: ReturnType<typeof usePdfWorkspace>): React.JSX.Element {
  const t = useSurfaceTranslations("pdf");
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("secureTitle")}</h1>
          <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">
            {t("webDescription")}
          </p>
        </div>
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle as="h2">{t("documentWorkspace")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field>
            <FieldLabel id="pdf-template-label">{t("template")}</FieldLabel>
            <Select
              items={templateOptions}
              value={template}
              onValueChange={(value) => {
                if (value === "invoice" || value === "certificate" || value === "agreement")
                  setTemplate(value);
              }}
            >
              <SelectTrigger aria-labelledby="pdf-template-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {templateOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{t("generationError")}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            className="w-auto self-start"
            type="button"
            disabled={loading}
            aria-busy={loading}
            onClick={download}
          >
            {loading ? t("generating") : t("generateDownload")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
