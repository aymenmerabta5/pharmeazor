import { describe, it, expect } from "bun:test";
import * as mod from "../src/index";

describe("@repo/testing barrel", () => {
  it("loads and exposes its public API", () => {
    expect(typeof mod.mockAsync).toBe("function");
  });
});
