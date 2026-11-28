import { describe, expect, it } from "bun:test";
import {
  PROFILE_QUICK_LINKS,
  profileInitials,
  profileQuickLinks,
  profileRole,
} from "../src/features/profile/model";

describe("profile model", () => {
  it("derives initials from a name, then an email, then the product fallback", () => {
    expect(profileInitials("Ada Lovelace", "ada@example.com")).toBe("AL");
    expect(profileInitials("Ada", "ada@example.com")).toBe("AD");
    expect(profileInitials("  ", "ada@example.com")).toBe("AD");
    expect(profileInitials(null, null)).toBe("PH");
  });

  it("normalises account roles without trusting arbitrary values", () => {
    expect(profileRole("admin")).toBe("admin");
    expect(profileRole("superAdmin")).toBe("superAdmin");
    expect(profileRole("user")).toBe("user");
    expect(profileRole("owner")).toBe("user");
    expect(profileRole(null)).toBe("user");
  });

  it("only offers the administration destination to an administrator", () => {
    expect(profileQuickLinks("user")).toEqual(PROFILE_QUICK_LINKS);
    expect(profileQuickLinks("admin").map((link) => link.key)).toContain("admin");
    expect(profileQuickLinks("superAdmin").map((link) => link.key)).toContain("admin");
    expect(profileQuickLinks("user").map((link) => link.key)).not.toContain("admin");
  });
});
