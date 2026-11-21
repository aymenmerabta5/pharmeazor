import { sql, type SQL } from "drizzle-orm";

/**
 * Build a `text[]` SQL expression from a list of values.
 *
 * Drizzle serializes a JavaScript array interpolated into a `sql` template as
 * a parenthesised tuple of parameters, which Postgres cannot cast to `text[]`.
 * Expanding it into `ARRAY[...]` keeps every value parameterised and produces
 * a real array expression.
 */
export function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}
