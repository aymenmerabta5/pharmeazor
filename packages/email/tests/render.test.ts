import { describe, expect, it } from "bun:test";
import * as React from "react";
import { render, type TailwindConfig } from "react-email";
import VerifyEmail from "../src/templates/VerifyEmail";

const configTypeContract = {
  presets: [],
  theme: { extend: { colors: { primary: "#d33d00" } } },
} satisfies TailwindConfig;

describe("React Email integration", () => {
  it("renders a typed template with the supported unified package", async () => {
    expect(configTypeContract.theme.extend.colors.primary).toBe("#d33d00");
    const html = await render(
      React.createElement(VerifyEmail, {
        link: "https://example.test/verify",
        appName: "GhostInit",
        locale: "ar",
      }),
    );

    expect(html).toContain("<!DOCTYPE html");
    expect(html).toContain("تحقق من بريدك الإلكتروني");
    expect(html).toContain("https://example.test/verify");
    expect(html).toContain('dir="rtl"');
  });
});
