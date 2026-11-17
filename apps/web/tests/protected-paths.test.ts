import { describe, expect, it } from "bun:test";
import { isDesignPreviewPath, isProtectedPath } from "../src/lib/protected-paths";

describe("protected paths", () => {
  it("keeps the agent route behind a session when the design preview is off", () => {
    expect(isProtectedPath("/agent", false)).toBe(true);
    expect(isProtectedPath("/agent/thread", false)).toBe(true);
    expect(isProtectedPath("/agent?q=dosage", false)).toBe(true);
  });

  it("opens the agent design preview only while the preview is enabled", () => {
    expect(isProtectedPath("/agent", true)).toBe(false);
    expect(isProtectedPath("/agent/thread", true)).toBe(false);
    expect(isProtectedPath("/agent?q=dosage", true)).toBe(false);
  });

  it("never opens the workspace routes for the design preview", () => {
    expect(isProtectedPath("/dashboard", true)).toBe(true);
    expect(isProtectedPath("/admin", true)).toBe(true);
    expect(isProtectedPath("/settings", true)).toBe(true);
    expect(isProtectedPath("/settings/billing", true)).toBe(true);
    expect(isProtectedPath("/checkout", true)).toBe(true);
  });

  it("keeps the checkout result routes public", () => {
    expect(isProtectedPath("/checkout/success", true)).toBe(false);
    expect(isProtectedPath("/checkout/cancel", true)).toBe(false);
    expect(isProtectedPath("/checkout", true)).toBe(true);
  });

  it("matches a preview route on its own path segments only", () => {
    expect(isDesignPreviewPath("/agent")).toBe(true);
    expect(isDesignPreviewPath("/agent/thread")).toBe(true);
    expect(isDesignPreviewPath("/agent-tools")).toBe(false);
    expect(isDesignPreviewPath("/api/agent")).toBe(false);
  });
});
