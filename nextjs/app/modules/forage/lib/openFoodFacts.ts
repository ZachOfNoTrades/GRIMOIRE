import { LabelOcrDraft } from '../types/labelOcr';
import { NUTRIENT_BY_CODE, NUTRIENT_CODES_IN_ORDER } from '../utils/nutrientLedger';

// ============================================================
// OPEN FOOD FACTS FALLBACK
//
// Some grocery/brand sites (H-E-B and friends behind Imperva/Incapsula,
// Cloudflare, DataDome) hard-block server-side reads — not with a soft UA gate a
// headless browser can clear, but at the IP/reputation level. For those, the
// pasted link still tells us WHICH product the user means: the slug carries the
// product name. So when webPageFetch reports a wall, foodUrlLLM asks this module
// to find the same product in Open Food Facts and imports from there instead.
//
// Everything here is best-effort and returns null rather than throwing, so a
// blocked page degrades to the original "that site blocked the import" error
// rather than a second, more confusing failure.
// ============================================================

const OFF_SEARCH_URL = 'https://search.openfoodfacts.org/search';
const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
// ============================================================
// OPEN FOOD FACTS API TERMS
// (https://openfoodfacts.github.io/openfoodfacts-server/api/)
//
// Their documented obligations, and how this module meets them:
//
//  1. User-Agent MUST be `AppName/Version (ContactEmail)`. A generic UA is
//     treated as bot traffic. Change OFF_CONTACT_EMAIL if the owner changes —
//     it is the address OFF would use to reach us about our traffic.
//  2. Rate limits, per IP: 15 req/min for product reads, 10 req/min for
//     searches. Enforced outbound below rather than discovered by being
//     blocked.
//  3. "If you need to fetch more than a few hundred products, download the
//     CSV/JSONL export instead." We never bulk-fetch: a search costs 1 request
//     and at most MAX_FULL_FETCHES product reads.
//  4. WRITE operations require authentication. We only ever read.
// ============================================================
export const OFF_CONTACT_EMAIL = 'aj12za10@gmail.com';
const OFF_USER_AGENT = `Grimoire-Forage/1.0 (${OFF_CONTACT_EMAIL})`;
const OFF_TIMEOUT_MS = 8_000;

// Documented per-IP ceilings. `search` covers search.openfoodfacts.org too:
// their published limit names /api/v*/search and /cgi/search.pl, and counting
// the search-a-licious host under the same budget is the conservative reading.
type OffBucket = 'product' | 'search';
const OFF_RATE_LIMITS: Record<OffBucket, { max: number; windowMs: number }> = {
  product: { max: 15, windowMs: 60_000 },
  search: { max: 10, windowMs: 60_000 },
};
// How long a caller will wait for a slot before giving up. A search is a bonus
// lane under the user's own foods, so it bails fast; a product read means the
// user actually tapped something, and is worth waiting on.
const OFF_MAX_WAIT_MS: Record<OffBucket, number> = { product: 10_000, search: 3_000 };

// Timestamps of recent outbound calls per bucket (sliding window).
const offCallTimes: Record<OffBucket, number[]> = { product: [], search: [] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Take a slot in the bucket's window, waiting if one frees up in time. Returns
// false when the wait would exceed the caller's budget — the caller then
// degrades (no suggestions / no fallback match) rather than breaching the limit.
async function acquireOffSlot(bucket: OffBucket): Promise<boolean> {
  const { max, windowMs } = OFF_RATE_LIMITS[bucket];
  const deadline = Date.now() + OFF_MAX_WAIT_MS[bucket];

  for (;;) {
    const now = Date.now();
    // Drop calls that have aged out of the window, then take a slot if free.
    // The filter + push happen in one synchronous run, so concurrent callers
    // can't both see the same free slot.
    const times = offCallTimes[bucket].filter((t) => now - t < windowMs);
    offCallTimes[bucket] = times;
    if (times.length < max) {
      times.push(now);
      return true;
    }
    // Wait for the oldest call to leave the window (+ a little slack).
    const waitMs = windowMs - (now - times[0]) + 50;
    if (now + waitMs > deadline) {
      console.warn(`[ForageOFF] ${bucket} rate limit reached (${max}/min) — skipping this call`);
      return false;
    }
    await sleep(waitMs);
  }
}

// Short-lived response cache. Cuts real traffic hard on the paths that repeat:
// typing narrows a query letter by letter, and the same product gets fetched by
// both the suggestion pick and the create call.
const OFF_CACHE_TTL_MS: Record<OffBucket, number> = { product: 60 * 60 * 1000, search: 10 * 60 * 1000 };
const OFF_CACHE_MAX_ENTRIES = 200;
const offCache = new Map<string, { expiresAt: number; value: any }>();

function readOffCache(url: string): any | undefined {
  const hit = offCache.get(url);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    offCache.delete(url);
    return undefined;
  }
  // Refresh insertion order so the eviction below is roughly LRU.
  offCache.delete(url);
  offCache.set(url, hit);
  return hit.value;
}

