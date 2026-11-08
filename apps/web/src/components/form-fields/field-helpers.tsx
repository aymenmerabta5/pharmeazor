"use client";

import * as React from "react";
import { FieldDescription, FieldError } from "@/components/ui/field";

export interface FieldIds {
  controlId: string;
  descriptionId: string;
  errorId: string;
}

export function useFieldIds(id?: string): FieldIds {
  const generatedId = React.useId();
  const controlId = id ?? "field-" + generatedId.replaceAll(":", "");
  return {
    controlId,
    descriptionId: controlId + "-description",
    errorId: controlId + "-error",
  };
}

export function firstFieldError(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === "string" && error.length > 0) return error;
    if (error instanceof Error && error.message.length > 0) return error.message;
    if (typeof error === "object" && error !== null) {
      const message = Reflect.get(error, "message");
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  return undefined;
}

export interface FieldMessagesProps {
  description?: React.ReactNode;
  descriptionId: string;
  error?: React.ReactNode;
  errorId: string;
}

export function FieldMessages({
  description,
  descriptionId,
  error,
  errorId,
}: FieldMessagesProps): React.JSX.Element {
  return (
    <>
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </>
  );
}

export function fieldDescriptionIds(
  ids: FieldIds,
  hasDescription: boolean,
  hasError: boolean,
): string | undefined {
  const describedBy = [
    hasDescription ? ids.descriptionId : undefined,
    hasError ? ids.errorId : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  return describedBy.length > 0 ? describedBy : undefined;
}
