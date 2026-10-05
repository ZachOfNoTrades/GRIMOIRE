"use client";

import { Dices, Minus, Plus, Swords } from "lucide-react";
import TabLink from "../../../../components/TabLink";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { generateUUID } from "@/lib/uuid";
import type { ImageSource } from "../../../../components/ImagePicker";
import SessionBar from "../../../../components/SessionBar";
import { TABLE_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { CR_KEYS, normalizeCr, summarizeEncounter, xpForCr, type Difficulty } from "../../../../lib/encounter";
import { GENERATORS, findChallengeRow, rollDice, statBlockFromChallenge } from "../../../../lib/reference";
import type { TableSnapshot } from "../../../../types/oracle";

interface EncounterRow {
  key: string;
  label: string;
  cr: string;
  count: number;
  entityId: string | null; // set when the creature came from the cast
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = { trivial: "Trivial", easy: "Easy", medium: "Medium", hard: "Hard", deadly: "Deadly" };

interface ReferenceClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
}

// QUICK REFERENCE — the encounter builder, dice and random tables. Nothing here calls a
// generator: every answer is instant.
export default function ReferenceClient({ snapshot }: ReferenceClientProps) {
  const campaign = snapshot.campaign;
  const activeMap = snapshot.maps.find((map) => map.id === campaign.active_map_id) ?? null;
  useAppHeight();
  useEntityTitle(campaign.name);

  // INPUT
  const [dice, setDice] = useState("1d20");

  // STATE
  const [rolled, setRolled] = useState<Record<string, string>>({}); // generator key -> its last result
  const [diceResult, setDiceResult] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // ENCOUNTER BUILDER — lines are creatures from the cast (by id) or a plain challenge rating
  const [lines, setLines] = useState<EncounterRow[]>([]);
  const [pickCr, setPickCr] = useState("1");
  const [pickEntity, setPickEntity] = useState("");
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const levels = snapshot.party.map((member) => member.level);
  const castCreatures = useMemo(
    () => snapshot.entities.filter((entity) => entity.kind === "creature" && normalizeCr(entity.stats?.cr)).sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.entities]
  );
  const summary = summarizeEncounter(lines.map((line) => ({ cr: line.cr, count: line.count })), levels);

  function addLine(next: Omit<EncounterRow, "count">) {
    setLines((list) => {
      const existing = list.find((line) => line.key === next.key);
      if (existing) return list.map((line) => (line.key === next.key ? { ...line, count: Math.min(30, line.count + 1) } : line));
      return [...list, { ...next, count: 1 }];
    });
    setAddedNote(null);
  }

  function changeCount(key: string, delta: number) {
    setLines((list) => list.map((line) => (line.key === key ? { ...line, count: line.count + delta } : line)).filter((line) => line.count > 0 && line.count <= 30));
  }

  // Put the encounter's plain-CR creatures into the cast beside the party, numbered. Creatures
  // picked from the cast are already there.
  async function addEncounterToCast() {
    if (isAdding) return;
    const generic = lines.filter((line) => line.entityId === null);
    if (generic.length === 0) {
      setAddedNote("Everything in this encounter is already in the cast.");
      return;
    }
    setIsAdding(true);
    try {
      let made = 0;
      for (const line of generic) {
        const row = findChallengeRow(line.cr);
        for (let index = 0; index < line.count; index += 1) {
          const angle = Math.random() * Math.PI * 2;
          await api(`${campaignApi(campaign.id)}/entities`, "POST", {
            id: generateUUID().toLowerCase(),
            kind: "creature",
            name: `${line.label}${line.count > 1 ? ` ${index + 1}` : ""}`,
            attitude: "hostile",
            source: "Challenge rating table",
            stats: row ? statBlockFromChallenge(row) : null,
            map_id: activeMap?.id ?? null,
            map_x: activeMap ? Math.round(Math.min(Math.max(activeMap.party_x + Math.cos(angle) * 60, 0), activeMap.data.width)) : null,
            map_y: activeMap ? Math.round(Math.min(Math.max(activeMap.party_y + Math.sin(angle) * 60, 0), activeMap.data.height)) : null,
          });
          made += 1;
        }
      }
      setAddedNote(`Added ${made} ${made === 1 ? "creature" : "creatures"} beside the party. Rename them from the Table tab.`);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add the creatures"));
    } finally {
      setIsAdding(false);
    }
  }

  function roll() {
    const result = rollDice(dice);
    setDiceResult(result ? `${result.total}  (${result.rolls.join(", ")})` : "Write dice like 2d6+1");
  }

  return (
    // PAGE — a locked full-height shell with one scrolling body
    <div className="page page-with-bottom-bar orc-shell">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* SESSION BAR */}
      <SessionBar campaignId={campaign.id} campaignName={campaign.name} active="reference" help={TABLE_HELP} />

      {/* SCROLLING BODY */}
      <div className="orc-page-body">
        <div className="page-container">
          <div className="orc-columns" data-columns="3">

            {/* RULES COLUMN */}
            <div className="orc-stack">

              {/* DICE CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Dices className="w-5 h-5" /> Dice</h2>
                </div>
                <div className="card-content">
                  <div className="orc-note-row">

                    {/* DICE FIELD — not autofocused: one of several tools on a reference page. */}
                    <input
                      id="orc-dice"
                      className="input-field"
                      value={dice}
                      maxLength={12}
                      aria-label="Dice to roll, like 2d6+1"
                      onChange={(event) => setDice(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          roll();
                        }
                      }}
                    />
                    <Button className="btn-blue" onClick={roll}>Roll</Button>
                  </div>

                  {/* DICE RESULT */}
                  <p className="orc-gen-value mt-3">{diceResult ?? "Write dice like 2d6+1 and roll."}</p>
                </div>
              </div>
            </div>

            {/* MONSTER COLUMN */}
            <div className="orc-stack">

              {/* ENCOUNTER BUILDER CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Swords className="w-5 h-5" /> Encounter builder</h2>
                </div>
                <div className="card-content orc-stack">

                  {/* PARTY LINE */}
                  <div className="orc-enc-party">
                    {levels.length === 0 ? (
                      <span className="orc-small text-secondary">No party. <TabLink campaignId={campaign.id} tab="prep" className="orc-inline-link">Add characters on Prep</TabLink></span>
                    ) : (
                      <span className="orc-small text-secondary">{levels.length} {levels.length === 1 ? "character" : "characters"}, level {levels.join(", ")}. <TabLink campaignId={campaign.id} tab="prep" className="orc-inline-link">Edit on Prep</TabLink></span>
                    )}
                    <div className="orc-enc-thresholds" aria-label="Party thresholds">
                      {(["easy", "medium", "hard", "deadly"] as const).map((key) => (
                        <span key={key} className="orc-enc-threshold" data-active={summary.difficulty === key ? "true" : undefined}>
                          <span className="orc-label">{key}</span>
                          <span className="orc-enc-xp">{summary.thresholds[key].toLocaleString()}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* ADD FROM THE CAST */}
                  <div className="orc-note-row">
                    <select className="input-field" value={pickEntity} aria-label="Creature from the cast" onChange={(event) => setPickEntity(event.target.value)}>
                      <option value="">{castCreatures.length ? "From the cast…" : "No cast creatures with a CR yet"}</option>
                      {castCreatures.map((entity) => (
                        <option key={entity.id} value={entity.id}>{entity.name} · CR {normalizeCr(entity.stats?.cr)}</option>
                      ))}
                    </select>
                    <Button
                      className="btn-off"
                      disabled={!pickEntity}
                      title="Add this creature"
                      aria-label="Add this creature"
                      onClick={() => {
                        const entity = castCreatures.find((entry) => entry.id === pickEntity);
                        if (entity) addLine({ key: `e:${entity.id}`, label: entity.name, cr: normalizeCr(entity.stats?.cr) as string, entityId: entity.id });
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* ADD BY CHALLENGE RATING */}
                  <div className="orc-note-row">
                    <select className="input-field" value={pickCr} aria-label="Challenge rating" onChange={(event) => setPickCr(event.target.value)}>
                      {CR_KEYS.map((cr) => (
                        <option key={cr} value={cr}>CR {cr} · {xpForCr(cr).toLocaleString()} XP{findChallengeRow(cr) ? "" : " · no stat block"}</option>
                      ))}
                    </select>
                    <Button className="btn-off" title="Add a creature of this rating" aria-label="Add a creature of this rating" onClick={() => addLine({ key: `cr:${pickCr}`, label: `Creature (CR ${pickCr})`, cr: pickCr, entityId: null })}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* LINES */}
                  {lines.length === 0 && <span className="orc-small text-secondary">No creatures yet</span>}
                  {lines.map((line) => (
                    <div key={line.key} className="orc-enc-line">
                      <span className="orc-gen-value">{line.label} <span className="orc-muted">· CR {line.cr} · {xpForCr(line.cr).toLocaleString()} XP</span></span>
                      <span className="orc-level">
                        <button type="button" className="orc-level-btn" aria-label={`One fewer ${line.label}`} onClick={() => changeCount(line.key, -1)}><Minus className="w-3 h-3" /></button>
                        <span className="orc-level-value">× {line.count}</span>
                        <button type="button" className="orc-level-btn" disabled={line.count >= 30} aria-label={`One more ${line.label}`} onClick={() => changeCount(line.key, 1)}><Plus className="w-3 h-3" /></button>
                      </span>
                    </div>
                  ))}

                  {/* GAUGE */}
                  {lines.length > 0 && (
                    <div className="orc-enc-result" data-difficulty={summary.difficulty}>
                      <div className="orc-enc-gauge" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={summary.gauge} aria-label="Difficulty">
                        <div className="orc-enc-gauge-fill" style={{ width: `${Math.round(summary.gauge * 100)}%` }} />
                      </div>
                      <div className="orc-enc-verdict">
                        <strong>{levels.length === 0 ? "Add the party to rate this" : DIFFICULTY_LABEL[summary.difficulty]}</strong>
                        <span className="orc-small text-secondary">
                          {summary.creatureCount} {summary.creatureCount === 1 ? "creature" : "creatures"} · {summary.rawXp.toLocaleString()} XP × {summary.multiplier} = {summary.adjustedXp.toLocaleString()} adjusted
                          {levels.length > 0 ? ` · ${summary.xpEach.toLocaleString()} XP each` : ""}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ACTIONS */}
                  {lines.length > 0 && (
                    <div className="orc-card-actions">
                      <span className="orc-small text-secondary">{addedNote ?? ""}</span>
                      <div className="orc-row-actions">
                        <Button className="btn-off" onClick={() => { setLines([]); setAddedNote(null); }}>Clear</Button>
                        <Button className="btn-blue" disabled={isAdding} onClick={addEncounterToCast}>
                          <Plus className="w-4 h-4" /> {isAdding ? "Adding…" : "Add to cast"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* GENERATORS COLUMN */}
            <div className="orc-stack">

              {/* GENERATORS CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Dices className="w-5 h-5" /> Generators</h2>
                </div>
                <div className="card-content orc-stack">
                  {GENERATORS.map((generator) => (

                    // GENERATOR ROW
                    <div key={generator.key} className="orc-gen-row">
                      <div className="orc-gen-body">
                        <span className="orc-label">{generator.label}</span>
                        <span className="orc-gen-value">{rolled[generator.key] ?? "Tap to roll"}</span>
                      </div>
                      <Button className="btn-off" onClick={() => setRolled((previous) => ({ ...previous, [generator.key]: generator.roll() }))} title={`Roll a ${generator.label.toLowerCase()}`} aria-label={`Roll a ${generator.label.toLowerCase()}`}>
                        <Dices className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
