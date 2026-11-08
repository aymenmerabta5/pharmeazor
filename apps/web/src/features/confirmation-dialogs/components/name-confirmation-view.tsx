"use client";
import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NameConfirmationProps } from "../types";
import type { useNameConfirmation } from "../use-name-confirmation";

export function NameConfirmationView({
  open,
  onOpenChange,
  expectedName,
  title = "Are you sure?",
  description,
  model,
}: NameConfirmationProps & { model: ReturnType<typeof useNameConfirmation> }): React.JSX.Element {
  const { form, confirm, cancel } = model;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <form.AppField name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="confirm-name">
                Type <span className="font-mono font-semibold">{expectedName}</span> to confirm
              </Label>
              <Input
                id="confirm-name"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={expectedName}
              />
            </div>
          )}
        </form.AppField>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancel}>Cancel</AlertDialogCancel>
          <form.Subscribe selector={(state) => state.values.name}>
            {(name) => (
              <AlertDialogAction
                disabled={name.trim() !== expectedName}
                onClick={() => void confirm()}
              >
                Confirm
              </AlertDialogAction>
            )}
          </form.Subscribe>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
