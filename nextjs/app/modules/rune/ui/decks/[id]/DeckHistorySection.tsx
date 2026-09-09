"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { formatRelativePast } from "@/lib/format";
import DateRangeSelector from "@/components/DateRangeSelector";
import { DateRangePreset, dateRangeOptions, getDateRangeBounds, toLocalDateString } from "@/lib/dateRange";
import { DeckStudySession } from "../../../types/study";
import StudyHistoryCharts from "../../../components/StudyHistoryCharts";

// How many sessions the table shows before the "Show all" toggle. Ten covers roughly the
// last fortnight of daily study — enough to see a trend without burying the page.
const COLLAPSED_ROWS = 10;

// Which windows the history offers. Narrower than the nutrition pages' set — a
// single day of study history is a row, not a view worth its own segment — and it
// keeps "All", because a deck's lifetime totals are the headline number here.
const HISTORY_RANGE_OPTIONS = dateRangeOptions(["1m", "3m", "1y", "all", "custom"]);

// Seconds to a compact human duration. Sessions run from a few seconds (one card) to
// well over an hour, so hours are spelled out rather than rolled into minutes.
function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;

  // Seconds are spelled out only under ten minutes. Past that they are noise, and the
  // extra token wrapped the Time column onto a second line at phone widths.
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 && minutes < 10 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Exact start time of a session — the relative label ("Yesterday") carries the row, this
// is the secondary line for when the day itself matters. Same shape CardHistoryModal uses,
// spelling out the year only for older sessions so the line stays short on a phone.
function formatSessionTimestamp(date: Date | string): string {
  const started = new Date(date);
  const isThisYear = started.getFullYear() === new Date().getFullYear();
  return started.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: isThisYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface DeckHistorySectionProps {
  deckId: string;
  // Bumped by the deck page when a study session ends, so the history picks up the
  // session that just finished without a full page reload.
  refreshKey: number;
}

// STUDY HISTORY — every past session that reviewed a card in this deck, with its size,
// how it went, and how long it took. Sits below the card list because it is a look back
// rather than something to act on; the stats above the Start button are the "right now".
export default function DeckHistorySection({ deckId, refreshKey }: DeckHistorySectionProps) {

  // DATA
  const [sessions, setSessions] = useState<DeckStudySession[]>([]);

  // INPUT
  const [showAll, setShowAll] = useState(false);
  // Defaults to "all" so the section opens on the deck's whole history — the same
  // thing it showed before there was a filter.
  const [range, setRange] = useState<DateRangePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // DERIVED — the selected window. Filtering is client-side because the endpoint
  // already returns the deck's whole history in one payload; there is nothing to
  // refetch, so a range change is instant. Sessions are placed by the viewer's
  // calendar day, matching both the bounds and the dates the rows print. A custom
  // range applies whichever bound is set, rather than waiting for both — a
  // half-picked range still narrows the list instead of doing nothing.
  const rangedSessions = useMemo(() => {
    const { startDate, endDate } = getDateRangeBounds(range, customStartDate, customEndDate);
    if (!startDate && !endDate) return sessions;
    return sessions.filter((session) => {
      const day = toLocalDateString(new Date(session.started_at));
      return (!startDate || day >= startDate) && (!endDate || day <= endDate);
    });
  }, [sessions, range, customStartDate, customEndDate]);

  // Totals across every session in the window, not just the visible rows, so
  // collapsing the table never changes what the summary claims.
  const summary = useMemo(() => {
    const reviews = rangedSessions.reduce((total, session) => total + session.reviews, 0);
    const correct = rangedSessions.reduce((total, session) => total + session.correct, 0);
    // A null duration only happens if a session's ratings carry no timestamps; count it
    // as zero rather than dropping the whole total.
    const seconds = rangedSessions.reduce((total, session) => total + (session.duration_seconds ?? 0), 0);
    return {
      reviews,
      correct,
      seconds,
      accuracy: reviews > 0 ? Math.round((correct / reviews) * 100) : null,
    };
  }, [rangedSessions]);

  const visibleSessions = showAll ? rangedSessions : rangedSessions.slice(0, COLLAPSED_ROWS);

  // LOAD HISTORY — refetched whenever refreshKey changes (i.e. after a study session).
  useEffect(() => {
    let cancelled = false;

    const fetchSessions = async () => {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        const response = await fetch(`/modules/rune/api/decks/${deckId}/study/sessions`);
        if (!response.ok) {
          if (!cancelled) setLoadFailed(true);
          return;
        }

        // Guard against an { error } envelope being set as the list.
        const data = await response.json();
        if (cancelled) return;
        if (Array.isArray(data)) {
          setSessions(data);
        } else {
          setLoadFailed(true);
        }
      } catch (error) {
        console.error("Error fetching deck study history:", error);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchSessions();
    return () => { cancelled = true; };
  }, [deckId, refreshKey]);

  return (

    /* STUDY HISTORY CARD */
    <div className="card mt-6">

      {/* CARD HEADER */}
      <div className="card-header">
        <h2 className="text-card-title">
          <History className="w-5 h-5" />
          Study History
        </h2>

        {/* HELP — the numbers here are deck-scoped slices of sessions that may have been
            larger, and some durations are estimates; neither is guessable from the table. */}
        <HelpButton
          title="Study History"
          sections={[
            { heading: "What a row is", body: "One past study session that reviewed at least one card in this deck, newest first. Sessions you opened and left without rating anything aren't listed — there is nothing to show for them." },
            { heading: "Cards", body: "How many ratings you submitted for this deck's cards in that session, and how many distinct cards those cover. The two differ when a card you rated Again came round a second time in the same session. Cards you have since deleted are not counted." },
            { heading: "Correct", body: "The share of those ratings that were Good or Easy — the same cut the study session scores a card correct on. The bar under the count breaks the session down by rating: red Again, yellow Hard, green Good, blue Easy. Hover it for the exact tally." },
            { heading: "Time", body: "How long the session took. A time marked with ~ is estimated from the timestamps on your ratings, either because you left the session without finishing it or because it was a collection session — see below." },
            { heading: "Date range", body: "The segmented control filters the table \u2014 and the four totals above it \u2014 to a window. \"All\" is the deck's whole history; \"Custom\" reveals a start and end date, and narrows as soon as either one is set." },
            { heading: "Collection sessions", body: "A session started from a collection studies several decks at once. It appears here with the collection's name, and every number on the row counts only the part of it that reviewed this deck." },
          ]}
        />
      </div>

      <div className="card-content">

        {/* LOADING PLACEHOLDER */}
        {isLoading && (
          <div className="loading-container py-8">
            <div className="loading-spinner" />
          </div>
        )}

        {/* LOAD FAILURE */}
        {!isLoading && loadFailed && (
          <div className="empty-state">
            <p className="empty-state-title">Couldn&apos;t load study history</p>
            <p className="empty-state-body">Reload the page to try again.</p>
          </div>
        )}

        {/* EMPTY PLACEHOLDER */}
        {!isLoading && !loadFailed && sessions.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-title">No study sessions yet</p>
            <p className="empty-state-body">Start a session above and it will show up here.</p>
          </div>
        )}

        {!isLoading && !loadFailed && sessions.length > 0 && (
          <>
            {/* RANGE FILTER — scopes the summary and the table together */}
            <div className="mb-4">
              <DateRangeSelector
                options={HISTORY_RANGE_OPTIONS}
                range={range}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onRangeChange={setRange}
                onCustomDateChange={(start, end) => { setCustomStartDate(start); setCustomEndDate(end); }}
                label="Study history date range"
              />
            </div>

            {/* TREND CHARTS — the window's sessions as shapes: how much was reviewed and
                how it was rated, then whether accuracy is moving. Hidden below two
                sessions, where there is no trend to draw. */}
            {rangedSessions.length >= 2 && (
              <div className="mb-4">
                <StudyHistoryCharts sessions={rangedSessions} />
              </div>
            )}

            {/* SUMMARY STATS — across every session that touched this deck in the window */}
            <div className="stat-section mb-4">

              {/* SESSION COUNT */}
              <div className="stat-card">
                <p className="stat-label">Sessions</p>
                <p className="stat-value">{rangedSessions.length}</p>
              </div>

              {/* TOTAL REVIEWS */}
              <div className="stat-card">
                <p className="stat-label">Reviews</p>
                <p className="stat-value">{summary.reviews}</p>
              </div>

              {/* OVERALL ACCURACY */}
              <div className="stat-card">
                <p className="stat-label">Good or better</p>
                <p className="stat-value">{summary.accuracy === null ? "-" : `${summary.accuracy}%`}</p>
              </div>

              {/* TOTAL TIME */}
              <div className="stat-card">
                <p className="stat-label">Time studied</p>
                <p className="stat-value text-base">{formatDuration(summary.seconds)}</p>
              </div>
            </div>

            {/* EMPTY WINDOW — the deck has history, this range just doesn't. Distinct from
                the never-studied placeholder above: the filter stays on screen so the
                window that hid the rows can be widened again. */}
            {rangedSessions.length === 0 && (
              <div className="empty-state">
                <p className="empty-state-title">No sessions in this range</p>
                <p className="empty-state-body">Widen the range to see earlier study sessions.</p>
              </div>
            )}

            {/* SESSION TABLE — four short columns, cells wrapping rather than scrolling
                sideways, so the whole row stays readable on a phone. */}
            {rangedSessions.length > 0 && (
            <div className="table-container">
              <table className="table rune-session-table">
                <thead className="table-header">
                  <tr className="table-header-row">
                    <th className="table-header-cell rune-session-col-when">When</th>
                    <th className="table-header-cell rune-session-col-cards">Cards</th>
                    <th className="table-header-cell rune-session-col-correct">Correct</th>
                    <th className="table-header-cell rune-session-col-time !text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="table-body">

                  {/* SESSION ROWS */}
                  {visibleSessions.map((session) => {
                    const accuracy = session.reviews > 0 ? Math.round((session.correct / session.reviews) * 100) : null;
                    const ratingTally = `${session.again} Again · ${session.hard} Hard · ${session.good} Good · ${session.easy} Easy`;

                    return (
                      <tr key={session.id} className="table-row">

                        {/* WHEN CELL — relative over exact, with the collection's name when the
                            session was a multi-deck run this deck was only part of. */}
                        <td className="table-cell">
                          <p>{formatRelativePast(session.started_at)}</p>
                          <p className="text-subtle text-xs">{formatSessionTimestamp(session.started_at)}</p>
                          {session.collection_name && (
                            <span className="badge-gray inline-flex items-center gap-1 w-fit mt-1" title={`Part of a study session across the "${session.collection_name}" collection`}>
                              {session.collection_name}
                            </span>
                          )}
                        </td>

                        {/* CARDS CELL — ratings submitted, the distinct cards behind them when
                            a lapse made those differ, and the session's rating mix as a bar. */}
                        <td className="table-cell">
                          <p>{session.reviews}</p>
                          {session.cards !== session.reviews && (
                            <p className="text-subtle text-xs">{session.cards} unique</p>
                          )}
                          <div className="rune-rating-bar" title={ratingTally} aria-label={ratingTally}>
                            {session.again > 0 && <div className="flashcard-progress-segment-again" style={{ flexGrow: session.again }} />}
                            {session.hard > 0 && <div className="flashcard-progress-segment-hard" style={{ flexGrow: session.hard }} />}
                            {session.good > 0 && <div className="flashcard-progress-segment-good" style={{ flexGrow: session.good }} />}
                            {session.easy > 0 && <div className="flashcard-progress-segment-easy" style={{ flexGrow: session.easy }} />}
                          </div>
                        </td>

                        {/* CORRECT CELL */}
                        <td className="table-cell">
                          <p>{accuracy === null ? "-" : `${accuracy}%`}</p>
                          <p className="text-subtle text-xs">{session.correct}/{session.reviews}</p>
                        </td>

                        {/* TIME CELL — a "~" marks a duration measured off the rating timestamps
                            rather than recorded by a finished session (see the help). */}
                        <td className="table-cell !text-right">
                          <p title={session.is_duration_exact ? undefined : "Estimated from the times of your ratings"}>
                            {/* An estimate of zero means the slice held a single rating, so
                                there are no two timestamps to measure between — that is an
                                unknown length, not a session that took no time. */}
                            {session.duration_seconds === null || (!session.is_duration_exact && session.duration_seconds === 0)
                              ? "-"
                              : `${session.is_duration_exact ? "" : "~"}${formatDuration(session.duration_seconds)}`}
                          </p>
                          {session.avg_response_ms != null && (
                            <p className="text-subtle text-xs">{(session.avg_response_ms / 1000).toFixed(1)}s/card</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {/* SHOW ALL TOGGLE — only once the window holds more history than the
                collapsed table shows */}
            {rangedSessions.length > COLLAPSED_ROWS && (
              <Button
                onClick={() => setShowAll((current) => !current)}
                className="btn-link w-full mt-2"
              >
                {showAll ? `Show last ${COLLAPSED_ROWS}` : `Show all ${rangedSessions.length} sessions`}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
