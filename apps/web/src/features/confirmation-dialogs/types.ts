export interface NameConfirmationProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  expectedName: string;
  onConfirm(): void;
  title?: string;
  description?: string;
}
export interface RejectReasonProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(reason: string): void;
  title?: string;
  description?: string;
}
