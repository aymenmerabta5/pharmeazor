import { describe, expect, it } from "bun:test";
import {
  HttpNeo4jClient,
  Neo4jHttpError,
  neo4jConfigFromEnv,
} from "../src/workers/retrieval/neo4j-http";

describe("Neo4j HTTP adapter", () => {
  it("sends basic auth to the database transaction endpoint", async () => {
    let request: { url: string; init: RequestInit | undefined } | null = null;
    const client = new HttpNeo4jClient({
      url: "http://neo4j.test:7474/",
      user: "neo4j",
      password: "secret",
      database: "pharmeazor",
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return new Response(
          JSON.stringify({
            results: [{ columns: ["value"], data: [{ row: [1] }] }],
            errors: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const rows = await client.query("RETURN 1 AS value");
    expect(rows).toEqual([{ value: 1 }]);
    expect(request!.url).toBe("http://neo4j.test:7474/db/pharmeazor/tx/commit");
    expect(request!.init!.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("neo4j:secret").toString("base64")}`,
    });
  });

  it("surfaces Neo4j transaction errors as typed failures", async () => {
    const client = new HttpNeo4jClient({
      url: "http://neo4j.test:7474",
      user: "neo4j",
      password: "secret",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            results: [],
            errors: [{ code: "Neo.ClientError.Statement.SyntaxError", message: "bad cypher" }],
          }),
          { status: 200 },
        ),
    });
    await expect(client.query("BAD")).rejects.toBeInstanceOf(Neo4jHttpError);
  });

  it("requires a configured target and rejects unsafe database names", () => {
    expect(neo4jConfigFromEnv({})).toBeNull();
    expect(
      neo4jConfigFromEnv({
        NEO4J_HTTP_URL: "http://localhost:7474",
        NEO4J_USER: "neo4j",
        NEO4J_PASSWORD: "secret",
      }),
    ).toMatchObject({ database: "neo4j" });
    expect(
      () =>
        new HttpNeo4jClient({
          url: "http://localhost:7474",
          user: "neo4j",
          password: "secret",
          database: "bad/name",
        }),
    ).toThrow("database name");
  });
});
