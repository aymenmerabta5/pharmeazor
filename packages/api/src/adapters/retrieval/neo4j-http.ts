/**
 * Minimal Neo4j HTTP transactional client.
 *
 * It deliberately uses the public HTTP transaction endpoint rather than adding
 * a driver dependency. Credentials are sent only in the Authorization header
 * and are never logged. It lives with the other provider adapters so both the
 * offline importer worker and the optional retrieval read arm depend on it
 * without an adapter importing a worker.
 */
export interface Neo4jStatement {
  readonly statement: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface Neo4jQueryResult {
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

export interface Neo4jClient {
  run(statements: readonly Neo4jStatement[]): Promise<readonly Neo4jQueryResult[]>;
  query(
    statement: string,
    parameters?: Readonly<Record<string, unknown>>,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
}

export interface Neo4jHttpConfig {
  readonly url: string;
  readonly user: string;
  readonly password: string;
  readonly database?: string;
  /**
   * Per-transaction timeout. Retrieval sets a short budget so a slow graph
   * cannot hold the hybrid result hostage; the importer leaves it unset for
   * large batches.
   */
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class Neo4jHttpError extends Error {
  readonly status: number | null;
  readonly codes: readonly string[];

  constructor(message: string, status: number | null, codes: readonly string[] = []) {
    super(message);
    this.name = "Neo4jHttpError";
    this.status = status;
    this.codes = codes;
  }
}

export class HttpNeo4jClient implements Neo4jClient {
  private readonly endpoint: string;
  private readonly authorization: string;
  private readonly timeoutMs: number | null;
  private readonly fetchImpl: typeof fetch;

  constructor(config: Neo4jHttpConfig) {
    const url = config.url.replace(/\/+$/u, "");
    if (!/^https?:\/\//u.test(url)) {
      throw new Error("Neo4j URL must start with http:// or https://");
    }
    if (!config.user || !config.password) {
      throw new Error("Neo4j user and password are required");
    }
    const database = config.database?.trim() || "neo4j";
    if (!/^[A-Za-z0-9_.-]+$/u.test(database)) {
      throw new Error("Neo4j database name contains unsupported characters");
    }
    this.endpoint = `${url}/db/${database}/tx/commit`;
    this.authorization = `Basic ${Buffer.from(`${config.user}:${config.password}`, "utf8").toString("base64")}`;
    this.timeoutMs =
      config.timeoutMs !== undefined && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
        ? config.timeoutMs
        : null;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async run(statements: readonly Neo4jStatement[]): Promise<readonly Neo4jQueryResult[]> {
    if (statements.length === 0) return [];
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: this.authorization,
      },
      ...(this.timeoutMs !== null ? { signal: AbortSignal.timeout(this.timeoutMs) } : {}),
      body: JSON.stringify({
        statements: statements.map((entry) => ({
          statement: entry.statement,
          parameters: entry.parameters ?? {},
        })),
      }),
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Neo4jHttpError(
        `Neo4j returned a non-JSON response (${response.status})`,
        response.status,
      );
    }
    if (!response.ok) {
      throw new Neo4jHttpError(
        `Neo4j HTTP request failed with status ${response.status}`,
        response.status,
      );
    }
    if (!isRecord(body)) {
      throw new Neo4jHttpError("Neo4j response is not an object", response.status);
    }
    const errors = Array.isArray(body.errors) ? body.errors : [];
    if (errors.length > 0) {
      const codes = errors
        .map((error) => (isRecord(error) && typeof error.code === "string" ? error.code : ""))
        .filter(Boolean);
      const message = errors
        .map((error) => (isRecord(error) && typeof error.message === "string" ? error.message : ""))
        .filter(Boolean)
        .join("; ");
      throw new Neo4jHttpError(
        `Neo4j transaction failed: ${message || "unknown error"}`,
        response.status,
        codes,
      );
    }
    const results = Array.isArray(body.results) ? body.results : [];
    return results.map((result) => parseResult(result));
  }

  async query(
    statement: string,
    parameters: Readonly<Record<string, unknown>> = {},
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const [result] = await this.run([{ statement, parameters }]);
    return result?.rows ?? [];
  }
}

export function neo4jConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Neo4jHttpConfig | null {
  const url = env.NEO4J_HTTP_URL?.trim();
  const user = env.NEO4J_USER?.trim();
  const password = env.NEO4J_PASSWORD;
  if (!url || !user || !password) return null;
  if (/REPLACE_WITH|CHANGE_ME/iu.test(url) || /REPLACE_WITH|CHANGE_ME/iu.test(user)) {
    return null;
  }
  if (/REPLACE_WITH|CHANGE_ME/iu.test(password)) return null;
  return {
    url,
    user,
    password,
    database: env.NEO4J_DATABASE?.trim() || "neo4j",
  };
}

function parseResult(value: unknown): Neo4jQueryResult {
  if (!isRecord(value)) return { columns: [], rows: [] };
  const columns = Array.isArray(value.columns)
    ? value.columns.filter((column): column is string => typeof column === "string")
    : [];
  const data = Array.isArray(value.data) ? value.data : [];
  const rows = data.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.row)) return [];
    const row: Record<string, unknown> = {};
    for (const [index, column] of columns.entries()) row[column] = entry.row[index];
    return [row];
  });
  return { columns, rows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
