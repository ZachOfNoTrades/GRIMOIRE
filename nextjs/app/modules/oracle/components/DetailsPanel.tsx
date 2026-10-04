"use client";

import { ArrowLeft, Dices, Eye, EyeOff, Gem, Landmark, MapPin, MapPinOff, Minus, MonitorUp, PawPrint, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, User, X, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { blurOnEnter } from "@/lib/inputBehavior";
import type { EntityKind, Knowledge, KnowledgeTier, OracleEntity, OracleEvent, StatBlock } from "../types/oracle";
import { api, campaignApi, errorMessage } from "../lib/client";
import { EVENT_MAX, KNOWLEDGE_SKILLS, KNOWLEDGE_TIERS } from "../lib/constants";

interface DetailsPanelProps {
  campaignId: string;
  entities: OracleEntity[];
  events: OracleEvent[];
  selected: OracleEntity | null;
  activeMapId: string | null;
  panelEntityId: string | null; // the entry on the player display's panel, if any
  isVisibleToPlayers: boolean; // the selected entry is inside the party's vision right now
  isPlacing: boolean; // waiting for a tap on the map to place the selected entry
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onEdit: (entity: OracleEntity) => void;
  onDelete: (entity: OracleEntity) => void;
  onShow: (entity: OracleEntity | null) => void;
  onToggleRevealed: (entity: OracleEntity) => void;
  onStats: (entity: OracleEntity, stats: StatBlock) => void;
  onAddNote: (entity: OracleEntity, body: string) => void;
  onReveal: (entity: OracleEntity, fact: string, skill: string | null, tier: KnowledgeTier | null) => void;
  onRemoveFact: (entity: OracleEntity, fact: Knowledge) => void;
  onPicture: (entity: OracleEntity) => void;
  onPlace: (entity: OracleEntity) => void;
  onUnplace: (entity: OracleEntity) => void;
  onZoomTo: (entity: OracleEntity) => void;
}

const KIND_ICONS: Record<EntityKind, typeof User> = { creature: PawPrint, person: User, place: Landmark, item: Gem };
const KIND_LABELS: Record<EntityKind, string> = { creature: "Creature", person: "Person", place: "Location", item: "Item" };

// THE DETAILS PANEL — everything about one creature, person or location. It is filled by
// tapping something on the map or by picking a search result at the top.
export default function DetailsPanel(props: DetailsPanelProps) {
  const { campaignId, entities, events, selected, activeMapId, panelEntityId, isVisibleToPlayers, isPlacing } = props;

  // INPUT
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [skill, setSkill] = useState<string>(KNOWLEDGE_SKILLS[0]);

  // STATE
  const [tier, setTier] = useState<KnowledgeTier | null>(null);
  const [draftFact, setDraftFact] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // A different entry starts a fresh knowledge check.
  useEffect(() => {
    setTier(null);
    setDraftFact(null);
    setIsGenerating(false);
    setNote("");
  }, [selected?.id]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle ? entities.filter((entity) => `${entity.name} ${entity.details}`.toLowerCase().includes(needle)) : entities;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }, [entities, query]);

  const history = selected ? events.filter((event) => event.entity_id === selected.id).slice(0, 8) : [];
  const showList = query.trim() !== "" || !selected;

  // The players roll and say the number; the DM taps the tier it reached. Nothing is shown to
  // the players until Reveal.
  async function generate(chosenSkill: string, chosenTier: KnowledgeTier) {
    if (!selected || isGenerating) return;
    const entityId = selected.id;
    setTier(chosenTier);
    setIsGenerating(true);
    setDraftFact(null);
    try {
      const result = await api<{ fact: string }>(`${campaignApi(campaignId)}/entities/${entityId}/knowledge/generate`, "POST", { skill: chosenSkill, tier: chosenTier });
      setDraftFact(result.fact);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't come up with a fact"));
      setTier(null);
    } finally {
      setIsGenerating(false);
    }
  }

  function reveal() {
    if (!selected || !draftFact) return;
    props.onReveal(selected, draftFact, skill, tier);
    setDraftFact(null);
    setTier(null);
  }

  function addNote() {
    const body = note.trim();
    if (!selected || !body) return;
    props.onAddNote(selected, body);
    setNote("");
  }

  function adjustHp(delta: number) {
    if (!selected?.stats) return;
    const hp = Math.min(selected.stats.hp_max, Math.max(0, selected.stats.hp + delta));
    if (hp !== selected.stats.hp) props.onStats(selected, { ...selected.stats, hp });
  }

  return (
    // DETAILS PANEL
    <div className="orc-details">

      {/* SEARCH ROW */}
      <div className="orc-details-search">

        {/* SEARCH FIELD — not autofocused: the panel is always on screen, and the DM is usually
            looking at the map, not about to type. The "/" key focuses it. */}
        <div className="input-with-icon orc-grow">
          <Search className="input-with-icon-leading w-4 h-4" aria-hidden />
          <input
            id="orc-details-search"
            className="input-field"
            value={query}
            placeholder="Search creatures, people, locations"
            aria-label="Search creatures, people, locations"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches.length > 0) {
                props.onSelect(matches[0].id);
                setQuery("");
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
          />
        </div>

        {/* NEW ENTRY BUTTON */}
        <Button className="btn-off" onClick={props.onCreate} title="New entry" aria-label="New entry">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New</span>
        </Button>
      </div>

      {/* RESULT LIST */}
      {showList && (
        <div className="orc-details-list">

          {/* EMPTY PLACEHOLDER */}
          {matches.length === 0 && (
            <div className="empty-state">
              <p className="empty-state-title">{entities.length === 0 ? "Nothing here yet" : "No match"}</p>
              <p className="empty-state-body">
                {entities.length === 0 ? "Add a creature, person or location, or build them from your notes on the Prep tab." : "Try a different word."}
              </p>
            </div>
          )}

          {/* RESULT ROWS */}
          {matches.map((entity) => {
            const Icon = KIND_ICONS[entity.kind];
            return (
              <button
                key={entity.id}
                type="button"
                className="orc-details-row"
                disabled={entity.id.startsWith("tmp-")}
                onClick={() => {
                  props.onSelect(entity.id);
                  setQuery("");
                }}
              >
                <Icon className="w-4 h-4 orc-attitude" data-attitude={entity.attitude} aria-hidden />
                <span className="orc-details-row-name">{entity.name}</span>
                <span className="orc-details-row-kind">{KIND_LABELS[entity.kind]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* SELECTED ENTRY */}
      {!showList && selected && (
        <div className="orc-details-body">

          {/* HEADER */}
          <div className="orc-details-head">

            {/* TITLE */}
            <div className="orc-details-title">
              <span className="orc-dot orc-attitude" data-attitude={selected.attitude} aria-hidden />
              <h2 className="orc-details-name">{selected.name}</h2>
            </div>

            {/* HEADER ACTIONS */}
            <div className="orc-details-actions">
              <Button className="btn-link" onClick={() => props.onEdit(selected)} title="Edit" aria-label={`Edit ${selected.name}`}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button className="btn-link-red" onClick={() => props.onDelete(selected)} title="Delete" aria-label={`Delete ${selected.name}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button className="btn-link" onClick={() => props.onSelect(null)} title="Back to the list" aria-label="Back to the list">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* VISIBILITY — whether the players can see it on their map */}
          {selected.kind !== "place" && selected.map_id === activeMapId && (
            <div className="orc-badges">
              <span className={`badge ${isVisibleToPlayers || selected.is_revealed ? "badge-green" : "badge-gray"}`}>
                {isVisibleToPlayers || selected.is_revealed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {selected.is_revealed ? "Revealed" : isVisibleToPlayers ? "In sight" : "Hidden"}
              </span>
            </div>
          )}

          {/* DISPLAY AND MAP ACTIONS */}
          <div className="orc-details-buttons">
            {panelEntityId === selected.id ? (
              <Button className="btn-green" onClick={() => props.onShow(null)}>
                <MonitorUp className="w-4 h-4" /> On display
              </Button>
            ) : (
              <Button className="btn-off" onClick={() => props.onShow(selected)}>
                <MonitorUp className="w-4 h-4" /> Show details to players
              </Button>
            )}
            {selected.kind !== "place" && selected.map_id === activeMapId && activeMapId && (
              <Button className={selected.is_revealed ? "btn-green" : "btn-off"} onClick={() => props.onToggleRevealed(selected)} title={selected.is_revealed ? "Take it off the players' map again" : "Put it on the players' map"}>
                {selected.is_revealed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />} {selected.is_revealed ? "Revealed" : "Reveal to players"}
              </Button>
            )}
            {selected.map_id === activeMapId && activeMapId ? (
              <>
                <Button className="btn-off" onClick={() => props.onZoomTo(selected)} title="Zoom the map in on this entry">
                  <ZoomIn className="w-4 h-4" /> Zoom to
                </Button>
                <Button className="btn-off" onClick={() => props.onUnplace(selected)}>
                  <MapPinOff className="w-4 h-4" /> Take off map
                </Button>
              </>
            ) : (
              <Button className={isPlacing ? "btn-blue" : "btn-off"} onClick={() => props.onPlace(selected)} disabled={!activeMapId}>
                <MapPin className="w-4 h-4" /> {isPlacing ? "Tap the map…" : "Place on map"}
              </Button>
            )}
            <Button className="btn-off" onClick={() => props.onPicture(selected)}>
              <Sparkles className="w-4 h-4" /> Generate image
            </Button>
          </div>

          {/* SECTIONS */}
          <div className="orc-sections">

            {/* PICTURE */}
            {selected.image_id && (
              <section className="orc-section">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="orc-details-image" src={`${campaignApi(campaignId)}/images/${selected.image_id}`} alt={selected.name} />
              </section>
            )}

            {/* DETAILS SECTION */}
            <section className="orc-section">
              <h3 className="orc-section-title">Details</h3>
              <p className="orc-section-text">{selected.details || "No details yet."}</p>
            </section>

            {/* STATS SECTION — creatures only */}
            {selected.stats && (
              <section className="orc-section">
                <h3 className="orc-section-title">Stats</h3>

                {/* VITALS */}
                <div className="orc-vitals">
                  <div className="orc-vital orc-vital-hp">
                    <button type="button" className="orc-hp-step" onClick={() => adjustHp(-1)} aria-label="Lose 1 hit point" title="Lose 1 hit point"><Minus className="w-3 h-3" /></button>
                    <span>
                      <span className="orc-vital-value">{selected.stats.hp}/{selected.stats.hp_max}</span>
                      <span className="orc-vital-label">HP</span>
                    </span>
                    <button type="button" className="orc-hp-step" onClick={() => adjustHp(1)} aria-label="Gain 1 hit point" title="Gain 1 hit point"><Plus className="w-3 h-3" /></button>
                  </div>
                  <div className="orc-vital"><span className="orc-vital-value">{selected.stats.ac}</span><span className="orc-vital-label">AC</span></div>
                  <div className="orc-vital"><span className="orc-vital-value">{selected.stats.speed}</span><span className="orc-vital-label">Speed</span></div>
                  <div className="orc-vital"><span className="orc-vital-value">{selected.stats.cr}</span><span className="orc-vital-label">CR</span></div>
                </div>

                {/* ABILITIES */}
                <div className="orc-abilities">
                  {(["str", "dex", "con", "int", "wis", "cha"] as const).map((key) => (
                    <div key={key} className="orc-ability">
                      <span className="orc-vital-label">{key.toUpperCase()}</span>
                      <span>{selected.stats?.abilities[key]}</span>
                    </div>
                  ))}
                </div>

                {/* ATTACKS */}
                {selected.stats.attacks.map((attack, index) => (
                  <div key={index} className="orc-attack">
                    <span className="orc-attack-name">{attack.name}</span>
                    <span className="orc-attack-roll">{attack.bonus >= 0 ? "+" : ""}{attack.bonus} · {attack.damage}</span>
                  </div>
                ))}
              </section>
            )}

            {/* KNOWN TO PLAYERS SECTION */}
            <section className="orc-section" data-tone="players">
              <h3 className="orc-section-title"><Eye className="w-3 h-3" /> Known to players</h3>
              {selected.knowledge.length === 0 && <p className="orc-section-text orc-muted">Nothing yet. A knowledge check adds to this.</p>}
              {selected.knowledge.map((fact) => (
                <div key={fact.id} className="orc-fact">
                  <span className="orc-section-text">{fact.fact}</span>
                  <button
                    type="button"
                    className="orc-fact-remove"
                    disabled={fact.id.startsWith("tmp-")}
                    onClick={() => props.onRemoveFact(selected, fact)}
                    title="Take this back"
                    aria-label="Take this fact back"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </section>

            {/* DM ONLY SECTION */}
            <section className="orc-section" data-tone="dm">
              <h3 className="orc-section-title"><EyeOff className="w-3 h-3" /> DM only</h3>
              <p className="orc-section-text">{selected.dm_notes || "No notes yet."}</p>
            </section>

            {/* KNOWLEDGE CHECK SECTION */}
            <section className="orc-section" data-tone="check">
              <h3 className="orc-section-title"><Dices className="w-3 h-3" /> Knowledge check</h3>

              {/* SKILL CHOICE */}
              <div className="orc-skills" role="radiogroup" aria-label="Skill">
                {KNOWLEDGE_SKILLS.map((entry) => (
                  <button key={entry} type="button" role="radio" aria-checked={skill === entry} className="orc-skill" disabled={isGenerating} onClick={() => setSkill(entry)}>
                    {entry}
                  </button>
                ))}
              </div>

              {/* TIER BUTTONS */}
              <div className="orc-tiers">
                {KNOWLEDGE_TIERS.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className="orc-tier"
                    aria-pressed={tier === entry.key}
                    disabled={isGenerating || selected.id.startsWith("tmp-")}
                    onClick={() => generate(skill, entry.key)}
                  >
                    <span className="orc-tier-range">{entry.range}</span>
                    <span className="orc-tier-label">{entry.label}</span>
                  </button>
                ))}
              </div>

              {/* GENERATING PLACEHOLDER */}
              {isGenerating && <p className="orc-section-text orc-muted">Thinking of what they learn…</p>}

              {/* DRAFT FACT */}
              {draftFact && (
                <div className="orc-draft">
                  <span className="orc-draft-label">{tier === "false" ? "Players will believe (wrong)" : "Players will learn"}</span>
                  <p className="orc-section-text">{draftFact}</p>
                  <div className="orc-draft-actions">
                    <Button className="btn-blue" onClick={reveal}>
                      <MonitorUp className="w-4 h-4" /> Reveal
                    </Button>
                    <Button className="btn-off" onClick={() => tier && generate(skill, tier)}>
                      <RefreshCw className="w-4 h-4" /> Another
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* HISTORY SECTION */}
            <section className="orc-section">
              <h3 className="orc-section-title">History</h3>
              {history.length === 0 && <p className="orc-section-text orc-muted">Nothing logged yet.</p>}
              {history.map((event) => (
                <div key={event.id} className="orc-event">
                  <span className="orc-event-scene">{event.session_title ?? "—"}</span>
                  <span className="orc-section-text">{event.body}</span>
                </div>
              ))}

              {/* NOTE FIELD — not autofocused: it sits at the end of a panel the DM reads first. */}
              <div className="orc-note-row">
                <input
                  className="input-field"
                  value={note}
                  maxLength={EVENT_MAX}
                  placeholder="Add a note"
                  aria-label={`Add a note about ${selected.name}`}
                  onChange={(event) => setNote(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && note.trim()) {
                      addNote();
                    } else {
                      blurOnEnter(event);
                    }
                  }}
                />
                <Button className="btn-off" disabled={!note.trim()} onClick={addNote} title="Add note" aria-label="Add note">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </section>
          </div>

          {/* FOOTER — where a creature comes from */}
          {selected.kind === "creature" && (
            <div className="orc-details-footer">Source: {selected.source || "not recorded"}</div>
          )}
        </div>
      )}
    </div>
  );
}
