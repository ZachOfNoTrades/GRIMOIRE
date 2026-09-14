"use client";

import { ArrowLeft, BookOpen, ExternalLink, Search } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { buildWikiSearchUrl } from "../lib/constants";

// Card/rules lookup. The site is set for the server (DAMNATION_WIKI_SEARCH_TEMPLATE, a search URL
// with a {query} placeholder, mtg.wiki by default), so a replacement can be swapped in if a site
// goes down. Results open in an in-app frame unless DAMNATION_WIKI_EMBED is false; a new-tab link
// is always offered because many sites refuse to be framed.

interface WikiSearchProps {
  template: string;
  embed: boolean;
  // Trigger styling; the phone action bar uses a full button.
  className?: string;
  // Controlled mode, for opening the search from a menu: `open` + `onOpenChange`, no trigger.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

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

export default function WikiSearch({ template, embed, className = "btn-off", open, onOpenChange }: WikiSearchProps) {
  // INPUT
  const [query, setQuery] = useState("");

  // STATE
  const [ownOpen, setOwnOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = open ?? ownOpen;
  const setIsOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwnOpen(next));
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  // The frame can't report where a clicked link went (it's another site), so count its page
  // loads instead: anything past the first means the reader has followed a link, which may be to a
  // site that refuses to be shown here (Scryfall, for one). frameKey remounts the frame to go back.
  const [frameLoads, setFrameLoads] = useState(0);
  const [frameKey, setFrameKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const siteHost = (() => {
    const url = safeUrl(buildWikiSearchUrl(template, "x"));
    return url ? new URL(url).hostname : "the wiki";
  })();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const url = safeUrl(buildWikiSearchUrl(template, query));
    if (!url) return;
    // Drop the on-screen keyboard so the results aren't hidden behind it.
    inputRef.current?.blur();
    if (embed) {
      setResultUrl(url);
      setFrameLoads(0);
      setFrameKey((key) => key + 1);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function close() {
    setIsOpen(false);
    setResultUrl(null);
  }

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
        {resultUrl && (
          <>
            {/* FRAME ACTIONS — new tab always available; some sites block framing */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <a className="btn btn-link" href={resultUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" aria-hidden /> Open in a new tab
              </a>

              {/* BACK TO RESULTS — once a link inside the frame has been followed */}
              {frameLoads > 1 && (
                <Button
                  className="btn-link"
                  onClick={() => {
                    setFrameLoads(0);
                    setFrameKey((key) => key + 1);
                  }}
                  title="Show the search results again"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden /> Back to results
                </Button>
              )}
            </div>

            {/* LINK NOTE — a followed link may point at a site that won't display here */}
            {frameLoads > 1 && (
              <p className="text-secondary mb-2">
                Page blank or refused? That site can&apos;t be shown inside Damnation — go back to the results, or open the
                search in a new tab and follow the link there.
              </p>
            )}

            {/* RESULT FRAME — sandboxed, no referrer; a separate origin from Grimoire */}
            <iframe
              key={frameKey}
              className="dmn-wiki-frame"
              src={resultUrl}
              onLoad={() => setFrameLoads((count) => count + 1)}
              title={`${siteHost} results`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          </>
        )}

        {/* EMPTY STATE */}
        {!resultUrl && (
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
