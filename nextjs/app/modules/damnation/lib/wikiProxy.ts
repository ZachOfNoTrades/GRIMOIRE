import { buildWikiSearchUrl } from "./constants";
import { DamnationError } from "./errors";
import { wikiConfig } from "./wikiConfig";

// The wiki panel shows pages through Grimoire rather than framing the wiki directly. A framed page
// follows its links inside the frame, and many of them (Scryfall, for every card name on mtg.wiki)
// point at sites that refuse to be framed, leaving a blank panel. Fetching the page here lets us
// add a small script that hands each link to the panel instead: wiki pages stay in the panel,
// Scryfall card links become a card view, and anything else opens in a new tab.
//
// Only the configured wiki's host is ever fetched, so this can't be used as an open proxy. The
// page is served with a sandbox CSP, so its scripts run in an opaque origin with no access to
// Grimoire's cookies or storage, even if the address is opened outside the panel.

const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
export const WIKI_URL_MAX_LENGTH = 2000;

export const WIKI_PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export type WikiPage = { kind: "html"; url: string; html: string } | { kind: "redirect"; url: string };

// The host the wiki panel may show, or null when results open in a new tab instead.
export function wikiHost(): string | null {
  const { wiki_search_template, wiki_embed } = wikiConfig();
  if (!wiki_embed) return null;
  return new URL(buildWikiSearchUrl(wiki_search_template, "x")).hostname;
}

function requireWikiUrl(raw: string, host: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DamnationError(400, "Not a wiki address");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.hostname !== host || url.username || url.password) {
    throw new DamnationError(400, "Not a wiki address");
  }
  url.hash = "";
  return url;
}

async function readCapped(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BYTES) throw new DamnationError(502, "That page is too large to show here");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new DamnationError(502, "That page is too large to show here");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=([^;\s]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Runs first in the page. Links resolve against <base> (the real page address), so a plain
// same-page anchor would leave for the real site; those scroll here instead.
function linkScript(pageUrl: string): string {
  const page = JSON.stringify(pageUrl).replace(/</g, "\\u003c");
  return `(function () {
  var page = new URL(${page});
  function samePage(url) {
    return url.origin === page.origin && url.pathname === page.pathname && url.search === page.search;
  }
  function route(url, event) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    event.preventDefault();
    if (samePage(url)) {
      if (url.hash) location.hash = url.hash;
      return;
    }
    var scryfall = /(^|\\.)scryfall\\.com$/.test(url.hostname) && /^\\/(search|card\\/)/.test(url.pathname);
    if (url.hostname === page.hostname || scryfall) {
      parent.postMessage({ damnationWiki: "navigate", url: url.href }, "*");
    } else {
      window.open(url.href, "_blank", "noopener");
    }
  }
  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (link) route(new URL(link.href), event);
  });
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (event.defaultPrevented || !(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get") return;
    var url = new URL(form.action || page.href);
    try {
      url.search = new URLSearchParams(new FormData(form, event.submitter)).toString();
    } catch (error) {
      url.search = new URLSearchParams(new FormData(form)).toString();
    }
    route(url, event);
  });
})();`;
}

function preparePage(html: string, pageUrl: string): string {
  const inject = `<base href="${escapeAttribute(pageUrl)}"><script>${linkScript(pageUrl)}</script>`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (!head) return inject + html;
  const at = head.index + head[0].length;
  return html.slice(0, at) + inject + html.slice(at);
}

// Fetches a wiki page for the panel, following redirects that stay on the wiki. Anything that
// isn't a web page (an image, a download) is sent to the real address instead.
export async function fetchWikiPage(raw: string | null): Promise<WikiPage> {
  const host = wikiHost();
  if (!host) throw new DamnationError(404, "The wiki panel is turned off");
  if (!raw || raw.length > WIKI_URL_MAX_LENGTH) throw new DamnationError(400, "Not a wiki address");
  let url = requireWikiUrl(raw, host);

  for (let hop = 0; ; hop += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; Grimoire Damnation wiki panel)" },
      });
    } catch {
      throw new DamnationError(502, "The wiki didn't answer");
    }

    if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
      await response.body?.cancel();
      const next = new URL(response.headers.get("location")!, url);
      if (next.hostname !== host) return { kind: "redirect", url: next.toString() };
      if (hop >= MAX_REDIRECTS) throw new DamnationError(502, "The wiki redirected too many times");
      url = requireWikiUrl(next.toString(), host);
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/^text\/html|^application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel();
      return { kind: "redirect", url: url.toString() };
    }
    // Error pages (a missing article is a 404) are still pages worth showing.
    const html = decode(await readCapped(response), contentType);
    return { kind: "html", url: url.toString(), html: preparePage(html, url.toString()) };
  }
}

// A plain page for when a wiki page can't be shown; the panel's own new-tab link still works.
export function wikiErrorPage(message: string): string {
  const text = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="font: 14px system-ui, sans-serif; padding: 1rem">${text}</body>`;
}
