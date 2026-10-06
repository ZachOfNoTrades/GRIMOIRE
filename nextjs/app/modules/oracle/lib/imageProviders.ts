import type { EntityKind, OracleImage } from "../types/oracle";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "./constants";
import type { TextModel } from "./constants";
import { OracleError } from "./errors";
import { saveImage } from "./imageFunctions";
import { generateJson } from "./llm";
import { resolveBackend } from "@/lib/llm/generate";
import { recordUsage } from "@/lib/llm/usage";
import { getOpenRouterKeyStatus, withOpenRouterKey } from "@/lib/llm/userKeys";
import { LlmBackendError, redactSecrets } from "@/lib/llm/types";

// WHERE NEW PICTURES COME FROM — two sources, offered side by side wherever a picture is added:
//
//   search    look the subject up on Openverse (openly licensed photos and artwork) and keep one
//   generate  have an image model draw it, through OpenRouter
//
// Search needs no account. Generation is paid per image through OpenRouter on the DM's OWN key
// (Settings → AI); there is no app-wide key. Without one the option is shown, marked unavailable.

export interface ImageSourceInfo {
  key: "search" | "generate";
  label: string;
  available: boolean;
  note: string | null;
}

export async function listImageSources(userId: string): Promise<ImageSourceInfo[]> {
  const canGenerate = (await getOpenRouterKeyStatus(userId)).configured;
  return [
    { key: "search", label: "Search the web", available: true, note: null },
    { key: "generate", label: "Generate", available: canGenerate, note: canGenerate ? null : "Needs an OpenRouter key in Settings → AI" },
  ];
}

export interface ImageCandidate {
  id: string;
  title: string;
  thumbnail: string; // a small version, loaded straight from the picture's own host
  full: string; // the version that is saved when the picture is kept
  credit: string;
}

// ---------------------------------------------------------------------------------------------
// SEARCH — Openverse
// ---------------------------------------------------------------------------------------------

const OPENVERSE = "https://api.openverse.org/v1/images";
// Openverse asks API users to identify themselves.
const USER_AGENT = "Grimoire-Oracle/1.0 (https://grimoire.zsmith.io)";
const OPENVERSE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Anonymous use is limited to 20 requests a minute and 200 a day. Stay well inside the burst
// limit ourselves instead of finding it by being refused.
const SEARCH_WINDOW_MS = 60_000;
const SEARCH_MAX_PER_WINDOW = 12;
const recentSearches: number[] = [];

function takeSearchSlot(): void {
  const now = Date.now();
  while (recentSearches.length > 0 && now - recentSearches[0] > SEARCH_WINDOW_MS) recentSearches.shift();
  if (recentSearches.length >= SEARCH_MAX_PER_WINDOW) {
    throw new OracleError(429, "Too many searches in a row. Wait a minute and try again.");
  }
  recentSearches.push(now);
}

// WHERE THE PICTURE ITSELF COMES FROM. Openverse is only the index; its own thumbnail endpoint
// turned out to be unreliable (it answers 424 "unavailable from provider" on and off for
// pictures that load fine from their host), so pictures are loaded from the two hosts that
// supply nearly all results, in the sizes those hosts publish. A result on any other host is
// skipped — which also means the server only ever downloads from these two known hosts.
function pictureVariants(sourceUrl: string): { small: string; large: string } | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  // Flickr: <id>_<secret>[_<size>].jpg — "_n" is 320 px wide, "_b" is 1024.
  if (url.hostname === "live.staticflickr.com") {
    const match = url.pathname.match(/^(\/[0-9]+\/[0-9]+_[0-9a-f]+)(?:_[a-z0-9])?\.jpg$/i);
    if (!match) return null;
    return { small: `https://live.staticflickr.com${match[1]}_n.jpg`, large: `https://live.staticflickr.com${match[1]}_b.jpg` };
  }

  // Wikimedia Commons: /wikipedia/commons/a/ab/File.jpg has thumbnails at
  // /wikipedia/commons/thumb/a/ab/File.jpg/<width>px-File.jpg, in a fixed set of widths.
  if (url.hostname === "upload.wikimedia.org") {
    const match = url.pathname.match(/^\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2}\/([^/]+\.(?:jpe?g|png|gif|webp)))$/i);
    if (!match) return null;
    const base = `https://upload.wikimedia.org/wikipedia/commons/thumb/${match[1]}`;
    return { small: `${base}/330px-${match[2]}`, large: `${base}/1280px-${match[2]}` };
  }
  return null;
}

