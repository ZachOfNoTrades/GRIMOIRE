"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/linkButton";
import CardContent from "../../components/CardContent";
import CardHistoryPanel from "../../components/CardHistoryPanel";
import { CardReview } from "../../types/card";
import { TroubleCard } from "../../types/trouble";

interface TroubleCardModalProps {
  card: TroubleCard | null; // Null while the modal is closed
  onClose: () => void;
}

// Show a trouble card in full with its rating history
export default function TroubleCardModal({ card, onClose }: TroubleCardModalProps) {

  // DATA
  const [reviews, setReviews] = useState<CardReview[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Fetch the card's ratings each time the modal opens on a card
  useEffect(() => {
    if (!card) {
      setReviews([]);
      return;
    }

    let cancelled = false;
    const fetchHistory = async () => {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        const response = await fetch(`/modules/rune/api/decks/${card.deck_id}/cards/${card.id}/reviews`);
        const data = response.ok ? await response.json() : null;
        if (cancelled) return;
        if (Array.isArray(data)) setReviews(data);
        else setLoadFailed(true);
      } catch (error) {
        console.error(`Error fetching review history for card ${card.id}:`, error);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [card]);

  return (
    <Modal
      isOpen={!!card}
      onClose={onClose}
      fullHeight
      title="Trouble Card"
      subHeader={card ? <p className="text-secondary">{card.deck_name}</p> : undefined}
      footer={
        <div className="flex gap-2 justify-end">

          {/* OPEN DECK BUTTON */}
          {card && (
            <LinkButton className="btn-off" href={`/modules/rune/ui/decks/${card.deck_id}`}>
              Open deck
            </LinkButton>
          )}

          {/* CLOSE BUTTON */}
          <Button className="btn-off" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {card && (
        <div className="flex flex-col gap-4">

          {/* FRONT */}
          <div>
            <p className="stat-label">Front</p>
            <CardContent text={card.front} className="text-primary" />
          </div>

          {/* BACK */}
          <div>
            <p className="stat-label">Back</p>
            {card.back
              ? <CardContent text={card.back} className="text-primary" />
              : <p className="text-subtle-italic">No answer</p>}
          </div>

          {/* NOTES */}
          {card.notes && (
            <div>
              <p className="stat-label">Notes</p>
              <CardContent text={card.notes} className="text-secondary" />
            </div>
          )}

          {/* SOURCE */}
          {card.source_ref && (
            <div className="rune-card-source">
              <p className="stat-label">Source</p>
              <CardContent text={card.source_ref} className="text-secondary rune-card-source-text" />
            </div>
          )}

          {/* RATING HISTORY */}
          <CardHistoryPanel
            card={card}
            reviews={reviews}
            isLoading={isLoading}
            loadFailed={loadFailed}
            failureBody="Close and try again."
          />
        </div>
      )}
    </Modal>
  );
}
