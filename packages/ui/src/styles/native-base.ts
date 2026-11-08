export const nativeBaseRoles = {
  canvas: "flex-1 bg-background",
  content: "text-base text-foreground",
  surface: "rounded-lg border border-border bg-card text-card-foreground",
  mutedContent: "text-muted-foreground",
  action: "bg-primary text-primary-foreground",
  danger: "bg-destructive text-destructive-foreground",
  focus: "border-ring",
} as const;

export const nativeInteractionStates = {
  active: "ui-active",
  disabled: "ui-disabled",
  error: "ui-error",
  hover: "ui-hover",
  loading: "ui-loading",
  selected: "ui-selected",
} as const;

export type NativeBaseRole = keyof typeof nativeBaseRoles;
export type NativeInteractionState = keyof typeof nativeInteractionStates;
