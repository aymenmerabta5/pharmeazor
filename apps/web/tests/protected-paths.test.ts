import { describe, expect, it } from "bun:test";
import { isProtectedPath } from "../src/lib/protected-paths";

describe("protected paths", () => {
  it("keeps the agent route behind a session", () => {
    expect(isProtectedPath("/agent")).toBe(true);
    expect(isProtectedPath("/agent/thread")).toBe(true);
    expect(isProtectedPath("/agent?q=dosage")).toBe(true);
  });

  it("protects the workspace routes", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/profile")).toBe(true);
    expect(isProtectedPath("/settings")).toBe(true);
    expect(isProtectedPath("/settings/billing")).toBe(true);
    expect(isProtectedPath("/checkout")).toBe(true);
  });

  it("keeps the public landing and checkout result routes open", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/pricing")).toBe(false);
    expect(isProtectedPath("/checkout/success")).toBe(false);
    expect(isProtectedPath("/checkout/cancel")).toBe(false);
  });

  it("matches a protected route on its own path segments only", () => {
    expect(isProtectedPath("/agent")).toBe(true);
    expect(isProtectedPath("/agent/thread")).toBe(true);
    expect(isProtectedPath("/agent-tools")).toBe(false);
    expect(isProtectedPath("/api/agent")).toBe(false);
  });
});
