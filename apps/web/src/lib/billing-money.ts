// Numeric minor units from SIX ISO 4217 List One, published 2026-01-01.
// Keep this data deterministic and avoid requiring Intl.supportedValuesOf on
// native runtimes that support NumberFormat but not that newer enumeration API.
const BILLING_ISO_CURRENCIES = new Set(
  "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAD XAF XCD XCG XOF XPF YER ZAR ZMW ZWG".split(
    " ",
  ),
);
const BILLING_ISO_ZERO_DIGITS = new Set(
  "BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF".split(" "),
);
const BILLING_ISO_THREE_DIGITS = new Set("BHD IQD JOD KWD LYD OMR TND".split(" "));
const BILLING_ISO_FOUR_DIGITS = new Set(["CLF", "UYW"]);

// Stripe and Chargily both use ISO currency minor units. Stripe applies its
// documented zero-decimal set, with two-decimal ISK/UGX API compatibility.
// Chargily settles in DZD and emits no invoice amount rows today.
const BILLING_ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function formatBillingInvoiceAmount(
  invoice: { provider: string; amount: number; currency?: string },
  locale = "en",
): string {
  if (
    !Number.isSafeInteger(invoice.amount) ||
    !invoice.currency ||
    !/^[a-z]{3}$/i.test(invoice.currency)
  )
    return "—";
  if (invoice.provider !== "stripe" && invoice.provider !== "chargily") return "—";
  const currency = invoice.currency.toUpperCase();
  try {
    if (!BILLING_ISO_CURRENCIES.has(currency)) return "—";
    const isoExponent = BILLING_ISO_ZERO_DIGITS.has(currency)
      ? 0
      : BILLING_ISO_THREE_DIGITS.has(currency)
        ? 3
        : BILLING_ISO_FOUR_DIGITS.has(currency)
          ? 4
          : 2;
    const format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: isoExponent,
      maximumFractionDigits: isoExponent,
    });
    const exponent =
      invoice.provider === "stripe" && BILLING_ZERO_DECIMAL_CURRENCIES.has(currency)
        ? 0
        : invoice.provider === "stripe" && (currency === "ISK" || currency === "UGX")
          ? 2
          : isoExponent;
    return format.format(invoice.amount / 10 ** exponent);
  } catch {
    return "—";
  }
}

/**
 * Format a catalog price.
 *
 * The price is stored in the minor units of its currency, so the exponent of
 * the currency decides how many decimals the amount carries.
 */
export function formatBillingPriceAmount(
  amountMinor: number,
  currency: string,
  locale = "en",
): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return "—";
  const code = currency.toUpperCase();
  if (!BILLING_ISO_CURRENCIES.has(code)) return "—";
  const exponent = BILLING_ISO_ZERO_DIGITS.has(code)
    ? 0
    : BILLING_ISO_THREE_DIGITS.has(code)
      ? 3
      : BILLING_ISO_FOUR_DIGITS.has(code)
        ? 4
        : 2;
  try {
    const format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "code",
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    });
    return format.format(amountMinor / 10 ** exponent);
  } catch {
    return "—";
  }
}
