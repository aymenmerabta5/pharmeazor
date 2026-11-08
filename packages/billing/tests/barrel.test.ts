import { describe, it, expect } from "bun:test";
import * as mod from "../src/index";

describe("@repo/billing barrel", () => {
  it("loads and exposes its public API", () => {
    expect(Array.isArray(mod.BILLING_PROVIDER_NAMES)).toBe(true);
  });
});
