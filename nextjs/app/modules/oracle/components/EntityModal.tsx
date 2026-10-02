"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import type { Attitude, EntityKind, OracleEntity, StatBlock } from "../types/oracle";
import { ATTITUDES, DETAILS_MAX, ENTITY_KINDS, NAME_MAX, NOTES_MAX } from "../lib/constants";
import { CHALLENGE_ROWS, findChallengeRow, statBlockFromChallenge } from "../lib/reference";
import { blurOnEnter, selectOnFocus } from "@/lib/inputBehavior";

export interface EntityDraft {
  kind: EntityKind;
  name: string;
  details: string;
  attitude: Attitude;
  dm_notes: string;
  stats: StatBlock | null;
}

interface EntityModalProps {
  isOpen: boolean;
  entity: OracleEntity | null; // null = a new entry
  defaultKind?: EntityKind;
  onSave: (draft: EntityDraft) => void;
  onClose: () => void;
}

const KIND_LABELS: Record<EntityKind, string> = { creature: "Creature", person: "Person", place: "Location" };

function numberOr(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

// Add or edit a creature, person or location. Creatures carry a stat block, started from the
// quick-monster table by challenge rating and adjustable from there.
export default function EntityModal({ isOpen, entity, defaultKind = "creature", onSave, onClose }: EntityModalProps) {
  const isEdit = entity !== null;

  // INPUT
  const [kind, setKind] = useState<EntityKind>(defaultKind);
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [attitude, setAttitude] = useState<Attitude>("neutral");
  const [notes, setNotes] = useState("");
  const [stats, setStats] = useState<StatBlock | null>(null);

  // STATE
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setKind(entity?.kind ?? defaultKind);
    setName(entity?.name ?? "");
    setDetails(entity?.details ?? "");
    setAttitude(entity?.attitude ?? "neutral");
    setNotes(entity?.dm_notes ?? "");
    setStats(entity?.stats ?? null);
    setError(null);
  }, [isOpen, entity, defaultKind]);

  // A creature always has a stat block; switching to creature starts one at CR 1/4.
  const shownStats = kind === "creature" ? stats ?? statBlockFromChallenge(findChallengeRow("1/4")!) : null;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name");
      return;
    }
    onSave({ kind, name: trimmed, details: details.trim(), attitude, dm_notes: notes.trim(), stats: shownStats });
  }

  function patchStats(patch: Partial<StatBlock>) {
    if (shownStats) setStats({ ...shownStats, ...patch });
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit ${entity.name}` : "New entry"}
      tall
      footer={
        <div className="flex items-center justify-end gap-2 w-full">

          {/* CANCEL */}
          <Button className="btn-off" onClick={onClose}>Cancel</Button>

          {/* SAVE */}
          <Button className="btn-blue" onClick={save}>{isEdit ? "Save" : "Add"}</Button>
        </div>
      }
    >
      <div className="orc-form">

        {/* ERROR */}
        {error && <div className="alert alert-red"><p className="alert-text">{error}</p></div>}

        {/* KIND */}
        <div className="orc-field">
          <span className="orc-field-label">Kind</span>
          <div className="orc-segments" role="radiogroup" aria-label="Kind">
            {ENTITY_KINDS.map((entry) => (
              <button key={entry} type="button" role="radio" aria-checked={kind === entry} className="orc-segment" onClick={() => setKind(entry)}>
                {KIND_LABELS[entry]}
              </button>
            ))}
          </div>
        </div>

        {/* NAME FIELD — autofocused on create (typing a name is the first step); not on edit,
            where the DM came to change some field and it is not necessarily this one. */}
        <label className="orc-field">
          <span className="orc-field-label">Name</span>
          <input
            id="orc-entity-name"
            className="input-field"
            autoFocus={!isEdit}
            value={name}
            maxLength={NAME_MAX}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        {/* ATTITUDE */}
        <div className="orc-field">
          <span className="orc-field-label">Attitude</span>
          <div className="orc-segments" role="radiogroup" aria-label="Attitude">
            {ATTITUDES.map((entry) => (
              <button key={entry} type="button" role="radio" aria-checked={attitude === entry} className="orc-segment" onClick={() => setAttitude(entry)}>
                {entry[0].toUpperCase() + entry.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* DETAILS FIELD */}
        <label className="orc-field">
          <span className="orc-field-label">Details (players may see this)</span>
          <textarea className="input-field orc-textarea" rows={3} value={details} maxLength={DETAILS_MAX} onChange={(event) => setDetails(event.target.value)} />
        </label>

        {/* DM NOTES FIELD */}
        <label className="orc-field">
          <span className="orc-field-label">DM only (never shown to players)</span>
          <textarea className="input-field orc-textarea" rows={3} value={notes} maxLength={NOTES_MAX} onChange={(event) => setNotes(event.target.value)} />
        </label>

        {/* STAT BLOCK */}
        {shownStats && (
          <div className="orc-field">
            <span className="orc-field-label">Stats</span>

            {/* CHALLENGE PICKER */}
            <div className="orc-stat-grid">
              <label className="orc-stat-field">
                <span>CR</span>
                <select
                  className="input-field"
                  value={shownStats.cr}
                  onChange={(event) => {
                    const row = findChallengeRow(event.target.value);
                    if (row) setStats({ ...statBlockFromChallenge(row), abilities: shownStats.abilities });
                  }}
                >
                  {!CHALLENGE_ROWS.some((row) => row.cr === shownStats.cr) && <option value={shownStats.cr}>{shownStats.cr}</option>}
                  {CHALLENGE_ROWS.map((row) => (
                    <option key={row.cr} value={row.cr}>{row.cr}</option>
                  ))}
                </select>
              </label>

              {/* ARMOR CLASS */}
              <label className="orc-stat-field">
                <span>AC</span>
                <input className="input-field" inputMode="numeric" value={shownStats.ac} onFocus={selectOnFocus} onKeyDown={blurOnEnter}
                  onChange={(event) => patchStats({ ac: numberOr(event.target.value, shownStats.ac, 0, 40) })} />
              </label>

              {/* HIT POINTS */}
              <label className="orc-stat-field">
                <span>HP</span>
                <input className="input-field" inputMode="numeric" value={shownStats.hp_max} onFocus={selectOnFocus} onKeyDown={blurOnEnter}
                  onChange={(event) => {
                    const next = numberOr(event.target.value, shownStats.hp_max, 1, 9999);
                    patchStats({ hp_max: next, hp: Math.min(shownStats.hp, next) === shownStats.hp && shownStats.hp !== shownStats.hp_max ? shownStats.hp : next });
                  }} />
              </label>

              {/* SPEED */}
              <label className="orc-stat-field">
                <span>Speed</span>
                <input className="input-field" inputMode="numeric" value={shownStats.speed} onFocus={selectOnFocus} onKeyDown={blurOnEnter}
                  onChange={(event) => patchStats({ speed: numberOr(event.target.value, shownStats.speed, 0, 300) })} />
              </label>
            </div>

            {/* ATTACK */}
            <div className="orc-stat-grid orc-stat-grid-attack">
              <label className="orc-stat-field">
                <span>Attack</span>
                <input className="input-field" value={shownStats.attacks[0]?.name ?? ""} maxLength={60}
                  onChange={(event) => patchStats({ attacks: [{ name: event.target.value, bonus: shownStats.attacks[0]?.bonus ?? 3, damage: shownStats.attacks[0]?.damage ?? "1d6" }, ...shownStats.attacks.slice(1)] })} />
              </label>
              <label className="orc-stat-field">
                <span>To hit</span>
                <input className="input-field" inputMode="numeric" value={shownStats.attacks[0]?.bonus ?? 0} onFocus={selectOnFocus} onKeyDown={blurOnEnter}
                  onChange={(event) => patchStats({ attacks: [{ name: shownStats.attacks[0]?.name ?? "Attack", bonus: numberOr(event.target.value, 0, -10, 30), damage: shownStats.attacks[0]?.damage ?? "1d6" }, ...shownStats.attacks.slice(1)] })} />
              </label>
              <label className="orc-stat-field">
                <span>Damage</span>
                <input className="input-field" value={shownStats.attacks[0]?.damage ?? ""} maxLength={60}
                  onChange={(event) => patchStats({ attacks: [{ name: shownStats.attacks[0]?.name ?? "Attack", bonus: shownStats.attacks[0]?.bonus ?? 3, damage: event.target.value }, ...shownStats.attacks.slice(1)] })} />
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
