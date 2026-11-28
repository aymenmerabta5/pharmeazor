import { describe, expect, it } from "bun:test";
import { launchPathname } from "../src/lib/launch-path";

describe("launch pathname", () => {
  it("reads a custom-scheme deep link whose first segment is the host", () => {
    expect(launchPathname("pharmeazor://auth/reset-password")).toBe("/auth/reset-password");
  });

  it("drops the query string and fragment", () => {
    expect(launchPathname("pharmeazor://auth/reset-password?token=abc#step")).toBe(
      "/auth/reset-password",
    );
  });

  it("keeps only the path of an https link", () => {
    expect(launchPathname("https://app.pharmeazor.com/auth/verify-email?token=abc")).toBe(
      "/auth/verify-email",
    );
  });

  it("accepts a triple-slash deep link", () => {
    expect(launchPathname("pharmeazor:///dashboard")).toBe("/dashboard");
  });

  it("maps the bare scheme to the root", () => {
    expect(launchPathname("pharmeazor://")).toBe("/");
  });

  it("ignores a value that is not a URL", () => {
    expect(launchPathname("not a url")).toBeNull();
  });
});
