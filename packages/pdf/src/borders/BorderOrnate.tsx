import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    borderWidth: 4,
    borderColor: "#7c2d12",
    padding: 4,
    backgroundColor: "#fffbeb",
  },
  inner: { flex: 1, borderWidth: 1, borderColor: "#f59e0b", borderStyle: "dashed", padding: 24 },
});

export default function BorderOrnate({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}
