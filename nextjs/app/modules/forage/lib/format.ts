// Format a logged amount for display: trim to ≤3 decimals and drop trailing zeros,
// so "100" stays "100", "1.50" shows as "1.5", and a typed fraction like 1/8
// survives the round-trip as "0.125" instead of collapsing to "0.13".
export function fmtAmount(n: number): string {
  if (!Number.isFinite(n)) return "1";
  return String(Math.round(n * 1000) / 1000);
}

// Single-character vulgar fractions, so a pasted "⅛ cup" or a keyboard that offers
// ½/¼ works the same as typing "1/8".
const VULGAR_FRACTIONS: Record<string, number> = {
  "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4,
  "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5,
  "⅙": 1 / 6, "⅚": 5 / 6, "⅐": 1 / 7,
  "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
  "⅑": 1 / 9, "⅒": 1 / 10,
};

const VULGAR_CLASS = Object.keys(VULGAR_FRACTIONS).join("");

// Characters a food-amount field may legitimately contain: digits, a decimal point
// or comma, the fraction slash, whitespace (mixed numbers), a leading minus, and the
// vulgar fraction glyphs. Used to keep junk out of the free-text amount inputs — the
// fields are type="text" (a type="number" input silently EATS "/", so typing "1/8"
// became "18"), so they need their own filter.
export function sanitizeAmountInput(raw: string): string {
  return raw.replace(new RegExp(`[^0-9.,/\\u2044\\s-${VULGAR_CLASS}]`, "g"), "");
}

// Parse a user-typed food amount. Accepts what Number() accepts plus kitchen
// fractions, since portions are naturally spoken that way ("1/8 cup", "1 1/2 scoops"):
//
//   "125"      -> 125        "1.5"    -> 1.5
//   "1/8"      -> 0.125      "3 / 4"  -> 0.75
//   "1 1/2"    -> 1.5        "1-1/2"  -> 1.5
//   "⅛"        -> 0.125      "1½"     -> 1.5
//
// Returns NaN for anything it can't resolve (including "" and a zero denominator),
// so every existing `Number.isFinite(q) && q > 0` guard keeps working unchanged.
export function parseAmount(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (raw == null) return NaN;

  // Normalize: unicode fraction slash -> "/", decimal comma -> ".", collapse spaces.
  const text = String(raw).replace(/⁄/g, "/").replace(/,/g, ".").trim().replace(/\s+/g, " ");
  if (text === "") return NaN;

  const sign = text.startsWith("-") ? -1 : 1;
  const body = text.replace(/^[+-]/, "").trim();

  // WHOLE + VULGAR GLYPH — "1½", "1 ½", "⅛"
  const vulgar = body.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*([${VULGAR_CLASS}])$`));
  if (vulgar) {
    const whole = vulgar[1] ? Number(vulgar[1]) : 0;
    return sign * (whole + VULGAR_FRACTIONS[vulgar[2]]);
  }

  // MIXED NUMBER — "1 1/2", "1-1/2"
  const mixed = body.match(/^(\d+(?:\.\d+)?)[\s-]+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (den === 0) return NaN;
    return sign * (Number(mixed[1]) + Number(mixed[2]) / den);
  }

  // SIMPLE FRACTION — "1/8", "3 / 4", ".5/2"
  const frac = body.match(/^(\d*(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (den === 0 || frac[1] === "") return NaN;
    return sign * (Number(frac[1]) / den);
  }

  // PLAIN NUMBER — anything else must parse cleanly on its own ("1.5", "100").
  if (!/^\d*(?:\.\d+)?$/.test(body) || body === "" || body === ".") return NaN;
  return sign * Number(body);
}
