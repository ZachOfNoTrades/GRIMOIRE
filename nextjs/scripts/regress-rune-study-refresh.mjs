#!/usr/bin/env node
// Regression check: a Rune study session resumes after a browser refresh, on the same card, with its ratings and clock kept
// Usage: GRIMOIRE_API_KEY=grm_xxx node scripts/regress-rune-study-refresh.mjs [firefox|chromium] [deck|collection]
// NOTE: Runs only as the test account agent-test@grimoire.local, and deletes only the deck and collection it creates
import { firefox, chromium } from 'playwright';

const BASE = process.env.GRIMOIRE_BASE || 'http://localhost:3000';
const KEY = process.env.GRIMOIRE_API_KEY;
if (!KEY) {
  console.error('Missing GRIMOIRE_API_KEY env var.');
  process.exit(2);
}
const engine = process.argv[2] === 'chromium' ? chromium : firefox;
const isCollection = process.argv[3] === 'collection';

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const api = async (method, path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

// Refuse to run as any account but the test account
const me = await api("GET", "/api/users/me");
if (me.email !== "agent-test@grimoire.local") {
  console.error(`Key belongs to '${me.email}', not the test account`);
  process.exit(2);
}

const deck = await api("POST", "/modules/rune/api/decks", { name: `regress refresh ${Date.now()}` });
let collectionId = null;
let browser = null;
try {
  browser = await engine.launch();
  for (let i = 1; i <= 4; i++) await api("POST", `/modules/rune/api/decks/${deck.id}/cards`, { front: `Question ${i}`, back: `Answer ${i}` });
  if (isCollection) collectionId = (await api("POST", "/modules/rune/api/collections", { name: `regress refresh ${Date.now()}`, deckIds: [deck.id] })).id;

  const page = await (await browser.newContext({ extraHTTPHeaders: { "X-API-Key": KEY } })).newPage();
  const goodCount = () => page.$$eval(".flashcard-progress-segment-good", (segments) => segments.length);
  const rateGood = async () => {
    await page.click(".flashcard-container");
    await page.click("button:has-text('GOOD')");
  };

  // Rate one card, then refresh once its review is sent
  await page.goto(`${BASE}/modules/rune/ui/${collectionId ? `collections/${collectionId}` : `decks/${deck.id}`}`, { waitUntil: "networkidle" });
  await page.click("text=Start Study Session");
  await page.waitForSelector(".flashcard-container");
  const reviewSent = page.waitForResponse((r) => r.url().endsWith("/study/review") && r.request().method() === "POST", { timeout: 30000 });
  await rateGood();
  await reviewSent;
  await page.waitForTimeout(1000);
  const cardBefore = new URL(page.url()).searchParams.get("card");
  await page.reload({ waitUntil: "networkidle" });

  const isResumed = !!(await page.$(".flashcard-container"));
  check("study view is open after a refresh", isResumed);
  check("same card is shown after a refresh", new URL(page.url()).searchParams.get("card") === cardBefore);
  check("rating given before the refresh is kept", isResumed && (await goodCount()) === 1);
  if (!isResumed) throw new Error("Session was not resumed; skipping the rest");

  // Finish the session, then check it was recorded as one session and is not resumed again
  for (let i = 0; i < 6 && !(await page.$("text=Session Complete")); i++) {
    await rateGood();
    await page.waitForTimeout(800);
  }
  await page.waitForSelector("text=Session Complete", { timeout: 10000 });
  await page.waitForTimeout(1500);
  const sessions = await api("GET", `/modules/rune/api/decks/${deck.id}/study/sessions`);
  check("one session holds all four reviews", sessions.length === 1 && sessions[0].reviews === 4, JSON.stringify(sessions.map((s) => s.reviews)));
  check("session is completed", !!sessions[0]?.completed_at);
  await api("POST", `/modules/rune/api/decks/${deck.id}/cards`, { front: "Question 5", back: "Answer 5" }); // Give the next session a due card
  await page.reload({ waitUntil: "networkidle" });
  check("finished session is not resumed", !(await page.$(".flashcard-container")));

  // Start a new session and check its clock starts now, not at the finished session's start
  const startClickedAt = Date.now();
  await page.click("text=Start Study Session");
  await page.waitForSelector(".flashcard-container");
  await page.waitForTimeout(500);
  const savedStartedAt = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith("rune-study-session:"));
    return key ? JSON.parse(sessionStorage.getItem(key)).startedAt : null;
  });
  check("new session starts its own clock", savedStartedAt !== null && savedStartedAt >= startClickedAt - 5000, String(savedStartedAt && startClickedAt - savedStartedAt));
} catch (error) {
  console.log(`FAIL ${error.message}`);
  failures++;
} finally {
  await browser?.close();
  if (collectionId) await api("DELETE", `/modules/rune/api/collections/${collectionId}`);
  await api("DELETE", `/modules/rune/api/decks/${deck.id}`);
}

process.exit(failures ? 1 : 0);
