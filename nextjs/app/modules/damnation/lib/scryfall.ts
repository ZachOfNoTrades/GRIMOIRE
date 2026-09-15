// Scryfall card links from the wiki panel, shown as cards in the panel. scryfall.com refuses to be
// framed, but its public API allows browser requests, so the panel looks the cards up itself.

export interface ScryfallCard {
  id: string;
  name: string;
  // One image per face; double-faced cards have two.
  images: string[];
  scryfallUrl: string;
}

export interface ScryfallResult {
  cards: ScryfallCard[];
  total: number;
}

// The most cards the panel lists for a search; the new-tab link has the rest.
const MAX_CARDS = 60;

interface ApiCard {
  id: string;
  name: string;
  scryfall_uri: string;
  image_uris?: { normal?: string };
  card_faces?: { image_uris?: { normal?: string } }[];
}

// The API address for a scryfall.com link, or null when the link isn't a card or a search.
export function scryfallApiUrl(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (!/(^|\.)scryfall\.com$/.test(url.hostname)) return null;
  const query = url.searchParams.get("q");
  if (url.pathname === "/search" && query) {
    return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`;
  }
  const card = /^\/card\/([^/]+)\/([^/]+)/.exec(url.pathname);
  if (card) return `https://api.scryfall.com/cards/${card[1]}/${card[2]}`;
  return null;
}

function toCard(card: ApiCard): ScryfallCard {
  const faces = card.image_uris?.normal
    ? [card.image_uris.normal]
    : (card.card_faces ?? []).map((face) => face.image_uris?.normal).filter((image): image is string => Boolean(image));
  return { id: card.id, name: card.name, images: faces, scryfallUrl: card.scryfall_uri };
}

export async function lookUpScryfall(apiUrl: string, signal: AbortSignal): Promise<ScryfallResult> {
  const response = await fetch(apiUrl, { headers: { Accept: "application/json" }, signal });
  // A search with no matches is a 404 with an error body.
  if (response.status === 404) return { cards: [], total: 0 };
  if (!response.ok) throw new Error(`Scryfall answered ${response.status}`);
  const data = await response.json();
  if (data.object === "list") {
    const cards = (data.data as ApiCard[]).slice(0, MAX_CARDS).map(toCard);
    return { cards, total: data.total_cards ?? cards.length };
  }
  return { cards: [toCard(data as ApiCard)], total: 1 };
}
