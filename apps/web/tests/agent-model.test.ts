import { describe, expect, it } from "bun:test";
import {
  fallbackConversationTitle,
  groupAgentConversations,
  isAdminAccount,
  planDisplayName,
} from "../src/features/agent/model";

describe("agent account badge", () => {
  it("recognises both administrator roles", () => {
    expect(isAdminAccount("admin")).toBe(true);
    expect(isAdminAccount("superAdmin")).toBe(true);
  });

  it("does not treat ordinary roles as administrators", () => {
    expect(isAdminAccount("user")).toBe(false);
    expect(isAdminAccount("viewer")).toBe(false);
    expect(isAdminAccount(null)).toBe(false);
    expect(isAdminAccount(undefined)).toBe(false);
  });

  it("names the sponsored entitlement instead of falling back to free", () => {
    expect(planDisplayName("sponsored")).toBe("Sponsored");
    expect(planDisplayName("pro-yearly")).toBe("Pro");
  });
});

describe("agent conversation history", () => {
  it("uses the first prompt as the immediate label and collapses whitespace", () => {
    expect(fallbackConversationTitle("  What is   the adult dose?  ")).toBe(
      "What is the adult dose?",
    );
    expect(fallbackConversationTitle("   ")).toBe("");
  });

  it("caps a long prompt with one trailing ellipsis", () => {
    const label = fallbackConversationTitle("a".repeat(80));
    expect(label.length).toBe(64);
    expect(label.endsWith("…")).toBe(true);
  });

  it("groups the newest-first history into today and earlier", () => {
    const now = new Date(2026, 10, 28, 18).getTime();
    const groups = groupAgentConversations(
      [
        {
          id: "today",
          title: "Today",
          updatedAt: new Date(2026, 10, 28, 9).toISOString(),
        },
        {
          id: "earlier",
          title: "Earlier",
          updatedAt: new Date(2026, 10, 27, 9).toISOString(),
        },
        { id: "invalid", title: "Invalid", updatedAt: "not-a-date" },
      ],
      now,
    );
    expect(groups.today.map((item) => item.id)).toEqual(["today"]);
    expect(groups.earlier.map((item) => item.id)).toEqual(["earlier", "invalid"]);
  });
});
