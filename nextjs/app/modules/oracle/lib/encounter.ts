// Shared by server and client code — keep this file free of Node-only imports.

// ENCOUNTER MATH — fifth-edition (2014) encounter building: each character's level sets four XP
// thresholds; the creatures' XP is summed, scaled by how many there are (and by party size), and
// the adjusted total is read against the party's thresholds.

export type Difficulty = "trivial" | "easy" | "medium" | "hard" | "deadly";

export const XP_BY_CR: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
  "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000,
  "28": 120000, "29": 135000, "30": 155000,
};
export const CR_KEYS = Object.keys(XP_BY_CR);

// Per character level: easy, medium, hard, deadly.
const THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
};

export interface PartyThresholds {
  easy: number;
  medium: number;
  hard: number;
  deadly: number;
}

export function partyThresholds(levels: number[]): PartyThresholds {
  const total = [0, 0, 0, 0];
  for (const level of levels) {
    const row = THRESHOLDS[Math.min(20, Math.max(1, Math.round(level)))];
    row.forEach((value, index) => (total[index] += value));
  }
  return { easy: total[0], medium: total[1], hard: total[2], deadly: total[3] };
}

// Normalize "CR 1/2", "0.5", " 3 " to a key of XP_BY_CR, or null.
export function normalizeCr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim().replace(/^cr\s*/i, "");
  if (text === "0.125") return "1/8";
  if (text === "0.25") return "1/4";
  if (text === "0.5") return "1/2";
  return text in XP_BY_CR ? text : null;
}

export function xpForCr(cr: string | null | undefined): number {
  const key = normalizeCr(cr);
  return key ? XP_BY_CR[key] : 0;
}

// The multiplier steps, by creature count. A party of fewer than three uses the next step up,
// one of six or more the next step down.
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
function multiplierIndex(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count <= 6) return 3;
  if (count <= 10) return 4;
  if (count <= 14) return 5;
  return 6;
}

export function encounterMultiplier(creatureCount: number, partySize: number): number {
  if (creatureCount === 0) return 1;
  let index = multiplierIndex(creatureCount);
  if (partySize < 3) index += 1;
  else if (partySize >= 6) index -= 1;
  return MULTIPLIERS[Math.min(MULTIPLIERS.length - 1, Math.max(0, index))];
}

export interface EncounterLine {
  cr: string;
  count: number;
}

export interface EncounterSummary {
  creatureCount: number;
  rawXp: number;
  multiplier: number;
  adjustedXp: number;
  difficulty: Difficulty;
  thresholds: PartyThresholds;
  xpEach: number; // the award split across the party
  // Where the adjusted total sits on a 0–1 gauge whose stops are the four thresholds.
  gauge: number;
}

export function summarizeEncounter(lines: EncounterLine[], levels: number[]): EncounterSummary {
  const thresholds = partyThresholds(levels);
  const creatureCount = lines.reduce((sum, line) => sum + line.count, 0);
  const rawXp = lines.reduce((sum, line) => sum + xpForCr(line.cr) * line.count, 0);
  const multiplier = encounterMultiplier(creatureCount, levels.length);
  const adjustedXp = Math.round(rawXp * multiplier);
  let difficulty: Difficulty = "trivial";
  if (levels.length > 0 && adjustedXp > 0) {
    if (adjustedXp >= thresholds.deadly) difficulty = "deadly";
    else if (adjustedXp >= thresholds.hard) difficulty = "hard";
    else if (adjustedXp >= thresholds.medium) difficulty = "medium";
    else if (adjustedXp >= thresholds.easy) difficulty = "easy";
  }
  const stops = [0, thresholds.easy, thresholds.medium, thresholds.hard, thresholds.deadly];
  let gauge = 0;
  if (thresholds.deadly > 0) {
    // Each threshold band takes a quarter of the gauge; past deadly it fills toward the end.
    for (let index = 1; index < stops.length; index += 1) {
      if (adjustedXp <= stops[index]) {
        gauge = (index - 1) / 4 + ((adjustedXp - stops[index - 1]) / Math.max(1, stops[index] - stops[index - 1])) / 4;
        break;
      }
      gauge = 1;
    }
    if (adjustedXp > thresholds.deadly) gauge = Math.min(1, 1 - 0.0001);
  }
  return { creatureCount, rawXp, multiplier, adjustedXp, difficulty, thresholds, xpEach: levels.length ? Math.floor(rawXp / levels.length) : 0, gauge };
}
