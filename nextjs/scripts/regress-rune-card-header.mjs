#!/usr/bin/env node
// Regression check: an open Rune card shows its controls on their own row, with the card's front on the full width under them
// Usage: [BROWSER_PATH=/usr/bin/chromium] GRIMOIRE_API_KEY=grm_xxx node scripts/regress-rune-card-header.mjs [firefox|chromium] [screenshot folder]
// NOTE: Runs only as a test account, and deletes only the deck it creates
import { firefox, chromium } from 'playwright';

const BASE = process.env.GRIMOIRE_BASE || 'http://localhost:3000';
const KEY = process.env.GRIMOIRE_API_KEY;
if (!KEY) {
  console.error('Missing GRIMOIRE_API_KEY env var.');
  process.exit(2);
}
const engine = process.argv[2] === 'chromium' ? chromium : firefox;
const screenshotFolder = process.argv[3];

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

// Refuse to run as any account but a test account
const me = await api("GET", "/api/users/me");
if (!/^agent-test(-2)?@grimoire\.local$/.test(me.email)) {
  console.error(`Key belongs to '${me.email}', not a test account`);
  process.exit(2);
}

const FRONT = "Which three things decide where the front of a long card sits once it runs past a single line of text?";
const deck = await api("POST", "/modules/rune/api/decks", { name: `regress card header ${Date.now()}` });
let browser = null;
try {
  browser = await engine.launch({ executablePath: process.env.BROWSER_PATH }); // Use an installed browser when BROWSER_PATH names one
  await api("POST", `/modules/rune/api/decks/${deck.id}/cards`, { front: FRONT, back: "The back of the card" });

  for (const [name, viewport] of [["desktop", { width: 1388, height: 698 }], ["phone", { width: 360, height: 740 }]]) {
    const context = await browser.newContext({ extraHTTPHeaders: { "X-API-Key": KEY }, viewport });
    const page = await context.newPage();
    await page.goto(`${BASE}/modules/rune/ui/decks/${deck.id}`, { waitUntil: "networkidle" });
    await page.click(`text=${FRONT}`);
    const title = page.locator(".rune-card-detail-title");
    await title.waitFor();
    const titleBox = await title.boundingBox();
    const editBox = await page.locator("[aria-label='Edit card']").boundingBox();
    const headerBox = await title.locator("xpath=../..").boundingBox();
    check(`${name}: the front sits below the controls`, titleBox.y >= editBox.y + editBox.height, `front top ${titleBox.y}, controls bottom ${editBox.y + editBox.height}`);
    check(`${name}: the front takes the header's full width`, titleBox.width >= headerBox.width - 1, `front ${titleBox.width}, header ${headerBox.width}`);
    if (screenshotFolder) await page.screenshot({ path: `${screenshotFolder}/rune-card-header-${name}.png` });
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await api("DELETE", `/modules/rune/api/decks/${deck.id}`);
}

if (failures > 0) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log("All checks passed");
