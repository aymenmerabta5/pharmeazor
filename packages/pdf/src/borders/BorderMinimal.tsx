import { View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

export default function BorderMinimal({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, padding: 32 }}>{children}</View>;
}
