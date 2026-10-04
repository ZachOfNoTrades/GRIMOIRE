"use client";

import { Gem, Landmark, PawPrint, User } from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import type { EntityKind, OracleChip } from "../types/oracle";
import { NAME_MAX } from "../lib/constants";

interface AdoptModalProps {
  chip: OracleChip | null; // a picture item from the banner; null = closed
  isBusy: boolean;
  onAdopt: (chip: OracleChip, kind: EntityKind, name: string, show: boolean) => void;
  onDismiss: (chip: OracleChip) => void;
  onClose: () => void;
}

const KINDS: { key: EntityKind; label: string; hint: string; icon: typeof User }[] = [
  { key: "creature", label: "Creature", hint: "With a stat block; then tap the map to place it", icon: PawPrint },
  { key: "person", label: "Person", hint: "Then tap the map to place them", icon: User },
  { key: "place", label: "Location", hint: "Then tap the map to pin it", icon: Landmark },
  { key: "item", label: "Item", hint: "Then tap the map to place it", icon: Gem },
];

// A banner picture, about to become part of the session. One choice (what it is) and a name;
// the write-up, the stat block and the map placement are done for the DM.
export default function AdoptModal({ chip, isBusy, onAdopt, onDismiss, onClose }: AdoptModalProps) {
  // INPUT
  const [kind, setKind] = useState<EntityKind>("creature");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (chip?.content.type === "image") {
      setKind(chip.content.suggested_kind);
      setName(chip.content.suggested_name);
      setShow(false);
    }
  }, [chip]);

  if (!chip || chip.content.type !== "image") return null;
  const content = chip.content;
  const trimmed = name.trim();

  return (
    <Modal
      isOpen
      onClose={onClose}
      disableClose={isBusy}
      title="Add to the session"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">

          {/* DISMISS */}
          <Button className="btn-off" disabled={isBusy} onClick={() => onDismiss(chip)}>
            Not this one
          </Button>

          {/* ADD */}
          <Button className="btn-blue" disabled={isBusy || !trimmed} onClick={() => onAdopt(chip, kind, trimmed, show)}>
            {isBusy ? "Adding…" : `Add ${KINDS.find((entry) => entry.key === kind)?.label.toLowerCase()}`}
          </Button>
        </div>
      }
    >
      <div className="orc-adopt">

        {/* PICTURE */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="orc-adopt-image" src={content.thumbnail} alt={content.suggested_name} />

        {/* CREDIT */}
        {content.credit && <p className="orc-small text-secondary">{content.credit}</p>}

        {/* KIND CHOICE */}
        <div className="orc-kind-row" role="radiogroup" aria-label="What it is">
          {KINDS.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={kind === entry.key}
                className="orc-kind"
                disabled={isBusy}
                onClick={() => setKind(entry.key)}
              >
                <Icon className="w-5 h-5" aria-hidden />
                <span className="orc-kind-label">{entry.label}</span>
                <span className="orc-kind-hint">{entry.hint}</span>
              </button>
            );
          })}
        </div>

        {/* NAME FIELD — not autofocused: the name is already filled in, and the first decision
            here is what the picture is, not what it is called. */}
        <label className="orc-field">
          <span className="orc-field-label">Name</span>
          <input
            className="input-field"
            value={name}
            maxLength={NAME_MAX}
            disabled={isBusy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmed && !isBusy) onAdopt(chip, kind, trimmed, show);
            }}
          />
        </label>

        {/* SHOW ON DISPLAY */}
        <label className="orc-check">
          <input type="checkbox" className="checkbox" checked={show} disabled={isBusy} onChange={(event) => setShow(event.target.checked)} />
          <span>Show it to the players now</span>
        </label>
      </div>
    </Modal>
  );
}
