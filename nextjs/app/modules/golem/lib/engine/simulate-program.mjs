// Full program simulation — runs the engine over the live "Fire Academy Support Program" using the
// REAL logged starting state (validated read-only from GRIMOIRE-GOLEM, user 2CB0D0CB; see plan §7/§-sim).
// Forward model: after each week the athlete is assumed to hit the prescription at the target RPE, so the
// next week progresses from it. Demonstrates selection (scored, no recycling), loading (double-progression
// + plateau override), volume ramp, and block-driven config change (program-agnostic).
// Run: node --experimental-strip-types app/modules/golem/lib/engine/simulate-program.mjs   (from nextjs/)
import { selectForSlot, DEFAULT_WEIGHTS } from './selection.ts';
import { decideLoad } from './progression.ts';
import { detectPlateau } from './volume.ts';
import { warmupRamp } from './warmup.ts';
import { epley1RM } from './oneRepMax.ts';

// ── Real starting state (exact values from validated DB queries). topSet=null → no load history (baseline). ──
function exDb() {
  const d = (s, e) => ({ date: new Date(s), e1rm: e });
  return {
    bench:      { id: 'bench', name: 'Bench Press', category: 'Strength', primaryMuscles: ['Chest'], allMuscles: ['Chest', 'Triceps', 'Shoulders'], daysSinceUsed: 0, historySessions: 8, topSet: { weight: 185, reps: 8, rpe: 8 }, e1rmSeries: [d('2026-01-18', 171), d('2026-02-17', 209), d('2026-03-06', 216), d('2026-05-12', 234)] },
    tricep:     { id: 'tricep', name: 'Tricep Pushdown With Rope', category: 'Strength', primaryMuscles: ['Triceps'], allMuscles: ['Triceps'], daysSinceUsed: 0, historySessions: 5, topSet: { weight: 80, reps: 12, rpe: 9 }, e1rmSeries: [] },
    hack:       { id: 'hack', name: 'Hack Squat Machine', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads', 'Glutes'], daysSinceUsed: 5, historySessions: 2, topSet: { weight: 90, reps: 10, rpe: 7 }, e1rmSeries: [d('2026-03-09', 120), d('2026-05-28', 120)] },
    legpress:   { id: 'legpress', name: 'Leg Press', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads', 'Glutes'], daysSinceUsed: 68, historySessions: 5, topSet: null, e1rmSeries: [] },
    legext:     { id: 'legext', name: 'Leg Extension', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads'], daysSinceUsed: 82, historySessions: 1, topSet: null, e1rmSeries: [] },
    pulldown:   { id: 'pulldown', name: 'Neutral Close-Grip Lat Pulldown', category: 'Strength', primaryMuscles: ['Lats'], allMuscles: ['Lats', 'Biceps', 'Upper Back'], daysSinceUsed: 0, historySessions: 4, topSet: { weight: 140, reps: 12, rpe: 8 }, e1rmSeries: [d('2026-05-29', 187)] },
    csrow:      { id: 'csrow', name: 'Chest-Supported Row', category: 'Strength', primaryMuscles: ['Upper Back'], allMuscles: ['Upper Back', 'Lats', 'Biceps'], daysSinceUsed: null, historySessions: 0, topSet: null, e1rmSeries: [] },
    revfly:     { id: 'revfly', name: 'Reverse Cable Flyes', category: 'Strength', primaryMuscles: ['Shoulders'], allMuscles: ['Shoulders', 'Upper Back'], daysSinceUsed: 0, historySessions: 3, topSet: { weight: 20, reps: 15, rpe: 8.5 }, e1rmSeries: [] },
    hammer:     { id: 'hammer', name: 'Hammer Curl', category: 'Strength', primaryMuscles: ['Biceps'], allMuscles: ['Biceps', 'Forearms'], daysSinceUsed: 0, historySessions: 6, topSet: { weight: 20, reps: 12, rpe: 9.5 }, e1rmSeries: [] },
    decline:    { id: 'decline', name: 'Decline Sit Ups', category: 'Strength', primaryMuscles: ['Core'], allMuscles: ['Core'], daysSinceUsed: 0, historySessions: 7, topSet: { weight: 25, reps: 12, rpe: 8 }, e1rmSeries: [] },
    hkr:        { id: 'hkr', name: 'Hanging Knee Raise', category: 'Strength', primaryMuscles: ['Core'], allMuscles: ['Core', 'Hip Flexors'], daysSinceUsed: 0, historySessions: 4, topSet: { weight: 0, reps: 12, rpe: 9 }, e1rmSeries: [] },
  };
}

// candidate pool for a target muscle = every exercise that is a primary mover for it
function candidatesFor(db, muscle) {
  return Object.values(db)
    .filter((e) => e.primaryMuscles.includes(muscle))
    .map((e) => ({ exerciseId: e.id, name: e.name, category: e.category, primaryMuscles: e.primaryMuscles, allMuscles: e.allMuscles, daysSinceUsed: e.daysSinceUsed, historySessions: e.historySessions, equipmentAvailable: true }));
}

// ── Block configs: same slot shape, different progression PARAMS → program-agnostic via config, not forks. ──
const BLOCKS = {
  1: { name: 'Work Capacity Foundation', repAdj: 0, rpe: 7.5, setBase: 1, loadStep: 0.05, volumeGap: 0.6 },
  2: { name: 'Functional Strength',      repAdj: -3, rpe: 8.5, setBase: 0, loadStep: 0.04, volumeGap: 0.5 }, // lower reps, heavier, strength
};

// Day archetypes (slots). Primaries pinned (specificity); accessories scored. repRange shifts by block.repAdj.
function days(block) {
  const r = (lo, hi) => [Math.max(3, lo + block.repAdj), Math.max(5, hi + block.repAdj)];
  const prog = (model, lo, hi, sets) => ({ model, repRange: r(lo, hi), targetRpe: block.rpe, loadStepPct: block.loadStep, roundToStep: 5, setTarget: sets + block.setBase });
  const slot = (role, muscle, cadence, pinned, cat = 'Strength') => ({ role, targetMuscle: muscle, categoryFilter: cat, rotationCadence: cadence, pinnedExerciseId: pinned, excludeExerciseIds: [] });
  return [
    { name: 'Upper Push + Carries', slots: [
      { def: slot('primary', 'Chest', 'per_block', 'bench'), progression: prog('double_progression', 6, 10, 3) },
      { def: slot('accessory', 'Triceps', 'per_session', null), progression: prog('double_progression', 10, 15, 3) },
    ] },
    { name: 'Lower — Low-Axial', slots: [
      { def: slot('primary', 'Quads', 'per_block', 'hack'), progression: prog('double_progression', 10, 12, 4) },
      { def: slot('secondary', 'Quads', 'per_session', null), progression: prog('double_progression', 10, 15, 3) },
      { def: slot('core', 'Core', 'per_session', null), progression: prog('double_progression', 10, 15, 3) },
    ] },
    { name: 'Upper Pull', slots: [
      { def: slot('primary', 'Lats', 'per_block', 'pulldown'), progression: prog('double_progression', 8, 12, 4) },
      { def: slot('secondary', 'Upper Back', 'per_session', null), progression: prog('double_progression', 8, 12, 3) },
      { def: slot('isolation', 'Biceps', 'per_session', null), progression: prog('double_progression', 8, 12, 3) },
      { def: slot('isolation', 'Shoulders', 'per_session', null), progression: prog('double_progression', 12, 20, 3) },
    ] },
  ];
}

// Generate one day inline (mirrors orchestrator.generateDay using the harness-loadable leaves).
function generateDay(day, db, block) {
  const chosenMuscleSets = [];
  const chosenIds = [];
  const out = [];
  for (const s of day.slots) {
    const cands = candidatesFor(db, s.def.targetMuscle);
    const ctx = { volumeGapByMuscle: new Map([[s.def.targetMuscle, block.volumeGap]]), alreadyChosenMuscleSets: chosenMuscleSets, noveltyTriggered: false, weights: DEFAULT_WEIGHTS, freshnessHalfLifeDays: 28, continuityTargetSessions: 5 };
    const slotWithDedup = { ...s.def, excludeExerciseIds: [...s.def.excludeExerciseIds, ...chosenIds] };
    const picked = selectForSlot(cands, slotWithDedup, ctx);
    if (!picked) continue;
    const ex = db[picked.candidate.exerciseId];
    chosenIds.push(ex.id);
    chosenMuscleSets.push(ex.allMuscles);
    const plateau = detectPlateau(ex.e1rmSeries);
    const baseline = ex.topSet === null;
    const topSet = ex.topSet ?? { weight: 0, reps: s.progression.repRange[0], rpe: s.progression.targetRpe };
    const dec = decideLoad(s.progression, topSet, { plateau, metTargetLastTime: false });
    out.push({ slotRole: s.def.role, ex, load: dec.load, reps: dec.reps, sets: s.progression.setTarget, rpe: s.progression.targetRpe, rationale: plateau ? dec.rationale : dec.rationale, baseline, warmups: warmupRamp(dec.load) });
  }
  return out;
}

// Apply the week's prescription to state (assume performed at target) so next week progresses from it.
function advance(db, generated, weekIdx) {
  for (const g of generated) {
    const ex = db[g.ex.id];
    ex.topSet = { weight: g.load, reps: g.reps, rpe: g.rpe };
    ex.daysSinceUsed = 0;
    ex.historySessions += 1;
    if (g.load > 0) ex.e1rmSeries = [...ex.e1rmSeries, { date: new Date(2026, 5, 1 + weekIdx * 7), e1rm: epley1RM(g.load, g.reps) }].slice(-6);
  }
}

// ── Run ──
function fmtLoad(g) {
  const w = g.load > 0 ? `${g.load}` : (g.baseline ? 'BW/baseline' : 'BW');
  const wu = g.load > 0 && g.warmups.length ? `  [wu ${g.warmups.map((s) => `${s.weight}×${s.reps}`).join('/')}]` : '';
  return `${g.sets}×${g.reps} @ ${w}${g.baseline ? ' ⚑' : ''}${wu}`;
}

console.log('═══ FULL PROGRAM SIMULATION — Fire Academy Support Program (real starting data) ═══\n');
let db = exDb();
const schedule = [{ block: 1, weeks: 4 }, { block: 2, weeks: 1 }]; // Block 1 detailed + Block 2 transition
let weekIdx = 0;
for (const phase of schedule) {
  const block = BLOCKS[phase.block];
  console.log(`\n████ BLOCK ${phase.block}: ${block.name}  (target RPE ${block.rpe}, load step ${(block.loadStep * 100).toFixed(0)}%) ████`);
  for (let w = 1; w <= phase.weeks; w++) {
    weekIdx++;
    console.log(`\n── Week ${w} ──`);
    const dayPlans = days(block);
    for (const day of dayPlans) {
      const gen = generateDay(day, db, block);
      console.log(`  ▸ ${day.name}`);
      for (const g of gen) {
        const note = g.rationale && g.rationale !== 'climb reps at same load' ? `   ‹${g.rationale}›` : '';
        console.log(`      ${g.ex.name.padEnd(32)} ${fmtLoad(g)}${note}`);
      }
      advance(db, gen, weekIdx);
    }
  }
}
console.log('\n  ▸ Conditioning Circuit (Day 4, all weeks): time/density-progressed — stairmill intervals + sled + carries + swings; +1 round or +interval each week (no load math). [model: time_effort]');
console.log('\n═══ end simulation ═══');
console.log('⚑ = no load history → conservative baseline, flagged for user confirmation.');