function writeOffCache(url: string, value: any, bucket: OffBucket): void {
  if (offCache.size >= OFF_CACHE_MAX_ENTRIES) {
    const oldest = offCache.keys().next();
    if (!oldest.done) offCache.delete(oldest.value);
  }
  offCache.set(url, { expiresAt: Date.now() + OFF_CACHE_TTL_MS[bucket], value });
}
// How many ranked hits to consider, and how many of those we're willing to pull
// the full record for. OFF's search response carries only per-100g nutriments,
// so confirming a candidate really has nutrition needs the product endpoint.
const MAX_CANDIDATES = 8;
const MAX_FULL_FETCHES = 4;
// A hit must share at least this share of the link's meaningful words (and at
// least two of them) before we'll believe it's the same product. Deliberately
// strict: importing the WRONG food's nutrition is far worse than importing none.
const MIN_TOKEN_MATCH_RATIO = 0.6;
const MIN_TOKEN_MATCHES = 2;

// Slug words that describe packaging rather than the food, so they neither help
// the search nor count toward the match score ("6-pk", "cans", "8-oz").
const NOISE_TOKENS = new Set([
  'pk', 'pack', 'ct', 'count', 'cans', 'can', 'bottles', 'bottle', 'box', 'bag', 'case',
  'oz', 'fl', 'ml', 'l', 'lb', 'lbs', 'g', 'kg', 'gram', 'grams', 'gal', 'qt', 'pt',
  'each', 'ea', 'size', 'the', 'a', 'of', 'and', 'with', 'in', 'for',
]);
// NB: words like "value" and "family" look like packaging chatter but are store
// BRAND names ("Great Value"), and dropping them costs the strongest identity
// signal a slug carries — so they deliberately stay in.

// URL path segments that are routing chrome, never the product name.
const PATH_NOISE = new Set([
  'product', 'products', 'product-detail', 'productdetail', 'p', 'dp', 'ip', 'item',
  'items', 'shop', 'store', 'grocery', 'food', 'en', 'en-us', 'us', 'detail', 'details',
  'buy', 'catalog', 'sku',
]);

// OFF nutriment key → grimoire nutrient code. OFF's own keys are stable across
// the dataset; codes not listed here simply don't get imported.
const OFF_KEY_TO_CODE: Record<string, string> = {
  'saturated-fat': 'sat_fat',
  'trans-fat': 'trans_fat',
  cholesterol: 'cholesterol',
  fiber: 'fiber',
  sugars: 'sugar_total',
  'added-sugars': 'sugar_added',
  sodium: 'sodium',
  potassium: 'potassium',
  calcium: 'calcium',
  iron: 'iron',
  magnesium: 'magnesium',
  phosphorus: 'phosphorus',
  zinc: 'zinc',
  copper: 'copper',
  manganese: 'manganese',
  selenium: 'selenium',
  iodine: 'iodine',
  chromium: 'chromium',
  molybdenum: 'molybdenum',
  chloride: 'chloride',
  'vitamin-a': 'vit_a',
  'vitamin-c': 'vit_c',
  'vitamin-d': 'vit_d',
  'vitamin-e': 'vit_e',
  'vitamin-k': 'vit_k',
  'vitamin-b1': 'thiamin',
  'vitamin-b2': 'riboflavin',
  'vitamin-pp': 'niacin',
  'vitamin-b6': 'vit_b6',
  'vitamin-b9': 'folate',
  folates: 'folate',
  'vitamin-b12': 'vit_b12',
  biotin: 'biotin',
  'pantothenic-acid': 'pantothenic',
  choline: 'choline',
  caffeine: 'caffeine',
  water: 'water',
};

