/** Strip diacritics, collapse whitespace, lowercase. Stable across runs. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function containsPhrase(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}
