"use client";

import { BookOpen, Dices, Flame, Plus, Skull, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { generateUUID } from "@/lib/uuid";
import type { ImageSource } from "../../../../components/ImagePicker";
import SessionBar from "../../../../components/SessionBar";
import { TABLE_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { CHALLENGE_ROWS, CONDITIONS, DIFFICULTY_CLASSES, GENERATORS, IMPROVISED_DAMAGE, rollDice, statBlockFromChallenge, type ChallengeRow } from "../../../../lib/reference";
import type { TableSnapshot } from "../../../../types/oracle";

interface ReferenceClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
}

// QUICK REFERENCE — fifth-edition numbers, conditions and random tables. Nothing here calls a
// generator: every answer is instant.
export default function ReferenceClient({ snapshot }: ReferenceClientProps) {
  const campaign = snapshot.campaign;
  const activeMap = snapshot.maps.find((map) => map.id === campaign.active_map_id) ?? null;
  useAppHeight();
  useEntityTitle(campaign.name);

  // INPUT
  const [dice, setDice] = useState("1d20");

  // STATE
  const [conditionName, setConditionName] = useState<string>(CONDITIONS[4].name);
  const [rolled, setRolled] = useState<Record<string, string>>({}); // generator key -> its last result
  const [diceResult, setDiceResult] = useState<string | null>(null);
  const [addedChallenge, setAddedChallenge] = useState<string | null>(null); // the CR just added to the cast
  const [isAdding, setIsAdding] = useState(false);
  const condition = CONDITIONS.find((entry) => entry.name === conditionName) ?? CONDITIONS[0];

  function roll() {
    const result = rollDice(dice);
    setDiceResult(result ? `${result.total}  (${result.rolls.join(", ")})` : "Write dice like 2d6+1");
  }

  // Add a creature with this row's stat block to the cast, beside the party on the active map.
  async function addCreature(row: ChallengeRow) {
    if (isAdding) return;
    setIsAdding(true);
    try {
      const angle = Math.random() * Math.PI * 2;
      await api(`${campaignApi(campaign.id)}/entities`, "POST", {
        id: generateUUID().toLowerCase(),
        kind: "creature",
        name: `Creature (CR ${row.cr})`,
        attitude: "hostile",
        stats: statBlockFromChallenge(row),
        map_id: activeMap?.id ?? null,
        map_x: activeMap ? Math.round(Math.min(Math.max(activeMap.party_x + Math.cos(angle) * 60, 0), activeMap.data.width)) : null,
        map_y: activeMap ? Math.round(Math.min(Math.max(activeMap.party_y + Math.sin(angle) * 60, 0), activeMap.data.height)) : null,
      });
      setAddedChallenge(row.cr);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add the creature"));
    } finally {
      setIsAdding(false);
    }
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

              {/* DIFFICULTY CLASS CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><BookOpen className="w-5 h-5" /> Difficulty class</h2>
                </div>
                <div className="card-content orc-table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Task</th><th>DC</th></tr>
                    </thead>
                    <tbody>
                      {DIFFICULTY_CLASSES.map((entry) => (
                        <tr key={entry.dc}><td>{entry.task}</td><td>{entry.dc}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* IMPROVISED DAMAGE CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Flame className="w-5 h-5" /> Improvised damage</h2>
                </div>
                <div className="card-content orc-table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Level</th><th>Setback</th><th>Dangerous</th><th>Deadly</th></tr>
                    </thead>
                    <tbody>
                      {IMPROVISED_DAMAGE.map((entry) => (
                        <tr key={entry.levels}><td>{entry.levels}</td><td>{entry.setback}</td><td>{entry.dangerous}</td><td>{entry.deadly}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

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

              {/* QUICK MONSTER CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Skull className="w-5 h-5" /> Quick monster by CR</h2>
                </div>
                <div className="card-content orc-table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>CR</th><th>AC</th><th>HP</th><th>Hit</th><th>Dmg</th><th>DC</th><th><span className="sr-only">Add</span></th></tr>
                    </thead>
                    <tbody>
                      {CHALLENGE_ROWS.map((row) => (
                        <tr key={row.cr} className={addedChallenge === row.cr ? "orc-row-selected" : undefined}>
                          <td>{row.cr}</td>
                          <td>{row.ac}</td>
                          <td>{row.hpMin}-{row.hpMax}</td>
                          <td>+{row.attack}</td>
                          <td>{row.damageMin}-{row.damageMax}</td>
                          <td>{row.saveDc}</td>
                          <td>
                            <Button className="btn-link" disabled={isAdding} onClick={() => addCreature(row)} title={`Add a CR ${row.cr} creature to the cast`} aria-label={`Add a CR ${row.cr} creature to the cast`}>
                              <Plus className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* ADDED NOTE */}
                  <p className="orc-small text-secondary mt-3">
                    {addedChallenge ? `Added a CR ${addedChallenge} creature beside the party. Rename it from the Table tab.` : "Tap + to add a creature with that row's numbers to the cast, beside the party."}
                  </p>
                </div>
              </div>

              {/* CONDITIONS CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><TriangleAlert className="w-5 h-5" /> Conditions</h2>
                </div>
                <div className="card-content">

                  {/* CONDITION NAMES */}
                  <div className="orc-chip-list" role="radiogroup" aria-label="Condition">
                    {CONDITIONS.map((entry) => (
                      <button key={entry.name} type="button" role="radio" aria-checked={conditionName === entry.name} className="orc-skill" onClick={() => setConditionName(entry.name)}>
                        {entry.name}
                      </button>
                    ))}
                  </div>

                  {/* CONDITION EFFECT */}
                  <p className="orc-section-text mt-3"><strong>{condition.name}.</strong> {condition.effect}</p>
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
