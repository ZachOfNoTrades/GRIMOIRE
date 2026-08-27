// Dev verification harness for the deterministic engine — NOT part of the app build (.mjs, not in tsconfig include).
// Run: node --import ./app/modules/golem/lib/engine/ts-resolve.mjs --experimental-strip-types app/modules/golem/lib/engine/verify.mjs
// Asserts the grounded cases from the live-data simulation (plan §0 / §-sim).
import assert from 'node:assert';
import { loadForRepsAtRpe, estimate1RM } from './oneRepMax.ts';
import { nextDoubleProgression, nextTimeEffort, nextLinear, decideLoad, layoffRetention, LAYOFF_GRACE_DAYS, LAYOFF_MAX_DECAY } from './progression.ts';
import { warmupRamp } from './warmup.ts';
import { realizedProgressionRate, detectPlateau, mondayOf, weeklyVolumeByMuscle } from './volume.ts';
import { selectForSlot, scoreCandidate, DEFAULT_WEIGHTS } from './selection.ts';

let pass = 0;
function check(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); process.exitCode = 1; }
}

console.log('Engine verification (grounded in live data):');

// 1. Hack Squat plateau override → load step to 95, reset reps to 10
check('Hack Squat 90x10 @RPE7.5, plateau → 4x10 @95', () => {
  const state = { model: 'double_progression', repRange: [10, 12], targetRpe: 7.5, loadStepPct: 0.06, roundToStep: 5, setTarget: 4 };
  const d = nextDoubleProgression(state, { weight: 90, reps: 10, rpe: 7.5 }, { plateau: true });
  assert.strictEqual(d.load, 95, `load=${d.load}`);
  assert.strictEqual(d.reps, 10, `reps=${d.reps}`);
});

// 2. Same set, NO plateau → climb reps at same load (90x11)
check('Hack Squat 90x10, no plateau → climb reps to 11 @90', () => {
  const state = { model: 'double_progression', repRange: [10, 12], targetRpe: 7.5, loadStepPct: 0.06, roundToStep: 5, setTarget: 4 };
  const d = nextDoubleProgression(state, { weight: 90, reps: 10, rpe: 7.5 }, { plateau: false });
  assert.strictEqual(d.load, 90, `load=${d.load}`);
  assert.strictEqual(d.reps, 11, `reps=${d.reps}`);
});

// 3. Lat Pulldown hit top of range @ ok RPE → load step to 150, reset to 10
check('Lat Pulldown 140x12 @RPE8 → 150x10', () => {
  const state = { model: 'double_progression', repRange: [10, 12], targetRpe: 8, loadStepPct: 0.07, roundToStep: 5, setTarget: 4 };
  const d = nextDoubleProgression(state, { weight: 140, reps: 12, rpe: 8 }, { plateau: false });
  assert.strictEqual(d.load, 150, `load=${d.load}`);
  assert.strictEqual(d.reps, 10, `reps=${d.reps}`);
});

// 4. Hammer Curl RPE 9.5 vs target 8 → overreach → hold load, reset reps (NO progression)
check('Hammer Curl 20x12 @RPE9.5 → overreach hold @20, reps 8', () => {
  const state = { model: 'double_progression', repRange: [8, 12], targetRpe: 8, loadStepPct: 0.05, roundToStep: 5, setTarget: 3 };
  const d = nextDoubleProgression(state, { weight: 20, reps: 12, rpe: 9.5 }, { plateau: false });
  assert.strictEqual(d.load, 20, `load=${d.load}`);
  assert.strictEqual(d.reps, 8, `reps=${d.reps}`);
  assert.match(d.rationale, /overreach/);
});

