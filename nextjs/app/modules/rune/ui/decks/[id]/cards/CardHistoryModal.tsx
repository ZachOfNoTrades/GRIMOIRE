"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { CardWithProgress, CardReview } from "../../../../types/card";
import CardHistoryPanel from "../../../../components/CardHistoryPanel";

interface CardHistoryModalProps {
  card: CardWithProgress | null;
  deckId: string;
  onClose: () => void;
}

export default function CardHistoryModal({ card, deckId, onClose }: CardHistoryModalProps) {

  // DATA
  const [reviews, setReviews] = useState<CardReview[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

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
      {/* HISTORY BODY — the same summary/trend/table the study session shows for the
          card it is on (see CardHistoryPanel); the modal only supplies the chrome. */}
      <CardHistoryPanel
        card={card}
        reviews={reviews}
        isLoading={isLoading}
        loadFailed={loadFailed}
        failureBody="Close and try again."
      />
    </Modal>
  );
}
