"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { CardWithProgress } from "../../../../types/card";
import CardContent from "../../../../components/CardContent";

interface RefineCardModalProps {
  card: CardWithProgress | null;
  deckId: string;
  onClose: () => void;
  onRefined: (cardId: string, front: string, back: string, notes: string | null) => void;
}

export default function RefineCardModal({ card, deckId, onClose, onRefined }: RefineCardModalProps) {

  // INPUT
  const [feedback, setFeedback] = useState("");

  // STATE
  const [isRefining, setIsRefining] = useState(false);

  const handleRefine = async () => {
    if (!card || !feedback.trim()) return;

    setIsRefining(true);
    try {
      const response = await fetch(`/modules/rune/api/decks/${deckId}/cards/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, feedback: feedback.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to refine card");
        return;
      }

      const result = await response.json();
      onRefined(card.id, result.front, result.back, result.notes || null);
      toast.success("Card refined");
      setFeedback("");
      onClose();
    } catch (error) {
      console.error("Error refining card:", error);
      toast.error("Failed to refine card");
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <Modal
      isOpen={!!card}
      onClose={onClose}
      title="Refine Card"
      footer={
        <div className="flex gap-2 justify-end">
          {/* CANCEL BUTTON */}
          <Button onClick={onClose} className="btn-off" disabled={isRefining}>
            Cancel
          </Button>

          {/* REFINE BUTTON */}
          <Button
            onClick={handleRefine}
            className="btn-blue"
            disabled={isRefining || !feedback.trim()}
          >
            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isRefining ? "Refining..." : "Refine"}
          </Button>
        </div>
      }
    >
      {card && (<>
        {/* CURRENT FRONT */}
        <div className="mb-3">
          <label className="text-label mb-1 block">Front</label>
          <div className="text-secondary text-sm">
            <CardContent text={card.front} />
          </div>
        </div>

        {/* CURRENT BACK */}
        <div className="mb-3">
          <label className="text-label mb-1 block">Back</label>
          <div className="text-secondary text-sm">
            <CardContent text={card.back} />
          </div>
        </div>

        {/* CURRENT NOTES */}
        {card.notes && (
          <div className="mb-4">
            <label className="text-label mb-1 block">Notes</label>
            <div className="text-secondary text-sm">
              <CardContent text={card.notes} />
            </div>
          </div>
        )}

        {/* FEEDBACK INPUT */}
        <div>
          <label className="text-label mb-1 block">Feedback</label>
          <textarea
            className="input-field w-full"
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
            placeholder="e.g. Make the answer more concise..."
            disabled={isRefining}
            autoFocus
          />
        </div>
      </>)}
    </Modal>
  );
}
