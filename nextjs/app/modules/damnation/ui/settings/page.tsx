"use client";

import { ArrowLeft, ExternalLink, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { BackLink } from "@/components/BackLink";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { buildWikiSearchUrl, DEFAULT_WIKI_SEARCH_TEMPLATE, WIKI_QUERY_PLACEHOLDER } from "../../lib/constants";
import type { DamnationSettings } from "../../types/damnation";

const SETTINGS_HELP = [
  {
    heading: "Wiki search",
    body: (
      <>
        The Wiki button on the board and on every phone searches this site. Paste the address a search on that site
        produces, with <code>{WIKI_QUERY_PLACEHOLDER}</code> where the search text goes — for example, search mtg.wiki for
        &ldquo;test&rdquo;, copy the address, and replace <code>test</code> with <code>{WIKI_QUERY_PLACEHOLDER}</code>.
        Changes reach games already in progress straight away.
      </>
    ),
  },
  {
    heading: "Show results inside Damnation",
    body: (
      <>
        On: results open in a panel. Off: they open in a new tab. Turn it off if the panel stays blank — many sites refuse
        to be shown inside another page. A new-tab link is offered either way.
      </>
    ),
  },
];

export default function DamnationSettingsPage() {
  // DATA
  const [settings, setSettings] = useState<DamnationSettings | null>(null);

  // INPUT
  const [template, setTemplate] = useState("");
  const [embed, setEmbed] = useState(true);
  const [testQuery, setTestQuery] = useState("Damnation");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = !!settings && (template !== settings.wiki_search_template || embed !== settings.wiki_embed);
  const previewUrl = template.includes(WIKI_QUERY_PLACEHOLDER) && /^https?:\/\//i.test(template)
    ? buildWikiSearchUrl(template, testQuery)
    : null;

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/modules/damnation/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error("Couldn't load settings");
        const data: DamnationSettings = await response.json();
        setSettings(data);
        setTemplate(data.wiki_search_template);
        setEmbed(data.wiki_embed);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't load settings");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function save(nextTemplate: string | null, nextEmbed: boolean) {
    setIsSaving(true);
    try {
      const response = await fetch("/modules/damnation/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wiki_search_template: nextTemplate, wiki_embed: nextEmbed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Couldn't save");
      setSettings(data);
      setTemplate(data.wiki_search_template);
      setEmbed(data.wiki_embed);
      toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-container">
        <Toaster position="top-center" />

        {/* HEADER ROW */}
        <div className="flex items-center justify-between mb-6">

          {/* BACK TO DAMNATION HOME */}
          <BackLink className="btn btn-link !pl-0" fallback="/modules/damnation/ui/home" aria-label="Back to Damnation">
            <ArrowLeft className="w-5 h-5" />
          </BackLink>

          {/* HELP */}
          <HelpButton title="Damnation settings" sections={SETTINGS_HELP} />
        </div>

        {/* PAGE TITLE */}
        <h1 className="text-page-title">
          <Settings className="w-7 h-7" /> Settings
        </h1>

        {/* LOADING PLACEHOLDER */}
        {isLoading && <p className="text-secondary">Loading settings…</p>}

        {/* WIKI CARD */}
        {!isLoading && settings && (
          <div className="card max-w-3xl">

            {/* CARD HEADER */}
            <div className="card-header">
              <h2 className="text-card-title">Wiki search</h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {/* TEMPLATE LABEL */}
              <label className="text-h2" htmlFor="dmn-wiki-template">Search address</label>

              {/* TEMPLATE FIELD — not autofocused: the page is mostly read to check the current site, and
                  focusing would raise the phone keyboard over it. */}
              <input
                id="dmn-wiki-template"
                type="url"
                inputMode="url"
                className="input-field"
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                placeholder={DEFAULT_WIKI_SEARCH_TEMPLATE}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />

              {/* TEMPLATE HINT */}
              <p className="text-secondary">
                Must start with https:// and contain <code>{WIKI_QUERY_PLACEHOLDER}</code>.
                {settings.is_default_template && " Currently the built-in mtg.wiki search."}
              </p>

              {/* EMBED TOGGLE */}
              <label className="flex items-center gap-2 text-primary">
                <input type="checkbox" checked={embed} onChange={(event) => setEmbed(event.target.checked)} />
                Show results inside Damnation
              </label>

              {/* TEST ROW */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  className="input-field flex-1 min-w-[10rem]"
                  value={testQuery}
                  onChange={(event) => setTestQuery(event.target.value)}
                  aria-label="Test search text"
                />
                {previewUrl ? (
                  <a className="btn btn-off" href={previewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" /> Try it
                  </a>
                ) : (
                  <span className="text-secondary">Enter a valid address to try it</span>
                )}
              </div>

              {/* ACTIONS */}
              <div className="flex flex-wrap gap-2 mt-2">
                <Button className="btn-green" disabled={!isDirty || isSaving} onClick={() => save(template, embed)}>
                  {isSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  className="btn-off"
                  disabled={isSaving || (settings.is_default_template && embed)}
                  onClick={() => save(null, true)}
                  title="Go back to mtg.wiki with results shown inside Damnation"
                >
                  Reset to mtg.wiki
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
