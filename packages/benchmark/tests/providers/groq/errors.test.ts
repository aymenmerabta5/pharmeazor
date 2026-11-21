import { describe, expect, it } from "bun:test";
import { APICallError } from "ai";
import { classifyGroqError } from "../../../src/providers/groq/errors";

function apiError(status: number, message = "err"): APICallError {
  return new APICallError({
    message,
    url: "https://api.groq.com/test",
    requestBodyValues: {},
    statusCode: status,
    responseHeaders: {},
  });
}

describe("classifyGroqError", () => {
  it("treats 429 as transient", () => {
    expect(classifyGroqError(apiError(429)).class).toBe("transient");
  });

  it("treats 5xx as transient", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyGroqError(apiError(status)).class).toBe("transient");
    }
  });

  it("treats 400, 401, 403, 404, 422 as permanent", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(classifyGroqError(apiError(status)).class).toBe("permanent");
    }
  });

  it("treats a generic Error as transient", () => {
    expect(classifyGroqError(new Error("network")).class).toBe("transient");
  });

  it("treats AbortError as transient", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(classifyGroqError(err).class).toBe("transient");
  });

  it("preserves status_code when present", () => {
    expect(classifyGroqError(apiError(503)).status_code).toBe(503);
  });

  it("classifies non-Error values as permanent", () => {
    expect(classifyGroqError("oops").class).toBe("permanent");
    expect(classifyGroqError(null).class).toBe("permanent");
  });
});
