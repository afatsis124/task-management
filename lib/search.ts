/**
 * Shared search helpers.
 *
 * Greek text is full of accents (Αγίου, Πατησίων, Θεσσαλονίκη). Comparing raw
 * text means a user typing "αγιου" never finds "Αγίου". These helpers strip
 * accents and case before comparing, so typing without accents just works.
 */
 
/** Lowercases and removes accents: "Αγίου" -> "αγιου", "Kolonáki" -> "kolonaki". */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accent marks
    .toLowerCase()
    .replace(/\u03c2/g, "\u03c3") // final sigma -> sigma, so "ΣΑΡΒΑΝΙΔΗΣ" matches "σαρβανιδης"
    .trim();
}
 
/**
 * True if every word the user typed appears in at least one of the fields.
 * Accents and capitals are ignored. An empty query matches everything.
 *
 *   matchesSearch("αγι", "Αγίου Πέτρου 12", "Εύοσμος")  // true
 *   matchesSearch("πετρου ευοσμ", "Αγίου Πέτρου 12", "Εύοσμος")  // true
 */
export function matchesSearch(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = fields
    .filter((f) => f)
    .map((f) => normalizeText(String(f)))
    .join(" | ");
  return q.split(/\s+/).every((word) => haystack.includes(word));
}
