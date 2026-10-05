"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { BookOpen, ChevronDown, PenLine, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Attitude, EntityKind, OracleEntity, StatBlock } from "../types/oracle";
import { ATTITUDES, DETAILS_MAX, ENTITY_IDEA_MAX, ENTITY_KINDS, NAME_MAX, NOTES_MAX } from "../lib/constants";
import { CHALLENGE_ROWS, findChallengeRow, statBlockFromChallenge } from "../lib/reference";
import { blurOnEnter, selectOnFocus } from "@/lib/inputBehavior";
import { api } from "../lib/client";
import type { LibraryCreature } from "../lib/creatureFunctions";

export interface EntityDraft {
  kind: EntityKind;
  name: string;
  details: string;
  attitude: Attitude;
  dm_notes: string;
  source: string | null;
  stats: StatBlock | null;
}

// What the AI writes for a new entry; the DM reviews it before saving.
export interface EntityWriteUp {
  name: string;
  details: string;
  dm_notes: string;
  attitude: Attitude;
  source: string | null;
  stats: StatBlock | null;
}

interface EntityModalProps {
  isOpen: boolean;
  entity: OracleEntity | null; // null = a new entry
  defaultKind?: EntityKind;
  onSave: (draft: EntityDraft) => void;
  onClose: () => void;
  onWrite?: (request: { kind: EntityKind; name: string; idea: string; draft?: { name: string; details: string; dm_notes: string } }) => Promise<EntityWriteUp>; // new entries only
}

const KIND_LABELS: Record<EntityKind, string> = { creature: "Creature", person: "Person", place: "Location", item: "Item" };

// How a new entry is started. The same three ways as the food logger: look it up, describe it, or
// write it yourself. Editing has no tabs — there is only the form.
type NewEntryWay = "search" | "describe" | "create";
const WAYS: { value: NewEntryWay; label: string; icon: typeof Search }[] = [
  { value: "search", label: "Search", icon: Search },
  { value: "describe", label: "Describe", icon: Sparkles },
  { value: "create", label: "Create", icon: PenLine },
];
const IDEA_PLACEHOLDERS: Record<EntityKind, string> = { creature: "A swamp beast guarding the ford", person: "A shopkeeper in the village", place: "A smugglers' cave", item: "A cursed coral necklace" };

