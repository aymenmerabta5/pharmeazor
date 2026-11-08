import { describe, it, expect } from "bun:test";
import appJson from "../app.json";

describe("mobile app config", () => {
  it("declares a scheme so Better Auth deep links resolve", () => {
    expect(typeof appJson.expo.scheme).toBe("string");
    expect(appJson.expo.scheme.length).toBeGreaterThan(0);
  });

  it("registers expo-router as a plugin", () => {
    expect(appJson.expo.plugins).toContain("expo-router");
  });
});