// Grams per unit / millilitres per unit, for normalizing OFF's declared units
// into the standard unit each grimoire nutrient is stored in.
const MASS_IN_GRAMS: Record<string, number> = {
  g: 1, mg: 1e-3, µg: 1e-6, ug: 1e-6, mcg: 1e-6, kg: 1000,
};
const VOLUME_IN_ML: Record<string, number> = { ml: 1, l: 1000, cl: 10, dl: 100 };

// A single OFF product, normalized into exactly the shape/units the food draft
// prompt expects — so the LLM only has to transcribe, never convert.
export interface OpenFoodFactsMatch {
  code: string;
  name: string;
  brand: string;
  // Public OFF page for the product, recorded as the draft's data provenance.
  url: string;
  serving_size_text: string | null;
  // Whether the numbers below are per stated serving or per 100 g / 100 ml.
  values_are_per: 'serving' | '100g' | '100ml';
  // OFF's category taxonomy tags (e.g. "en:peanut-butters"), used to pick an
  // icon. Frequently empty — plenty of records carry none at all.
  category_tags: string[];
  // Front-of-pack photo, when the record has one. Downloaded and stored against
  // the food so the app never hotlinks (and survives OFF being down).
  image_url: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  // Keyed by grimoire nutrient code, already in that nutrient's standard unit.
  nutrients_by_code: Record<string, number>;
}

// Split a string into lowercase word tokens.
function rawTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Word tokens with packaging noise and bare numbers dropped.
function meaningfulTokens(text: string): string[] {
  return rawTokens(text).filter((t) => !NOISE_TOKENS.has(t) && !/^\d+$/.test(t));
}

// Read the product identity out of a link we couldn't fetch. The descriptive
// slug ("v8-energy-strawberry-banana-drink-6-pk-cans-8-oz") is the search query;
// a path/query segment of 8-14 digits is a real UPC/EAN we can look up directly.
// Shorter digit runs are retailer SKUs (H-E-B's trailing /2208825) and ignored.
export function deriveProductQuery(rawUrl: string): { terms: string; barcode: string | null } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { terms: '', barcode: null };
  }

  const segments = parsed.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));

  // BARCODE — a bare 8-14 digit run anywhere in the path or query string.
  let barcode: string | null = null;
  const digitCandidates = [...segments, ...Array.from(parsed.searchParams.values())];
  for (const candidate of digitCandidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 14 && digits === candidate.replace(/[^0-9]/g, '') && /^\d+$/.test(candidate)) {
      barcode = digits;
      break;
    }
  }

  // TERMS — the longest word-bearing segment that isn't routing chrome. Product
  // slugs are the longest descriptive part of essentially every retail URL.
  let best = '';
  for (const segment of segments) {
    const cleaned = segment.replace(/\.(html?|php|aspx?)$/i, '');
    if (PATH_NOISE.has(cleaned.toLowerCase())) continue;
    const tokens = meaningfulTokens(cleaned);
    if (tokens.length > meaningfulTokens(best).length) best = cleaned;
  }

  return { terms: meaningfulTokens(best).join(' '), barcode };
}