function toCandidate(entry: unknown): ImageCandidate | null {
  const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
  if (typeof item.id !== "string" || !OPENVERSE_ID.test(item.id) || typeof item.url !== "string") return null;
  const variants = pictureVariants(item.url);
  if (!variants) return null;
  return {
    id: item.id.toLowerCase(),
    title: typeof item.title === "string" ? item.title.slice(0, 80) : "Untitled",
    thumbnail: variants.small,
    full: variants.large,
    credit: [typeof item.creator === "string" ? item.creator : null, typeof item.license === "string" ? `CC ${item.license.toUpperCase()}` : null]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 80),
  };
}

async function openverseSearch(query: string, artworkOnly: boolean): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({ q: query, page_size: "20", mature: "false" });
  if (artworkOnly) params.set("category", "illustration,digitized_artwork");
  const response = await fetch(`${OPENVERSE}/?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 429) throw new OracleError(429, "The image search is busy. Try again in a minute.");
  if (!response.ok) throw new OracleError(502, "The image search didn't answer. Try again.");
  const body = (await response.json()) as { results?: unknown };
  return (Array.isArray(body.results) ? body.results : []).map(toCandidate).filter((candidate): candidate is ImageCandidate => candidate !== null);
}

// WHAT TO SEARCH FOR. Openverse matches words in titles and tags, so an entry's own name ("Inquisitor
// Voss", "Castellan Estate escape route") finds little or the wrong thing. A short model call turns
// the subject into the plain words a photo or artwork library would carry, with invented names
// dropped. Answers are cached; a failure falls back to the words as given.
const termsCache = new Map<string, string>();
const TERMS_CACHE_MAX = 500;

export async function searchTermsFor(userId: string, subject: string, world: string, model: TextModel, detail = ""): Promise<string> {
  const key = `${subject.trim().toLowerCase()}|${detail.trim().toLowerCase().slice(0, 200)}`;
  const cached = termsCache.get(key);
  if (cached) return cached;
  const prompt = `A game master wants a picture for something at a fantasy tabletop game. Turn the subject into 2 or 3 plain English search words for a library of photographs and public-domain artwork (museum paintings, old illustrations, nature photos). Every word must match, so use only the most essential: the kind of thing first (crab, knight, manor, tower, forest), then one word for its look or period. Never include invented proper names or adjectives like "aggressive".
Subject: ${subject.slice(0, 160)}
${detail ? `What is known about it: ${detail.slice(0, 400)}` : ""}
${world ? `Setting: ${world.slice(0, 300)}` : ""}
Answer with JSON only: { "terms": "<search words>" }`;
  try {
    const result = (await generateJson(userId, "picture", prompt, { model, timeoutMs: 30_000 })) as { terms?: unknown };
    const terms = typeof result.terms === "string" ? result.terms.replace(/[^\p{L}\p{N} '-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const chosen = terms || subject;
    if (termsCache.size >= TERMS_CACHE_MAX) termsCache.clear();
    termsCache.set(key, chosen);
    return chosen;
  } catch (error) {
    console.error("Oracle picture terms failed:", error);
    return subject;
  }
}

// Search the rewritten words; when nothing comes back, drop words from the end, then try the
// subject as typed. Returns the words that produced the results.
export async function searchImagesWithFallback(terms: string, subject: string): Promise<{ terms: string; candidates: ImageCandidate[] }> {
  const attempts: string[] = [];
  const words = terms.split(" ").filter(Boolean);
  for (let count = words.length; count >= 1; count -= 1) attempts.push(words.slice(0, count).join(" "));
  if (!attempts.includes(subject)) attempts.push(subject);
  let last: { terms: string; candidates: ImageCandidate[] } = { terms, candidates: [] };
  for (const attempt of attempts) {
    const candidates = await searchImages(attempt);
    last = { terms: attempt, candidates };
    if (candidates.length > 0) return last;
  }
  return last;
}

// Artwork first, because a drawing fits a fantasy table better than a photo; when that finds
// little, everything.
export async function searchImages(query: string): Promise<ImageCandidate[]> {
  takeSearchSlot();
  try {
    const artwork = await openverseSearch(query, true);
    if (artwork.length >= 6) return artwork.slice(0, 12);
    const everything = await openverseSearch(query, false);
    const seen = new Set(artwork.map((candidate) => candidate.id));
    return [...artwork, ...everything.filter((candidate) => !seen.has(candidate.id))].slice(0, 12);
  } catch (error) {
    if (error instanceof OracleError) throw error;
    console.error("Oracle image search failed:", error);
    throw new OracleError(502, "The image search didn't answer. Try again.");
  }
}

// PICTURES FOR THE BANNER — the same search, used in the background. It must never spend the
// search allowance the DM's own searches need, so it draws on a small cache (one search feeds
// several banner items) and simply finds nothing when the allowance is short.
const inspirationCache = new Map<string, { at: number; candidates: ImageCandidate[] }>();
const INSPIRATION_CACHE_MS = 6 * 60 * 60 * 1000;
const INSPIRATION_CACHE_MAX = 200;

export async function findInspirationImage(query: string, excludeIds: Set<string>): Promise<ImageCandidate | null> {
  const key = query.toLowerCase();
  let entry = inspirationCache.get(key);
  if (!entry || Date.now() - entry.at > INSPIRATION_CACHE_MS) {
    const now = Date.now();
    while (recentSearches.length > 0 && now - recentSearches[0] > SEARCH_WINDOW_MS) recentSearches.shift();
    // Leave most of the per-minute allowance to the DM's own searches.
    if (recentSearches.length >= SEARCH_MAX_PER_WINDOW / 2) return null;
    recentSearches.push(now);
    try {
      entry = { at: now, candidates: await openverseSearch(query, false) };
    } catch {
      return null;
    }
    if (inspirationCache.size >= INSPIRATION_CACHE_MAX) inspirationCache.clear();
    inspirationCache.set(key, entry);
  }
  const fresh = entry.candidates.filter((candidate) => !excludeIds.has(candidate.id));
  // The first few results are the most relevant; start at a random one of them so repeats of a
  // query vary. An index entry can outlive its picture, so each candidate is checked before it
  // is put on the banner, and a dead one is dropped from the cache.
  const start = Math.floor(Math.random() * Math.min(4, Math.max(fresh.length, 1)));
  for (let offset = 0; offset < Math.min(3, fresh.length); offset += 1) {
    const candidate = fresh[(start + offset) % fresh.length];
    if (await pictureLoads(candidate.thumbnail)) return candidate;
    entry.candidates = entry.candidates.filter((other) => other.id !== candidate.id);
  }
  return null;
}

async function pictureLoads(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8_000) });
    await response.body?.cancel();
    return response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

// Download a picture into the campaign's library. `url` must be one this module built itself
// (pictureVariants), so the server only ever fetches from the two known picture hosts.
export async function importPicture(campaignId: string, url: string, caption: string): Promise<OracleImage> {
  const allowed = pictureVariants(url);
  if (!allowed || (url !== allowed.small && url !== allowed.large)) throw new OracleError(400, "That picture can't be used");
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    console.error("Oracle image import failed:", error);
    throw new OracleError(502, "Couldn't download that picture. Try another one.");
  }
  if (!response.ok) throw new OracleError(502, "Couldn't download that picture. Try another one.");
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES[contentType]) throw new OracleError(502, "That picture is in a format that can't be used. Try another one.");
  if (Number(response.headers.get("content-length") ?? "0") > MAX_IMAGE_BYTES) throw new OracleError(413, "That picture is too large. Try another one.");
  const bytes = Buffer.from(await response.arrayBuffer());
  return saveImage(campaignId, caption, contentType, bytes);
}

// Keep a search result the DM picked. The browser sends only the result's id; the address to
// download is looked up from the index again here, never taken from the request.
export async function importSearchImage(campaignId: string, sourceId: string, caption: string): Promise<OracleImage> {
  if (!OPENVERSE_ID.test(sourceId)) throw new OracleError(400, "Unknown search result");
  let detail: unknown;
  try {
    const response = await fetch(`${OPENVERSE}/${sourceId.toLowerCase()}/`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    detail = await response.json();
  } catch (error) {
    console.error("Oracle image lookup failed:", error);
    throw new OracleError(502, "Couldn't look that picture up. Try another one.");
  }
  const candidate = toCandidate(detail);
  if (!candidate) throw new OracleError(400, "That picture can't be used. Try another one.");
  return importPicture(campaignId, candidate.full, caption);
}

// ---------------------------------------------------------------------------------------------
// GENERATE — OpenRouter image API
// ---------------------------------------------------------------------------------------------

const IMAGE_STYLE = "Painted fantasy illustration, inked linework, muted palette, tabletop RPG art. No text, no lettering, no border, no watermark.";

// `kind` picks the framing: a portrait for a creature, person or item, a scene for a location.
// Runs on the DM's own OpenRouter key with the model from their `oracle_image` task setting; the
// key is decrypted inside withOpenRouterKey and used for this one request.
// With `reference`, the model paints over that picture (a map's shape layout) using its own prompt
// and aspect ratio instead of the portrait/scene framing.
export interface ImageReference {
  png: Buffer;
  prompt: string;
  aspectRatio: string;
}

export async function generateImage(userId: string, campaignId: string, prompt: string, world: string, caption: string, detail = "", kind: EntityKind | null = null, reference: ImageReference | null = null): Promise<OracleImage> {
  const { model } = await resolveBackend(userId, "oracle_image");
  const framing = kind === "place" ? "A view of the place." : kind === "item" ? "A single object, centered." : kind ? "A portrait, the subject filling the frame." : "";
  const fullPrompt = reference ? reference.prompt : `${prompt}.${detail ? ` ${detail.slice(0, 500)}` : ""} ${framing} ${IMAGE_STYLE}${world ? ` Setting: ${world.slice(0, 400)}` : ""}`.replace(/\s+/g, " ");
  const started = Date.now();
  const usage = (ok: boolean, errorCode: string | null, costUsd: number | null = null) =>
    recordUsage({ userId, task: "oracle_image", backend: "openrouter", model, promptTokens: 0, completionTokens: 0, costUsd, durationMs: Date.now() - started, ok, errorCode });

  let body: { data?: { b64_json?: string; media_type?: string }[]; usage?: { cost?: number } };
  try {
    body = await withOpenRouterKey(userId, async (apiKey) => {
      let response: Response;
      try {
        response = await fetch("https://openrouter.ai/api/v1/images", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://grimoire.zsmith.io", "X-OpenRouter-Title": "GRIMOIRE" },
          body: JSON.stringify({
            model,
            prompt: fullPrompt,
            ...(reference ? { input_references: [{ type: "image_url", image_url: { url: `data:image/png;base64,${reference.png.toString("base64")}` } }] } : {}),
            aspect_ratio: reference ? reference.aspectRatio : kind && kind !== "place" ? "1:1" : "4:3",
            n: 1,
            output_format: "jpeg",
            usage: { include: true },
          }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (error) {
        console.error("Oracle image generation failed:", redactSecrets(error instanceof Error ? error.message : String(error)));
        throw new OracleError(502, "The image generator didn't answer. Try again.");
      }
      if (!response.ok) {
        console.error(`Oracle image generation failed with status: '${response.status}'`, redactSecrets((await response.text().catch(() => "")).slice(0, 300)));
        throw new OracleError(502, response.status === 401 || response.status === 403 ? "OpenRouter rejected your key. Check it in Settings → AI." : "The image generator refused the request. Try a different description.");
      }
      return (await response.json()) as typeof body;
    });
  } catch (error) {
    usage(false, error instanceof LlmBackendError ? error.code : "openrouter_error");
    if (error instanceof LlmBackendError) throw new OracleError(error.status, error.message);
    throw error;
  }
  const first = body.data?.[0];
  if (!first?.b64_json) {
    usage(false, "bad_response");
    throw new OracleError(502, "The image generator returned nothing. Try again.");
  }
  usage(true, null, typeof body.usage?.cost === "number" ? body.usage.cost : null);
  const contentType = first.media_type && ALLOWED_IMAGE_TYPES[first.media_type] ? first.media_type : "image/jpeg";
  return saveImage(campaignId, caption, contentType, Buffer.from(first.b64_json, "base64"));
}
