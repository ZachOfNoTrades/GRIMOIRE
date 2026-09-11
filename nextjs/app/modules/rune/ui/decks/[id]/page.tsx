"use client";

import { useState, useEffect, useMemo, useCallback, useRef, use } from "react";
import { BackLink } from "@/components/BackLink";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Plus, Pencil, Power, PowerOff, Trash2, Sparkles, History, EllipsisVertical, Check, Upload } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import ExpandableRowList from "@/components/ExpandableRowList";
import PopoverMenu from "@/components/PopoverMenu";
import { Deck } from "../../../types/deck";
import { CardWithProgress, CardReview } from "../../../types/card";
import { DEFAULT_AUTO_ADVANCE_SECONDS, DEFAULT_DAILY_GOAL, DEFAULT_DAILY_MAX_RENEW } from "../../../types/settings";
import { formatRelativePast } from "@/lib/format";
import { generateUUID } from "@/lib/uuid";
import CardContent from "../../../components/CardContent";
import RatingTrendChart from "../../../components/RatingTrendChart";
import StudySession, { StudyPreferences } from "../../../components/StudySession";
import CardTable, { CardSheetDraft, PendingRow, draftFromCard, isDirty as isDraftDirty } from "./cards/CardTable";
import ManageCardModal from "./cards/ManageCardModal";
import DeleteCardModal from "./cards/DeleteCardModal";
import RefineCardModal from "./cards/RefineCardModal";
import CardHistoryModal from "./cards/CardHistoryModal";
import ImportCardsModal from "./ImportCardsModal";
import RefineDeckModal from "./RefineDeckModal";
import EditDeckModal from "./EditDeckModal";
import DeleteDeckModal from "./DeleteDeckModal";
import DeckHistorySection from "./DeckHistorySection";

// Sort options for a deck's card list. "category" is the historical default —
// category runs in manual order_index — and is the only mode that can be grouped
// by category, since grouping only detects contiguous runs. The rest are single-key
// re-sorts. Labels are short because they are the sort button's face (one tap
// cycles this list), matching the forage food logger / Recipes page control —
// not dropdown options, which is what they used to be.
type CardSortKey = "category" | "created" | "modified" | "alphabetical";

// Which shape the deck's cards are drawn in. "list" is the master/detail row list
// (one back at a time); "table" lays every card's front AND back out at once, which
// is the view for proofreading or scanning a whole deck rather than drilling into
// one card. Remembered across visits (per browser) because it's a lasting reading
// preference, not a per-visit one — and it's the deck page's own state rather than
// the row list's so the page can also widen its container for the table.
type CardViewMode = "list" | "table";
const CARD_VIEW_STORAGE_KEY = "rune.deckCardView";

const SORT_OPTIONS: { value: CardSortKey; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "created", label: "Created" },
  { value: "modified", label: "Modified" },
  { value: "alphabetical", label: "A–Z" },
];

// Human label for a card's created_via / modified_via channel. Null (cards written before
// the columns existed) yields null so the origin line renders the bare date instead of
// guessing a channel that was never recorded.
function channelLabel(via: string | null): string | null {
  if (via === "mcp") return "MCP";
  if (via === "api") return "API";
  if (via === "web") return "the web app";
  return null;
}

