export function isRtlLocale(locale: string): boolean {
  return locale === "ar";
}

export function logicalClass(textAlign: "start" | "end" | "center" | "justify"): string {
  if (textAlign === "start") return "text-start";
  if (textAlign === "end") return "text-end";
  return `text-${textAlign}`;
}

export function marginStartClass(value: string): string {
  return `ms-${value}`;
}

export function paddingStartClass(value: string): string {
  return `ps-${value}`;
}
