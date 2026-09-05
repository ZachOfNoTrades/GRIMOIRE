// Shared client-side search matching — the normalization every in-memory list
// filter runs so that what the user *means* matches what the data *says*.
//
// The plain `value.toLowerCase().includes(query)` this replaces is a literal
// phrase match, which fails the moment the writer and the searcher spell the
// same thing differently. The concrete complaint: a card reading `5" nominal`
// is invisible to the query `5 inch`, and a card reading `5 inch pounds` is
// invisible to `5"`. Same for `6 ft` vs `6 feet` and `10 lb` vs `10 pounds`.
//
// Both sides of the comparison go through normalizeSearchText(), so the rules
// below only ever need to be self-consistent — never "correct" in the abstract.
//
// Deliberately client-safe (no imports at all): the same helper runs in list
// components across every module. Forage's food/recipe search is NOT built on
// this — it filters in SQL with LIKE + REPLACE chains (see
// forage/lib/searchNormalize.ts), where a per-alias REPLACE chain over every
// searched column is not practical. Its punctuation-stripping and its
// every-token-must-appear semantics are mirrored here on purpose so the two
// searches behave the same way where they can.

// Unit aliases, keyed by the alias, valued by the canonical singular word both
// sides get rewritten to. The canonical form is the spelled-out singular, so a
// card written either way lands on the same token.
const UNIT_ALIASES: Record<string, string> = {
  // LENGTH
  in: 'inch', inch: 'inch', inches: 'inch',
  ft: 'foot', foot: 'foot', feet: 'foot',
  yd: 'yard', yds: 'yard', yard: 'yard', yards: 'yard',
  mi: 'mile', mile: 'mile', miles: 'mile',
  mm: 'millimeter', millimeter: 'millimeter', millimeters: 'millimeter', millimetre: 'millimeter', millimetres: 'millimeter',
  cm: 'centimeter', centimeter: 'centimeter', centimeters: 'centimeter', centimetre: 'centimeter', centimetres: 'centimeter',
  m: 'meter', meter: 'meter', meters: 'meter', metre: 'meter', metres: 'meter',
  km: 'kilometer', kilometer: 'kilometer', kilometers: 'kilometer', kilometre: 'kilometer', kilometres: 'kilometer',
  // MASS
  lb: 'pound', lbs: 'pound', pound: 'pound', pounds: 'pound',
  oz: 'ounce', ounce: 'ounce', ounces: 'ounce',
  g: 'gram', gram: 'gram', grams: 'gram',
  kg: 'kilogram', kgs: 'kilogram', kilo: 'kilogram', kilos: 'kilogram', kilogram: 'kilogram', kilograms: 'kilogram',
  mg: 'milligram', milligram: 'milligram', milligrams: 'milligram',
  mcg: 'microgram', microgram: 'microgram', micrograms: 'microgram',
  // VOLUME
  ml: 'milliliter', milliliter: 'milliliter', milliliters: 'milliliter', millilitre: 'milliliter', millilitres: 'milliliter',
  l: 'liter', liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter',
  tsp: 'teaspoon', teaspoon: 'teaspoon', teaspoons: 'teaspoon',
  tbsp: 'tablespoon', tablespoon: 'tablespoon', tablespoons: 'tablespoon',
  cup: 'cup', cups: 'cup',
  pt: 'pint', pint: 'pint', pints: 'pint',
  qt: 'quart', quart: 'quart', quarts: 'quart',
  gal: 'gallon', gallon: 'gallon', gallons: 'gallon',
  // TEMPERATURE
  deg: 'degree', degree: 'degree', degrees: 'degree',
  c: 'celsius', celsius: 'celsius', centigrade: 'celsius',
  f: 'fahrenheit', fahrenheit: 'fahrenheit',
  // TIME
  s: 'second', sec: 'second', secs: 'second', second: 'second', seconds: 'second',
  min: 'minute', mins: 'minute', minute: 'minute', minutes: 'minute',
  hr: 'hour', hrs: 'hour', hour: 'hour', hours: 'hour',
  d: 'day', day: 'day', days: 'day',
  wk: 'week', wks: 'week', week: 'week', weeks: 'week',
  mo: 'month', month: 'month', months: 'month',
  yr: 'year', yrs: 'year', year: 'year', years: 'year',
  // COUNT-ISH
  pct: 'percent', percent: 'percent',
  cal: 'calorie', cals: 'calorie', calorie: 'calorie', calories: 'calorie', kcal: 'calorie',
  rep: 'rep', reps: 'rep',
  set: 'set', sets: 'set',
};

