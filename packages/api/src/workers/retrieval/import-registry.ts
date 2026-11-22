import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "@repo/database";
import { compactRegistryText as compact, foldRegistryText as fold } from "@repo/services/retrieval";

import { parseCsv } from "./provenance";

/**
 * Import the Algerian product register.
 *
 * Two catalogues cover the same register and are complementary rather than
 * redundant: the Ministry nomenclature (SANTE_MSP) carries withdrawal dates and
 * reasons, Pharm'Net carries observations and a cleaner status field. They share
 * 9,448 registration numbers. The nomenclature is the base, Pharm'Net fills the
 * gaps, and every field where they disagree is reported instead of silently
 * resolved — a disagreement about whether a product is withdrawn is a fact
 * somebody has to look at, not a merge detail.
 *
 *   bun run retrieval:import-registry
 *   bun run retrieval:import-registry -- --dry-run
 *
 * Neither file is a clinical source. This table exists to answer register
 * questions deterministically, and the tool that reads it refuses to turn a row
 * into an indication or a dose.
 */

const NOMENCLATURE_CSV = "tooling/cleaning-lab/output/structured/nomenclature_products.csv";
const PHARMNET_CSV = "tooling/cleaning-lab/output/structured/pharmnet_products.csv";

interface Options {
  readonly nomenclature: string;
  readonly pharmnet: string;
  readonly dryRun: boolean;
}

interface RegisterRow {
  /**
   * Registration number plus brand and dosage, hashed. The registration number
   * alone is not unique in either source: one dossier can carry several brand
   * names, and a product can repeat with a different pack. Pack variants are
   * one product here; brand and dosage are not.
   */
  readonly productKey: string;
  readonly registrationNumber: string;
  readonly brand: string;
  readonly dci: string | null;
  readonly dciCode: string | null;
  readonly form: string | null;
  readonly dosage: string | null;
  readonly pack: string | null;
  readonly schedule: string | null;
  readonly holder: string | null;
  readonly holderCountry: string | null;
  readonly productType: string | null;
  readonly registrationStatus: string;
  readonly withdrawalDate: string | null;
  readonly withdrawalReason: string | null;
  readonly shelfLife: string | null;
  readonly observation: string | null;
  readonly isCombination: boolean;
  readonly inScope: boolean;
  readonly medicineIds: string[];
  readonly sources: string[];
  readonly sourceSheet: string | null;
  /** Merge bookkeeping only; never written to the table. */
  readonly origin: "nomenclature" | "pharmnet";
}

function parseOptions(argv: readonly string[]): Options {
  let nomenclature = NOMENCLATURE_CSV;
  let pharmnet = PHARMNET_CSV;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--nomenclature") {
      const value = argv[index + 1];
      if (!value) throw new Error("--nomenclature requires a path");
      nomenclature = value;
      index += 1;
    } else if (arg === "--pharmnet") {
      const value = argv[index + 1];
      if (!value) throw new Error("--pharmnet requires a path");
      pharmnet = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: import-registry [--nomenclature <csv>] [--pharmnet <csv>] [--dry-run]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { nomenclature, pharmnet, dryRun };
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** The register spells the same schedule several ways across its sheets. */
function normalizeSchedule(value: string | undefined): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const upper = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (upper.startsWith("STUPEFIANT")) return "STUPEFIANT";
  if (/^L+ISTE\s+I{2}$/.test(upper.replace(/\s+/g, " "))) return "LISTE II";
  if (/^L+ISTE\s+I$/.test(upper.replace(/\s+/g, " "))) return "LISTE I";
  return upper;
}

function normalizeProductType(value: string | undefined): string | null {
  const raw = clean(value)?.toUpperCase();
  return raw === "GE" || raw === "RE" || raw === "BIO" ? raw : null;
}

function flag(value: string | undefined): boolean {
  return clean(value)?.toLowerCase() === "true";
}

