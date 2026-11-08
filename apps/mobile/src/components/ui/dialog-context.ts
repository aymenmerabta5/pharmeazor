import * as React from "react";
import type { View } from "react-native";

export interface DialogContextValue {
  open: boolean;
  close: () => void;
  openDialog: () => void;
  triggerRef: React.RefObject<View | null>;
}

export const DialogContext = React.createContext<DialogContextValue | null>(null);

export function useDialogContext(): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("Dialog components must be rendered inside Dialog");
  return context;
}