// Exact timestamp for the card origin line — same shape CardHistoryModal uses for a
// review, spelling out the year only for older cards so the line stays one row on a phone.
function formatCardTimestamp(date: Date | string): string {
  const d = new Date(date);
  const isThisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: isThisYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// True when a card has actually been edited since it was written. Every insert stamps
// created_at and modified_at from the same GETDATE(), but the two round-trip through
// datetime2 independently — so compare with a small tolerance rather than for equality,
// and only then is a separate "Modified" line worth the row.
function wasModified(card: CardWithProgress): boolean {
  const created = new Date(card.created_at).getTime();
  const modified = new Date(card.modified_at).getTime();
  return Number.isFinite(created) && Number.isFinite(modified) && modified - created > 2000;
}

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  // Only used to name the author on the card origin line ("by Zach"). An API-key page
  // load has no NextAuth session, so this is null there and the line drops the name —
  // every card in a deck belongs to the viewer, so there is no other author to confuse it with.
  const { data: session } = useSession();
  const authorName = session?.user?.name?.split(" ")[0] || null;

  // DATA
  const [deck, setDeck] = useState<Deck | null>(null);
  const [allCards, setAllCards] = useState<CardWithProgress[]>([]);
  const [dueCards, setDueCards] = useState<CardWithProgress[]>([]);

  // Name the browser tab after this deck ("Rune · Anatomy 101") instead of the route
  // folder, which reads identically to the decks list you came from. Null until the
  // deck loads, which leaves the plain "Rune · Decks" in place rather than flashing.
  useEntityTitle(deck?.name);

  // INPUT
  const [sortKey, setSortKey] = useState<CardSortKey>("category");
  // Starts on "list" and is corrected from localStorage after mount — reading storage
  // during render would make the server and first client paint disagree.
  const [cardView, setCardView] = useState<CardViewMode>("list");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isStudying, setIsStudying] = useState(false); // in the study UI; the session itself lives in StudySession
  const [handsFree, setHandsFree] = useState(false);
  // Study preferences loaded from rune_settings, handed to the study session.
  const [autoAdvanceOnEvaluate, setAutoAdvanceOnEvaluate] = useState(false);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState(DEFAULT_AUTO_ADVANCE_SECONDS);
  const [evaluationSoundEnabled, setEvaluationSoundEnabled] = useState(true);
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [dailyMaxRenew, setDailyMaxRenew] = useState<number>(DEFAULT_DAILY_MAX_RENEW);
  // Distinct cards reviewed today across all decks/sessions, as of the last load.
  const [reviewedToday, setReviewedToday] = useState<number>(0);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [editingCard, setEditingCard] = useState<CardWithProgress | null>(null);
  const [deletingCard, setDeletingCard] = useState<CardWithProgress | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteCards, setShowBulkDeleteCards] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showEditDeck, setShowEditDeck] = useState(false);
  const [showDeleteDeck, setShowDeleteDeck] = useState(false);
  const [refiningCard, setRefiningCard] = useState<CardWithProgress | null>(null);
  const [historyCard, setHistoryCard] = useState<CardWithProgress | null>(null); // card whose rating history is open
  const [showRefineDeck, setShowRefineDeck] = useState(false);
  const [showImportCards, setShowImportCards] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null); // which card's detail (front+back) is open in the row list
  // Rating history for the expanded card, fetched lazily on expand — one request at a
  // time, never one per card in the deck. Kept with the id it was loaded for so a
  // fast second expand can't paint the previous card's trend under the new card.
  const [expandedCardReviews, setExpandedCardReviews] = useState<{ cardId: string; reviews: CardReview[] } | null>(null);
  const [isDeckMenuOpen, setIsDeckMenuOpen] = useState(false); // the header's deck-actions popover
  // SHEET EDIT — the table view's single-Edit-button mode. `sheetDrafts` is keyed by card
  // id and holds every row's working copy while it's on; null means the table is in read
  // mode. Keyed rather than positional so a mid-edit search/filter (which changes which
  // rows are rendered) can't shuffle one card's edits onto another, and so a row edited
  // before being filtered out still saves.
  const [sheetDrafts, setSheetDrafts] = useState<Record<string, CardSheetDraft> | null>(null);
  const [isSavingSheet, setIsSavingSheet] = useState(false);
  // WHICH CARDS THE LIST IS SHOWING — published by ExpandableRowList as its search/filter
  // narrows. Studying follows it: filtering a deck to one category and pressing Start is a
  // request to study that category, not the whole deck. Null until the list first reports
  // (the very first render, before the effect runs), which reads as "no narrowing".
  const [visibleCardIds, setVisibleCardIds] = useState<Set<string> | null>(null);

  // ROWS BEING WRITTEN — table rows added during a sheet pass that aren't cards yet. They
  // hold their own place (below the card they were added under) and are written by the same
  // save as the edits, so one pass down a deck can fix what is there and add what isn't.
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  // Bumped when a study session ends so the history section refetches the session that
  // just finished — its rows are server-derived, so there is nothing to update locally.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const deckMenuAnchorRef = useRef<HTMLDivElement>(null);

  // Soft daily-target progress. Both thresholds are soft — goalMet is motivational,
  // overMaxRenew only warns; neither hides or blocks any due card.
  const goalMet = reviewedToday >= dailyGoal;
  const overMaxRenew = reviewedToday >= dailyMaxRenew;

  const studyPreferences: StudyPreferences = {
    autoAdvanceOnEvaluate,
    autoAdvanceSeconds,
    evaluationSoundEnabled,
    dailyGoal,
    dailyMaxRenew,
    reviewedTodayBaseline: reviewedToday,
  };

  // Distinct category names present in the deck, sorted — feeds both the
  // ManageCardModal's category suggestions and the card list's category filter.
  const existingCategories = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b)),
    [allCards]
  );

  // The card list's ordering. "category" sorts by category (uncategorized last)
  // preserving each category's manual order_index — required for
  // ExpandableRowList's getSectionLabel grouping, which only detects contiguous
  // runs rather than sorting itself. The other modes are flat re-sorts, each
  // tie-broken on the front text so equal keys stay in a stable, readable order.
  const sortedCards = useMemo(() => {
    const time = (value: Date | string | null) => (value ? new Date(value).getTime() : -Infinity);
    return [...allCards].sort((a, b) => {
      switch (sortKey) {
        case "created":
          return time(b.created_at) - time(a.created_at) || a.front.localeCompare(b.front);
        case "modified":
          return time(b.modified_at) - time(a.modified_at) || a.front.localeCompare(b.front);
        case "alphabetical":
          return a.front.localeCompare(b.front);
        case "category":
        default:
          if (a.category !== b.category) {
            if (!a.category) return 1;
            if (!b.category) return -1;
            return a.category.localeCompare(b.category);
          }
          return a.order_index - b.order_index;
      }
    });
  }, [allCards, sortKey]);

  // Which rows the sheet would actually write. Drives the Save button's count and its
  // disabled state, so a save is never issued for an untouched table.
  const dirtySheetCards = useMemo(() => {
    if (!sheetDrafts) return [];
    return allCards.filter((card) => sheetDrafts[card.id] && isDraftDirty(card, sheetDrafts[card.id]));
  }, [allCards, sheetDrafts]);

  // THE CARDS A SESSION WOULD ACTUALLY STUDY — the due set intersected with what the card
  // list is showing. With no search or filter the two are the same, so this needs no
  // "is filtered" flag: the intersection simply is the whole due set.
  const studyCards = useMemo(() => {
    if (!visibleCardIds) return dueCards;
    return dueCards.filter((card) => visibleCardIds.has(card.id));
  }, [dueCards, visibleCardIds]);

  // True when the list is narrowed AND that narrowing actually costs the session cards — the
  // one case worth a line of explanation under the button. A filter that happens to include
  // every due card needs no comment.
  const studyNarrowed = studyCards.length < dueCards.length;

  // New rows worth writing: a row left completely blank is an insert the user thought better
  // of, and is dropped on save rather than 400ing the batch for a missing front.
  const filledPendingRows = useMemo(
    () => pendingRows.filter((row) => row.front.trim() || row.back.trim() || row.notes.trim()),
    [pendingRows]
  );

  // Whether Save has anything to do, and what the toolbar says it would write. Counted
  // separately because "3 cards changed" and "2 cards added" are different promises.
  const sheetHasWork = dirtySheetCards.length > 0 || filledPendingRows.length > 0;
  const sheetStatusLabel = useMemo(() => {
    const parts: string[] = [];
    if (dirtySheetCards.length > 0) parts.push(dirtySheetCards.length === 1 ? "1 card changed" : `${dirtySheetCards.length} cards changed`);
    if (filledPendingRows.length > 0) parts.push(filledPendingRows.length === 1 ? "1 card added" : `${filledPendingRows.length} cards added`);
    return parts.length === 0 ? "Editing every card — no changes yet" : parts.join(", ");
  }, [dirtySheetCards.length, filledPendingRows.length]);

  // How many cards are drafts — gates the draft filter options (below): with zero
  // drafts the extra dropdown group is just noise, so it's omitted entirely.
  const draftCount = useMemo(() => allCards.filter((c) => c.is_draft).length, [allCards]);

  // STATUS FILTER OPTIONS — folded into the category dropdown under a "Status" group.
  // Only appears when the deck actually has drafts, so a deck without any gets no extra
  // group at all.
  const statusFilterOptions = useMemo(() => {
    const options: { value: string; label: string; predicate: (card: CardWithProgress) => boolean }[] = [];
    if (draftCount > 0) {
      options.push({ value: "__drafts__", label: `Drafts (${draftCount})`, predicate: (card) => card.is_draft });
      options.push({ value: "__published__", label: "Published", predicate: (card) => !card.is_draft });
    }
    return options.length > 0 ? options : undefined;
  }, [draftCount]);

  // LOAD DATA
  useEffect(() => {
    fetchDeckAndCards();
  }, [id]);

  // LOAD EXPANDED CARD HISTORY — the small recall trend under a card's detail. Only
  // the open card is fetched, and a failure just leaves the chart out: the detail is
  // about the card's content, and the full history is a tap away in the modal.
  useEffect(() => {
    if (!expandedCardId) {
      setExpandedCardReviews(null);
      return;
    }

    let cancelled = false;
    const cardId = expandedCardId;
    fetch(`/modules/rune/api/decks/${id}/cards/${cardId}/reviews`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setExpandedCardReviews({ cardId, reviews: data });
      })
      .catch((error) => console.error("Error fetching card review history:", error));

    return () => { cancelled = true; };
  }, [expandedCardId, id]);

  // LOAD STUDY PREFERENCES — auto-advance + evaluation-sound settings from rune_settings.
  useEffect(() => {
    fetchStudyPreferences();
  }, []);

  // RESTORE CARD VIEW — a browser-local reading preference, not a server setting, so
  // it lives in localStorage (private-mode/quota failures just leave the default).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CARD_VIEW_STORAGE_KEY) === "table") setCardView("table");
    } catch {
      // storage unavailable — stay on the list default
    }
  }, []);

  // The view toggle's handler: flip the view and remember it. Sheet edit belongs to the
  // table, so switching away closes it — with a warning when that costs unsaved rows,
  // since the toggle is a small icon and losing typing to it silently would be worse.
  const changeCardView = (view: CardViewMode) => {
    if (view === "list" && sheetDrafts) {
      if (sheetHasWork) toast("Unsaved card edits discarded");
      exitSheetEdit();
    }
    setCardView(view);
    try {
      window.localStorage.setItem(CARD_VIEW_STORAGE_KEY, view);
    } catch {
      // best-effort — the view still changes for this visit
    }
  };

  const fetchStudyPreferences = async () => {
    try {
      const response = await fetch("/modules/rune/api/settings");
      if (!response.ok) return;
      const data = await response.json();
      setAutoAdvanceOnEvaluate(Boolean(data.autoAdvanceOnEvaluate));
      if (Number.isFinite(data.autoAdvanceSeconds)) setAutoAdvanceSeconds(data.autoAdvanceSeconds);
      setEvaluationSoundEnabled(data.evaluationSoundEnabled !== false);
      if (Number.isFinite(data.dailyGoal)) setDailyGoal(data.dailyGoal);
      if (Number.isFinite(data.dailyMaxRenew)) setDailyMaxRenew(data.dailyMaxRenew);
      if (Number.isFinite(data.reviewedToday)) setReviewedToday(data.reviewedToday);
    } catch {
      // best-effort — fall back to defaults on failure
    }
  };

  // Due cards feed the study session. Draft cards are excluded — they're
  // unfinished and never enter a study session. A blank back is not a reason to hold a
  // card out: it studies as a self-graded card. Mirrors the due_count SQL in
  // deckFunctions.getAllDecks.
  const selectDueCards = (cardList: CardWithProgress[]): CardWithProgress[] => {
    const now = new Date();
    return cardList.filter((c) => !c.is_draft && (!c.next_review_at || new Date(c.next_review_at) <= now));
  };

  const fetchDeckAndCards = async () => {
    try {
      const [deckResponse, cardsResponse] = await Promise.all([
        fetch(`/modules/rune/api/decks/${id}`),
        fetch(`/modules/rune/api/decks/${id}/cards`),
      ]);

      if (!deckResponse.ok) {
        setNotFound(true);
        return;
      }

      const deckData = await deckResponse.json();
      setDeck(deckData);

      if (cardsResponse.ok) {
        const cardsData: CardWithProgress[] = await cardsResponse.json();
        setAllCards(cardsData);
        setDueCards(selectDueCards(cardsData));
      }
    } catch (error) {
      console.error("Error fetching deck data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Silent background refetch to reconcile client state with the DB. Returns the
  // fresh list so a running study session can reconcile its own queue.
  const refetchCards = async (): Promise<CardWithProgress[]> => {
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`);
      if (!response.ok) return allCards;

      const freshCards: CardWithProgress[] = await response.json();
      setAllCards(freshCards);
      setDueCards(selectDueCards(freshCards));
      return freshCards;
    } catch (error) {
      console.error("Error refetching cards:", error);
      return allCards;
    }
  };

  // Pause / resume the deck. Optimistic — flip locally first, revert on failure — so the
  // header responds instantly. Nothing about the cards or their schedule changes; only
  // whether the rest of the app counts this deck as having anything due.
  const toggleDeckDisabled = async () => {
    if (!deck) return;

    const next = !deck.is_disabled;
    setDeck({ ...deck, is_disabled: next });

    try {
      const response = await fetch(`/modules/rune/api/decks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_disabled: next }),
      });
      if (!response.ok) throw new Error("Request failed");
      toast.success(next ? "Deck disabled" : "Deck enabled");
    } catch (error) {
      console.error("Error updating deck disabled state:", error);
      setDeck((prev) => (prev ? { ...prev, is_disabled: !next } : prev));
      toast.error("Couldn't update deck");
    }
  };

  // Leaving the study session: refresh the landing screen's Due / Last Reviewed /
  // today's-progress stats, which the ratings just submitted have moved.
  const handleQuitStudy = () => {
    setIsStudying(false);
    fetchDeckAndCards();
    fetchStudyPreferences();
    setHistoryRefreshKey((key) => key + 1);
  };

  // Add a new card
  const handleAddCard = async (front: string, back: string, notes: string | null, category: string | null, isDraft: boolean, sourceRef: string | null) => {
    // Client update with temp card
    const tempId = generateUUID();
    // created_via/modified_via are "web" here because this optimistic row IS a browser
    // write — the refetch below replaces it with the server's own row either way.
    const tempCard: CardWithProgress = { id: tempId, deck_id: id, front, back, notes, category, source: "manual", source_id: null, source_ref: sourceRef, order_index: allCards.length, is_disabled: false, is_draft: isDraft, created_at: new Date(), modified_at: new Date(), created_via: "web", modified_via: "web", ease_factor: null, interval_days: null, repetitions: null, next_review_at: null, last_reviewed_at: null, last_rating: null };
    setAllCards((prev) => [...prev, tempCard]);
    // Draft cards never enter the due list — they're excluded from study. Same predicate
    // as selectDueCards, so the optimistic paint can't briefly over-count the due badge
    // before the refetch corrects it.
    if (!isDraft) {
      setDueCards((prev) => [...prev, tempCard]);
    }
    setIsAddingCard(false);

    // Background DB insert + refetch to get real ID. The refetch is what actually rolls
    // the stand-in back on failure (it re-reads the deck, which never had it), but that
    // alone is silent — the row just vanishes. Surface the server's own message too.
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back, notes, category, is_draft: isDraft, source_ref: sourceRef }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Request failed");
      }
    } catch (error) {
      console.error("Error adding card:", error);
      toast.error(error instanceof Error && error.message !== "Request failed" ? error.message : "Couldn't add card");
    }
    refetchCards();
  };

  // Edit an existing card
  const handleEditCard = async (cardId: string, front: string, back: string, notes: string | null, category: string | null, isDraft: boolean, sourceRef: string | null) => {
    // Client update first
    setAllCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes, category, is_draft: isDraft, source_ref: sourceRef } : c)
    );
    // Editing a card can make it unstudyable — marking it a draft — so the due list is
    // filtered, not just mapped, or the card would linger there until the refetch below.
    setDueCards((prev) =>
      prev
        .map((c) => c.id === cardId ? { ...c, front, back, notes, category, is_draft: isDraft, source_ref: sourceRef } : c)
        .filter((c) => !c.is_draft)
    );
    setEditingCard(null);

    // Background DB update + refetch. Same contract as the add path: the refetch restores
    // the server's copy of the card, and the toast says why it reverted.
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, front, back, notes, category, is_draft: isDraft, source_ref: sourceRef }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Request failed");
      }
    } catch (error) {
      console.error("Error updating card:", error);
      toast.error(error instanceof Error && error.message !== "Request failed" ? error.message : "Couldn't update card");
    }
    refetchCards();
  };

  // ENTER SHEET EDIT — seed a draft for every card in the deck, not just the rows the
  // current search/filter leaves visible: the drafts are keyed by id and a row that
  // scrolls out of the filter mid-edit must keep (and save) what was typed into it.
  // Deliberately does NOT autofocus a field: the sheet turns the whole deck editable and
  // the user picks where to start, so focusing the first row would open the soft keyboard
  // and scroll them somewhere they didn't ask to be (unlike a modal with one obvious
  // first field — see the field-autofocus skill).
  const startSheetEdit = () => {
    setSheetDrafts(Object.fromEntries(allCards.map((card) => [card.id, draftFromCard(card)])));
    // Selection is hidden for the duration (see `selectable` on the row list); drop what was
    // selected with it, so leaving the sheet doesn't restore a bulk-delete target the user
    // has since forgotten about.
    setSelectedCardIds(new Set());
  };

  // LEAVE SHEET EDIT — one exit for Cancel, for a successful save, and for the view
  // toggle. Discards the drafts and any row that was never written; the caller decides
  // whether anything was saved.
  const exitSheetEdit = () => {
    setSheetDrafts(null);
    setPendingRows([]);
  };

  // Cancel, from the toolbar. Says what it cost when that is more than nothing — a pass
  // that added rows as well as edited them can lose work the changed-count alone doesn't
  // account for.
  const cancelSheetEdit = () => {
    if (sheetHasWork) toast("Unsaved card edits discarded");
    exitSheetEdit();
  };

  // ADD A ROW — below `anchor`, or at the end of the deck when it is null (the table's own
  // last line). The row is client-side until the sheet is saved: a card needs a front, and a
  // brand-new row hasn't got one yet. Entering sheet edit from here rather than requiring it
  // first is deliberate — "add a card below this one" is a complete intention on its own, and
  // the row it makes is only useful once you can type in it.
  const insertRowBelow = (anchor: CardWithProgress | null) => {
    if (!sheetDrafts) startSheetEdit();
    setPendingRows((prev) => [...prev, {
      tempId: generateUUID(),
      afterCardId: anchor?.id ?? null,
      front: "",
      back: "",
      notes: "",
      // A card added below another starts in its category — inserting into a run is how you
      // extend that run, and the table is ordered by category, so a new row with no category
      // would jump out of the place it was just put.
      category: anchor?.category ?? "",
      isDraft: false,
    }]);
  };

  // Stable identity so the row list's effect doesn't re-fire on every parent render.
  const handleVisibleCardsChange = useCallback((items: CardWithProgress[]) => {
    setVisibleCardIds(new Set(items.map((card) => card.id)));
  }, []);

  const updatePendingRow = (tempId: string, patch: Partial<CardSheetDraft>) => {
    setPendingRows((prev) => prev.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row)));
  };

  const discardPendingRow = (tempId: string) => {
    setPendingRows((prev) => prev.filter((row) => row.tempId !== tempId));
  };

  // Edit one cell of one row.
  const updateSheetDraft = (cardId: string, patch: Partial<CardSheetDraft>) => {
    setSheetDrafts((prev) => (prev ? { ...prev, [cardId]: { ...prev[cardId], ...patch } } : prev));
  };

  // Put one row back to the card it was seeded from — the sheet equivalent of closing
  // the edit modal without saving, for when only one of several rows went wrong.
  const revertSheetRow = (card: CardWithProgress) => {
    setSheetDrafts((prev) => (prev ? { ...prev, [card.id]: draftFromCard(card) } : prev));
  };

  // SAVE THE WHOLE SHEET — every changed row in one request, so the table the user is
  // looking at either matches the deck afterwards or is untouched. Optimistic like the
  // single-card edit: paint the new values, close edit mode, then reconcile.
  const handleSaveSheet = async () => {
    if (!sheetDrafts) return;

    const changed = dirtySheetCards;
    const added = filledPendingRows;
    if (changed.length === 0 && added.length === 0) {
      exitSheetEdit();
      return;
    }

    // A blank front would be rejected row-by-row by the API anyway, but the batch is
    // all-or-nothing — so catch it here and keep the user in the sheet with their other
    // edits intact rather than failing the whole save on one empty cell. New rows are held
    // to the same rule: a row with an answer and no question is a half-written card, not an
    // abandoned one, so it's an error rather than something to silently drop.
    const blank = changed.find((card) => !sheetDrafts[card.id].front.trim());
    if (blank) {
      toast.error("Every card needs a front");
      return;
    }
    if (added.some((row) => !row.front.trim())) {
      toast.error("Every new card needs a front");
      return;
    }

    const payload = changed.map((card) => ({
      cardId: card.id,
      front: sheetDrafts[card.id].front.trim(),
      back: sheetDrafts[card.id].back.trim(),
      notes: sheetDrafts[card.id].notes.trim() || null,
      category: sheetDrafts[card.id].category.trim() || null,
      is_draft: sheetDrafts[card.id].isDraft,
    }));
    const byId = new Map(payload.map((row) => [row.cardId, row]));

    // NEW ROWS, in the order they sit in the table — two rows added below the same card keep
    // the sequence they were typed in, because each insert pushes the previous one down.
    const createPayload = added.map((row) => ({
      front: row.front.trim(),
      back: row.back.trim(),
      notes: row.notes.trim() || null,
      category: row.category.trim() || null,
      is_draft: row.isDraft,
      after_card_id: row.afterCardId,
    }));

    // Client update first
    const applyEdits = (card: CardWithProgress): CardWithProgress => {
      const row = byId.get(card.id);
      return row ? { ...card, front: row.front, back: row.back, notes: row.notes, category: row.category, is_draft: row.is_draft } : card;
    };
    setAllCards((prev) => prev.map(applyEdits));
    // Same reasoning as the single-card edit: a sheet save can make a card unstudyable
    // (marked draft), so the due list is re-filtered, not just mapped.
    setDueCards((prev) => prev.map(applyEdits).filter((c) => !c.is_draft));

    setIsSavingSheet(true);
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: payload, create: createPayload }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || "Request failed");
      }
      const saidChanged = changed.length > 0 ? (changed.length === 1 ? "1 card updated" : `${changed.length} cards updated`) : "";
      const saidAdded = added.length > 0 ? (added.length === 1 ? "1 card added" : `${added.length} cards added`) : "";
      toast.success([saidChanged, saidAdded].filter(Boolean).join(", "));
      exitSheetEdit();
    } catch (error) {
      console.error("Error saving card table:", error);
      toast.error(error instanceof Error && error.message !== "Request failed" ? error.message : "Couldn't save changes");
      // Nothing was written (the batch is one transaction), so leave the user in the
      // sheet with their edits — the refetch below restores the stored values underneath.
    } finally {
      setIsSavingSheet(false);
      refetchCards();
    }
  };

  // MOVE A CARD — commits a drag in the table view. The table hands back the card's new
  // neighbours rather than a whole order, because a search or filter means what it shows is a
  // subsequence of the deck: the move is spliced into the deck's own `order_index` sequence
  // beside the neighbour it was dropped against, so every card the user can't currently see
  // keeps its place. Both neighbours are in the dragged card's category (the table clamps the
  // drop to its run), so the ordering the page renders agrees with what is stored.
  const handleReorderCard = async (sourceId: string, afterId: string | null, beforeId: string | null) => {
    const order = [...allCards]
      .sort((a, b) => a.order_index - b.order_index)
      .map((card) => card.id)
      .filter((cardId) => cardId !== sourceId);

    let at: number;
    if (afterId) {
      const anchor = order.indexOf(afterId);
      if (anchor === -1) return;
      at = anchor + 1;
    } else if (beforeId) {
      const anchor = order.indexOf(beforeId);
      if (anchor === -1) return;
      at = anchor;
    } else {
      return;
    }
    order.splice(at, 0, sourceId);

    // Client update first — the new indices are exactly what the server will renumber to, so
    // the table settles into its final order immediately instead of on the refetch.
    const positionById = new Map(order.map((cardId, index) => [cardId, index]));
    setAllCards((prev) => prev.map((card) => ({ ...card, order_index: positionById.get(card.id) ?? card.order_index })));

    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: order }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Request failed");
      }
    } catch (error) {
      console.error("Error reordering cards:", error);
      toast.error(error instanceof Error && error.message !== "Request failed" ? error.message : "Couldn't move that card");
      refetchCards();
    }
  };

  // Delete a single card
  const handleDeleteCard = async (cardId: string) => {
    // Client update first
    setAllCards((prev) => prev.filter((c) => c.id !== cardId));
    setDueCards((prev) => prev.filter((c) => c.id !== cardId));
    setDeletingCard(null);
    setExpandedCardId((cur) => (cur === cardId ? null : cur));

    // Background DB delete + refetch
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (!response.ok) {
        toast.error("Failed to delete card");
      }
    } catch {
      toast.error("Failed to delete card");
    }
    refetchCards();
  };

  // Bulk delete selected cards
  const handleBulkDeleteCards = async () => {
    if (selectedCardIds.size === 0) return;

    // Client update first
    const idsToDelete = new Set(selectedCardIds);
    setAllCards((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
    setDueCards((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
    setSelectedCardIds(new Set());
    setShowBulkDeleteCards(false);
    setExpandedCardId((cur) => (cur && idsToDelete.has(cur) ? null : cur));

    // Background DB deletes
    setIsBulkDeleting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const cardId of idsToDelete) {
        try {
          const response = await fetch(`/modules/rune/api/decks/${id}/cards`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardId }),
          });
          if (response.ok) { successCount++; } else { failCount++; }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Deleted ${successCount} card${successCount === 1 ? "" : "s"}`);
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} card${failCount === 1 ? "" : "s"}`);
      }

      // Refetch for data integrity
      refetchCards();
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Handle card-level refinement result
  const handleCardRefined = (cardId: string, front: string, back: string, notes: string | null) => {
    setAllCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes } : c)
    );
    setDueCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes } : c)
    );
    refetchCards();
  };

  // Edit deck
  const handleEditDeck = async (name: string, description: string | null, sourceUrl: string | null) => {
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, sourceUrl }),
      });
      if (response.ok) {
        setDeck((prev) => prev ? { ...prev, name, description, source_url: sourceUrl } : prev);
        setShowEditDeck(false);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update deck");
      }
    } catch (error) {
      console.error("Error updating deck:", error);
      toast.error("Failed to update deck");
    }
  };

  // Delete deck
  const handleDeleteDeck = async () => {
    const response = await fetch(`/modules/rune/api/decks/${id}`, { method: "DELETE" });
    if (response.ok) {
      router.push("/modules/rune/ui/decks");
    }
  };

  // LOADING
  if (isLoading) {
    return (
      <div className="page">
        <main className="page-container">
          <div className="loading-container py-16">
            <div className="loading-spinner" />
          </div>
        </main>
      </div>
    );
  }

  // NOT FOUND
  if (notFound || !deck) {
    return (
      <div className="page">
        <main className="page-container">
          {/* BACK BUTTON */}
          <BackLink
            fallback="/modules/rune/ui/decks"
            className="btn btn-link !pl-0 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </BackLink>

          {/* NOT FOUND MESSAGE */}
          <div className="card">
            <p className="text-secondary text-center py-8">Deck not found</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      {/* PRE-SESSION: deck info + start button */}
      {!isStudying && (
        <div className="page">
          {/* The table view trades the page's comfortable reading gutters for width —
              two full-text columns need every pixel, and the todo asked for max width. */}
          <main className={`page-container rune-deck-container ${cardView === "table" ? "rune-deck-container--wide" : ""}`}>

            {/* HEADER */}
            <div className="flex items-center justify-between mb-4">
              <div>
                {/* BACK BUTTON */}
                <BackLink
                  fallback="/modules/rune/ui/decks"
                  className="btn btn-link !pl-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </BackLink>

                {/* TITLE */}
                <h1 className="text-page-title flex items-center gap-2 flex-wrap">
                  {deck.name}

                  {/* DISABLED BADGE */}
                  {deck.is_disabled && (
                    <span className="badge badge-gray">Disabled</span>
                  )}
                </h1>
                {deck.description && (
                  <p className="text-secondary">{deck.description}</p>
                )}
              </div>

              {/* DECK ACTIONS — every deck-level action lives in one overflow menu. They used to be
                  four naked icon buttons crowding the title; the menu labels each action in words
                  (an icon alone can't say what "power" does to a deck) and leaves the header calm. */}
              <div ref={deckMenuAnchorRef}>
                <Button
                  className="btn-link !p-2"
                  onClick={() => setIsDeckMenuOpen((open) => !open)}
                  title="Deck actions"
                  aria-label="Deck actions"
                  aria-haspopup="menu"
                  aria-expanded={isDeckMenuOpen}
                >
                  <EllipsisVertical className="w-5 h-5" />
                </Button>
              </div>

              {/* DECK ACTIONS MENU */}
              <PopoverMenu open={isDeckMenuOpen} onClose={() => setIsDeckMenuOpen(false)} anchorRef={deckMenuAnchorRef} className="popover-menu--wide">

                {/* REFINE ITEM */}
                <button
                  onClick={() => { setIsDeckMenuOpen(false); setShowRefineDeck(true); }}
                  className="popover-item"
                  disabled={allCards.length === 0}
                >
                  <Sparkles className="w-4 h-4 mr-3" />
                  Refine with AI
                </button>

                {/* EDIT ITEM */}
                <button
                  onClick={() => { setIsDeckMenuOpen(false); setShowEditDeck(true); }}
                  className="popover-item"
                >
                  <Pencil className="w-4 h-4 mr-3" />
                  Edit deck
                </button>

                {/* DISABLE / ENABLE ITEM — pauses the deck's scheduling without touching its cards */}
                <button
                  onClick={() => { setIsDeckMenuOpen(false); toggleDeckDisabled(); }}
                  className="popover-item"
                  title={deck.is_disabled ? "Count this deck's cards as due again" : "Stop counting this deck toward due totals, the daily review email and collection sessions"}
                >
                  {deck.is_disabled ? <Power className="w-4 h-4 mr-3" /> : <PowerOff className="w-4 h-4 mr-3" />}
                  {deck.is_disabled ? "Enable deck" : "Disable deck"}
                </button>

                {/* IMPORT ITEM — bulk-adds cards from a spreadsheet export, appended to the
                    end of the deck. Sits with the deck-level actions because it writes many
                    cards at once; the table's own "Add card" row is the one-at-a-time path. */}
                <button
                  onClick={() => { setIsDeckMenuOpen(false); setShowImportCards(true); }}
                  className="popover-item"
                  title="Add cards in bulk from a CSV file"
                >
                  <Upload className="w-4 h-4 mr-3" />
                  Import cards from CSV
                </button>

                <div className="popover-separator" />

                {/* DELETE ITEM */}
                <button
                  onClick={() => { setIsDeckMenuOpen(false); setShowDeleteDeck(true); }}
                  className="popover-item popover-item-danger"
                >
                  <Trash2 className="w-4 h-4 mr-3" />
                  Delete deck
                </button>
              </PopoverMenu>
            </div>

            {/* STATS */}
            <div className="stat-section mb-6">
              {/* TOTAL CARDS */}
              <div className="stat-card">
                <p className="stat-label">Cards</p>
                <p className="stat-value">{allCards.length}</p>
              </div>

              {/* DUE CARDS — a disabled deck schedules nothing, so it reports no due cards here
                  too, matching the deck list, the Rune home total and the dashboard badge. */}
              <div className="stat-card">
                <p className="stat-label">Due</p>
                <p className="stat-value">
                  {deck.is_disabled ? <span className="text-subtle">—</span> : dueCards.length}
                </p>
              </div>

              {/* TODAY'S PROGRESS — global daily goal, counts every deck (not just this one) */}
              <div className="stat-card">
                <p className="stat-label">Today · all decks</p>
                <p className={`stat-value ${goalMet ? "text-alert-green" : ""}`}>
                  {reviewedToday}
                  <span className="text-subtle text-base"> / {dailyGoal}</span>
                </p>
              </div>

              {/* LAST REVIEWED */}
              <div className="stat-card">
                <p className="stat-label">Last Reviewed</p>
                <p className="stat-value text-base">
                  {formatRelativePast(deck.last_reviewed_at)}
                </p>
              </div>
            </div>

            {/* DISABLED NOTE — one line. The badge by the title is the indicator; this just says what
                pausing excluded the deck from, since that isn't guessable from the word "Disabled". */}
            {deck.is_disabled && (
              <p className="text-subtle mb-3">
                Paused — left out of due counts, the daily review email and collection sessions. Study it here any time.
              </p>
            )}

            {/* DAILY MAX RENEW WARNING (soft — never blocks study) */}
            {overMaxRenew && (
              <p className="text-alert-yellow text-sm mb-3">
                You&apos;ve reviewed {reviewedToday} cards today, past your daily max of {dailyMaxRenew}. All due cards stay available — this is just a nudge to rest.
              </p>
            )}

            {/* HANDS-FREE CHECKBOX */}
            <label className="flex items-center gap-2 mb-3 cursor-pointer text-secondary">
              <input
                type="checkbox"
                checked={handsFree}
                onChange={(e) => setHandsFree(e.target.checked)}
              />
              Hands-free mode
            </label>

            {/* START BUTTON — a disabled deck is still studiable on demand, just never nagged about.
                The label doesn't flip to "Study Anyway": pressing Start on a deck you can see is
                marked Disabled is already the deliberate choice that phrasing was asking for. */}
            <Button
              onClick={() => setIsStudying(true)}
              className="btn-blue w-full"
              disabled={studyCards.length === 0}
              title={studyNarrowed ? "Studies only the cards the filter is showing" : undefined}
            >
              Start Study Session
            </Button>

            {/* FILTERED-SESSION NOTE — the session follows the card list's filter, which is a
                surprise if it isn't said out loud: the DUE stat above still counts the whole
                deck. Only shown when the filter actually holds cards back. */}
            {studyNarrowed && (
              <p className="rune-study-scope-note">
                {studyCards.length === 0
                  ? "No due cards match the current filter — clear it to study the rest of the deck."
                  : `Studying ${studyCards.length} of ${dueCards.length} due cards — the rest are hidden by the current filter.`}
              </p>
            )}

            {/* CARDS SECTION */}
            <div className="card mt-6">

              {/* CARD HEADER */}
              <div className="card-header">
                <h2 className="text-card-title">
                  Cards
                </h2>

                <div className="flex items-center gap-2">

                  {/* BULK DELETE BUTTON */}
                  <Button
                    onClick={() => setShowBulkDeleteCards(true)}
                    disabled={selectedCardIds.size === 0 || isBulkDeleting}
                    className="btn-red relative !p-2"
                    title={selectedCardIds.size > 0 ? `Delete ${selectedCardIds.size} card${selectedCardIds.size === 1 ? "" : "s"}` : "Select cards to delete"}
                  >
                    <Trash2 className="w-4 h-4" />
                    {selectedCardIds.size > 0 && (
                      <span className="notification-count-red absolute -top-1 -right-1">
                        {selectedCardIds.size}
                      </span>
                    )}
                  </Button>
                </div>
              </div>

              <div className="card-content">

                {/* ADD CARD BUTTON — list view only. The table has its own last line for
                    this, and a per-row insert besides; a full-width button above the search
                    field would be a third way to do the same thing, pushing the cards
                    themselves further down a view whose whole point is showing them. */}
                {cardView === "list" && (
                  <div className="pb-3">
                    <Button
                      onClick={() => setIsAddingCard(true)}
                      className="btn-link w-full"
                    >
                      <Plus className="w-4 h-4" />
                      Add Card
                    </Button>
                  </div>
                )}

                {/* EMPTY PLACEHOLDER */}
                {allCards.length === 0 && (
                  <div className="empty-state">
                    <p className="empty-state-title">No cards in this deck</p>
                    <p className="empty-state-body">Add one to get started.</p>
                  </div>
                )}

                {allCards.length > 0 && (

                  /* CARD ROWS — front is the row label (marquees on hover if it
                     overflows); expanding a row swaps in the full front/back/notes
                     detail instead of opening a modal. Bulk selection (for the
                     header's delete button) is the row list's own built-in
                     "Select" mode — feeds selectedCardIds. The category filter dropdown
                     also carries a "Status" group (Drafts / Published) when the deck has
                     any drafts — see statusFilterOptions. The sort toggle on that same
                     row cycles the order; only its default keeps category grouping. */
                  <ExpandableRowList
                    items={sortedCards}
                    getId={(card) => card.id}
                    selectedId={expandedCardId}
                    onToggle={(id) => setExpandedCardId((cur) => (cur === id ? null : id))}
                    // Bulk selection steps aside while the sheet is open: its checkbox wants
                    // the same gutter the row's position uses, and selecting cards to delete
                    // in the middle of editing them all is two intentions at once. Hiding it
                    // also gives the toolbar its line back on a phone.
                    selectable={!sheetDrafts}
                    selectedIds={selectedCardIds}
                    onSelectedIdsChange={setSelectedCardIds}
                    searchable
                    searchPlaceholder="Search cards…"
                    getSearchText={(card) => `${card.front} ${card.back} ${card.notes ?? ""} ${card.source_ref ?? ""}`}
                    filterLabel="Category"
                    getFilterValue={(card) => card.category}
                    // Draft status folded into the same filter dropdown (only when the
                    // deck actually has drafts) rather than a separate control.
                    filterExtraGroupLabel="Status"
                    filterExtraOptions={statusFilterOptions}
                    sortOptions={SORT_OPTIONS}
                    sortValue={sortKey}
                    onSortChange={(value) => setSortKey(value as CardSortKey)}
                    onVisibleItemsChange={handleVisibleCardsChange}
                    sortLabel="cards"
                    // TABLE VIEW — same cards, same search/filter/sort, laid out as
                    // front-beside-back so a whole deck can be read (or proofread) in
                    // one pass instead of one card at a time. Backs render through
                    // CardContent, the study session's own renderer, so an embedded
                    // image or list looks the same here as it will in a review.
                    isTableView={cardView === "table"}
                    onTableViewChange={(isTable) => changeCardView(isTable ? "table" : "list")}
                    tableViewLabel="cards"
                    renderTable={(cards, selection) => (
                      <CardTable
                        cards={cards}
                        selection={selection}
                        existingCategories={existingCategories}
                        sheetDrafts={sheetDrafts}
                        onDraftChange={updateSheetDraft}
                        onRevertRow={revertSheetRow}
                        isSaving={isSavingSheet}
                        pendingRows={pendingRows}
                        onInsertBelow={insertRowBelow}
                        onPendingChange={updatePendingRow}
                        onDiscardPending={discardPendingRow}
                        onHistory={setHistoryCard}
                        onRefine={setRefiningCard}
                        onDelete={setDeletingCard}
                        canReorder={sortKey === "category"}
                        reorderHint="Switch the sort to Category to drag cards into a new order."
                        onReorder={handleReorderCard}
                      />
                    )}
                    // SHEET CONTROLS — one Edit button for the whole table, on the same line
                    // as Select rather than a bar of its own. The table is the view for
                    // working through a deck in bulk, so a pencil on every row (each opening
                    // a modal for one card) was the wrong shape for it: this makes every row's
                    // cells editable at once and saves them together. The list view still
                    // opens the full card editor, which is also where notes and source live.
                    toolbarExtra={cardView === "table" ? (
                      sheetDrafts ? (
                        <>
                          <span className="text-subtle mr-auto">{sheetStatusLabel}</span>
                          <Button className="btn-off" onClick={cancelSheetEdit} disabled={isSavingSheet}>
                            Cancel
                          </Button>
                          <Button
                            className="btn-blue"
                            onClick={handleSaveSheet}
                            disabled={isSavingSheet || !sheetHasWork}
                            title="Save every changed and added row at once"
                          >
                            <Check className="w-4 h-4" />
                            {isSavingSheet ? "Saving..." : "Save"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          className="btn-link"
                          onClick={startSheetEdit}
                          disabled={allCards.length === 0}
                          title="Edit every card's front, back, category and draft flag in place, then save them together"
                          aria-label="Edit all cards in the table"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </Button>
                      )
                    ) : undefined}
                    // Category grouping only holds while the list is actually in category
                    // order — every other sort interleaves categories, which would render
                    // as a run of one-row "sections". So the grouping (and its toggle)
                    // drop out entirely rather than showing something misleading.
                    getSectionLabel={sortKey === "category" ? (card) => card.category || "Uncategorized" : undefined}
                    groupToggleLabel={sortKey === "category" ? "Group by category" : undefined}
                    renderLabel={(card) => card.front}
                    // Subtle leading dot marks draft cards in the list; the framed icon tile
                    // would be too heavy for a status indicator.
                    renderMarker={(card) => (card.is_draft ? <span className="dot-yellow" title="Draft" aria-label="Draft" /> : null)}
                    labelLines={3}
                    backLabel="Cards"
                    detailEmptyMessage="Select a card to view its back"
                    renderDetailHeader={(card) => (
                      <>
                        <h3 className="text-card-title flex-1 min-w-0">{card.front}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button className="btn-link" aria-label="Rating history" title="Rating history" onClick={() => setHistoryCard(card)}>
                            <History className="w-4 h-4" />
                          </Button>
                          <Button className="btn-link" aria-label="Edit card" onClick={() => setEditingCard(card)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button className="btn-link" aria-label="Refine card" onClick={() => setRefiningCard(card)}>
                            <Sparkles className="w-4 h-4" />
                          </Button>
                          <Button className="btn-link-red" aria-label="Delete card" onClick={() => setDeletingCard(card)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    )}
                    renderDetail={(card) => (
                      <div className="flex flex-col gap-4">
                        {/* BACK — CardContent renders markdown (incl. pasted images), the same
                            renderer the study session uses, so an embedded image shows up here
                            too instead of just its raw ![]() syntax. A blank back is a valid
                            card, so the whole section drops out rather than framing an empty
                            box under a heading. */}
                        {card.back.trim() && (
                          <div>
                            <p className="text-subtle text-xs mb-1">Back</p>
                            <CardContent text={card.back} className="text-primary" />
                          </div>
                        )}
                        {card.notes && (
                          <div>
                            <p className="text-subtle text-xs mb-1">Notes</p>
                            <CardContent text={card.notes} className="text-secondary" />
                          </div>
                        )}
                        {/* SOURCE — the user's citation for the card's material. Rendered
                            through CardContent so a bare URL autolinks (remark-gfm) and a
                            [label](url) works, same as in the study session. Sits directly
                            under Notes, mirroring the study card's ordering. */}
                        {card.source_ref && (
                          <div>
                            <p className="text-subtle text-xs mb-1">Source</p>
                            <CardContent text={card.source_ref} className="text-secondary rune-card-source-text" />
                          </div>
                        )}
                        {(card.is_draft || card.category || (card.source && card.source !== "manual")) && (
                          <div className="flex flex-wrap gap-2">
                            {/* DRAFT BADGE — draft cards are hidden from study and the due count */}
                            {card.is_draft && (
                              <span className="badge-yellow inline-flex items-center gap-1 w-fit">Draft</span>
                            )}
                            {card.category && (
                              <span className="badge-blue inline-flex items-center gap-1 w-fit">{card.category}</span>
                            )}
                            {card.source && card.source !== "manual" && (
                              <span className="badge-gray inline-flex items-center gap-1 w-fit capitalize">{card.source}</span>
                            )}
                          </div>
                        )}

                        {/* RECALL TREND — this card's ratings over time, once it has a
                            couple. Compact: it is a glance at whether the card is
                            sticking, with the readable version in the history modal. */}
                        {expandedCardReviews?.cardId === card.id && expandedCardReviews.reviews.length > 1 && (
                          <RatingTrendChart reviews={expandedCardReviews.reviews} compact />
                        )}

                        {/* ORIGIN LINE — when the card was written and through which client
                            (web app / API / MCP). Deck view only, deliberately: the study
                            session shows the card alone, and provenance there is noise that
                            competes with recall. Cards predating created_via carry no channel,
                            so the "via …" clause drops out rather than guessing one. The
                            Modified row only appears once the card has actually been edited. */}
                        <div className="text-subtle text-xs">
                          <p>
                            Created {formatCardTimestamp(card.created_at)}
                            {authorName && ` by ${authorName}`}
                            {channelLabel(card.created_via) && ` via ${channelLabel(card.created_via)}`}
                          </p>
                          {wasModified(card) && (
                            <p>
                              Modified {formatCardTimestamp(card.modified_at)}
                              {channelLabel(card.modified_via) && ` via ${channelLabel(card.modified_via)}`}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  />
                )}
              </div>
            </div>

            {/* STUDY HISTORY SECTION — past sessions, their size, accuracy and length.
                Below the card list: it's a look back, not something to act on. */}
            <DeckHistorySection deckId={id} refreshKey={historyRefreshKey} />

            {/* TOASTER */}
            <Toaster />

            {/* MANAGE CARD MODAL (add / edit) */}
            <ManageCardModal
              isOpen={isAddingCard || !!editingCard}
              editCard={editingCard}
              onClose={() => { setIsAddingCard(false); setEditingCard(null); }}
              onAdd={handleAddCard}
              onEdit={handleEditCard}
              existingCategories={existingCategories}
            />

            {/* DELETE CARD MODAL (single) */}
            <DeleteCardModal
              card={deletingCard}
              onClose={() => setDeletingCard(null)}
              onConfirm={() => deletingCard ? handleDeleteCard(deletingCard.id) : Promise.resolve()}
            />

            {/* DELETE CARD MODAL (bulk) */}
            <DeleteCardModal
              isOpen={showBulkDeleteCards}
              bulkCount={selectedCardIds.size}
              onClose={() => setShowBulkDeleteCards(false)}
              onConfirm={handleBulkDeleteCards}
            />

            {/* REFINE DECK MODAL */}
            {/* IMPORT CARDS MODAL */}
      <ImportCardsModal
        isOpen={showImportCards}
        deckId={id}
        onClose={() => setShowImportCards(false)}
        onImported={refetchCards}
      />

      <RefineDeckModal
              isOpen={showRefineDeck}
              deckId={id}
              onClose={() => setShowRefineDeck(false)}
              onApplied={refetchCards}
            />

            {/* REFINE CARD MODAL */}
            <RefineCardModal
              card={refiningCard}
              deckId={id}
              onClose={() => setRefiningCard(null)}
              onRefined={handleCardRefined}
            />

            {/* CARD RATING HISTORY MODAL */}
            <CardHistoryModal
              card={historyCard}
              deckId={id}
              onClose={() => setHistoryCard(null)}
            />

            {/* EDIT DECK MODAL */}
            <EditDeckModal
              isOpen={showEditDeck}
              onClose={() => setShowEditDeck(false)}
              name={deck.name}
              description={deck.description}
              sourceUrl={deck.source_url}
              onSave={handleEditDeck}
            />

            {/* DELETE DECK MODAL */}
            <DeleteDeckModal
              isOpen={showDeleteDeck}
              onClose={() => setShowDeleteDeck(false)}
              deckName={deck.name}
              onConfirm={handleDeleteDeck}
            />
          </main>
        </div>
      )}

      {/* STUDY SESSION — mounted even while idle so the first card's audio and
          images are already warm when "Start Study Session" is pressed. */}
      <StudySession
        isActive={isStudying}
        sourceName={deck.name}
        studyApiBase={`/modules/rune/api/decks/${id}`}
        cardUrlBase={`/modules/rune/ui/decks/${id}`}
        cards={studyCards}
        handsFree={handsFree}
        onHandsFreeChange={setHandsFree}
        preferences={studyPreferences}
        existingCategories={existingCategories}
        onRefetchCards={refetchCards}
        onQuit={handleQuitStudy}
        onExit={() => router.push("/modules/rune/ui/decks")}
        exitLabel="Back to Decks"
      />
    </>
  );
}
