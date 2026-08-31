/**
 * Supabase Storage rejects filenames containing Greek letters, spaces or most
 * punctuation ("Invalid key"). This turns any filename into a safe storage key
 * while keeping it readable: "ΤΙΜΟΛΟΓΙΟ ΕΡΑΤΥΡΑΣ 19.pdf" -> "timologio-eratyras-19.pdf".
 */
const GREEK_TO_LATIN: Record<string, string> = {
  "α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e",
  "ζ": "z", "η": "i", "θ": "th", "ι": "i", "κ": "k",
  "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o",
  "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t",
  "υ": "y", "φ": "f", "χ": "ch", "ψ": "ps", "ω": "o",
};

function cleanFilenamePart(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split("")
    .map((ch) => GREEK_TO_LATIN[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export function toStorageKey(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawBase = dot > 0 ? fileName.slice(0, dot) : fileName;
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "";
  const base = cleanFilenamePart(rawBase).slice(0, 60) || "file";
  const ext = cleanFilenamePart(rawExt) || "pdf";
  return `${base}.${ext}`;
}
