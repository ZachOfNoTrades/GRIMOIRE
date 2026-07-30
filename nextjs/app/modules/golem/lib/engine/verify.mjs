// Dev verification harness for the deterministic engine — NOT part of the app build (.mjs, not in tsconfig include).
// Run: node --experimental-strip-types app/modules/golem/lib/engine/verify.mjs
// Asserts the grounded cases from the live-data simulation (plan §0 / §-sim).
import assert from 'node:assert';
import { loadForRepsAtRpe, estimate1RM } from './oneRepMax.ts';
import { nextDoubleProgression, nextTimeEffort, decideLoad } from './progression.ts';
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
  const best = selectForSlot(quadPool, slot, ctx());
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
  const best = selectForSlot(pool, slot, c2);
  assert.notStrictEqual(best.candidate.name, 'Leg Press', 'should rotate away from the just-used Leg Press');
  console.log(`        → rotated to ${best.candidate.name} (staleness trigger)`);
});

check('selection — pinned primary slot keeps its exercise (specificity)', () => {
  const slot = { role: 'primary', targetMuscle: 'Quads', categoryFilter: 'Strength', rotationCadence: 'per_block', pinnedExerciseId: 'hack', excludeExerciseIds: [] };
  const best = selectForSlot(quadPool, slot, ctx());
  assert.strictEqual(best.candidate.name, 'Hack Squat Machine', `pinned winner=${best?.candidate.name}`);
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

console.log(`\n${pass} checks passed.`);
