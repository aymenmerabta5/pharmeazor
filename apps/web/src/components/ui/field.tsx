"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="field-group"
      className={cn("@container/field-group flex flex-col gap-6", className)}
      {...props}
    />
  ),
);
FieldGroup.displayName = "FieldGroup";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  "data-disabled"?: boolean;
  "data-invalid"?: boolean;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    {
      className,
      orientation = "vertical",
      "data-disabled": disabled,
      "data-invalid": invalid,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      data-slot="field"
      data-orientation={orientation}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      className={cn(
        "group/field flex w-full min-w-0 flex-col gap-2 data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:items-start data-[orientation=horizontal]:gap-3 data-[disabled=true]:opacity-70 data-[invalid=true]:text-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Field.displayName = "Field";

export const FieldContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="field-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-1.5", className)}
      {...props}
    />
  ),
);
FieldContent.displayName = "FieldContent";

export const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    data-slot="field-label"
    className={cn(
      "text-sm font-medium leading-5 text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 group-data-[disabled=true]/field:cursor-not-allowed group-data-[invalid=true]/field:text-destructive",
      className,
    )}
    {...props}
  />
));
FieldLabel.displayName = "FieldLabel";

export const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="field-description"
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
FieldDescription.displayName = "FieldDescription";

export const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  if (!children) return null;
  return (
    <p
      ref={ref}
      data-slot="field-error"
      aria-live="polite"
      className={cn("text-sm font-medium leading-5 text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
});
FieldError.displayName = "FieldError";

export const FieldSet = React.forwardRef<
  HTMLFieldSetElement,
  React.FieldsetHTMLAttributes<HTMLFieldSetElement>
>(({ className, ...props }, ref) => (
  <fieldset
    ref={ref}
    data-slot="field-set"
    className={cn("flex flex-col gap-6", className)}
    {...props}
  />
));
FieldSet.displayName = "FieldSet";

export const FieldLegend = React.forwardRef<
  HTMLLegendElement,
  React.HTMLAttributes<HTMLLegendElement>
>(({ className, ...props }, ref) => (
  <legend
    ref={ref}
    data-slot="field-legend"
    className={cn("text-base font-semibold leading-6", className)}
    {...props}
  />
));
FieldLegend.displayName = "FieldLegend";

export { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from "./input-group";
export { ToggleGroup, ToggleGroupItem } from "./toggle-group";
