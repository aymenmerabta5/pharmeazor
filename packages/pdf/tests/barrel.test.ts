import { describe, it, expect } from "bun:test";
import * as mod from "../src/index";
describe("@repo/pdf barrel", () => {
  it("loads", () => {
    expect(typeof mod.generateVerificationCode).toBe("function");
  });
});