// 4b. TIME_EFFORT — CARDIO (timeRange set): prescribes DURATION within the range (floor → capped ceiling).
check('time_effort cardio [600,900]s: no history → 600s floor; 600→660; near cap → 900; reps null', () => {
  const state = { model: 'time_effort', repRange: [8, 12], timeRange: [600, 900], targetRpe: null, loadStepPct: 0.05, roundToStep: 5, setTarget: 1 };
  const baseline = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: null });
  assert.strictEqual(baseline.timeSeconds, 600, `baseline=${baseline.timeSeconds}`);
  assert.strictEqual(baseline.reps, null, 'reps null for time_effort');
  const step = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 600 }); // +max(5,round(60/5)*5)=+60
  assert.strictEqual(step.timeSeconds, 660, `step=${step.timeSeconds}`);
  const capped = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 880 });
  assert.strictEqual(capped.timeSeconds, 900, `capped=${capped.timeSeconds}`);
});

// 4c. TIME_EFFORT — STRENGTH HOLD (timeRange null): NO guardrails. No history → null target (self-report);
//     with history → progress from logged time, no ceiling.
check('time_effort strength hold (no range): no history → null (self-report); 40s→45s uncapped', () => {
  const state = { model: 'time_effort', repRange: [8, 12], timeRange: null, targetRpe: null, loadStepPct: 0.05, roundToStep: 5, setTarget: 3 };
  const cold = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: null });
  assert.strictEqual(cold.timeSeconds, null, `cold-start target=${cold.timeSeconds} (expected null self-report)`);
  assert.match(cold.rationale, /self-report/);
  const fromHistory = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 40 });
  assert.strictEqual(fromHistory.timeSeconds, 45, `fromHistory=${fromHistory.timeSeconds}`);
  // No ceiling: a long hold keeps climbing (120 → +max(5,round(12/5)*5)=+10 → 130).
  const long = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 120 });
  assert.strictEqual(long.timeSeconds, 130, `long=${long.timeSeconds}`);
  // Dispatcher routes time_effort and holds load.
  const viaDispatch = decideLoad(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 40 }, { plateau: false, metTargetLastTime: false });
  assert.strictEqual(viaDispatch.timeSeconds, 45, `dispatch=${viaDispatch.timeSeconds}`);
});

// 5. RPE-aware load: e1RM 234, 8 reps @ RPE7 ≈ 171
check('loadForRepsAtRpe(234,8,7) ≈ 171', () => {
  const load = Math.round(loadForRepsAtRpe(234, 8, 7));
  assert.ok(Math.abs(load - 171) <= 2, `got ${load}`);
});
check('estimate1RM(185,8) Epley ≈ 234', () => {
  assert.strictEqual(estimate1RM(185, 8), 234, `got ${estimate1RM(185, 8)}`);
});

// 6. Warmup ramp off 95 lb → ascending sub-working sets
check('warmupRamp(95) → 3 ascending sets all < 95', () => {
  const w = warmupRamp(95);
  assert.strictEqual(w.length, 3, `len=${w.length}`);
  assert.ok(w.every((s) => s.isWarmup && s.weight < 95), 'all warmup & sub-working');
  assert.ok(w[0].weight < w[1].weight && w[1].weight < w[2].weight, 'ascending');
});
check('warmupRamp(bodyweight 0) → none', () => {
  assert.strictEqual(warmupRamp(0).length, 0);
});

// 7. Plateau + progression-rate on e1RM series
check('detectPlateau on flat-topped series → true', () => {
  const mk = (d, e) => ({ date: new Date(d), e1rm: e });
  const series = [mk('2026-01-05', 120), mk('2026-01-12', 119), mk('2026-01-19', 120), mk('2026-01-26', 120), mk('2026-02-02', 120)];
  assert.strictEqual(detectPlateau(series), true);
});
check('realizedProgressionRate on rising bench series → positive', () => {
  const mk = (d, e) => ({ date: new Date(d), e1rm: e });
  const series = [mk('2026-01-18', 171), mk('2026-02-17', 209), mk('2026-03-06', 216), mk('2026-05-12', 234)];
  const rate = realizedProgressionRate(series);
  assert.ok(rate !== null && rate > 0, `rate=${rate}`);
});

