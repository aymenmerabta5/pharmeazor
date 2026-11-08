export const pdfLocales = ["en", "fr", "ar"] as const;
export type PdfLocale = (typeof pdfLocales)[number];

const ENGLISH_PDF_MESSAGES = {
  invoice: "Invoice",
  billTo: "Bill to",
  dueDate: "Due date",
  currency: "Currency",
  description: "Description",
  quantity: "Qty",
  unit: "Unit",
  amount: "Amount",
  total: "Total",
  notes: "Notes",
  verification: "Verification",
  generatedWith: "Generated with GhostInit PDF",
  thankYou: "Thank you for your business",
  certificate: "Certificate",
  certifiesThat: "This is to certify that",
  issuedOn: "Issued on",
  validUntil: "Valid until",
  signature: "Signature",
  verify: "Verify",
  name: "Name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  effective: "Effective",
  expiry: "Expiry",
} as const;
export type PdfMessageKey = keyof typeof ENGLISH_PDF_MESSAGES;

const PDF_MESSAGES: Readonly<Record<PdfLocale, Readonly<Record<PdfMessageKey, string>>>> = {
  en: ENGLISH_PDF_MESSAGES,
  fr: {
    invoice: "Facture",
    billTo: "Facturé à",
    dueDate: "Date d’échéance",
    currency: "Devise",
    description: "Description",
    quantity: "Qté",
    unit: "Unité",
    amount: "Montant",
    total: "Total",
    notes: "Notes",
    verification: "Vérification",
    generatedWith: "Généré avec GhostInit PDF",
    thankYou: "Merci pour votre confiance",
    certificate: "Certificat",
    certifiesThat: "Nous certifions que",
    issuedOn: "Délivré le",
    validUntil: "Valable jusqu’au",
    signature: "Signature",
    verify: "Vérifier",
    name: "Nom",
    email: "E-mail",
    phone: "Téléphone",
    address: "Adresse",
    effective: "Prise d’effet",
    expiry: "Expiration",
  },
  ar: {
    invoice: "فاتورة",
    billTo: "الفاتورة إلى",
    dueDate: "تاريخ الاستحقاق",
    currency: "العملة",
    description: "الوصف",
    quantity: "الكمية",
    unit: "الوحدة",
    amount: "المبلغ",
    total: "الإجمالي",
    notes: "ملاحظات",
    verification: "التحقق",
    generatedWith: "تم الإنشاء باستخدام GhostInit PDF",
    thankYou: "شكراً لتعاملك معنا",
    certificate: "شهادة",
    certifiesThat: "نشهد بأن",
    issuedOn: "تاريخ الإصدار",
    validUntil: "صالحة حتى",
    signature: "التوقيع",
    verify: "تحقق",
    name: "الاسم",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    address: "العنوان",
    effective: "بدء السريان",
    expiry: "انتهاء الصلاحية",
  },
};

export function normalizePdfLocale(locale?: string): PdfLocale {
  const candidate = locale?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return candidate === "fr" || candidate === "ar" ? candidate : "en";
}

export function pdfLocaleTag(locale?: string): "en-US" | "fr-FR" | "ar-DZ" {
  const normalized = normalizePdfLocale(locale);
  return normalized === "fr" ? "fr-FR" : normalized === "ar" ? "ar-DZ" : "en-US";
}

export function pdfMessage(locale: string | undefined, key: PdfMessageKey): string {
  return PDF_MESSAGES[normalizePdfLocale(locale)][key];
}

export function pdfTextAlign(locale?: string): "left" | "right" {
  return normalizePdfLocale(locale) === "ar" ? "right" : "left";
}

export function pdfTextDirection(locale?: string): "ltr" | "rtl" {
  return normalizePdfLocale(locale) === "ar" ? "rtl" : "ltr";
}

export function pdfRowDirection(locale?: string): "row" | "row-reverse" {
  return normalizePdfLocale(locale) === "ar" ? "row-reverse" : "row";
}
