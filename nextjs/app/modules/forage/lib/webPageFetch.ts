import { lookup } from 'dns/promises';
import { isIP } from 'net';

// Shared, SSRF-guarded page fetcher for every forage feature that pulls data
// from a user-supplied link — the recipe URL import (recipeUrlLLM) and the food
// source-link import / resync (foodUrlLLM). Lives on its own so both paths get
// the identical guard, timeout, size cap and headless-browser fallback.

const FETCH_TIMEOUT_MS = 10_000;
const BROWSER_NAV_TIMEOUT_MS = 25_000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB page cap
const MAX_REDIRECTS = 5;

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Statuses that, from a content site, almost always mean "bot protection" rather
// than a genuine error — worth retrying through a real headless browser.
const BOT_BLOCK_STATUSES = new Set([401, 403, 429, 503]);

// Raised when a page is unreachable because the site is walling us out, as
// opposed to being unreadable for content reasons. Callers branch on this to
// offer a different route to the same data (see foodUrlLLM's Open Food Facts
// fallback) instead of just reporting failure.
export class SiteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiteBlockedError';
  }
}

// Bot walls that answer with a normal 200 — Imperva/Incapsula in particular
// serves its JS challenge as a ~1 KB HTTP 200 document, so status codes alone
// miss it and the challenge stub gets passed downstream as if it were the page.
// Split by confidence: STRONG markers are vendor strings no real page carries,
// while GENERIC ones are ordinary English that only means "wall" on a stub, so
// they're checked against small documents only.
const STRONG_WALL_MARKERS = [
  /_Incapsula_Resource/i,
  /Incapsula incident ID/i,
  /cf-browser-verification|cf_chl_opt|\/cdn-cgi\/challenge-platform/i,
  /px-captcha|_pxhc|PerimeterX/i,
  /DataDome|datadome\.co/i,
  /Pardon Our Interruption/i,
  /Checking your browser before accessing/i,
];
const GENERIC_WALL_MARKERS = [
  /Request unsuccessful/i,
  /Just a moment\s*(?:\.\.\.|…)/i,
  /Access (?:to this page has been )?denied/i,
  /Attention Required!/i,
  /enable JavaScript and cookies to continue/i,
];
// Wall stubs are tiny; a real product page mentioning one of the generic
// phrases in its copy is not. Only documents under this size are eligible for
// a generic-marker match.
const WALL_STUB_MAX_CHARS = 20_000;

// True when a fetched document is a bot wall rather than real page content.
export function looksLikeBotWall(html: string): boolean {
  if (!html.trim()) return true;
  if (STRONG_WALL_MARKERS.some((re) => re.test(html))) return true;
  return html.length <= WALL_STUB_MAX_CHARS && GENERIC_WALL_MARKERS.some((re) => re.test(html));
}

// ============================================================
// SSRF guard
//
// This box shares a LAN with internal services (Infisical, notify-relay,
// mssql on localhost). A user-supplied URL fetched server-side is a classic
// SSRF pivot, so every hop is validated: http(s) only, and the host must
// resolve exclusively to public addresses. Redirects are followed manually so
// a public URL can't 302 into the LAN.
// ============================================================

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0) return true; // 192.0.0/24, 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a >= 224) return true; // multicast + reserved 224+/3
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4.
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true; // fe80::/10 link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // fc00::/7 ULA
  if (v.startsWith('ff')) return true; // multicast
  return false;
}

function addressIsPrivate(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return ipv4IsPrivate(ip);
  if (fam === 6) return ipv6IsPrivate(ip);
  return true; // not a parseable IP → refuse
}

// Validate one URL: scheme + that the hostname resolves only to public IPs.
// Returns the parsed URL on success, throws a user-safe error otherwise.
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) links are supported');
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip [] off IPv6 literals
  if (host.toLowerCase() === 'localhost') {
    throw new Error('That link points to a private address');
  }
  // Literal IP host — check directly (no DNS).
  if (isIP(host)) {
    if (addressIsPrivate(host)) throw new Error('That link points to a private address');
    return url;
  }
  // Hostname — every resolved address must be public.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error('Could not resolve that link');
  }
  if (addrs.length === 0 || addrs.some((a) => addressIsPrivate(a.address))) {
    throw new Error('That link points to a private address');
  }
  return url;
}