// Fetch JSON from OFF with a timeout, honouring their per-IP rate limits and a
// short response cache. Returns null on any failure — OFF's endpoints 503 under
// load often enough that a hard throw here would turn a recoverable fallback
// into a dead end.
async function fetchOffJson(url: string, bucket: OffBucket): Promise<any | null> {
  const cached = readOffCache(url);
  if (cached !== undefined) return cached;

  // A slot we can't get in time means we'd be over their published limit;
  // degrade instead of sending the call anyway.
  if (!(await acquireOffSlot(bucket))) return null;

  // Another caller may have populated the cache while we waited for a slot.
  const afterWait = readOffCache(url);
  if (afterWait !== undefined) return afterWait;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': OFF_USER_AGENT, accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[ForageOFF] ${res.status} from ${url}`);
      return null;
    }
    // OFF serves an HTML "temporarily unavailable" page under load, sometimes
    // with a 200 — so parse defensively rather than trusting the status.
    const text = await res.text();
    if (!text.trimStart().startsWith('{')) {
      console.warn(`[ForageOFF] non-JSON body from ${url}: ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
      return null;
    }
    const parsed = JSON.parse(text);
    writeOffCache(url, parsed, bucket);
    return parsed;
  } catch (error: any) {
    console.warn(`[ForageOFF] request failed for ${url}: ${error?.message ?? error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Convert an OFF value into the standard unit grimoire stores that nutrient in.
// Returns null when the units aren't comparable (OFF occasionally carries "%"
// or "IU", neither of which converts without knowing the compound).
function convertToStandardUnit(value: number, fromUnit: string, toUnit: string): number | null {
  const from = fromUnit.trim().toLowerCase() || 'g';
  const to = toUnit.trim().toLowerCase();
  if (from === to) return value;
  if (from in MASS_IN_GRAMS && to in MASS_IN_GRAMS) {
    return (value * MASS_IN_GRAMS[from]) / MASS_IN_GRAMS[to];
  }
  if (from in VOLUME_IN_ML && to in VOLUME_IN_ML) {
    return (value * VOLUME_IN_ML[from]) / VOLUME_IN_ML[to];
  }
  return null;
}

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Trim to label-grade precision. Two sources of nonsense feed in here: unit
// conversion noise (0.04 g → 40.00000001 mg), and OFF's own per-100g figures,
// which are back-computed from a per-serving number and land as 540.54054054054
// kcal. Significant digits rather than decimal places, so a 540 kcal value and a
// 0.00072 g one both survive — no label states more than this anyway.
function tidy(value: number): number {
  if (value === 0) return 0;
  return Number(value.toPrecision(4));
}

// Turn an OFF product document into a normalized match, or null when it carries
// no usable energy figure (a record with a name and nothing else is no better
// than the blocked page).
function normalizeProduct(product: any): OpenFoodFactsMatch | null {
  const nutriments = product?.nutriments;
  if (!nutriments || typeof nutriments !== 'object') return null;

  // PREFER PER-SERVING figures; fall back to the per-100 basis the record was
  // entered in. Mixing the two would silently scale everything wrongly, so the
  // basis is chosen once and every value below is read from that same suffix.
  const hasServing = finiteOrNull(nutriments['energy-kcal_serving']) !== null;
  const suffix = hasServing ? '_serving' : '_100g';
  const per100Basis = String(product?.nutrition_data_per ?? '100g').toLowerCase() === '100ml' ? '100ml' : '100g';
  const values_are_per: OpenFoodFactsMatch['values_are_per'] = hasServing ? 'serving' : per100Basis;

  const read = (key: string, targetUnit: string): number | null => {
    const raw = finiteOrNull(nutriments[`${key}${suffix}`]);
    if (raw === null) return null;
    // OFF expresses `<key>_serving` / `<key>_100g` in the unit named by
    // `<key>_unit` (grams for most nutrients, so that's the default).
    const unit = typeof nutriments[`${key}_unit`] === 'string' ? nutriments[`${key}_unit`] : 'g';
    const converted = convertToStandardUnit(raw, unit, targetUnit);
    return converted === null ? null : tidy(converted);
  };

  // Read directly rather than through `read()` (energy needs no unit
  // conversion), so it has to be tidied here or it keeps OFF's full float.
  const kcalRaw = finiteOrNull(nutriments[`energy-kcal${suffix}`]);
  if (kcalRaw === null) return null;
  const kcal = tidy(kcalRaw);

  const nutrients_by_code: Record<string, number> = {};
  const knownCodes = new Set<string>(NUTRIENT_CODES_IN_ORDER);
  for (const [offKey, code] of Object.entries(OFF_KEY_TO_CODE)) {
    if (!knownCodes.has(code) || code in nutrients_by_code) continue;
    const targetUnit = NUTRIENT_BY_CODE[code as keyof typeof NUTRIENT_BY_CODE]?.unit;
    if (!targetUnit) continue;
    const value = read(offKey, targetUnit);
    if (value !== null) nutrients_by_code[code] = value;
  }

  const brands = Array.isArray(product.brands) ? product.brands.join(', ') : product.brands;

  return {
    code: String(product.code ?? ''),
    name: typeof product.product_name === 'string' ? product.product_name : '',
    brand: typeof brands === 'string' ? brands : '',
    url: `https://world.openfoodfacts.org/product/${product.code}`,
    serving_size_text: typeof product.serving_size === 'string' ? product.serving_size : null,
    values_are_per,
    category_tags: Array.isArray(product.categories_tags)
      ? product.categories_tags.filter((t: unknown): t is string => typeof t === 'string')
      : [],
    image_url:
      typeof product.image_front_small_url === 'string'
        ? product.image_front_small_url
        : typeof product.image_front_url === 'string'
          ? product.image_front_url
          : typeof product.image_url === 'string'
            ? product.image_url
            : null,
    kcal,
    protein_g: read('proteins', 'g'),
    carbs_g: read('carbohydrates', 'g'),
    fat_g: read('fat', 'g'),
    nutrients_by_code,
  };
}

// Score how well an OFF hit matches the words in the link. Returns the share of
// the link's meaningful words that appear in the product's name or brand.
function matchScore(queryTokens: string[], hit: any): { ratio: number; matches: number } {
  const brands = Array.isArray(hit?.brands) ? hit.brands.join(' ') : (hit?.brands ?? '');
  const haystack = new Set(meaningfulTokens(`${hit?.product_name ?? ''} ${brands}`));
  const matches = queryTokens.filter((t) => haystack.has(t)).length;
  return { ratio: queryTokens.length ? matches / queryTokens.length : 0, matches };
}

// Find the Open Food Facts entry for a product we could only identify by its
// link. Returns null whenever we can't be confident, which the caller treats as
// "the site blocked us and we have nothing better".
export async function lookupOpenFoodFacts(opts: {
  terms: string;
  barcode: string | null;
}): Promise<OpenFoodFactsMatch | null> {
  const { terms, barcode } = opts;

  // BARCODE PATH — an exact UPC in the URL beats any amount of name matching.
  if (barcode) {
    const byCode = await fetchOffJson(`${OFF_PRODUCT_URL}/${encodeURIComponent(barcode)}.json`, 'product');
    if (byCode?.status === 1 && byCode.product) {
      const match = normalizeProduct(byCode.product);
      if (match) return match;
    }
  }

  if (!terms) return null;
  const queryTokens = meaningfulTokens(terms);
  if (queryTokens.length === 0) return null;

  const search = await fetchOffJson(
    `${OFF_SEARCH_URL}?q=${encodeURIComponent(terms)}&page_size=${MAX_CANDIDATES}`,
    'search'
  );
  const hits: any[] = Array.isArray(search?.hits) ? search.hits : [];
  if (hits.length === 0) {
    console.warn(`[ForageOFF] search returned no hits for '${terms}'`);
    return null;
  }

  // Keep OFF's own relevance order — it ranks the right product first far more
  // reliably than re-sorting by how complete a record looks, and preferring the
  // fuller record is exactly how a same-brand SIBLING product wins by mistake.
  const candidates = hits
    .map((hit) => ({ hit, score: matchScore(queryTokens, hit) }))
    .filter(({ score }) => score.ratio >= MIN_TOKEN_MATCH_RATIO && score.matches >= MIN_TOKEN_MATCHES)
    .slice(0, MAX_FULL_FETCHES);

  if (candidates.length === 0) {
    console.warn(
      `[ForageOFF] ${hits.length} hits for '${terms}' but none matched closely enough ` +
        `(best: ${hits.map((h) => `${h?.product_name}`).slice(0, 3).join(' | ')})`
    );
    return null;
  }

  for (const { hit } of candidates) {
    const code = String(hit?.code ?? '');
    if (!code) continue;
    const match = await fetchOpenFoodFactsProduct(code);
    if (match) return match;
  }

  return null;
}

// Pull one product by barcode and normalize it. Shared by the blocked-page
// fallback and the food-search fallback's "user picked this result" step.
export async function fetchOpenFoodFactsProduct(code: string): Promise<OpenFoodFactsMatch | null> {
  const full = await fetchOffJson(`${OFF_PRODUCT_URL}/${encodeURIComponent(code)}.json`, 'product');
  if (full?.status !== 1 || !full.product) {
    console.warn(`[ForageOFF] product fetch failed for '${code}'`);
    return null;
  }
  const match = normalizeProduct(full.product);
  if (!match) console.warn(`[ForageOFF] '${code}' (${full.product.product_name}) has no usable energy value`);
  return match;
}

// ============================================================
// FOOD-SEARCH FALLBACK
//
// When a library search comes back empty, the same database backs a "not in your
// library — is it one of these?" list, so the dead end becomes a pick instead of
// a from-scratch create. Kept deliberately cheap: the LIST is built from the
// search response alone (one request, no per-hit product fetch), and only the
// result the user actually taps is pulled in full and turned into a draft.
// ============================================================

// One row in the "from Open Food Facts" list. Energy is whatever basis the
// search index carries — per 100 g/ml — purely so the row can show a number;
// the authoritative figures come from the product fetch on tap.
export interface OpenFoodFactsSuggestion {
  code: string;
  name: string;
  brand: string;
  quantity: string | null;
  kcal_per_100: number | null;
}

// How many hits the prefix pass below scans through. Wider than the list we
// show, because the product being typed toward is ranked among all the other
// results for the words already finished.
const PREFIX_SCAN_PAGE_SIZE = 25;

// Run one search and hand back the raw hits.
async function offSearchHits(terms: string, pageSize: number): Promise<any[]> {
  const search = await fetchOffJson(
    `${OFF_SEARCH_URL}?q=${encodeURIComponent(terms)}&page_size=${Math.max(1, Math.min(pageSize, 25))}`,
    'search'
  );
  return Array.isArray(search?.hits) ? search.hits : [];
}

// Does this hit's name or brand contain a word STARTING with `prefix`?
function hitHasTokenStartingWith(hit: any, prefix: string): boolean {
  const brands = Array.isArray(hit?.brands) ? hit.brands.join(' ') : (hit?.brands ?? '');
  return rawTokens(`${hit?.product_name ?? ''} ${brands}`).some((t) => t.startsWith(prefix));
}

function toSuggestion(hit: any): OpenFoodFactsSuggestion {
  const brands = Array.isArray(hit?.brands) ? hit.brands.join(', ') : hit?.brands;
  return {
    code: String(hit?.code ?? ''),
    name: typeof hit?.product_name === 'string' ? hit.product_name : '',
    brand: typeof brands === 'string' ? brands : '',
    quantity: typeof hit?.quantity === 'string' ? hit.quantity : null,
    kcal_per_100: finiteOrNull(hit?.nutriments?.['energy-kcal_100g']),
  };
}

// Search Open Food Facts for products matching a library query. Returns [] on
// any failure — this is a bonus lane below the user's own foods, never an error
// worth interrupting a search with.
//
// Open Food Facts matches WHOLE WORDS only: "v8 energy straw" finds nothing
// strawberry, because `straw` is its own token and never matches `strawberry`.
// Lucene wildcards (`straw*`) 500 the endpoint and fuzzy (`straw~`) returns
// nothing, so the half-typed last word is handled here instead: search the words
// the user HAS finished, then keep the hits whose name or brand carries a word
// starting with the partial one. That costs a second request only when the
// straightforward search already failed to honour the partial word.
export async function searchOpenFoodFactsSuggestions(
  query: string,
  limit: number
): Promise<OpenFoodFactsSuggestion[]> {
  const terms = query.trim();
  if (terms.length < 2) return [];

  const hits = await offSearchHits(terms, limit);
  const tokens = rawTokens(terms);
  const partial = tokens[tokens.length - 1] ?? '';

  const usable = (list: any[]) => list.map(toSuggestion).filter((s) => s.code && s.name).slice(0, limit);

  // Straightforward search already respects the last word (it was complete, or
  // it happens to prefix something) — nothing more to do.
  if (hits.length > 0 && partial && hits.some((hit) => hitHasTokenStartingWith(hit, partial))) {
    return usable(hits);
  }

  // PREFIX PASS — drop the half-typed word, search the rest, filter back down.
  // Needs at least one finished word to search on; a lone partial ("strawb")
  // has nothing to anchor the search to and falls through.
  if (tokens.length >= 2 && partial) {
    const broader = await offSearchHits(tokens.slice(0, -1).join(' '), PREFIX_SCAN_PAGE_SIZE);
    const narrowed = broader.filter((hit) => hitHasTokenStartingWith(hit, partial));
    if (narrowed.length > 0) return usable(narrowed);
  }

  return usable(hits);
}

// Unit words as they appear in OFF serving strings → the food_units name they
// mean. Ordered longest-first at match time so "fl oz" wins over "oz".
const SERVING_UNIT_WORDS: Array<[RegExp, string]> = [
  [/fl\.?\s*oz\.?|fluid\s+ounces?/i, 'fl oz'],
  [/tbsps?\.?|tablespoons?/i, 'tbsp'],
  [/tsps?\.?|teaspoons?/i, 'tsp'],
  [/grams?|gr?\b/i, 'g'],
  [/kilograms?|kg\b/i, 'kg'],
  [/millilit(?:er|re)s?|ml\b/i, 'ml'],
  [/ounces?|oz\b/i, 'oz'],
  [/pounds?|lbs?\b/i, 'lb'],
  [/cups?/i, 'cup'],
  [/slices?/i, 'slice'],
  // Countable packaging words all collapse to the generic countable unit.
  [/cans?|bottles?|pieces?|portions?|items?|bars?|packets?|pouches|pouch|containers?|sticks?|cookies?|crackers?|eggs?/i, 'piece'],
];

// Parse an Open Food Facts serving string into serving rows: "2 Tbsp (32 g)" →
// [{tbsp,2},{g,32}], "237.0g" → [{g,237}], "1 can (226.8 g)" → [{piece,1},{g,226.8}].
// Only units the app actually knows survive; unparseable text yields [].
export function parseServingSize(text: string | null, knownUnits: Set<string>): LabelOcrDraft['servings'] {
  if (!text) return [];
  const rows: LabelOcrDraft['servings'] = [];
  const seen = new Set<string>();

  // Each "<number><unit word>" pair in the string, in order.
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-zA-Z.\s]{1,20})/g)) {
    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const word = match[2].trim();
    if (!word) continue;

    const hit = SERVING_UNIT_WORDS.find(([re]) => re.test(word));
    if (!hit) continue;
    const unit = hit[1];
    if (seen.has(unit) || !knownUnits.has(unit)) continue;
    seen.add(unit);
    // decimal(10,4) is the units_per_serving column scale.
    rows.push({ unit, units_per_serving: Math.round(amount * 1e4) / 1e4 });
  }

  return rows;
}