function numberOr(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

// Add or edit a creature, person, location or item. Creatures carry a stat block, started from the
// quick-monster table by challenge rating and adjustable from there.
export default function EntityModal({ isOpen, entity, defaultKind = "creature", onSave, onClose, onWrite }: EntityModalProps) {
  const isEdit = entity !== null;

  // INPUT
  const [way, setWay] = useState<NewEntryWay>("search");
  const [lookup, setLookup] = useState("");
  // What has been said while writing this entry. The DM's turns are instructions; Oracle's are
  // what it wrote back, so a change can be asked for without starting again.
  const [said, setSaid] = useState<{ who: "dm" | "oracle"; text: string }[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [found, setFound] = useState<LibraryCreature[]>([]);
  const [isLooking, setIsLooking] = useState(false);
  const [kind, setKind] = useState<EntityKind>(defaultKind);
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [attitude, setAttitude] = useState<Attitude>("neutral");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [stats, setStats] = useState<StatBlock | null>(null);
  const [idea, setIdea] = useState("");

  // STATE
  const [error, setError] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setKind(entity?.kind ?? defaultKind);
    setName(entity?.name ?? "");
    setDetails(entity?.details ?? "");
    setAttitude(entity?.attitude ?? "neutral");
    setNotes(entity?.dm_notes ?? "");
    setSource(entity?.source ?? "");
    setStats(entity?.stats ?? null);
    setIdea("");
    setError(null);
    setIsWriting(false);
  }, [isOpen, entity, defaultKind]);

  // A creature always has a stat block; switching to creature starts one at CR 1/4.
  const shownStats = kind === "creature" ? stats ?? statBlockFromChallenge(findChallengeRow("1/4")!) : null;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name");
      return;
    }
    onSave({ kind, name: trimmed, details: details.trim(), attitude: kind === "item" ? "neutral" : attitude, dm_notes: notes.trim(), source: kind === "creature" ? source.trim() || null : null, stats: shownStats });
  }

  // WRITE WITH AI — fills the form from the idea (and the name, if one is typed); a typed name is kept.
  async function write() {
    if (!onWrite || isWriting) return;
    const asked = idea.trim();
    if (!asked && !name.trim()) {
      setError("Say what it is, or give it a name");
      return;
    }
    setError(null);
    setIsWriting(true);
    if (asked) setSaid((turns) => [...turns, { who: "dm", text: asked }]);
    setIdea("");
    try {
      // After the first reply the exchange carries what is on the page, so "add a secret tunnel"
      // adds one rather than writing a different cave.
      const written = await onWrite({
        kind,
        name: hasDraft ? "" : name.trim(),
        idea: asked,
        draft: hasDraft ? { name, details, dm_notes: notes } : undefined,
      });
      setName(written.name);
      setDetails(written.details);
      setNotes(written.dm_notes);
      setAttitude(written.attitude);
      if (kind === "creature") {
        setSource(written.source ?? "");
        setStats(written.stats);
      }
      setSaid((turns) => [...turns, { who: "oracle", text: `${written.name} — ${written.details}` }]);
      setHasDraft(true);
      setShowFields(true);
    } catch (writeError) {
      setSaid((turns) => [...turns, { who: "oracle", text: writeError instanceof Error ? writeError.message : "Couldn't write it" }]);
      setError(writeError instanceof Error ? writeError.message : "Couldn't write it");
    } finally {
      setIsWriting(false);
    }
  }

  // THE LIBRARY — the bundled SRD alongside anything the DM has saved. Only what comes from a
  // published book carries a source; everything else is homebrew.
  useEffect(() => {
    if (!isOpen || isEdit || way !== "search") return;
    let stopped = false;
    setIsLooking(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ creatures: LibraryCreature[] }>(`/modules/oracle/api/creatures?q=${encodeURIComponent(lookup)}`);
        if (!stopped) setFound(result.creatures);
      } catch {
        if (!stopped) setFound([]);
      } finally {
        if (!stopped) setIsLooking(false);
      }
    }, 200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isOpen, isEdit, way, lookup]);

  // Taking one from the library fills the form rather than saving at once, so the DM can rename it
  // or add a note before it goes on the map.
  function take(creature: LibraryCreature) {
    setKind("creature");
    setName(creature.name);
    setDetails(creature.details ?? "");
    setAttitude("hostile");
    setNotes(creature.source_url ? `Full entry: ${creature.source_url}` : "");
    setSource(creature.official_source ?? "");
    setStats(creature.stats);
    setWay("create");
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

        {/* HOW TO START — new entries only; editing has only the form. Same tab strip the food
            logger's picker uses. */}
        {!isEdit && (
          <nav className="orc-ways" role="tablist" aria-label="How to add this">
            {WAYS.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.value}
                  type="button"
                  role="tab"
                  aria-selected={way === entry.value}
                  className={`tab-button ${way === entry.value ? "tab-button-active" : ""}`}
                  onClick={() => setWay(entry.value)}
                >
                  <Icon className="w-4 h-4" aria-hidden /> {entry.label}
                </button>
              );
            })}
          </nav>
        )}

        {/* SEARCH — the creature library: the SRD, and anything saved before. Picking one fills
            the form, so it can be renamed or annotated before it goes on the map. */}
        {!isEdit && way === "search" && (
          <div className="orc-library">
            <div className="orc-library-search">
              <div className="bottom-action-bar-pill" style={{ maxWidth: "none" }}>
                <Search className="bottom-action-bar-pill-icon w-4 h-4" aria-hidden />
                <input
                  type="text"
                  autoFocus
                  value={lookup}
                  maxLength={60}
                  placeholder="Search creatures"
                  aria-label="Search creatures"
                  className="bottom-action-bar-pill-text"
                  style={{ background: "transparent", border: "none", outline: "none", padding: 0 }}
                  onChange={(event) => setLookup(event.target.value)}
                />
                {lookup !== "" && (
                  <button type="button" className="bottom-action-bar-pill-clear" title="Clear search" aria-label="Clear search" onClick={() => setLookup("")}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="orc-library-list">
              {found.length === 0 && !isLooking && (
                <div className="empty-state">
                  <p className="empty-state-title">{lookup.trim() ? "No match" : "Nothing yet"}</p>
                  <p className="empty-state-body">{lookup.trim() ? "Try another name, or describe it instead." : "Type a name to search the published creatures."}</p>
                </div>
              )}
              {found.map((creature) => (
                <button key={creature.id} type="button" className="orc-library-row" onClick={() => take(creature)}>
                  <span className="orc-library-name">{creature.name}</span>
                  <span className="orc-library-meta">
                    {[creature.size, creature.creature_type].filter(Boolean).join(" ")}
                    {creature.cr ? ` · CR ${creature.cr}` : ""}
                  </span>
                  <span className="orc-library-source">
                    {creature.official_source ? <><BookOpen className="w-3 h-3" aria-hidden /> {creature.official_source}</> : "Homebrew"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

          {/* DESCRIBE IT — an exchange rather than one box: the first line says what to make, and
            every line after it asks for a change to what is already written. */}
        {!isEdit && onWrite && way === "describe" && (
          <div className="orc-talk">
            <div className="orc-talk-said" aria-live="polite">
              {said.length === 0 && (
                <div className="empty-state">
                  <p className="empty-state-title">Say what to make</p>
                  <p className="empty-state-body">{IDEA_PLACEHOLDERS[kind]}. Then keep going: ask for a change and it is rewritten.</p>
                </div>
              )}
              {said.map((turn, index) => (
                <p key={index} className="orc-talk-turn" data-who={turn.who}>{turn.text}</p>
              ))}
              {isWriting && <p className="orc-talk-turn" data-who="oracle" data-waiting="true">Writing…</p>}
            </div>
            <div className="orc-talk-ask">
              <div className="bottom-action-bar-pill" style={{ maxWidth: "none" }}>
                <input
                  type="text"
                  autoFocus
                  value={idea}
                  maxLength={ENTITY_IDEA_MAX}
                  placeholder={said.length === 0 ? IDEA_PLACEHOLDERS[kind] : "Ask for a change"}
                  aria-label={said.length === 0 ? "Idea" : "Change"}
                  className="bottom-action-bar-pill-text"
                  style={{ background: "transparent", border: "none", outline: "none", padding: 0 }}
                  disabled={isWriting}
                  onChange={(event) => setIdea(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void write();
                    }
                  }}
                />
              </div>
              <Button className="btn-off" onClick={() => void write()} disabled={isWriting}>
                <Sparkles className="w-4 h-4" aria-hidden /> {isWriting ? "Writing…" : said.length === 0 ? "Write" : "Change"}
              </Button>
            </div>
          </div>
        )}

        {/* THE FIELDS — folded away while the exchange is still going, opened as soon as it has
            written something, so the DM can correct a word without leaving the conversation. */}
        {!isEdit && way === "describe" && (
          <button type="button" className="orc-talk-fields" aria-expanded={showFields} onClick={() => setShowFields((open) => !open)}>
            <ChevronDown className="w-4 h-4" aria-hidden data-open={showFields ? "true" : undefined} /> Fields
          </button>
        )}

        {/* THE ENTRY ITSELF — hidden while the library is being searched, since picking something
            there fills this in. */}
        {(isEdit || way !== "search") && (isEdit || way !== "describe" || showFields) && (
          <>
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

          {/* ATTITUDE — not for items */}
          {kind !== "item" && (
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
          )}

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

          {/* SOURCE — creatures only */}
          {kind === "creature" && (
          <label className="orc-field">
            <span className="orc-field-label">Source</span>
            <input className="input-field" value={source} maxLength={200} placeholder="Monster Manual, p. 307" onChange={(event) => setSource(event.target.value)} />
          </label>
          )}

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
          </>
        )}
      </div>
    </Modal>
  );
}