// Fetch a page with the SSRF guard applied to every redirect hop, a hard timeout,
// and a response-size cap. Returns the raw HTML. `blockedHint` is appended to the
// bot-wall error so each caller can suggest its own fallback path.
export async function fetchWebPage(rawUrl: string, blockedHint = ''): Promise<string> {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await assertSafeUrl(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(safe.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        // A fuller browser-like header set clears naive User-Agent gates. It
        // can't beat JS/Cloudflare bot-walls (those still 403/503) — that's
        // surfaced as an actionable error below.
        headers: {
          'user-agent': BROWSER_UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'sec-ch-ua': '"Chromium";v="124", "Not:A-Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new Error('That link took too long to load');
      throw new Error('Could not load that link');
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect handling — re-validate the Location target.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Could not load that link');
      current = new URL(loc, safe).toString();
      continue;
    }

    if (!res.ok) {
      // Bot-protection statuses → retry through a real headless browser, which
      // clears the softer JS/UA walls a plain fetch can't. If that's also
      // blocked (hard Cloudflare challenge), surface an actionable message.
      if (BOT_BLOCK_STATUSES.has(res.status)) {
        return await retryThroughBrowser(safe.toString(), blockedHint, res.status);
      }
      throw new Error(`That link returned ${res.status}`);
    }

    const html = await readCapped(res);
    // A 200 is not proof we got the page: Incapsula and DataDome both serve
    // their challenge as a normal 200. Same treatment as a 403 — try a real
    // browser, and call it blocked when that's walled too.
    if (looksLikeBotWall(html)) {
      return await retryThroughBrowser(safe.toString(), blockedHint);
    }
    return html;
  }

  throw new Error('That link redirected too many times');
}

// Read a response body with a byte cap so a huge page can't exhaust memory.
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Second attempt at a walled page through headless Chromium, normalizing both
// outcomes into a SiteBlockedError so callers can offer another route to the
// data. `status` is included in the message when a status code triggered this.
async function retryThroughBrowser(url: string, blockedHint: string, status?: number): Promise<string> {
  try {
    return await fetchWebPageViaBrowser(url);
  } catch (err: any) {
    if (err instanceof SiteBlockedError) throw err;
    throw new SiteBlockedError(
      `That site blocked the import${status ? ` (${status})` : ''}.${blockedHint ? ` ${blockedHint}` : ''}`
    );
  }
}

// Fallback for sites that bot-block a plain fetch: load the page in headless
// Chromium so soft JS/UA walls (and cookie-setting challenges) are satisfied by
// a real browser, then return the rendered HTML.
//
// SSRF stays enforced: Chromium does its OWN DNS + follows redirects/subresources
// to arbitrary hosts, so request interception re-applies assertSafeUrl to EVERY
// request and aborts anything that resolves into private space. Heavy resource
// types are dropped (we only need text + JSON-LD), which also shrinks the attack
// surface and speeds the load.
export async function fetchWebPageViaBrowser(startUrl: string): Promise<string> {
  // Re-validate up front (caller already did, but be defensive for direct use).
  await assertSafeUrl(startUrl);

  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(BROWSER_UA);
    await page.setRequestInterception(true);

    page.on('request', (req) => {
      void (async () => {
        const type = req.resourceType();
        // We extract from text/JSON-LD only — block heavy/irrelevant subresources.
        if (type === 'image' || type === 'media' || type === 'font' || type === 'stylesheet') {
          await req.abort().catch(() => {});
          return;
        }
        try {
          // The SSRF guard, re-applied to navigation + every subresource/redirect.
          await assertSafeUrl(req.url());
          await req.continue().catch(() => {});
        } catch {
          await req.abort().catch(() => {});
        }
      })();
    });

    // networkidle2 gives JS-rendered content a chance to settle; on timeout we
    // still read whatever rendered rather than failing outright.
    try {
      await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: BROWSER_NAV_TIMEOUT_MS });
    } catch {
      /* timeout / nav interruption — fall through to whatever rendered */
    }

    const html = await page.content();
    // about:blank-ish, or the wall rendered again — a hard block (IP/reputation
    // based) looks identical in a real browser, and its block page is bigger
    // than the old 200-byte floor, so the marker check does the real work here.
    if (!html || html.length < 200 || looksLikeBotWall(html)) {
      throw new SiteBlockedError('That site blocked the import.');
    }
    console.log(`[ForageWebFetch] browser fallback rendered ${html.length} bytes`);
    return html;
  } finally {
    await browser.close().catch(() => {});
  }
}

// Crude HTML→text for the fallback path when no structured data is present.
// `maxChars` caps how much of the page a caller feeds its LLM prompt.
export function htmlToText(html: string, maxChars: number): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}