// 8. Calendar-week bucketing groups by Monday anchor (calendar-independent: derive a real Monday from mondayOf)
check('weeklyVolumeByMuscle buckets same-week sets together', () => {
  const monday = mondayOf(new Date(2026, 4, 25)); // guaranteed Monday of that week
  assert.strictEqual(monday.getDay(), 1, 'mondayOf returns a Monday');
  const sameWeek = new Date(monday); sameWeek.setDate(monday.getDate() + 2); // +2d, still same week
  const nextWeek = new Date(monday); nextWeek.setDate(monday.getDate() + 9); // +9d, next week
  const out = weeklyVolumeByMuscle([
    { date: monday, muscle: 'Quads' },
    { date: sameWeek, muscle: 'Quads' },
    { date: nextWeek, muscle: 'Quads' },
  ]);
  const w0 = out.find((r) => r.weekStart.getTime() === monday.getTime());
  assert.strictEqual(w0.sets, 2, `same-week sets=${w0?.sets}`);
  assert.strictEqual(out.length, 2, `distinct weeks=${out.length}`);
});

// 9. Composer end-to-end (mirrors buildPrescription via the leaves): Hack Squat plateau →
//    warmups + 4 working sets @ 95×10. (buildPrescription itself is type-checked; its value imports
//    are extensionless so this harness reproduces its composition with the harness-loadable leaves.)
check('composed prescription — Hack Squat plateau → warmups + 4×10 @95', () => {
  const state = { model: 'double_progression', repRange: [10, 12], targetRpe: 7.5, loadStepPct: 0.06, roundToStep: 5, setTarget: 4 };
  const topSet = { weight: 90, reps: 10, rpe: 7.5 };
  const mk = (d, e) => ({ date: new Date(d), e1rm: e });
  const e1rmSeries = [mk('2026-03-09', 120), mk('2026-04-06', 120), mk('2026-05-04', 120), mk('2026-05-28', 120)];
  const plateau = detectPlateau(e1rmSeries);
  assert.strictEqual(plateau, true, 'flat series → plateau');
  const d = decideLoad(state, topSet, { plateau, metTargetLastTime: false });
  const warmups = warmupRamp(d.load);
  const working = Array.from({ length: state.setTarget }, (_, i) => ({ setNumber: i + 1, isWarmup: false, weight: d.load, reps: d.reps, rpe: state.targetRpe, timeSeconds: null }));
  assert.strictEqual(d.load, 95, `load=${d.load}`);
  assert.strictEqual(working.length, 4, `working=${working.length}`);
  assert.ok(working.every((s) => s.weight === 95 && s.reps === 10), 'working all 95×10');
  assert.ok(warmups.length >= 2 && warmups.every((s) => s.weight < 95), 'warmups ramp below working');
  console.log(`        → ${warmups.map((s) => `${s.weight}×${s.reps}`).join(', ')} | ${working.length}×(${d.load}×${d.reps})`);
});

