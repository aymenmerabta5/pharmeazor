"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { RejectReasonProps } from "../types";
import type { useRejectReason } from "../use-reject-reason";

export function RejectReasonView({
  open,
  onOpenChange,
  title = "Reject",
  description = "Provide a reason for rejection.",
  model,
}: RejectReasonProps & { model: ReturnType<typeof useRejectReason> }): React.JSX.Element {
  const { form, submit, cancel } = model;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form.AppField name="reason">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea
                id="reject-reason"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Explain why..."
                rows={4}
              />
            </div>
          )}
        </form.AppField>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
          <form.Subscribe selector={(state) => state.values.reason}>
            {(reason) => (
              <Button disabled={!reason.trim()} onClick={() => void submit()}>
                {title}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
