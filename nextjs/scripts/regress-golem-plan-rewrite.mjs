#!/usr/bin/env node
// Regression check: saving logged sets while the session page holds an old plan, and saving a set with reps not entered yet
// Usage: GRIMOIRE_API_KEY=grm_xxx node scripts/regress-golem-plan-rewrite.mjs
// NOTE: Runs only as the test account agent-test@grimoire.local, and deletes only the session it creates
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.GRIMOIRE_BASE || 'http://localhost:3000';
const KEY = process.env.GRIMOIRE_API_KEY;
if (!KEY) {
  console.error('Missing GRIMOIRE_API_KEY env var.');
  process.exit(2);
}

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const client = new Client({ name: "regress-golem-plan-rewrite", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${KEY}` } } }));
const call = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);

const segmentsUrl = (sessionId) => `${BASE}/modules/golem/api/sessions/${sessionId}/segments`;
const getSegments = async (sessionId) => (await fetch(segmentsUrl(sessionId), { headers: { "X-API-Key": KEY } })).json();
const putSegments = (sessionId, segments) =>
  fetch(segmentsUrl(sessionId), { method: "PUT", headers: { "X-API-Key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(segments) });

// Build a logged segment from a planned exercise the way the session page does, ids taken from the target
const fromTarget = (sessionId, target, setValues) => ({
  id: target.id, session_id: sessionId, exercise_id: target.exercise_id, target_id: target.id, modifier_id: null,
  order_index: target.order_index, is_warmup: target.is_warmup, notes: null,
  sets: target.sets.map((targetSet) => ({
    id: targetSet.id, set_number: targetSet.set_number, is_warmup: targetSet.is_warmup,
    reps: 0, weight: 0, rpe: null, time_seconds: null, distance: null, notes: null, is_completed: false, ...setValues,
  })),
});

let sessionId = null;
try {
  // Refuse to run as any account but the test account
  const me = await (await fetch(`${BASE}/api/users/me`, { headers: { "X-API-Key": KEY } })).json();
  if (me.email !== "agent-test@grimoire.local") throw new Error(`Key belongs to '${me.email}', not the test account`);

  const exercises = (await call("golem_list_exercises", {})).filter((e) => !e.is_timed).slice(0, 2);
  if (exercises.length < 2) throw new Error("The test account needs at least two exercises that are not timed");
  const plan = exercises.map((e) => ({ exerciseId: e.id, sets: [{ reps: 5 }, { reps: 5 }] }));
  const created = await call("golem_create_session", { name: "regress plan rewrite", description: null });
  sessionId = created.id ?? created.sessionId ?? created.session?.id;

  await call("golem_set_session_plan", { sessionId, exercises: plan });
  const firstPlan = (await getSegments(sessionId)).targets;
  const [firstA, firstB] = [...firstPlan].sort((a, b) => a.order_index - b.order_index);

  // Log the first exercise against the plan the page loaded
  const loggedA = fromTarget(sessionId, firstA, { reps: 5, weight: 20, is_completed: true });
  let response = await putSegments(sessionId, [loggedA]);
  check("save against the loaded plan", response.ok, `HTTP ${response.status}`);

  // Rewrite the plan, then save the page's old state with a second exercise opened from the old plan
  await call("golem_set_session_plan", { sessionId, exercises: plan });
  const secondPlan = (await getSegments(sessionId)).targets;
  const loggedB = fromTarget(sessionId, firstB, { reps: 5, weight: 20, is_completed: true });
  response = await putSegments(sessionId, [loggedA, loggedB]);
  check("save after the plan was rewritten", response.ok, `HTTP ${response.status}`);
  const afterRewrite = await getSegments(sessionId);
  const secondPlanIds = new Set(secondPlan.map((t) => t.id));
  check("logged exercises relinked to the new plan", afterRewrite.exercises?.length === 2 && afterRewrite.exercises.every((s) => secondPlanIds.has(s.target_id)),
    `${afterRewrite.exercises?.filter((s) => secondPlanIds.has(s.target_id)).length ?? 0} of 2`);

  // Save a set with weight and RPE entered before its reps
  const partialSet = { ...loggedA, sets: [{ ...loggedA.sets[0] }, { ...loggedA.sets[1], reps: 0, weight: 20, rpe: 7, is_completed: false }] };
  response = await putSegments(sessionId, [partialSet, loggedB]);
  check("save a set with reps not entered yet", response.ok, `HTTP ${response.status}`);

  // Refuse negative reps
  const negativeSet = { ...loggedA, sets: [{ ...loggedA.sets[0], reps: -1 }] };
  response = await putSegments(sessionId, [negativeSet, loggedB]);
  check("refuse negative reps", response.status === 400, `HTTP ${response.status}`);
} finally {
  if (sessionId) await call("golem_delete_session", { sessionId });
  await client.close();
}

process.exit(failures ? 1 : 0);
