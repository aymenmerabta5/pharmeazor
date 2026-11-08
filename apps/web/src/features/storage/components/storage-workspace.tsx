"use client";
import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { useStorageWorkspace } from "../use-storage-workspace";
import { useSurfaceTranslations } from "@/lib/translations";

export function StorageWorkspace({
  objectId,
  setObjectId,
  name,
  setName,
  text,
  setText,
  downloaded,
  status,
  isPending,
  upload,
  download,
  remove,
}: ReturnType<typeof useStorageWorkspace>): React.JSX.Element {
  const t = useSurfaceTranslations("storage");
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("description")}</p>
      </header>
      {isPending ? <p role="status">{t("pending")}</p> : null}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("upload")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="storage-file-name">{t("fileName")}</FieldLabel>
              <Input
                disabled={isPending}
                id="storage-file-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="storage-text-content">{t("textContent")}</FieldLabel>
              <Textarea
                disabled={isPending}
                id="storage-text-content"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
            <Button disabled={isPending} aria-busy={isPending} className="w-fit" onClick={upload}>
              {t("upload")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("download")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="storage-object-id">{t("objectId")}</FieldLabel>
              <Input
                disabled={isPending}
                id="storage-object-id"
                value={objectId}
                onChange={(event) => setObjectId(event.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isPending}
                aria-busy={isPending}
                variant="outline"
                onClick={download}
              >
                {t("download")}
              </Button>
              <Button
                disabled={isPending}
                aria-busy={isPending}
                variant="destructive"
                onClick={remove}
              >
                {t("remove")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {status ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
      {downloaded ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("downloaded")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-4 text-sm">
              {downloaded}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
