import { DEFAULT_WIKI_SEARCH_TEMPLATE } from "./constants";
import { normalizeWikiTemplate } from "./validation";

// The wiki search every game uses, set for the whole server rather than per host:
//   DAMNATION_WIKI_SEARCH_TEMPLATE — a search address with {query} where the search text goes
//                                    (blank = mtg.wiki)
//   DAMNATION_WIKI_EMBED           — "false" opens results in a new tab instead of a panel
// An invalid template is logged and ignored, so a typo in the environment can't break games.
export function wikiConfig(): { wiki_search_template: string; wiki_embed: boolean } {
  let template = DEFAULT_WIKI_SEARCH_TEMPLATE;
  const raw = process.env.DAMNATION_WIKI_SEARCH_TEMPLATE;
  if (raw && raw.trim() !== "") {
    try {
      template = normalizeWikiTemplate(raw) ?? DEFAULT_WIKI_SEARCH_TEMPLATE;
    } catch (error) {
      console.error("DAMNATION_WIKI_SEARCH_TEMPLATE is invalid; using mtg.wiki:", error instanceof Error ? error.message : error);
    }
  }
  return { wiki_search_template: template, wiki_embed: process.env.DAMNATION_WIKI_EMBED?.trim().toLowerCase() !== "false" };
}