// Aliases that are also ordinary English words or bare letters. Rewriting these
// unconditionally would wreck normal prose — "in the box" must not become "inch
// the box", and "d" is a note name as often as it is a day. They only count as a
// unit when a NUMBER immediately precedes them, which is exactly the shape a
// measurement takes ("5 in", "400 m", "350 f", "30 s").
const NUMERIC_CONTEXT_ONLY = new Set([
  'in', 'm', 'g', 'l', 's', 'c', 'f', 'd', 'pt', 'mo', 'min', 'mins', 'cal', 'cals',
  'set', 'sets', 'sec', 'secs', 'cup', 'cups', 'second', 'seconds', 'minute', 'minutes',
  'day', 'days', 'month', 'months', 'year', 'years', 'week', 'weeks',
]);

// Punctuation nobody reliably types, removed rather than split on so "H-E-B"
// collapses to "heb" and "don't" to "dont" — the same call forage's
// normalizeSearchTerm makes. Whitespace is NOT in here: collapsing it would let
// "heb" match "the best".
const SILENT_PUNCTUATION = /['’‘`´&.,\-–—/\\()[\]{}+*"”“#:;!?_|<>=~^$@]/g;

// Placeholder standing in for a decimal point while punctuation is stripped, so
// "2.5" survives as one token instead of collapsing to "25" (which would make
// the query "25" match a card that says 2.5). Any character outside
// SILENT_PUNCTUATION works; it is swapped back to "." before tokenizing.
const DECIMAL_MARK = '\u0001';

// Fold a string to the canonical token stream both a query and a searched value
// are compared in. Returns a single space-joined string so callers can keep
// using substring matching (a partial word like "diam" still finds "diameter").
export function normalizeSearchText(value: string): string {
  let text = value
    .toLowerCase()
    // Strip diacritics so "café"/"naïve" answer to "cafe"/"naive".
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Typographic characters to their ASCII equivalents BEFORE the unit rules
    // below look for a literal quote — a phone keyboard emits the curly ones.
    .replace(/[‘’ʼ′‵]/g, "'")
    .replace(/[“”″‶]/g, '"');

  // Symbol units, but ONLY directly after a number. A bare apostrophe is an
  // apostrophe ("don't"), and a bare quote is a quote — it is the digit in
  // front that makes 5" a measurement. Doubled primes are checked before the
  // single one so 5'' reads as inches, not feet.
  text = text
    .replace(/(\d)\s*''/g, '$1 inch')
    .replace(/(\d)\s*"/g, '$1 inch')
    .replace(/(\d)\s*'/g, '$1 foot')
    .replace(/(\d)\s*°/g, '$1 degree')
    .replace(/(\d)\s*%/g, '$1 percent');

  // Split a number welded to its unit so "10lb" tokenizes like "10 lb". Only
  // digit->letter: the reverse would break names like "b12".
  text = text.replace(/(\d)([a-z])/g, '$1 $2');

  // Protect decimal points, drop the punctuation, restore them.
  text = text
    .replace(/(\d)\.(\d)/g, `$1${DECIMAL_MARK}$2`)
    .replace(SILENT_PUNCTUATION, '')
    .split(DECIMAL_MARK).join('.');

  const tokens = text.split(/[^a-z0-9.]+/).filter(Boolean);

  // Canonicalize unit tokens. The ambiguous ones need a numeric token
  // immediately to their left to qualify.
  return tokens
    .map((token, index) => {
      const canonical = UNIT_ALIASES[token];
      if (!canonical) return token;
      if (NUMERIC_CONTEXT_ONLY.has(token) && !/^\d+(\.\d+)?$/.test(tokens[index - 1] ?? '')) return token;
      return canonical;
    })
    .join(' ');
}

// Build a reusable predicate for one query. Preferred over searchMatches() when
// filtering a list — the query is normalized once, not once per row.
export function makeSearchMatcher(query: string): (value: string) => boolean {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  // An empty/punctuation-only query matches everything; callers generally skip
  // filtering entirely in that case, but this keeps the predicate total.
  if (tokens.length === 0) return () => true;
  return (value: string) => {
    const haystack = normalizeSearchText(value);
    // EVERY token must appear, in any order and not necessarily adjacent —
    // "diameter pipe" finds "pipe diameter", matching how forage's food search
    // already behaves ("turkey heb" -> "Reserve Turkey Breast ... H-E-B").
    return tokens.every((token) => haystack.includes(token));
  };
}

// One-off convenience for a single comparison.
export function searchMatches(value: string, query: string): boolean {
  return makeSearchMatcher(query)(value);
}