// Icon rules, most specific first. Matched against the record's category tags
// and its name/brand, so a record with no categories at all (plenty have none)
// can still be classified off its name.
//
// ORDER IS THE WHOLE DESIGN HERE: drink terms come before fruit terms, because
// "V8 Energy Strawberry Banana" is a soda, not a banana. Anything genuinely
// ambiguous is left to fall through to null rather than guessed at.
const ICON_RULES: Array<[RegExp, string]> = [
  // BEVERAGES — first, so fruit-flavoured drinks don't read as fruit.
  [/\bwaters?\b|mineral-water|spring-water/, 'glass-water'],
  [/\bcoffee|espresso|cappuccino|\bteas?\b|matcha/, 'coffee'],
  [/\bbeers?\b|\blagers?\b|\bales?\b|cider/, 'beer'],
  [/\bwines?\b|champagne|prosecco/, 'wine'],
  [/spirits|liqueur|whisk|vodka|\brum\b|tequila|cocktail/, 'martini'],
  [/milks?\b|dairy-drink|milkshake|creamer/, 'milk'],
  [/sodas?|soft-drink|energy-drink|\bcolas?\b|juice|smoothie|lemonade|beverage|\bdrinks?\b|\benergy\b/, 'cup-soda'],

  // SWEETS & SNACKS — before produce, since these are usually flavoured.
  [/ice-cream|gelato|sorbet/, 'ice-cream'],
  [/chocolate|confection|candies|\bcandy\b|gummi|caramel|nougat/, 'candy'],
  [/lollipop/, 'lollipop'],
  [/cookies?|biscuits?/, 'cookie'],
  [/donuts?|doughnuts?/, 'donut'],
  [/cakes?|brownie|muffin/, 'cake'],
  [/pudding|custard|yogh?urts?|yaourt/, 'dessert'],
  [/popcorn/, 'popcorn'],
  [/crisps|potato-chips|salty-snacks|\bsnacks?\b|pretzel|crackers?/, 'popcorn'],
  [/croissant|pastr|\bdanish\b|scone/, 'croissant'],

  // PROTEIN
  [/\beggs?\b|omelett?e/, 'egg'],
  [/shrimps?|prawns?|\bcrab\b|lobster/, 'shrimp'],
  [/\bfish\b|salmon|tuna|cod\b|seafood|sardine|anchov/, 'fish'],
  [/chicken|poultry|turkey|\bduck\b/, 'drumstick'],
  [/\bhams?\b|bacon|\bpork\b|sausage|salami|charcuterie/, 'ham'],
  [/\bbeef\b|steak|\bveal\b|\blamb\b|\bmeats?\b/, 'beef'],

  // PANTRY / PLANT
  [/peanut-butter|nut-butter|\bnuts?\b|almond|cashew|pistachio|walnut|peanut/, 'nut'],
  [/legume|\bbeans?\b|lentil|chickpea|\bpeas\b|hummus/, 'bean'],
  [/breads?\b|cereals?|pasta|noodle|\brice\b|grain|flour|oats?\b|granola|tortilla/, 'wheat'],

  // PRODUCE
  [/apples?\b|applesauce/, 'apple'],
  [/bananas?\b|plantain/, 'banana'],
  [/cherr(?:y|ies)|berr(?:y|ies)|strawberr|raspberr|blueberr/, 'cherry'],
  [/grapes?\b|raisin/, 'grape'],
  [/citrus|oranges?\b|lemons?\b|limes?\b|grapefruit|mandarin/, 'citrus'],
  [/carrots?\b|\broot-vegetable/, 'carrot'],
  [/salads?\b|lettuce|spinach|\bgreens\b|\bkale\b|vegetables?\b/, 'salad'],

  // PREPARED DISHES
  [/pizzas?\b/, 'pizza'],
  [/burgers?\b|hamburger/, 'hamburger'],
  [/sandwich|\bwraps?\b|\bsubs?\b|burrito|taco/, 'sandwich'],
  [/soups?\b|broth|bisque/, 'soup'],
  [/stew|casserole|curry|chili/, 'cooking-pot'],
  [/meals?\b|entree|dinner|prepared/, 'utensils'],
];

