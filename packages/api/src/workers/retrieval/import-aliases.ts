import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "@repo/database";
import { tokenizeForLexical } from "@repo/services/retrieval/tokenize";

import { textArray } from "../../adapters/retrieval/sql";
import { parseCsv } from "./provenance";

/**
 * Import brand-to-substance aliases from the retrieval lab's name map.
 *
 * The map is a product catalogue, not an alias list: it repeats one brand for
 * every strength and form, and marks combination products with
 * `ambiguous = yes`. This worker folds it into one row per brand, keeping the
 * substance labels the brand stands for and the medicines it belongs to.
 *
 *   bun run retrieval:import-aliases
 *   bun run retrieval:import-aliases -- --dry-run
 *
 * The source file is Windows-1252, not UTF-8: decoding it as UTF-8 corrupts
 * every accented substance name (`paracétamol`), and a corrupted alias would
 * never match the folded postings.
 */

const DEFAULT_CSV = "tooling/retrieval-lab/data/metadata/name_map.csv";

interface Options {
  readonly csv: string;
  readonly dryRun: boolean;
  readonly prune: boolean;
}

interface AliasRow {
  readonly aliasNorm: string;
  readonly aliasRaw: string;
  readonly dciNorms: string[];
  readonly dciLabels: string[];
  readonly medicineIds: string[];
  readonly ambiguous: boolean;
  readonly sourceId: string;
}

function parseOptions(argv: readonly string[]): Options {
  let csv = DEFAULT_CSV;
  let dryRun = false;
  let prune = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--prune") {
      prune = true;
    } else if (arg === "--csv") {
      const value = argv[index + 1];
      if (!value) throw new Error("--csv requires a path");
      csv = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: import-aliases [--csv <name_map.csv>] [--dry-run] [--prune]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { csv, dryRun, prune };
}

/** Fold a label with the same analyser the BM25 postings use. */
function fold(value: string): string {
  return tokenizeForLexical(value).join(" ");
}

interface BrandAccumulator {
  readonly raw: string;
  readonly dcis: Set<string>;
  readonly medicines: Set<string>;
  readonly sources: Set<string>;
  flaggedAmbiguous: boolean;
}

async function readBrands(path: string): Promise<Map<string, BrandAccumulator>> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Name map not readable (${path}): ${detail}`);
  }
  // The name map is UTF-8. The BDPM register files are Windows-1252, which is
  // why the two are decoded by different readers.
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("Name map is empty");
  const index = new Map(header.map((name, position) => [name.trim(), position]));
  for (const required of ["brand_name", "dci", "medicine_id", "source_id", "ambiguous"]) {
    if (!index.has(required)) throw new Error(`Name map is missing the ${required} column`);
  }

  const brands = new Map<string, BrandAccumulator>();
  for (const row of rows) {
    const brand = (row[index.get("brand_name")!] ?? "").trim();
    const dci = (row[index.get("dci")!] ?? "").trim();
    if (!brand || !dci) continue;
    const aliasNorm = fold(brand);
    if (!aliasNorm) continue;

    let accumulator = brands.get(aliasNorm);
    if (!accumulator) {
      accumulator = {
        raw: brand.toUpperCase(),
        dcis: new Set<string>(),
        medicines: new Set<string>(),
        sources: new Set<string>(),
        flaggedAmbiguous: false,
      };
      brands.set(aliasNorm, accumulator);
    }
    accumulator.dcis.add(dci.toLowerCase());
    const medicineId = (row[index.get("medicine_id")!] ?? "").trim();
    if (medicineId) accumulator.medicines.add(medicineId);
    const sourceId = (row[index.get("source_id")!] ?? "").trim();
    if (sourceId) accumulator.sources.add(sourceId);
    if ((row[index.get("ambiguous")!] ?? "").trim().toLowerCase() === "yes") {
      accumulator.flaggedAmbiguous = true;
    }
  }
  return brands;
}

function buildRows(brands: ReadonlyMap<string, BrandAccumulator>): AliasRow[] {
  const rows: AliasRow[] = [];
  for (const [aliasNorm, brand] of [...brands.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const labels = [...brand.dcis].sort();
    const ambiguous = brand.flaggedAmbiguous || labels.length !== 1;
    rows.push({
      aliasNorm,
      aliasRaw: brand.raw,
      dciNorms: ambiguous ? [] : labels.map(fold),
      dciLabels: labels,
      medicineIds: [...brand.medicines].sort(),
      ambiguous,
      sourceId: [...brand.sources].sort()[0] ?? "name_map",
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = performance.now();
  const brands = await readBrands(options.csv);
  const rows = buildRows(brands);
  const ambiguous = rows.filter((row) => row.ambiguous);
  const expandable = rows.filter((row) => !row.ambiguous);
  const summary = {
    ok: true,
    dryRun: options.dryRun,
    csv: options.csv,
    brands: rows.length,
    expandable: expandable.length,
    ambiguous: ambiguous.length,
    medicines: new Set(rows.flatMap((row) => row.medicineIds)).size,
    ambiguousSamples: ambiguous.slice(0, 10).map((row) => row.aliasRaw),
    elapsedMs: Math.round(performance.now() - startedAt),
  };

  if (options.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const payload = JSON.stringify(
    rows.map((row) => ({
      alias_norm: row.aliasNorm,
      alias_raw: row.aliasRaw,
      dci_norms: row.dciNorms,
      dci_labels: row.dciLabels,
      medicine_ids: row.medicineIds,
      ambiguous: row.ambiguous,
      source_id: row.sourceId,
    })),
  );

  await db.execute(sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(
        alias_norm text,
        alias_raw text,
        dci_norms text[],
        dci_labels text[],
        medicine_ids text[],
        ambiguous boolean,
        source_id text
      )
    )
    INSERT INTO retrieval_aliases (
      alias_norm, alias_raw, dci_norms, dci_labels, medicine_ids, ambiguous, source_id, updated_at
    )
    SELECT alias_norm, alias_raw, dci_norms, dci_labels, medicine_ids, ambiguous, source_id, now()
    FROM incoming
    ON CONFLICT (alias_norm) DO UPDATE SET
      alias_raw = EXCLUDED.alias_raw,
      dci_norms = EXCLUDED.dci_norms,
      dci_labels = EXCLUDED.dci_labels,
      medicine_ids = EXCLUDED.medicine_ids,
      ambiguous = EXCLUDED.ambiguous,
      source_id = EXCLUDED.source_id,
      updated_at = now()
  `);

  let pruned = 0;
  if (options.prune) {
    const prunedRows = await db.execute<{ alias_norm: string }>(sql`
      DELETE FROM retrieval_aliases
      WHERE NOT (alias_norm = ANY(${textArray(rows.map((row) => row.aliasNorm))}))
      RETURNING alias_norm
    `);
    pruned = prunedRows.rows.length;
  }

  const stored = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM retrieval_aliases
  `);

  console.log(
    JSON.stringify({ ...summary, stored: Number(stored.rows[0]?.count ?? 0), pruned }, null, 2),
  );
}

await main();
