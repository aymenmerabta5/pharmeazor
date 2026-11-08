import * as React from "react";

export interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

export const TabsContext = React.createContext<TabsContextValue | null>(null);

export function useTabsContext(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be rendered inside Tabs");
  return context;
}
