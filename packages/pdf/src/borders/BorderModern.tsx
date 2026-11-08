import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: { flex: 1, borderWidth: 1, borderColor: "#d97706", padding: 4, borderRadius: 8 },
  inner: { flex: 1, padding: 24 },
});

export default function BorderModern({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}
