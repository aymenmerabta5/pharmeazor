import { describe, expect, it } from "bun:test";
import {
  answerDisplayText,
  answerSections,
  extractSources,
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

describe("agent answer markdown", () => {
  it("keeps a Markdown table in the body instead of the headline", () => {
    const { headline, body } = answerSections(
      "Here is a quick overview.\n\n| Tool | Use |\n| --- | --- |\n| `bash` | Shell |",
    );
    expect(headline).toBe("Here is a quick overview.");
    expect(body).toBe("| Tool | Use |\n| --- | --- |\n| `bash` | Shell |");
  });

  it("turns a leading heading into the headline and leaves the rest as Markdown", () => {
    const { headline, body } = answerSections("## Dosage\n\nTake one tablet.");
    expect(headline).toBe("Dosage");
    expect(body).toBe("Take one tablet.");
  });

  it("does not invent a headline for a table-first answer", () => {
    const { headline, body } = answerSections("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(headline).toBe("");
    expect(body).toContain("| A | B |");
  });

  it("keeps a blank line inside a fenced code block", () => {
    const source = "```ts\nconst a = 1;\n\nconsole.log(a);\n```";
    const { headline, body } = answerSections(source);
    expect(headline).toBe("");
    expect(body).toBe(source);
  });

  it("strips inline emphasis from the headline but keeps the Markdown body", () => {
    const { headline, body } = answerSections(
      "**Paracetamol** is used for pain. It is also an antipyretic.",
    );
    expect(headline).toBe("Paracetamol is used for pain.");
    expect(body).toBe("It is also an antipyretic.");
  });

  it("ignores URLs that only appear inside code", () => {
    const sources = extractSources(
      "See [the leaflet](https://example.com/leaflet).\n\n```text\nhttps://example.com/code\n```",
    );
    expect(sources.map((source) => source.url)).toEqual(["https://example.com/leaflet"]);
  });

  it("produces readable copy text without Markdown markers", () => {
    expect(
      answerDisplayText("**Dose:** take `one` tablet.\n\n[Leaflet](https://example.com)"),
    ).toBe("Dose: take one tablet.\n\nLeaflet");
  });
});
