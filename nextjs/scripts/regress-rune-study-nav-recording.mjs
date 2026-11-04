#!/usr/bin/env node
// Regression check: PREV and NEXT stay usable while a Rune study session's mic is recording, and moving card discards the recording
// Usage: GRIMOIRE_API_KEY=grm_xxx [CHROMIUM_PATH=/usr/bin/chromium] node scripts/regress-rune-study-nav-recording.mjs
// NOTE: Runs only as the test account agent-test@grimoire.local, and deletes only the deck it creates
// NOTE: Uses Chromium's fake microphone, and answers speech-to-text, text-to-speech and evaluation requests itself
import { chromium } from 'playwright';

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

// Build a WAV data URL of silence, for the question audio
function silentWavDataUrl(seconds) {
  const sampleRate = 8000;
  const samples = Math.round(sampleRate * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

// Refuse to run as any account but the test account
const me = await api("GET", "/api/users/me");
if (me.email !== "agent-test@grimoire.local") {
  console.error(`Key belongs to '${me.email}', not the test account`);
  process.exit(2);
}

const deck = await api("POST", "/modules/rune/api/decks", { name: `regress nav recording ${Date.now()}` });
let browser = null;
try {
  for (let i = 1; i <= 4; i++) await api("POST", `/modules/rune/api/decks/${deck.id}/cards`, { front: `Question ${i}`, back: `Answer ${i}` });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ extraHTTPHeaders: { "X-API-Key": KEY }, permissions: ["microphone"] });
  const page = await context.newPage();

  // Answer speech-to-text only once released, so a transcription can be held in flight
  const sttRequests = [];
  let releaseStt = () => {};
  let sttGate = Promise.resolve();
  await page.route("**/modules/rune/api/stt", async (route) => {
    sttRequests.push(route.request());
    await sttGate;
    await route.fulfill({ json: { transcript: "Spoken answer" } }).catch(() => { /* request was aborted */ });
  });
  const abortedStt = [];
  page.on("requestfailed", (request) => { if (request.url().endsWith("/modules/rune/api/stt")) abortedStt.push(request); });

  // Answer question audio with a short silence, and record graded answers and sent ratings
  const question = silentWavDataUrl(0.3);
  await page.route("**/modules/rune/api/tts", (route) => route.fulfill({ json: { audioData: question } }));
  const graded = [];
  await page.route("**/modules/rune/api/evaluate", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.userAnswer) graded.push(body.userAnswer);
    await route.fulfill({ json: body.userAnswer ? { correct: true, suggestedRating: 3, explanation: "" } : {} });
  });
  const reviews = [];
  page.on("request", (request) => { if (request.url().includes("/study/review")) reviews.push(request); });

  const cardId = () => new URL(page.url()).searchParams.get("card");
  const recordButton = () => page.locator(".rune-study-answer button").first();
  const prevButton = () => page.locator("button:has-text('PREV')");
  const nextButton = () => page.locator("button:has-text('NEXT'), button:has-text('FINISH')").first();
  const waitForRecordLabel = (label) => page.waitForFunction(
    (text) => document.querySelector(".rune-study-answer button")?.textContent?.includes(text),
    label,
    { timeout: 15000 },
  );

  // Start a session without hands-free
  await page.goto(`${BASE}/modules/rune/ui/decks/${deck.id}`, { waitUntil: "networkidle" });
  await page.click("text=Start Study Session");
  await page.waitForSelector(".flashcard-container");
  await page.waitForTimeout(800);

  // Record, then press NEXT while the mic is open
  const firstCard = cardId();
  await recordButton().click();
  await waitForRecordLabel("Stop");
  check("NEXT is enabled while recording", await nextButton().isEnabled());
  await nextButton().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
  check("NEXT moves to another card while recording", cardId() !== firstCard, `${firstCard} -> ${cardId()}`);
  check("recording stops when the card changes", (await recordButton().textContent()).includes("Record"));

  // Record, then press PREV while the mic is open
  const secondCard = cardId();
  await recordButton().click();
  await waitForRecordLabel("Stop");
  check("PREV is enabled while recording", await prevButton().isEnabled());
  await prevButton().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
  check("PREV moves back while recording", cardId() !== secondCard && cardId() === firstCard, `${secondCard} -> ${cardId()}`);
  check("recording stops on PREV", (await recordButton().textContent()).includes("Record"));
  check("discarded recordings are never transcribed", sttRequests.length === 0, `${sttRequests.length} requests`);

  // Hold a transcription in flight, then press NEXT
  sttGate = new Promise((resolve) => { releaseStt = resolve; });
  const thirdCard = cardId();
  await recordButton().click();
  await waitForRecordLabel("Stop");
  await page.waitForTimeout(1500);
  await recordButton().click(); // Stop, which starts the transcription
  await page.waitForFunction(() => document.querySelector(".rune-study-answer button")?.textContent?.includes("Transcribing"), null, { timeout: 15000 });
  check("NEXT is enabled while transcribing", await nextButton().isEnabled());
  await nextButton().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  releaseStt();
  await page.waitForTimeout(1500);
  check("NEXT moves to another card while transcribing", cardId() !== thirdCard);
  check("transcription request is canceled", sttRequests.length > 0 && abortedStt.length === sttRequests.length, `${abortedStt.length} of ${sttRequests.length} canceled`);
  check("late transcript does not land on the new card", (await page.inputValue(".rune-study-answer-field")) === "");
  check("discarded answer is never graded", graded.length === 0, graded.join(", "));
  check("no rating is sent for the cards left", reviews.length === 0, `${reviews.length} reviews`);

  // Record and stop on one card, and check its transcript still fills the answer
  await recordButton().click();
  await waitForRecordLabel("Stop");
  await page.waitForTimeout(1500);
  await recordButton().click();
  await page.waitForFunction(() => document.querySelector(".rune-study-answer-field")?.value === "Spoken answer", null, { timeout: 15000 }).catch(() => {});
  check("recording stopped on its card fills the answer", (await page.inputValue(".rune-study-answer-field")) === "Spoken answer");
  graded.length = 0; // Keep only hands-free grading for the check below

  // Start a hands-free session, then press NEXT once it is listening
  await page.goto(`${BASE}/modules/rune/ui/decks/${deck.id}`, { waitUntil: "networkidle" });
  await page.evaluate(() => Object.keys(sessionStorage).forEach((k) => k.startsWith("rune-study-session:") && sessionStorage.removeItem(k)));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("label:has-text('Hands-free mode') input").check();
  await page.click("text=Start Study Session");
  await page.waitForSelector(".flashcard-container");
  await waitForRecordLabel("Stop");
  const handsFreeCard = cardId();
  await nextButton().click({ timeout: 3000 }).catch(() => {});
  let isListeningAgain = true;
  await page.waitForTimeout(500);
  await waitForRecordLabel("Stop").catch(() => { isListeningAgain = false; });
  check("hands-free NEXT moves to another card while listening", cardId() !== handsFreeCard);
  check("hands-free listens again on the new card", isListeningAgain);
  check("hands-free stays on", await page.locator(".rune-study-handsfree input").isChecked());
  check("hands-free discarded answer is never graded", graded.length === 0, graded.join(", "));
} catch (error) {
  console.log(`FAIL ${error.message}`);
  failures++;
} finally {
  await browser?.close();
  await api("DELETE", `/modules/rune/api/decks/${deck.id}`);
}

process.exit(failures ? 1 : 0);
