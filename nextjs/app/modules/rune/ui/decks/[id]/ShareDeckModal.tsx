"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import toast from "@/components/Toaster";
import { generateUUID } from "@/lib/uuid";
import { DeckShare, DeckShareRole, SHARE_EMAIL_MAX_LENGTH } from "../../../types/share";

interface ShareDeckModalProps {
  isOpen: boolean;
  deckId: string;
  onClose: () => void;
  // Reports the share count after every change so the deck page can keep its own copy right.
  onSharesChange?: (count: number) => void;
}

const ROLE_OPTIONS: { value: DeckShareRole; label: string }[] = [
  { value: "view", label: "Can view" },
  { value: "edit", label: "Can edit" },
];

// Share a deck by email. Fire-and-forget by design: sharing looks and responds the same
// whether or not the address has a GRIMOIRE account — the list below only ever shows the
// addresses you typed, never whether anyone is behind them.
export default function ShareDeckModal({ isOpen, deckId, onClose, onSharesChange }: ShareDeckModalProps) {

  // DATA
  const [shares, setShares] = useState<DeckShare[]>([]);

  // INPUT
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DeckShareRole>("view");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // LOAD SHARES — every time the modal opens, so a change made on another device shows.
  useEffect(() => {
    if (!isOpen) return;
    setEmail("");
    setRole("view");
    setError(null);
    setIsLoading(true);
    fetchShares().finally(() => setIsLoading(false));
  }, [isOpen, deckId]);

  const fetchShares = async (): Promise<DeckShare[] | null> => {
    try {
      const response = await fetch(`/modules/rune/api/decks/${deckId}/shares`);
      if (!response.ok) return null;
      const data = await response.json();
      const list: DeckShare[] = Array.isArray(data?.shares) ? data.shares : [];
      setShares(list);
      onSharesChange?.(list.length);
      return list;
    } catch (fetchError) {
      console.error("Error fetching deck shares:", fetchError);
      return null;
    }
  };

  // SHARE — optimistic: the row appears at once, the POST runs behind it, and the silent
  // refetch swaps in the server's row. Re-sharing an address already on the list just
  // updates its role in place.
  const handleShare = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setError(null);

    const previous = shares;
    const existing = shares.find((share) => share.email === normalized);
    setShares(existing
      ? shares.map((share) => (share.email === normalized ? { ...share, role } : share))
      : [...shares, { id: `tmp-${generateUUID()}`, email: normalized, role, created_at: new Date() }]);
    setEmail("");

    try {
      const response = await fetch(`/modules/rune/api/decks/${deckId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, role }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Couldn't share deck");
      }
      toast.success(`Shared with ${normalized}`);
      fetchShares();
    } catch (shareError) {
      // Put the list and the typed address back so the fix is one edit away.
      setShares(previous);
      setEmail(normalized);
      setError(shareError instanceof Error ? shareError.message : "Couldn't share deck");
    }
  };

  // CHANGE ROLE — optimistic, reverted on failure.
  const handleRoleChange = async (share: DeckShare, nextRole: DeckShareRole) => {
    const previous = shares;
    setShares(shares.map((s) => (s.id === share.id ? { ...s, role: nextRole } : s)));
    try {
      const response = await fetch(`/modules/rune/api/decks/${deckId}/shares/${share.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) throw new Error("Request failed");
    } catch (roleError) {
      console.error("Error updating share role:", roleError);
      setShares(previous);
      toast.error("Couldn't change access");
    }
  };

  // REMOVE — optimistic, restored on failure. The person loses the deck immediately; their
  // own study progress is kept in case it's shared again.
  const handleRemove = async (share: DeckShare) => {
    const previous = shares;
    const next = shares.filter((s) => s.id !== share.id);
    setShares(next);
    onSharesChange?.(next.length);
    try {
      const response = await fetch(`/modules/rune/api/decks/${deckId}/shares/${share.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Request failed");
    } catch (removeError) {
      console.error("Error removing share:", removeError);
      setShares(previous);
      onSharesChange?.(previous.length);
      toast.error("Couldn't remove access");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Deck"
      footer={
        <div className="flex gap-2 justify-end">
          {/* DONE BUTTON — every change above is saved as it's made */}
          <Button onClick={onClose} className="btn-off">
            Done
          </Button>
        </div>
      }
    >
      {/* SHARE FORM */}
      <form
        className="rune-share-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleShare();
        }}
      >
        {/* EMAIL FIELD — autofocused: sharing is the one thing this modal is for, the email is
            its single free-text value, and an accidental Enter only shares a deck, which is
            undone with the remove button below. */}
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          className="input-field rune-share-email"
          placeholder="Email address"
          aria-label="Email address to share with"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={SHARE_EMAIL_MAX_LENGTH}
          autoFocus
        />

        {/* ROLE SELECT */}
        <select
          className="input-field rune-share-role"
          value={role}
          onChange={(e) => setRole(e.target.value as DeckShareRole)}
          aria-label="Access level"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {/* SHARE BUTTON */}
        <Button type="submit" className="btn-blue" disabled={!email.trim()}>
          Share
        </Button>
      </form>

      {/* ERROR */}
      {error && <p className="text-alert-red text-sm mt-2">{error}</p>}

      {/* NOTE — the one rule that isn't guessable from the form */}
      <p className="text-subtle text-sm mt-3">
        They&apos;ll find it under Decks once they sign in to GRIMOIRE with this address.
      </p>

      {/* SHARED-WITH LIST */}
      {isLoading ? (
        <div className="loading-container py-6">
          <div className="loading-spinner" />
        </div>
      ) : shares.length > 0 && (
        <div className="mt-4">
          <p className="text-label mb-2">Shared with</p>
          <ul className="rune-share-list">
            {shares.map((share) => (
              <li key={share.id} className="rune-share-row">

                {/* EMAIL */}
                <span className="rune-share-row-email" title={share.email}>{share.email}</span>

                {/* ROLE SELECT */}
                <select
                  className="input-field rune-share-role"
                  value={share.role}
                  onChange={(e) => handleRoleChange(share, e.target.value as DeckShareRole)}
                  aria-label={`Access for ${share.email}`}
                  disabled={share.id.startsWith("tmp-")}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>

                {/* REMOVE BUTTON */}
                <Button
                  className="btn-link-red"
                  onClick={() => handleRemove(share)}
                  title="Remove access"
                  aria-label={`Remove access for ${share.email}`}
                  disabled={share.id.startsWith("tmp-")}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
