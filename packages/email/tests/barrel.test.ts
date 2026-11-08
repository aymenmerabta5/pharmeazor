import { describe, it, expect } from "bun:test";
import * as mod from "../src/index";

describe("@repo/email barrel", () => {
  it("loads the environment-neutral React Email template API", () => {
    expect(typeof mod.EmailLayout).toBe("function");
    expect(typeof mod.VerifyEmail).toBe("function");
    expect("sendEmail" in mod).toBe(false);
  });
});