// 10. SELECTION scorer on the real quad candidate pool (from live DB).
const quadPool = [
  { exerciseId: 'legpress', name: 'Leg Press', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads', 'Glutes'], daysSinceUsed: 68, historySessions: 5, equipmentAvailable: true },
  { exerciseId: 'bulgarian', name: 'Bulgarian Split Squat', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads', 'Glutes'], daysSinceUsed: 68, historySessions: 3, equipmentAvailable: true },
  { exerciseId: 'legext', name: 'Leg Extension', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads'], daysSinceUsed: 82, historySessions: 1, equipmentAvailable: true },
  { exerciseId: 'oneleg', name: 'One-Legged Leg Extension', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads'], daysSinceUsed: 76, historySessions: 2, equipmentAvailable: true },
  { exerciseId: 'backsq', name: 'Back Squat', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads', 'Glutes', 'Hamstrings', 'Core', 'Lower Back'], daysSinceUsed: 103, historySessions: 1, equipmentAvailable: true },
  { exerciseId: 'stair', name: 'Stair Climber', category: 'Cardio', primaryMuscles: ['Quads'], allMuscles: ['Quads', 'Glutes', 'Calves'], daysSinceUsed: 4, historySessions: 4, equipmentAvailable: true },
  { exerciseId: 'hack', name: 'Hack Squat Machine', category: 'Strength', primaryMuscles: ['Quads'], allMuscles: ['Quads', 'Glutes'], daysSinceUsed: 5, historySessions: 2, equipmentAvailable: true },
];
const ctx = () => ({ volumeGapByMuscle: new Map([['Quads', 0.6]]), alreadyChosenMuscleSets: [['Quads', 'Glutes']], noveltyTriggered: false, weights: DEFAULT_WEIGHTS, freshnessHalfLifeDays: 28, continuityTargetSessions: 5 });

check('selection — secondary Quads slot (Hack Squat is the primary, deduped) → Leg Press wins on continuity', () => {
  const slot = { role: 'secondary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_session', pinnedExerciseId: null, excludeExerciseIds: ['hack'] };
  const best = selectForSlot(quadPool, slot, ctx()).picked;
  assert.strictEqual(best.candidate.name, 'Leg Press', `winner=${best?.candidate.name}`);
  // Cardio filtered, dedup'd primary excluded
  assert.strictEqual(scoreCandidate(quadPool.find((c) => c.exerciseId === 'stair'), slot, ctx()).score, -Infinity, 'Stair Climber filtered (Cardio)');
  assert.strictEqual(scoreCandidate(quadPool.find((c) => c.exerciseId === 'hack'), slot, ctx()).score, -Infinity, 'Hack Squat excluded (dedup)');
  console.log(`        → ${best.candidate.name} (score ${best.score.toFixed(3)})`);
});

check('selection — demand-driven novelty: Leg Press used 3d ago + trigger → rotates AWAY from it', () => {
  const pool = quadPool.map((c) => (c.exerciseId === 'legpress' ? { ...c, daysSinceUsed: 3 } : c));
  const c2 = ctx(); c2.noveltyTriggered = true;
  const slot = { role: 'secondary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_session', pinnedExerciseId: null, excludeExerciseIds: ['hack'] };
  const best = selectForSlot(pool, slot, c2).picked;
  assert.notStrictEqual(best.candidate.name, 'Leg Press', 'should rotate away from the just-used Leg Press');
  console.log(`        → rotated to ${best.candidate.name} (staleness trigger)`);
});

check('selection — pinned primary slot keeps its exercise (specificity)', () => {
  const slot = { role: 'primary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_block', pinnedExerciseId: 'hack', excludeExerciseIds: [] };
  const { picked, pinOutcome } = selectForSlot(quadPool, slot, ctx());
  assert.strictEqual(picked.candidate.name, 'Hack Squat Machine', `pinned winner=${picked?.candidate.name}`);
  assert.strictEqual(pinOutcome, undefined, 'a cleanly-honored pin reports no outcome');
});

// ── Pin never dropped silently (Notion todo 3c6f6cc9 — a pin encodes an injury constraint, so a
//    substitution the user can't see is worse than a hard failure). ──────────────────────────────

check('selection — pin whose equipment is missing at the location is KEPT, with a warning', () => {
  const pool = quadPool.map((c) => (c.exerciseId === 'hack' ? { ...c, equipmentAvailable: false, missingEquipment: ['Hack Squat Machine'] } : c));
  const slot = { role: 'primary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'never', pinnedExerciseId: 'hack', excludeExerciseIds: [] };
  const { picked, pinOutcome } = selectForSlot(pool, slot, ctx());
  assert.strictEqual(picked.candidate.name, 'Hack Squat Machine', `pin should still win, got ${picked?.candidate.name}`);
  assert.strictEqual(pinOutcome.honored, true, 'equipment is an advisory blocker → pin honored');
  assert.strictEqual(pinOutcome.reason, 'equipment');
  assert.deepStrictEqual(pinOutcome.detail, ['Hack Squat Machine'], 'names the missing equipment');
  console.log(`        → kept ${picked.candidate.name}; missing: ${pinOutcome.detail.join(', ')}`);
});

check('selection — contraindicated pin is substituted, and SAYS SO', () => {
  const slot = { role: 'primary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'never', pinnedExerciseId: 'backsq', excludeExerciseIds: [], contraindicatedMuscles: ['Lower Back'] };
  const { picked, pinOutcome } = selectForSlot(quadPool, slot, ctx());
  assert.notStrictEqual(picked.candidate.exerciseId, 'backsq', 'a contraindicated pin must NOT be emitted');
  assert.strictEqual(pinOutcome.honored, false, 'safety blockers win over the pin');
  assert.strictEqual(pinOutcome.reason, 'contraindicated');
  assert.deepStrictEqual(pinOutcome.detail, ['Lower Back']);
  console.log(`        → substituted ${picked.candidate.name} (Back Squat recruits Lower Back)`);
});

check('selection — pin absent from the candidate pool reports not_in_pool (never a silent free-pick)', () => {
  const slot = { role: 'primary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'never', pinnedExerciseId: 'battleropes', excludeExerciseIds: [] };
  const { picked, pinOutcome } = selectForSlot(quadPool, slot, ctx());
  assert.ok(picked, 'the slot still fills');
  assert.strictEqual(pinOutcome.reason, 'not_in_pool');
  assert.strictEqual(pinOutcome.honored, false);
});

check('selection — a per_session slot ignores its pin entirely (no spurious warning)', () => {
  const slot = { role: 'primary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_session', pinnedExerciseId: 'battleropes', excludeExerciseIds: [] };
  const { pinOutcome } = selectForSlot(quadPool, slot, ctx());
  assert.strictEqual(pinOutcome, undefined, 'rotation_cadence per_session means the pin is not in play');
});

check('selection — archetype fit: a PRIMARY slot favors the compound (Back Squat) over isolation (Leg Ext)', () => {
  const slot = { role: 'primary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_session', pinnedExerciseId: null, excludeExerciseIds: [] };
  const backsq = scoreCandidate(quadPool.find((c) => c.exerciseId === 'backsq'), slot, ctx()).score;
  const legext = scoreCandidate(quadPool.find((c) => c.exerciseId === 'legext'), slot, ctx()).score;
  assert.ok(backsq > legext, `compound should outscore isolation in a primary slot (backsq ${backsq.toFixed(3)} vs legext ${legext.toFixed(3)})`);
  console.log(`        → primary slot: Back Squat ${backsq.toFixed(3)} > Leg Extension ${legext.toFixed(3)}`);
});

check('selection — archetype fit: an ISOLATION slot favors Leg Ext over the compound (Back Squat)', () => {
  const slot = { role: 'isolation', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_session', pinnedExerciseId: null, excludeExerciseIds: [] };
  const legext = scoreCandidate(quadPool.find((c) => c.exerciseId === 'legext'), slot, ctx()).score;
  const backsq = scoreCandidate(quadPool.find((c) => c.exerciseId === 'backsq'), slot, ctx()).score;
  assert.ok(legext > backsq, `isolation should outscore compound in an isolation slot (legext ${legext.toFixed(3)} vs backsq ${backsq.toFixed(3)})`);
  console.log(`        → isolation slot: Leg Extension ${legext.toFixed(3)} > Back Squat ${backsq.toFixed(3)}`);
});

check('selection — archetype fit: a UNILATERAL slot favors Bulgarian Split Squat over Leg Press (despite more history)', () => {
  const slot = { role: 'unilateral', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_session', pinnedExerciseId: null, excludeExerciseIds: [] };
  const bulgarian = scoreCandidate(quadPool.find((c) => c.exerciseId === 'bulgarian'), slot, ctx()).score;
  const legpress = scoreCandidate(quadPool.find((c) => c.exerciseId === 'legpress'), slot, ctx()).score;
  assert.ok(bulgarian > legpress, `unilateral movement should win a unilateral slot (bulgarian ${bulgarian.toFixed(3)} vs legpress ${legpress.toFixed(3)})`);
  console.log(`        → unilateral slot: Bulgarian Split Squat ${bulgarian.toFixed(3)} > Leg Press ${legpress.toFixed(3)}`);
});

// ── Regressions found by the 10-archetype generation simulation (devtools/engine-sim) ─────────────────
// Each of these reproduced a plan the engine actually produced for a real archetype.

const carrySlot = (over = {}) => ({ role: 'carry', targetMuscle: 'Forearms', categoryFilter: 'Strength',
  rotationCadence: 'per_session', pinnedExerciseId: null, excludeExerciseIds: [], ...over });
const cand = (id, name, over = {}) => ({ exerciseId: id, name, category: 'Strength',
  primaryMuscles: ['Forearms'], allMuscles: ['Forearms', 'Traps'], daysSinceUsed: null, historySessions: 0,
  equipmentAvailable: true, isTimed: true, ...over });

check('selection — a carry slot rejects a dead hang AND a curl, and takes the actual carry', () => {
  const pool = [cand('hang', 'Bar Hang'), cand('curl', 'Reverse Dumbbell Curl'), cand('fw', "Farmer's Walk")];
  const picked = selectForSlot(pool, carrySlot(), ctx()).picked;
  assert.strictEqual(picked?.candidate.exerciseId, 'fw', `picked ${picked?.candidate.name}`);
  console.log(`        → ${picked.candidate.name} (hang and curl both hard-filtered as not_a_carry)`);
});

check('selection — a carry slot with no real carry in the pool picks NOTHING (caller warns)', () => {
  const picked = selectForSlot([cand('hang', 'Bar Hang'), cand('shrug', 'Dumbbell Shrug')], carrySlot(), ctx()).picked;
  assert.strictEqual(picked, null, 'a pool of non-carries must not fill a carry slot');
  console.log('        → slot left unfilled rather than filled wrongly');
});

check('selection — tied candidates resolve deterministically, not by pool order', () => {
  const pool = [cand('a', "Farmer's Walk"), cand('b', 'Sandbag Shoulder Carry'), cand('c', 'Sled Push')];
  const fwd = selectForSlot(pool, carrySlot(), ctx()).picked.candidate.exerciseId;
  const rev = selectForSlot([...pool].reverse(), carrySlot(), ctx()).picked.candidate.exerciseId;
  assert.strictEqual(fwd, rev, `pool order changed the pick (${fwd} vs ${rev})`);
  console.log(`        → same pick (${fwd}) whichever order the database returns the pool in`);
});

check('selection — duration fit: a 30-min aerobic slot prefers the modality trained for 20 min over one trained for 3', () => {
  const slot = { role: 'conditioning', targetMuscle: null, categoryFilter: 'Cardio', rotationCadence: 'per_session',
    pinnedExerciseId: null, excludeExerciseIds: [], timeRange: [1800, 2700] };
  const c = (id, name, typ) => ({ exerciseId: id, name, category: 'Cardio', primaryMuscles: [], allMuscles: [],
    daysSinceUsed: 7, historySessions: 1, equipmentAvailable: true, isTimed: true, typicalTimeSeconds: typ });
  const run = scoreCandidate(c('run', 'Treadmill Run', 1200), slot, ctx()).score;
  const rope = scoreCandidate(c('rope', 'Jump Rope', 180), slot, ctx()).score;
  assert.ok(run > rope, `long-duration modality should win a long slot (run ${run.toFixed(3)} vs rope ${rope.toFixed(3)})`);
  const short = { ...slot, timeRange: [30, 45] };
  const runS = scoreCandidate(c('run', 'Treadmill Run', 1200), short, ctx()).score;
  const ropeS = scoreCandidate(c('rope', 'Jump Rope', 180), short, ctx()).score;
  assert.ok(ropeS > runS, `short-interval modality should win a short slot (rope ${ropeS.toFixed(3)} vs run ${runS.toFixed(3)})`);
  console.log(`        → 30min: run ${run.toFixed(3)} > rope ${rope.toFixed(3)};  45s: rope ${ropeS.toFixed(3)} > run ${runS.toFixed(3)}`);
});

check('progression — a heavy 5-rep history landing in a 12-20 slot re-anchors to 12 at a lighter load', () => {
  const state = { model: 'double_progression', repRange: [12, 20], targetRpe: 8, loadStepPct: 0.05, roundToStep: 5, setTarget: 3 };
  const d = nextDoubleProgression(state, { weight: 205, reps: 5, rpe: 8, timeSeconds: null });
  assert.strictEqual(d.reps, 12, `reps=${d.reps} — must move INTO the authored range, not climb to 6`);
  assert.ok(d.load < 205, `load=${d.load} — 12 reps at a 5-rep load is not performable`);
  console.log(`        → 12 reps @ ${d.load} (was 6 @ 205)`);
});

check('progression — a 5-rep history in a 3-5 slot is untouched by the re-anchor', () => {
  const state = { model: 'double_progression', repRange: [3, 5], targetRpe: 8, loadStepPct: 0.05, roundToStep: 5, setTarget: 3 };
  const d = nextDoubleProgression(state, { weight: 205, reps: 5, rpe: 8, timeSeconds: null });
  assert.strictEqual(d.reps, 3, `reps=${d.reps}`);
  assert.ok(d.load > 205, `hitting the top of the range should still step the load (got ${d.load})`);
  console.log(`        → 3 reps @ ${d.load} (normal double progression, unaffected)`);
});

check('progression — an authored time range is honoured for a STRENGTH hold, not just Cardio', () => {
  const state = { model: 'time_effort', repRange: [1, 1], targetRpe: null, loadStepPct: 0, roundToStep: 5, setTarget: 3, timeRange: [40, 60] };
  const d = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 0 });
  assert.strictEqual(d.timeSeconds, 40, `cold start must prescribe the authored floor, got ${d.timeSeconds}`);
  console.log(`        → ${d.timeSeconds}s prescribed on a cold start (was null / self-report)`);
});

// LAYOFF REGRESSION — a stale top set must never be progressed off. Grounded in the live case that
// filed this: Machine Chest Press 130x7 @RPE8 logged 2026-06-17, generated again 2026-08-26 (71 days),
// which produced 3x4 @135 — heavier than it had ever been trained.
check('layoff — 130x7 @RPE8 last done 71 days ago regresses instead of stepping to 135', () => {
  const state = { model: 'double_progression', repRange: [4, 6], targetRpe: 8, loadStepPct: 0.04, roundToStep: 5, setTarget: 3 };
  const stale = { weight: 130, reps: 7, rpe: 8, timeSeconds: null, daysSince: 71 };
  const d = nextDoubleProgression(state, stale, { plateau: false });
  assert.ok(d.load < 130, `load=${d.load} — a 71-day layoff must come back lighter, not at 135`);
  assert.strictEqual(d.load, 100, `load=${d.load}`);
  assert.strictEqual(d.reps, 6, `reps=${d.reps} — hold the rep target, don't reset the cycle`);
  console.log(`        → ${d.reps} reps @ ${d.load} (was 4 @ 135)`);
});

check('layoff — the plateau override cannot re-add load through a layoff', () => {
  const state = { model: 'double_progression', repRange: [4, 6], targetRpe: 8, loadStepPct: 0.04, roundToStep: 5, setTarget: 3 };
  const stale = { weight: 130, reps: 7, rpe: 8, timeSeconds: null, daysSince: 71 };
  const d = nextDoubleProgression(state, stale, { plateau: true });
  assert.strictEqual(d.load, 100, `load=${d.load} — a layoff reliably trips plateau detection; it must not win`);
});

check('layoff — inside the grace window nothing changes (recent history progresses as before)', () => {
  const state = { model: 'double_progression', repRange: [4, 6], targetRpe: 8, loadStepPct: 0.04, roundToStep: 5, setTarget: 3 };
  const fresh = { weight: 130, reps: 7, rpe: 8, timeSeconds: null, daysSince: LAYOFF_GRACE_DAYS };
  const d = nextDoubleProgression(state, fresh, { plateau: false });
  assert.strictEqual(d.load, 135, `load=${d.load} — 21 days out is still fresh, expect the normal load step`);
  assert.strictEqual(d.reps, 4, `reps=${d.reps}`);
});

check('layoff — an unknown date behaves exactly as before (daysSince null)', () => {
  const state = { model: 'double_progression', repRange: [4, 6], targetRpe: 8, loadStepPct: 0.04, roundToStep: 5, setTarget: 3 };
  const d = nextDoubleProgression(state, { weight: 130, reps: 7, rpe: 8, timeSeconds: null, daysSince: null }, { plateau: false });
  assert.strictEqual(d.load, 135, `load=${d.load}`);
});

check('layoff — regression is floored at LAYOFF_MAX_DECAY, however long the gap', () => {
  assert.strictEqual(layoffRetention(LAYOFF_GRACE_DAYS), 1, 'grace boundary must not regress');
  assert.ok(layoffRetention(400) === 1 - LAYOFF_MAX_DECAY, `retention=${layoffRetention(400)}`);
  const state = { model: 'double_progression', repRange: [4, 6], targetRpe: 8, loadStepPct: 0.04, roundToStep: 5, setTarget: 3 };
  const d = nextDoubleProgression(state, { weight: 130, reps: 5, rpe: 8, timeSeconds: null, daysSince: 400 }, { plateau: false });
  assert.strictEqual(d.load, 90, `load=${d.load} — 130 x 0.70 = 91 → 90 at a 5 lb step`);
});

check('layoff — a below-range history re-anchors to the floor at the DECAYED e1RM', () => {
  const state = { model: 'double_progression', repRange: [12, 20], targetRpe: 8, loadStepPct: 0.05, roundToStep: 5, setTarget: 3 };
  const fresh = nextDoubleProgression(state, { weight: 205, reps: 5, rpe: 8, timeSeconds: null, daysSince: 7 });
  const stale = nextDoubleProgression(state, { weight: 205, reps: 5, rpe: 8, timeSeconds: null, daysSince: 71 });
  assert.strictEqual(stale.reps, 12, `reps=${stale.reps} — still moves into the authored range`);
  assert.ok(stale.load < fresh.load, `stale ${stale.load} must be lighter than fresh ${fresh.load}`);
  console.log(`        → 12 reps @ ${stale.load} after a layoff (vs ${fresh.load} fresh)`);
});

check('layoff — linear progression regresses instead of taking its step', () => {
  const state = { model: 'linear', repRange: [5, 5], targetRpe: null, loadStepPct: 0.05, roundToStep: 5, setTarget: 3 };
  const d = nextLinear(state, { weight: 200, reps: 5, rpe: null, timeSeconds: null, daysSince: 60 }, true);
  assert.ok(d.load < 200, `load=${d.load} — met-target-last-time was met BEFORE the gap`);
});

check('layoff — a stale timed hold comes back shorter, not longer', () => {
  const state = { model: 'time_effort', repRange: [1, 1], targetRpe: null, loadStepPct: 0, roundToStep: 5, setTarget: 3, timeRange: null };
  const d = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 120, daysSince: 71 });
  assert.ok(d.timeSeconds < 120, `timeSeconds=${d.timeSeconds}`);
  console.log(`        → ${d.timeSeconds}s (was 120s, 71 days ago)`);
});

check('layoff — a stale CARDIO effort never drops below its authored floor', () => {
  const state = { model: 'time_effort', repRange: [1, 1], targetRpe: null, loadStepPct: 0, roundToStep: 5, setTarget: 3, timeRange: [600, 900] };
  const d = nextTimeEffort(state, { weight: 0, reps: 0, rpe: null, timeSeconds: 620, daysSince: 200 });
  assert.strictEqual(d.timeSeconds, 600, `timeSeconds=${d.timeSeconds} — clamp to the prescribed floor`);
});

console.log(`\n${pass} checks passed.`);
