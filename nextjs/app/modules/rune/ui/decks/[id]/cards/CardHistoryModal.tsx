"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { formatRelativePast, formatRelativeFuture } from "@/lib/format";
import { CardWithProgress, CardReview } from "../../../../types/card";

interface CardHistoryModalProps {
  card: CardWithProgress | null;
  deckId: string;
  onClose: () => void;
}

// Map rating number to its display label — same 1-4 scale the study session rates on.
function ratingToLabel(rating: number): string {
  if (rating === 1) return "Again";
  if (rating === 2) return "Hard";
  if (rating === 3) return "Good";
  return "Easy";
}

// Map rating number to a design-system badge class (red -> blue, worst to best).
function ratingToBadgeClass(rating: number): string {
  if (rating === 1) return "badge-red";
  if (rating === 2) return "badge-yellow";
  if (rating === 3) return "badge-green";
  return "badge-blue";
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

export default function CardHistoryModal({ card, deckId, onClose }: CardHistoryModalProps) {

  // DATA
  const [reviews, setReviews] = useState<CardReview[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // DERIVED — share of ratings that were Good or Easy, the same >=3 cut the
  // study session scores a card "correct" on.
  const correctCount = reviews.filter((review) => review.rating >= 3).length;
  const successRate = reviews.length > 0 ? Math.round((correctCount / reviews.length) * 100) : null;

  // LOAD REVIEW HISTORY — refetched each time the modal opens on a card, so a
  // rating submitted since the deck page loaded is included.
  useEffect(() => {
    if (!card) return;

    let cancelled = false;
    const fetchHistory = async () => {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        const response = await fetch(`/modules/rune/api/decks/${deckId}/cards/${card.id}/reviews`);
        if (!response.ok) {
          if (!cancelled) setLoadFailed(true);
          return;
        }

        const data = await response.json();
        // Guard against an { error } envelope being set as the list.
        if (!cancelled) {
          if (Array.isArray(data)) {
            setReviews(data);
          } else {
            setLoadFailed(true);
          }
        }
      } catch (error) {
        console.error("Error fetching card review history:", error);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [card, deckId]);

  // Reset between cards so the previous card's ratings never flash in the list.
  useEffect(() => {
    if (!card) setReviews([]);
  }, [card]);

  return (
    <Modal
      isOpen={!!card}
      onClose={onClose}
      title="Rating History"
      subHeader={card ? <p className="text-secondary">{card.front}</p> : undefined}
      footer={
        <div className="flex justify-end">
          {/* CLOSE BUTTON */}
          <Button onClick={onClose} className="btn-off">
            Close
          </Button>
        </div>
      }
    >
      {/* SRS SUMMARY — current scheduling state, the outcome of the ratings below.
          Laid out as a wrapping grid rather than `.stat-section`'s single flex row:
          the modal is narrower than a page, so a 5-up row breaks its labels
          mid-word ("INTER VAL") at every viewport, not just on phones. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">

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
        <div className="stat-card">
          <p className="stat-label">Next Review</p>
          <p className="stat-value text-base">{formatRelativeFuture(card?.next_review_at ?? null)}</p>
        </div>
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
          <p className="empty-state-body">Close and try again.</p>
        </div>
      )}

      {/* EMPTY PLACEHOLDER */}
      {!isLoading && !loadFailed && reviews.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-title">No ratings yet</p>
          <p className="empty-state-body">This card hasn&apos;t come up in a study session.</p>
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
              {reviews.map((review) => (
                <tr key={review.id} className="table-row">
                  {/* The compact cell drops `.table-cell`'s nowrap, so a full
                      timestamp wraps inside the modal instead of forcing the
                      table into a horizontal scroll on a phone. */}
                  <td className="table-cell-compact">
                    <p>{formatRelativePast(review.created_at)}</p>
                    <p className="text-subtle text-xs">
                      {formatReviewTimestamp(review.created_at)}
                      {review.response_time_ms != null && ` · ${(review.response_time_ms / 1000).toFixed(1)}s`}
                    </p>
                  </td>
                  <td className="table-cell-compact !text-right">
                    <span className={`${ratingToBadgeClass(review.rating)} inline-flex items-center gap-1 w-fit`}>
                      {ratingToLabel(review.rating)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
