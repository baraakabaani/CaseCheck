// Lightweight Arabic/English text normalization used by the offline
// (zero-API) heuristic matcher — no external NLP dependency required.

const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

const STOPWORDS = new Set([
  "و",
  "أو",
  "في",
  "من",
  "إلى",
  "الى",
  "على",
  "عن",
  "مع",
  "أن",
  "ان",
  "ما",
  "لا",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "التي",
  "الذي",
  "كل",
  "بعد",
  "قبل",
  "حسب",
  "يتم",
  "عدم",
  "أي",
  "اي",
  "بين",
  "خلال",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "a",
  "an",
]);

/** Normalizes Arabic text: strips diacritics/tatweel, unifies alef/ya/ta
 * marbuta variants, lowercases Latin text, and collapses punctuation. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Note: taa marbuta (ة) is already folded to ه by normalizeText() above, so
// the nisba-adjective + taa marbuta ending ("-iyya") shows up as "يه" here,
// not "ية" — order matters, longer/compound suffixes must be checked first.
const STEM_SUFFIXES = ["يه", "ات", "ين", "ون", "ه", "ي", "ا"];

/** Very light Arabic suffix/prefix stripping (definite article, plural and
 * nisba-adjective endings) — not a real stemmer, just enough to close the
 * gap between e.g. "البنكية" and "بنك", or "كشوفات" and "كشف", for keyword
 * matching purposes. */
function lightStem(token: string): string {
  let t = token;
  if (t.startsWith("ال") && t.length > 4) t = t.slice(2);
  for (const suffix of STEM_SUFFIXES) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 2) {
      t = t.slice(0, t.length - suffix.length);
      break;
    }
  }
  return t;
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(lightStem);
}

export function tokenSet(input: string): Set<string> {
  return new Set(tokenize(input));
}

/** Fraction of `needleTokens` that appear in `haystack` — a recall-oriented
 * coverage score in [0, 1], suited to short keyword lists against long
 * document text. */
export function tokenCoverage(needleTokens: string[], haystack: Set<string>): number {
  if (needleTokens.length === 0) return 0;
  let hits = 0;
  for (const t of needleTokens) if (haystack.has(t)) hits++;
  return hits / needleTokens.length;
}
