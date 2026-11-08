import * as React from "react";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface FormSectionProps {
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title?: React.ReactNode;
}

export function FormSection({
  children,
  className,
  description,
  title,
}: FormSectionProps): React.JSX.Element {
  return (
    <FieldSet className={cn("gap-5 border-t border-border pt-5", className)}>
      {title ? <FieldLegend>{title}</FieldLegend> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldGroup className="gap-4">{children}</FieldGroup>
    </FieldSet>
  );
}
