"use client";

import { ArrowLeft, BookOpen, ExternalLink, Search } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { buildWikiSearchUrl } from "../lib/constants";
import { lookUpScryfall, scryfallApiUrl, type ScryfallCard, type ScryfallResult } from "../lib/scryfall";

// Card/rules lookup. The site is set for the server (DAMNATION_WIKI_SEARCH_TEMPLATE, a search URL
// with a {query} placeholder, mtg.wiki by default), so a replacement can be swapped in if a site
// goes down. Unless DAMNATION_WIKI_EMBED is false, results show in the panel through
// /api/damnation/wiki, which hands every link in the page back here: wiki links open in the
// panel, Scryfall card links show the card, and other sites open in a new tab.

interface WikiSearchProps {
  template: string;
  embed: boolean;
  // Trigger styling; the phone action bar uses a full button.
  className?: string;
  // Controlled mode, for opening the search from a menu: `open` + `onOpenChange`, no trigger.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type CardView =
  | { link: string; status: "loading" }
  | { link: string; status: "ready"; result: ScryfallResult; chosen: ScryfallCard | null }
  | { link: string; status: "failed" };

// The template was validated server-side; this second check means a malformed value can
// never become a javascript: link in the page, whatever happens upstream.
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// The panel's address for a wiki page; the anchor stays on so the page opens at that section.
function framedUrl(page: string): string {
  const hash = new URL(page).hash;
  return `/api/damnation/wiki?url=${encodeURIComponent(page)}${hash}`;
}

export default function WikiSearch({ template, embed, className = "btn-off", open, onOpenChange }: WikiSearchProps) {
  // INPUT
  const [query, setQuery] = useState("");

  // STATE
  const [ownOpen, setOwnOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = open ?? ownOpen;
  const setIsOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwnOpen(next));
  // Wiki pages visited since the search, newest last; Back steps through them.
  const [pages, setPages] = useState<string[]>([]);
  const [cardView, setCardView] = useState<CardView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const siteHost = (() => {
    const url = safeUrl(buildWikiSearchUrl(template, "x"));
    return url ? new URL(url).hostname : "the wiki";
  })();
  const currentPage = pages.at(-1) ?? null;

  // Links clicked inside the page arrive here. Only this panel's own frame is listened to.
  useEffect(() => {
    if (!currentPage) return;
    function onMessage(event: MessageEvent) {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const data = event.data as { damnationWiki?: string; url?: unknown } | null;
      if (data?.damnationWiki !== "navigate" || typeof data.url !== "string") return;
      const link = safeUrl(data.url);
      if (!link) return;
      if (new URL(link).hostname === siteHost) {
        setPages((previous) => [...previous, link]);
      } else if (scryfallApiUrl(link)) {
        setCardView({ link, status: "loading" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentPage, siteHost]);

  // Look up the card view's cards; a newer link or closing the view cancels the request.
  const cardLink = cardView?.status === "loading" ? cardView.link : null;
  useEffect(() => {
    if (!cardLink) return;
    const apiUrl = scryfallApiUrl(cardLink);
    if (!apiUrl) return;
    const controller = new AbortController();
    lookUpScryfall(apiUrl, controller.signal)
      .then((result) =>
        setCardView((view) =>
          view?.link === cardLink ? { link: cardLink, status: "ready", result, chosen: result.cards.length === 1 ? result.cards[0] : null } : view
        )
      )
      .catch(() => {
        if (!controller.signal.aborted) {
          setCardView((view) => (view?.link === cardLink ? { link: cardLink, status: "failed" } : view));
        }
      });
    return () => controller.abort();
  }, [cardLink]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const url = safeUrl(buildWikiSearchUrl(template, query));
    if (!url) return;
    // Drop the on-screen keyboard so the results aren't hidden behind it.
    inputRef.current?.blur();
    if (embed) {
      setPages([url]);
      setCardView(null);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function back() {
    if (cardView?.status === "ready" && cardView.chosen && cardView.result.cards.length > 1) {
      setCardView({ ...cardView, chosen: null });
    } else if (cardView) {
      setCardView(null);
    } else {
      setPages((previous) => previous.slice(0, -1));
    }
  }

  function close() {
    setIsOpen(false);
    setPages([]);
    setCardView(null);
  }

  const newTabUrl = cardView ? (cardView.status === "ready" && cardView.chosen ? cardView.chosen.scryfallUrl : cardView.link) : currentPage;
  const canGoBack = cardView !== null || pages.length > 1;

  return (
    <>
      {/* WIKI TRIGGER */}
      {!isControlled && (
        <Button className={className} onClick={() => setIsOpen(true)} title={`Search ${siteHost}`} aria-label={`Search ${siteHost}`}>
          <BookOpen className="w-5 h-5" aria-hidden /> Wiki
        </Button>
      )}

      {/* WIKI MODAL — autofocuses the search field: opening it means "I want to look something up". */}
      <Modal isOpen={isOpen} onClose={close} title={`Search ${siteHost}`} fullScreenMobileOnly wide>

        {/* SEARCH FORM */}
        <form onSubmit={submit} className="flex gap-2 mb-3">

          {/* QUERY FIELD */}
          <input
            ref={inputRef}
            autoFocus
            type="search"
            className="input-field flex-1"
            placeholder="Card name or rule"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            aria-label="Search text"
          />

          {/* SEARCH BUTTON */}
          <Button type="submit" className="btn-blue" aria-label="Search" title="Search">
            <Search className="w-4 h-4" aria-hidden />
          </Button>
        </form>

        {/* RESULT */}
        {currentPage && (
          <>
            {/* PANEL ACTIONS — back through visited pages and cards; the page or card in a new tab */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {canGoBack && (
                <Button className="btn-link" onClick={back} title="Go back">
                  <ArrowLeft className="w-4 h-4" aria-hidden /> Back
                </Button>
              )}
              {newTabUrl && (
                <a className="btn btn-link" href={newTabUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" aria-hidden /> Open in a new tab
                </a>
              )}
            </div>

            {/* CARD VIEW — a Scryfall link from the page */}
            {cardView && (
              <div className="dmn-wiki-cards">
                {cardView.status === "loading" && <p className="text-secondary">Looking up the card…</p>}
                {cardView.status === "failed" && <p className="text-secondary">Scryfall didn&apos;t answer. Open it in a new tab instead.</p>}
                {cardView.status === "ready" && cardView.result.cards.length === 0 && <p className="text-secondary">No cards found</p>}

                {/* ONE CARD — every face */}
                {cardView.status === "ready" && cardView.chosen && (
                  <div className="dmn-wiki-card-faces">
                    {cardView.chosen.images.map((image, index) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={image} src={image} alt={index === 0 ? cardView.chosen!.name : `${cardView.chosen!.name}, back face`} />
                    ))}
                    {cardView.chosen.images.length === 0 && <p className="text-h2">{cardView.chosen.name}</p>}
                  </div>
                )}

                {/* SEARCH RESULTS — tap one to see it large */}
                {cardView.status === "ready" && !cardView.chosen && cardView.result.cards.length > 0 && (
                  <>
                    {cardView.result.total > cardView.result.cards.length && (
                      <p className="text-secondary mb-2">
                        First {cardView.result.cards.length} of {cardView.result.total} cards
                      </p>
                    )}
                    <div className="dmn-wiki-card-grid">
                      {cardView.result.cards.map((card) => (
                        <button key={card.id} type="button" className="dmn-wiki-card-pick" onClick={() => setCardView({ ...cardView, chosen: card })} title={card.name}>
                          {card.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={card.images[0]} alt={card.name} loading="lazy" />
                          ) : (
                            <span>{card.name}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* RESULT FRAME — the page through Grimoire, sandboxed into its own opaque origin. Kept
                mounted under the card view so going back returns to the same spot; remounted per
                page so visiting pages doesn't add to the browser's own history. */}
            <iframe
              key={`${pages.length}:${currentPage}`}
              ref={frameRef}
              hidden={cardView !== null}
              className="dmn-wiki-frame"
              src={framedUrl(currentPage)}
              title={`${siteHost} results`}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          </>
        )}

        {/* EMPTY STATE */}
        {!currentPage && (
          <p className="text-secondary">
            {embed
              ? `Results provided by ${siteHost}`
              : `Results from ${siteHost} open in a new tab.`}
          </p>
        )}
      </Modal>
    </>
  );
}