function medicineIds(value: string | undefined): string[] {
  const raw = clean(value);
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The nomenclature puts "Non Renouvelés" rows on a `registered` sheet, so
 * `sheet_status` alone would report a lapsed registration as current. The sheet
 * name is the missing half of the status.
 */
function nomenclatureStatus(sheetStatus: string | undefined, sheet: string | undefined): string {
  if (clean(sheetStatus)?.toLowerCase() === "withdrawn") return "withdrawn";
  const sheetName = clean(sheet)?.toLowerCase() ?? "";
  if (sheetName.includes("non renouvel")) return "non_renewed";
  return "registered";
}

function pharmnetStatus(value: string | undefined): string {
  const raw = clean(value)?.toLowerCase();
  if (raw === "withdrawn" || raw === "non_renewed" || raw === "registered") return raw;
  return "unknown";
}

async function readCsv(path: string): Promise<Record<string, string>[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Register file not readable (${path}): ${detail}`);
  }
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header) throw new Error(`Register file is empty: ${path}`);
  const columns = header.map((name) => name.trim());
  return rows
    .filter((row) => row.some((field) => field.trim().length > 0))
    .map((row) => {
      const record: Record<string, string> = {};
      for (let index = 0; index < columns.length; index += 1) {
        record[columns[index]!] = row[index] ?? "";
      }
      return record;
    });
}

/** Registration numbers differ only in case and whitespace between the sources. */
function registrationNumberFor(row: Record<string, string>): string | null {
  const raw = clean(row.registration_number);
  return raw ? raw.toUpperCase().replace(/\s+/g, " ") : null;
}

/**
 * One product is one registration number, brand and dosage. The registration
 * number alone is not unique: `LYANA` and `YASMINE` share `285/11 H 078/21`,
 * so keying on it silently dropped a brand. Pack variants collapse into one
 * product because the register answer is about the product, not each box size.
 */
function productKeyFor(registrationNumber: string, brand: string, dosage: string | null): string {
  return createHash("sha256")
    .update(compact(registrationNumber))
    .update("\u0001")
    .update(fold(brand))
    .update("\u0001")
    .update(compact(dosage))
    .digest("hex")
    .slice(0, 32);
}

/**
 * `withdrawn` beats `non_renewed` beats `registered` beats `unknown`. When two
 * rows describe the same product, the stronger statement wins: a duplicate
 * must not soften a withdrawal into a renewal.
 */
const STATUS_RANK: Record<string, number> = {
  unknown: 0,
  registered: 1,
  non_renewed: 2,
  withdrawn: 3,
};

function strongerStatus(left: string, right: string): string {
  return (STATUS_RANK[right] ?? 0) > (STATUS_RANK[left] ?? 0) ? right : left;
}

function union(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}

interface Disagreement {
  readonly registrationNumber: string;
  readonly field: string;
  readonly kept: string | null;
  readonly keptSource: string;
  readonly other: string | null;
  readonly otherSource: string;
}

interface DuplicatePresentation {
  readonly registrationNumber: string;
  readonly brand: string;
  readonly dosage: string | null;
  readonly keptPack: string | null;
  readonly droppedPack: string | null;
}

interface RegistrationCollision {
  readonly registrationNumber: string;
  readonly products: string[];
}

interface MergeResult {
  readonly rows: RegisterRow[];
  readonly disagreements: Disagreement[];
  readonly duplicatePresentations: DuplicatePresentation[];
  readonly registrationCollisions: RegistrationCollision[];
  readonly nomenclatureRows: number;
  readonly pharmnetRows: number;
  readonly sharedKeys: number;
}

function rowFromNomenclature(row: Record<string, string>, registrationNumber: string): RegisterRow {
  const brand = clean(row.brand) ?? registrationNumber;
  const dosage = clean(row.dosage);
  return {
    productKey: productKeyFor(registrationNumber, brand, dosage),
    registrationNumber,
    brand,
    dci: clean(row.dci),
    dciCode: clean(row.dci_code),
    form: clean(row.form),
    dosage,
    pack: clean(row.pack),
    schedule: normalizeSchedule(row.schedule),
    holder: clean(row.holder),
    holderCountry: clean(row.holder_country),
    productType: normalizeProductType(row.product_type),
    registrationStatus: nomenclatureStatus(row.sheet_status, row.source_sheet),
    withdrawalDate: clean(row.withdrawal_date),
    withdrawalReason: clean(row.withdrawal_reason),
    shelfLife: clean(row.shelf_life),
    observation: clean(row.obs),
    isCombination: flag(row.is_combination),
    inScope: flag(row.in_scope),
    medicineIds: medicineIds(row.medicine_ids),
    sources: ["SANTE_MSP"],
    sourceSheet: clean(row.source_sheet),
    origin: "nomenclature",
  };
}

function rowFromPharmnet(row: Record<string, string>, registrationNumber: string): RegisterRow {
  const brand = clean(row.brand) ?? registrationNumber;
  const dosage = clean(row.dosage);
  return {
    productKey: productKeyFor(registrationNumber, brand, dosage),
    registrationNumber,
    brand,
    dci: clean(row.dci),
    dciCode: clean(row.dci_code),
    form: clean(row.form),
    dosage,
    pack: clean(row.pack),
    schedule: normalizeSchedule(row.schedule),
    holder: clean(row.holder),
    holderCountry: clean(row.holder_country),
    productType: normalizeProductType(row.product_type),
    registrationStatus: pharmnetStatus(row.status),
    withdrawalDate: null,
    withdrawalReason: null,
    shelfLife: clean(row.shelf_life_months),
    observation: clean(row.observation),
    isCombination: flag(row.is_combination),
    inScope: flag(row.in_scope),
    medicineIds: medicineIds(row.medicine_ids),
    sources: ["PHARMNET_CATALOG"],
    sourceSheet: null,
    origin: "pharmnet",
  };
}

/**
 * Two rows for the same product within one source. Keep the first presentation,
 * strengthen the status, and union the membership lists.
 */
function mergeSameSource(existing: RegisterRow, candidate: RegisterRow): RegisterRow {
  return {
    ...existing,
    registrationStatus: strongerStatus(existing.registrationStatus, candidate.registrationStatus),
    dci: existing.dci ?? candidate.dci,
    dciCode: existing.dciCode ?? candidate.dciCode,
    form: existing.form ?? candidate.form,
    pack: existing.pack ?? candidate.pack,
    schedule: existing.schedule ?? candidate.schedule,
    holder: existing.holder ?? candidate.holder,
    holderCountry: existing.holderCountry ?? candidate.holderCountry,
    productType: existing.productType ?? candidate.productType,
    shelfLife: existing.shelfLife ?? candidate.shelfLife,
    observation: existing.observation ?? candidate.observation,
    isCombination: existing.isCombination || candidate.isCombination,
    inScope: existing.inScope || candidate.inScope,
    medicineIds: union(existing.medicineIds, candidate.medicineIds),
    sources: union(existing.sources, candidate.sources),
  };
}

function merge(
  nomenclature: readonly Record<string, string>[],
  pharmnet: readonly Record<string, string>[],
): MergeResult {
  const rows = new Map<string, RegisterRow>();
  const disagreements: Disagreement[] = [];
  const duplicatePresentations: DuplicatePresentation[] = [];

  for (const source of nomenclature) {
    const registrationNumber = registrationNumberFor(source);
    if (!registrationNumber) continue;
    const candidate = rowFromNomenclature(source, registrationNumber);
    const existing = rows.get(candidate.productKey);
    if (!existing) {
      rows.set(candidate.productKey, candidate);
      continue;
    }
    if (existing.pack !== candidate.pack) {
      duplicatePresentations.push({
        registrationNumber,
        brand: existing.brand,
        dosage: existing.dosage,
        keptPack: existing.pack,
        droppedPack: candidate.pack,
      });
    }
    rows.set(candidate.productKey, mergeSameSource(existing, candidate));
  }

  for (const source of pharmnet) {
    const registrationNumber = registrationNumberFor(source);
    if (!registrationNumber) continue;
    const candidate = rowFromPharmnet(source, registrationNumber);
    const existing = rows.get(candidate.productKey);
    if (!existing) {
      rows.set(candidate.productKey, candidate);
      continue;
    }

    if (existing.origin === "pharmnet") {
      // The same product listed twice in one source, usually `withdrawn` and
      // `non_renewed`. The stronger status wins: a duplicate must not soften a
      // withdrawal into a renewal.
      if (existing.registrationStatus !== candidate.registrationStatus) {
        disagreements.push({
          registrationNumber,
          field: "registrationStatus",
          kept: strongerStatus(existing.registrationStatus, candidate.registrationStatus),
          keptSource: "PHARMNET_CATALOG",
          other: candidate.registrationStatus,
          otherSource: "PHARMNET_CATALOG",
        });
      }
      rows.set(candidate.productKey, mergeSameSource(existing, candidate));
      continue;
    }

    // Cross-source: the nomenclature is the base and wins every field it
    // carries; Pharm'Net fills the gaps and every disagreement is reported.
    const pairs: Array<[string, string | null, string | null]> = [
      ["brand", existing.brand, candidate.brand],
      ["dci", existing.dci, candidate.dci],
      ["schedule", existing.schedule, candidate.schedule],
      ["productType", existing.productType, candidate.productType],
    ];
    for (const [field, kept, other] of pairs) {
      if (kept && other && fold(kept) !== fold(other)) {
        disagreements.push({
          registrationNumber,
          field,
          kept,
          keptSource: "SANTE_MSP",
          other,
          otherSource: "PHARMNET_CATALOG",
        });
      }
    }
    if (
      candidate.registrationStatus !== "unknown" &&
      candidate.registrationStatus !== existing.registrationStatus &&
      // `non_renewed` and `withdrawn` are both "not currently registered" and
      // the sources routinely disagree on which label applies; that is not a
      // safety-relevant disagreement.
      !(
        candidate.registrationStatus === "non_renewed" &&
        existing.registrationStatus === "withdrawn"
      )
    ) {
      disagreements.push({
        registrationNumber,
        field: "registrationStatus",
        kept: existing.registrationStatus,
        keptSource: "SANTE_MSP",
        other: candidate.registrationStatus,
        otherSource: "PHARMNET_CATALOG",
      });
    }

    rows.set(candidate.productKey, {
      ...existing,
      dci: existing.dci ?? candidate.dci,
      dciCode: existing.dciCode ?? candidate.dciCode,
      form: existing.form ?? candidate.form,
      dosage: existing.dosage ?? candidate.dosage,
      pack: existing.pack ?? candidate.pack,
      schedule: existing.schedule ?? candidate.schedule,
      holder: existing.holder ?? candidate.holder,
      holderCountry: existing.holderCountry ?? candidate.holderCountry,
      productType: existing.productType ?? candidate.productType,
      shelfLife: existing.shelfLife ?? candidate.shelfLife,
      observation: existing.observation ?? candidate.observation,
      isCombination: existing.isCombination || candidate.isCombination,
      inScope: existing.inScope || candidate.inScope,
      medicineIds: union(existing.medicineIds, candidate.medicineIds),
      sources: union(existing.sources, candidate.sources),
    });
  }

  // One registration number carrying more than one product is either a shared
  // dossier (`LYANA` / `YASMINE`) or a spelling difference between the sources.
  // Both are reported, never merged.
  const byRegistration = new Map<string, Set<string>>();
  for (const row of rows.values()) {
    const products = byRegistration.get(row.registrationNumber) ?? new Set<string>();
    products.add(row.dosage ? `${row.brand} ${row.dosage}` : row.brand);
    byRegistration.set(row.registrationNumber, products);
  }
  const registrationCollisions = [...byRegistration.entries()]
    .filter(([, products]) => products.size > 1)
    .map(([registrationNumber, products]) => ({
      registrationNumber,
      products: [...products].sort(),
    }));

  const nomenclatureRegistrations = new Set(
    nomenclature
      .map((row) => registrationNumberFor(row))
      .filter((value): value is string => value !== null),
  );
  const sharedKeys = new Set(
    pharmnet
      .map((row) => registrationNumberFor(row))
      .filter((value): value is string => value !== null && nomenclatureRegistrations.has(value)),
  ).size;

  return {
    rows: [...rows.values()].sort(
      (left, right) =>
        left.registrationNumber.localeCompare(right.registrationNumber) ||
        left.brand.localeCompare(right.brand) ||
        (left.dosage ?? "").localeCompare(right.dosage ?? ""),
    ),
    disagreements,
    duplicatePresentations,
    registrationCollisions,
    nomenclatureRows: nomenclature.length,
    pharmnetRows: pharmnet.length,
    sharedKeys,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = performance.now();
  const [nomenclature, pharmnet] = await Promise.all([
    readCsv(options.nomenclature),
    readCsv(options.pharmnet),
  ]);
  const merged = merge(nomenclature, pharmnet);
  const byStatus = merged.rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.registrationStatus] = (counts[row.registrationStatus] ?? 0) + 1;
    return counts;
  }, {});
  const summary = {
    ok: true,
    dryRun: options.dryRun,
    nomenclatureRows: merged.nomenclatureRows,
    pharmnetRows: merged.pharmnetRows,
    sharedRegistrationNumbers: merged.sharedKeys,
    products: merged.rows.length,
    inScope: merged.rows.filter((row) => row.inScope).length,
    byStatus,
    disagreements: merged.disagreements.length,
    disagreementSamples: merged.disagreements.slice(0, 10),
    duplicatePresentations: merged.duplicatePresentations.length,
    duplicatePresentationSamples: merged.duplicatePresentations.slice(0, 10),
    registrationCollisions: merged.registrationCollisions.length,
    registrationCollisionSamples: merged.registrationCollisions.slice(0, 10),
    elapsedMs: Math.round(performance.now() - startedAt),
  };

  if (options.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const payload = JSON.stringify(
    merged.rows.map((row) => ({
      product_key: row.productKey,
      registration_number: row.registrationNumber,
      registration_norm: compact(row.registrationNumber),
      brand: row.brand,
      brand_norm: fold(row.brand),
      dci: row.dci,
      dci_norm: row.dci ? fold(row.dci) : null,
      dci_code: row.dciCode,
      form: row.form,
      dosage: row.dosage,
      pack: row.pack,
      schedule: row.schedule,
      holder: row.holder,
      holder_country: row.holderCountry,
      product_type: row.productType,
      registration_status: row.registrationStatus,
      withdrawal_date: row.withdrawalDate,
      withdrawal_reason: row.withdrawalReason,
      shelf_life: row.shelfLife,
      observation: row.observation,
      is_combination: row.isCombination,
      in_scope: row.inScope,
      medicine_ids: row.medicineIds,
      sources: row.sources,
      source_sheet: row.sourceSheet,
    })),
  );

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${payload}::jsonb) AS x(
          product_key text,
          registration_number text,
          registration_norm text,
          brand text,
          brand_norm text,
          dci text,
          dci_norm text,
          dci_code text,
          form text,
          dosage text,
          pack text,
          schedule text,
          holder text,
          holder_country text,
          product_type text,
          registration_status text,
          withdrawal_date text,
          withdrawal_reason text,
          shelf_life text,
          observation text,
          is_combination boolean,
          in_scope boolean,
          medicine_ids text[],
          sources text[],
          source_sheet text
        )
      )
      INSERT INTO retrieval_products (
        product_key, registration_number, registration_norm, brand, brand_norm, dci, dci_norm,
        dci_code, form, dosage, pack, schedule, holder, holder_country, product_type,
        registration_status, withdrawal_date, withdrawal_reason, shelf_life, observation,
        is_combination, in_scope, medicine_ids, sources, source_sheet, updated_at
      )
      SELECT product_key, registration_number, registration_norm, brand, brand_norm, dci, dci_norm,
             dci_code, form, dosage, pack, schedule, holder, holder_country, product_type,
             registration_status, withdrawal_date, withdrawal_reason, shelf_life, observation,
             is_combination, in_scope, medicine_ids, sources, source_sheet, now()
      FROM incoming
      ON CONFLICT (product_key) DO UPDATE SET
        registration_number = EXCLUDED.registration_number,
        registration_norm = EXCLUDED.registration_norm,
        brand = EXCLUDED.brand,
        brand_norm = EXCLUDED.brand_norm,
        dci = EXCLUDED.dci,
        dci_norm = EXCLUDED.dci_norm,
        dci_code = EXCLUDED.dci_code,
        form = EXCLUDED.form,
        dosage = EXCLUDED.dosage,
        pack = EXCLUDED.pack,
        schedule = EXCLUDED.schedule,
        holder = EXCLUDED.holder,
        holder_country = EXCLUDED.holder_country,
        product_type = EXCLUDED.product_type,
        registration_status = EXCLUDED.registration_status,
        withdrawal_date = EXCLUDED.withdrawal_date,
        withdrawal_reason = EXCLUDED.withdrawal_reason,
        shelf_life = EXCLUDED.shelf_life,
        observation = EXCLUDED.observation,
        is_combination = EXCLUDED.is_combination,
        in_scope = EXCLUDED.in_scope,
        medicine_ids = EXCLUDED.medicine_ids,
        sources = EXCLUDED.sources,
        source_sheet = EXCLUDED.source_sheet,
        updated_at = now()
    `);

    // Rows that vanished from both catalogues must not linger: a stale register
    // row reads as a current registration. The incoming payload is reused as
    // the keep-set so the statement stays one bound parameter instead of 9.5k.
    await tx.execute(sql`
      DELETE FROM retrieval_products p
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(${payload}::jsonb) AS x(product_key text)
        WHERE x.product_key = p.product_key
      )
    `);
  });

  const stored = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM retrieval_products
  `);

  console.log(JSON.stringify({ ...summary, stored: Number(stored.rows[0]?.count ?? 0) }, null, 2));
}

await main();
