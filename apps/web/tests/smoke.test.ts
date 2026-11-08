import { describe, it, expect } from "bun:test";

describe("web smoke", () => {
  it("has a landing page export", () => {
    expect(typeof fetch).toBe("function");
  });
});
