import { NextResponse } from "next/server";
import { DamnationError } from "@/app/modules/damnation/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/app/modules/damnation/lib/rateLimit";
import { fetchWikiPage, WIKI_PAGE_HEADERS, wikiErrorPage } from "@/app/modules/damnation/lib/wikiProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/damnation/wiki?url=<wiki page> — a page of the configured wiki for the wiki panel, with
// its links handed to the panel (see lib/wikiProxy.ts). Public: guests use the panel too.
export async function GET(request: Request) {
  try {
    enforceRateLimit("wiki", request, RATE_LIMITS.wiki.limit, RATE_LIMITS.wiki.windowMs);
    const page = await fetchWikiPage(new URL(request.url).searchParams.get("url"));
    if (page.kind === "redirect") return NextResponse.redirect(page.url, 302);
    return new Response(page.html, { headers: WIKI_PAGE_HEADERS });
  } catch (error) {
    if (!(error instanceof DamnationError)) console.error("Error in GET /api/damnation/wiki:", error);
    const status = error instanceof DamnationError ? error.status : 502;
    const message = error instanceof DamnationError ? error.message : "The wiki page couldn't be shown";
    return new Response(wikiErrorPage(message), { status, headers: WIKI_PAGE_HEADERS });
  }
}
