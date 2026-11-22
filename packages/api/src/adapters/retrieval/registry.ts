import { sql, type SQL } from "drizzle-orm";
import { db } from "@repo/database";
import {
  compactRegistryText,
  foldRegistryText,
  type RegistryLookupInput,
  type RegistryPage,
  type RegistryPort,
  type RegistryProduct,
} from "@repo/services/retrieval";

/**
 * Postgres adapter for the Algerian product register.
 *
 * The register is 9.5k rows, so a sequential scan is cheaper than maintaining a
 * trigram index and is exact: a brand query either contains the term or does
 * not. Similarity search is the wrong tool here — a nearest neighbour will
 * happily return `DOLIPRANE` for `DOLKO`, and a register lookup must not.
 *
 * One extra row is fetched so `truncated` reflects the register, not the page.
 */

interface ProductRow {
  [key: string]: unknown;
  registration_number: string;
  brand: string;
  dci: string | null;
  dci_code: string | null;
  form: string | null;
  dosage: string | null;
  pack: string | null;
  schedule: string | null;
  holder: string | null;
  holder_country: string | null;
  product_type: string | null;
  registration_status: string;
  withdrawal_date: string | null;
  withdrawal_reason: string | null;
  shelf_life: string | null;
  is_combination: boolean;
  in_scope: boolean;
  medicine_ids: string[] | null;
  total: number;
}

/** `%`, `_` and `\` are pattern syntax in `ILIKE`; a brand may contain them. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toProduct(row: ProductRow): RegistryProduct {
  return {
    registrationNumber: row.registration_number,
    brand: row.brand,
    dci: text(row.dci),
    dciCode: text(row.dci_code),
    form: text(row.form),
    dosage: text(row.dosage),
    pack: text(row.pack),
    schedule: text(row.schedule),
    holder: text(row.holder),
    holderCountry: text(row.holder_country),
    productType: text(row.product_type),
    registrationStatus: row.registration_status,
    withdrawalDate: text(row.withdrawal_date),
    withdrawalReason: text(row.withdrawal_reason),
    shelfLife: text(row.shelf_life),
    isCombination: row.is_combination === true,
    inScope: row.in_scope === true,
    medicineIds: row.medicine_ids ?? [],
  };
}

function matchCondition(input: RegistryLookupInput, pattern: string, prefix: string): SQL {
  const contains = sql`${pattern}`;
  const startsWith = sql`${prefix}`;
  switch (input.kind) {
    case "brand":
      return sql`brand_norm LIKE ${contains}`;
    case "substance":
      return sql`dci_norm LIKE ${contains}`;
    case "registration":
      return sql`registration_norm LIKE ${startsWith}`;
    case "auto":
    default:
      return input.registrationShaped
        ? sql`(brand_norm LIKE ${contains} OR dci_norm LIKE ${contains} OR registration_norm LIKE ${startsWith})`
        : sql`(brand_norm LIKE ${contains} OR dci_norm LIKE ${contains})`;
  }
}

/**
 * Exact matches first, then brands that merely contain the term. Without this
 * ordering `DOLKO` can appear below `DOLKO ENFANT` or an unrelated longer name,
 * which reads to a user as the wrong product.
 */
function rankExpression(input: RegistryLookupInput, folded: string, compacted: string): SQL {
  if (input.kind === "registration") {
    return sql`CASE WHEN registration_norm = ${compacted} THEN 0 ELSE 1 END`;
  }
  return sql`CASE
    WHEN brand_norm = ${folded} THEN 0
    WHEN dci_norm = ${folded} THEN 1
    WHEN brand_norm LIKE ${`${escapeLike(folded)}%`} THEN 2
    ELSE 3
  END`;
}

export const postgresRegistry: RegistryPort = {
  async lookupProducts(input: RegistryLookupInput): Promise<RegistryPage> {
    // Both sides are folded: the register mixes `PARACÉTAMOL` and
    // `PARACETAMOL`, and a pharmacist may type either.
    const folded = foldRegistryText(input.query);
    const compacted = compactRegistryText(input.query);
    const pattern = `%${escapeLike(folded)}%`;
    const prefix = `${escapeLike(compacted)}%`;
    const statusCondition = input.includeWithdrawn
      ? sql`TRUE`
      : sql`registration_status = 'registered'`;

    const result = await db.execute<ProductRow>(sql`
      SELECT registration_number, brand, dci, dci_code, form, dosage, pack, schedule,
             holder, holder_country, product_type, registration_status, withdrawal_date,
             withdrawal_reason, shelf_life, is_combination, in_scope, medicine_ids,
             CAST(count(*) OVER () AS int) AS total
      FROM retrieval_products
      WHERE ${statusCondition}
        AND ${matchCondition(input, pattern, prefix)}
      ORDER BY ${rankExpression(input, folded, compacted)}, brand ASC, dosage ASC NULLS LAST
      LIMIT ${input.limit + 1}
    `);

    const rows = result.rows;
    return {
      products: rows.slice(0, input.limit).map(toProduct),
      // The window count runs before LIMIT, so it reports the register's answer
      // size rather than the page size. A brand with 30 products can then be
      // described as "30 registered" even when the page returns 10.
      total: Number(rows[0]?.total ?? 0),
      truncated: rows.length > input.limit,
    };
  },
};