// Root categories that classify nothing. `en:plant-based-foods-and-beverages`
// in particular sits on peanut butter and potato crisps alike and contains the
// word "beverages" — left in, it makes every plant-based food read as a drink.
const UMBRELLA_CATEGORY_TAGS = new Set([
  'en:plant-based-foods-and-beverages',
  'en:plant-based-foods',
  'en:foods',
  'en:groceries',
  'en:farming-products',
]);

// Best-guess icon for an Open Food Facts record, or null when nothing fits.
// This exists because the search-pick path deliberately skips the LLM (a result
// has to open instantly), and a food with no icon AND no photo renders as the
// generic default — which is what "the workflow skips setting an icon" looked
// like.
export function inferIconCode(match: OpenFoodFactsMatch): string | null {
  const tags = match.category_tags.filter((t) => !UMBRELLA_CATEGORY_TAGS.has(t.toLowerCase()));
  const haystack = `${tags.join(' ')} ${match.name} ${match.brand}`.toLowerCase();
  for (const [pattern, code] of ICON_RULES) {
    if (pattern.test(haystack)) return code;
  }
  return null;
}

// Turn a normalized OFF match into the same draft shape a label scan produces,
// WITHOUT an LLM round-trip — a search result has to open instantly, and every
// field here is a direct copy or a deterministic parse.
export function buildDraftFromMatch(match: OpenFoodFactsMatch, knownUnits: Set<string>): LabelOcrDraft {
  // SERVINGS — from the stated serving text when the numbers are per serving,
  // otherwise the 100 g/ml basis the record was entered in. A per-serving record
  // whose serving text won't parse still has valid per-serving numbers, so it
  // falls back to a single unnamed countable unit rather than losing them.
  let servings: LabelOcrDraft['servings'];
  if (match.values_are_per === 'serving') {
    const parsed = parseServingSize(match.serving_size_text, knownUnits);
    servings = parsed.length > 0 ? parsed : [{ unit: 'unit', units_per_serving: 1 }];
  } else {
    servings = [{ unit: match.values_are_per === '100ml' ? 'ml' : 'g', units_per_serving: 100 }];
  }

  const barcodeDigits = match.code.replace(/\D/g, '');

  return {
    name: match.name,
    brand: match.brand,
    barcode_upc: barcodeDigits.length >= 8 ? barcodeDigits : null,
    // Inferred from the record's categories/name rather than asked of an LLM,
    // so the wizard opens instantly. Null when nothing fits — the user picks.
    icon: inferIconCode(match),
    // Gate-keeping field for the whole nutrition block. normalizeProduct only
    // returns a match when it carries an energy value, so this is always true.
    serving_size_stated: true,
    servings: servings.filter((s) => knownUnits.has(s.unit)),
    kcal_per_serving: match.kcal,
    protein_g_per_serving: match.protein_g,
    carbs_g_per_serving: match.carbs_g,
    fat_g_per_serving: match.fat_g,
    nutrients_by_code: match.nutrients_by_code,
  };
}
