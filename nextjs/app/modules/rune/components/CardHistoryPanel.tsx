"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRelativePast, formatRelativeFuture } from "@/lib/format";
import { CardWithProgress, CardReview } from "../types/card";
import { ratingLabel, ratingBadgeClass } from "../lib/rating";
import RatingTrendChart from "./RatingTrendChart";

// ONE CARD'S HISTORY — the SRS state it currently sits at, the trend behind it, and
// every rating it has ever been given. Shared by the deck page's Rating History modal
// and the study session's in-session history section, so the same card reads the same
// way in both places; the only difference is the chrome each caller wraps it in.

interface CardHistoryPanelProps {
  // The card the history belongs to — supplies the SRS summary (ease/interval/next
  // review), which lives on the card row rather than in the review log.
  card: CardWithProgress | null;
  // Reviews as the API returns them, newest first.
  reviews: CardReview[];
  isLoading: boolean;
  loadFailed: boolean;
  // When set, the table shows only this many rows behind a "Show all" toggle. The
  // modal leaves it unset (it scrolls); the study session caps it so a long-lived
  // card's history doesn't push the rest of the session off screen.
  collapsedRows?: number;
  // Copy for the never-rated case, which differs by where the panel is shown.
  emptyBody?: string;
  // Likewise for the recovery step after a failed load — closing a modal is not the
  // same advice as reloading a page.
  failureBody?: string;
  // The study session hides the next-review tile: in a session the card is in hand
  // and about to be rated, so when it comes back is about to change anyway. The deck
  // page, where the card is being reviewed as a record, keeps it.
  showNextReview?: boolean;
}

// Exact timestamp for a review — the relative label ("3d ago") carries the row,
// this is the secondary line for when the day itself matters. The year is only
// spelled out for older reviews so the line stays single-row on a phone.
function formatReviewTimestamp(date: Date): string {
  const reviewed = new Date(date);
  const isThisYear = reviewed.getFullYear() === new Date().getFullYear();
  return reviewed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: isThisYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CardHistoryPanel({
  card,
  reviews,
  isLoading,
  loadFailed,
  collapsedRows,
  emptyBody = "This card hasn't come up in a study session.",
  failureBody = "Reload the page to try again.",
  showNextReview = true,
}: CardHistoryPanelProps) {

  // INPUT
  const [showAll, setShowAll] = useState(false);

  // Collapse again when the panel moves to another card, so a card with two reviews
  // isn't shown under a stale "Show last 5" toggle.
  useEffect(() => {
    setShowAll(false);
  }, [card?.id]);

  // DERIVED — share of ratings that were Good or Easy, the same >=3 cut the
  // study session scores a card "correct" on.
  const correctCount = reviews.filter((review) => review.rating >= 3).length;
  const successRate = reviews.length > 0 ? Math.round((correctCount / reviews.length) * 100) : null;

  const visibleReviews = collapsedRows && !showAll ? reviews.slice(0, collapsedRows) : reviews;

  return (
    <>
      {/* SRS SUMMARY — current scheduling state, the outcome of the ratings below.
          Laid out as a grid that fits itself to the container rather than
          `.stat-section`'s single flex row or a viewport-breakpoint column count:
          this panel is rendered both in a modal and in the study session's rail,
          and a column count chosen by viewport width breaks the labels mid-word
          ("INTER VAL") in the narrow one while the window is wide. */}
      <div className="rune-stat-grid mb-4">

        {/* REVIEW COUNT */}
        <div className="stat-card">
          <p className="stat-label">Reviews</p>
          <p className="stat-value">{reviews.length}</p>
        </div>

        {/* SUCCESS RATE */}
        <div className="stat-card">
          <p className="stat-label">Good or better</p>
          <p className="stat-value">{successRate === null ? "-" : `${successRate}%`}</p>
        </div>

        {/* EASE FACTOR */}
        <div className="stat-card">
          <p className="stat-label">Ease</p>
          <p className="stat-value">{card?.ease_factor != null ? Number(card.ease_factor).toFixed(2) : "-"}</p>
        </div>

        {/* CURRENT INTERVAL */}
        <div className="stat-card">
          <p className="stat-label">Interval</p>
          <p className="stat-value">{card?.interval_days != null ? `${card.interval_days}d` : "-"}</p>
        </div>

        {/* NEXT REVIEW */}
        {showNextReview && (
          <div className="stat-card">
            <p className="stat-label">Next Review</p>
            <p className="stat-value text-base">{formatRelativeFuture(card?.next_review_at ?? null)}</p>
          </div>
        )}
      </div>

      {/* LOADING PLACEHOLDER */}
      {isLoading && (
        <div className="loading-container py-8">
          <div className="loading-spinner" />
        </div>
      )}

      {/* LOAD FAILURE */}
      {!isLoading && loadFailed && (
        <div className="empty-state">
          <p className="empty-state-title">Couldn&apos;t load rating history</p>
          <p className="empty-state-body">{failureBody}</p>
        </div>
      )}

      {/* EMPTY PLACEHOLDER */}
      {!isLoading && !loadFailed && reviews.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-title">No ratings yet</p>
          <p className="empty-state-body">{emptyBody}</p>
        </div>
      )}

      {/* RECALL TREND — the ratings below as a trajectory. Above the table because the
          shape answers "is this card sticking?" at a glance, which is the question the
          table only answers by being read row by row. */}
      {!isLoading && !loadFailed && reviews.length > 1 && (
        <div className="mb-4">
          <RatingTrendChart reviews={reviews} />
        </div>
      )}

      {/* REVIEW TABLE — newest first, matching the API's ordering. Two columns only:
          a third (response time) pushed the table past the modal's edge on a phone,
          and it's blank for every review predating response-time capture — so it
          rides along under the timestamp when it exists instead. */}
      {!isLoading && !loadFailed && reviews.length > 0 && (
        <div className="table-container">
          <table className="table">
            <thead className="table-header">
              <tr className="table-header-row">
                <th className="table-header-cell">When</th>
                <th className="table-header-cell !text-right w-0">Rating</th>
              </tr>
            </thead>
            <tbody className="table-body">

              {/* REVIEW ROWS */}
              {visibleReviews.map((review) => (
                <tr key={review.id} className="table-row">
                  {/* The compact cell drops `.table-cell`'s nowrap, so a full
                      timestamp wraps inside a narrow container instead of forcing
                      the table into a horizontal scroll on a phone. */}
                  <td className="table-cell-compact">
                    <p>{formatRelativePast(review.created_at)}</p>
                    <p className="text-subtle text-xs">
                      {formatReviewTimestamp(review.created_at)}
                      {review.response_time_ms != null && ` · ${(review.response_time_ms / 1000).toFixed(1)}s`}
                    </p>
                  </td>
                  <td className="table-cell-compact !text-right">
                    <span className={`${ratingBadgeClass(review.rating)} inline-flex items-center gap-1 w-fit`}>
                      {ratingLabel(review.rating)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SHOW ALL TOGGLE — only for callers that cap the table, and only once the
          card has more history than the cap shows. */}
      {!isLoading && !loadFailed && collapsedRows != null && reviews.length > collapsedRows && (
        <Button
          onClick={() => setShowAll((current) => !current)}
          className="btn-link w-full mt-2"
        >
          {showAll ? `Show last ${collapsedRows}` : `Show all ${reviews.length} ratings`}
        </Button>
      )}
    </>
  );
}
