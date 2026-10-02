// Shared by server and client code — keep this file free of Node-only imports.
import type { StatBlock } from "../types/oracle";

// QUICK REFERENCE — fifth-edition (2014) table values the DM reaches for mid-session. Static on
// purpose: these answer instantly and never cost a generation.

export const DIFFICULTY_CLASSES: { task: string; dc: number }[] = [
  { task: "Very easy", dc: 5 },
  { task: "Easy", dc: 10 },
  { task: "Medium", dc: 15 },
  { task: "Hard", dc: 20 },
  { task: "Very hard", dc: 25 },
  { task: "Nearly impossible", dc: 30 },
];

export const IMPROVISED_DAMAGE: { levels: string; setback: string; dangerous: string; deadly: string }[] = [
  { levels: "1-4", setback: "1d10", dangerous: "2d10", deadly: "4d10" },
  { levels: "5-10", setback: "2d10", dangerous: "4d10", deadly: "10d10" },
  { levels: "11-16", setback: "4d10", dangerous: "10d10", deadly: "18d10" },
  { levels: "17-20", setback: "10d10", dangerous: "18d10", deadly: "24d10" },
];

export interface ChallengeRow {
  cr: string;
  ac: number;
  hpMin: number;
  hpMax: number;
  attack: number;
  damageMin: number;
  damageMax: number;
  saveDc: number;
}

export const CHALLENGE_ROWS: ChallengeRow[] = [
  { cr: "1/8", ac: 13, hpMin: 7, hpMax: 35, attack: 3, damageMin: 2, damageMax: 3, saveDc: 13 },
  { cr: "1/4", ac: 13, hpMin: 36, hpMax: 49, attack: 3, damageMin: 4, damageMax: 5, saveDc: 13 },
  { cr: "1/2", ac: 13, hpMin: 50, hpMax: 70, attack: 3, damageMin: 6, damageMax: 8, saveDc: 13 },
  { cr: "1", ac: 13, hpMin: 71, hpMax: 85, attack: 3, damageMin: 9, damageMax: 14, saveDc: 13 },
  { cr: "2", ac: 13, hpMin: 86, hpMax: 100, attack: 3, damageMin: 15, damageMax: 20, saveDc: 13 },
  { cr: "3", ac: 13, hpMin: 101, hpMax: 115, attack: 4, damageMin: 21, damageMax: 26, saveDc: 13 },
  { cr: "4", ac: 14, hpMin: 116, hpMax: 130, attack: 5, damageMin: 27, damageMax: 32, saveDc: 14 },
  { cr: "5", ac: 15, hpMin: 131, hpMax: 145, attack: 6, damageMin: 33, damageMax: 38, saveDc: 15 },
  { cr: "6", ac: 15, hpMin: 146, hpMax: 160, attack: 6, damageMin: 39, damageMax: 44, saveDc: 15 },
  { cr: "7", ac: 15, hpMin: 161, hpMax: 175, attack: 6, damageMin: 45, damageMax: 50, saveDc: 15 },
  { cr: "8", ac: 16, hpMin: 176, hpMax: 190, attack: 7, damageMin: 51, damageMax: 56, saveDc: 16 },
  { cr: "10", ac: 17, hpMin: 206, hpMax: 220, attack: 7, damageMin: 63, damageMax: 68, saveDc: 16 },
];

export function findChallengeRow(cr: string | null | undefined): ChallengeRow | null {
  if (!cr) return null;
  return CHALLENGE_ROWS.find((row) => row.cr === cr.trim()) ?? null;
}

// A usable stat block straight from a challenge row: the middle of each range, one attack that
// deals the round's damage. Meant as a starting point the DM adjusts.
export function statBlockFromChallenge(row: ChallengeRow): StatBlock {
  const hitPoints = Math.round((row.hpMin + row.hpMax) / 2);
  const damage = Math.round((row.damageMin + row.damageMax) / 2);
  return {
    ac: row.ac,
    hp: hitPoints,
    hp_max: hitPoints,
    speed: 30,
    cr: row.cr,
    abilities: { str: 12, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    attacks: [{ name: "Attack", bonus: row.attack, damage: `${damage} per round` }],
  };
}

export const CONDITIONS: { name: string; effect: string }[] = [
  { name: "Blinded", effect: "Cannot see and fails any check that needs sight. Attacks against it have advantage; its own attacks have disadvantage." },
  { name: "Charmed", effect: "Cannot attack the charmer or target them with harmful effects. The charmer has advantage on social checks with it." },
  { name: "Deafened", effect: "Cannot hear and fails any check that needs hearing." },
  { name: "Frightened", effect: "Disadvantage on checks and attacks while the source of fear is in sight. Cannot willingly move closer to it." },
  { name: "Grappled", effect: "Speed becomes 0. Ends if the grappler is incapacitated or the target is moved out of reach." },
  { name: "Incapacitated", effect: "Cannot take actions or reactions." },
  { name: "Invisible", effect: "Cannot be seen without magic or a special sense. Attacks against it have disadvantage; its own attacks have advantage." },
  { name: "Paralyzed", effect: "Incapacitated, cannot move or speak. Fails Strength and Dexterity saves. Attacks have advantage, and a hit from within 5 feet is a critical." },
  { name: "Petrified", effect: "Turned to stone: incapacitated, unaware, resistant to all damage, immune to poison and disease." },
  { name: "Poisoned", effect: "Disadvantage on attack rolls and ability checks." },
  { name: "Prone", effect: "Can only crawl. Disadvantage on attacks. Attacks from within 5 feet have advantage against it; from farther away, disadvantage." },
  { name: "Restrained", effect: "Speed becomes 0. Attacks against it have advantage; its own attacks and Dexterity saves have disadvantage." },
  { name: "Stunned", effect: "Incapacitated, cannot move, can speak only falteringly. Fails Strength and Dexterity saves. Attacks against it have advantage." },
  { name: "Unconscious", effect: "Incapacitated, drops what it holds, falls prone. Fails Strength and Dexterity saves. A hit from within 5 feet is a critical." },
  { name: "Exhaustion", effect: "Six levels: 1 disadvantage on checks, 2 speed halved, 3 disadvantage on attacks and saves, 4 hit point maximum halved, 5 speed 0, 6 death." },
];

// GENERATORS — plain random tables, no generation call. Each returns a fresh result per roll.
const FIRST_NAMES = ["Tobren", "Maera", "Aldric", "Sunniva", "Corwin", "Ysolde", "Harl", "Brenna", "Dunstan", "Elowen", "Garrick", "Thessaly", "Osric", "Wynne", "Jorund", "Petra", "Lucan", "Isaura", "Bram", "Odalys"];
const LAST_NAMES = ["Ashdown", "Holt", "Carrow", "Vane", "Thistlewood", "Marsh", "Blackbarrow", "Fenwick", "Stonehand", "Greaves", "Wren", "Harrow", "Underhill", "Coldwater", "Briar", "Locke"];
const QUIRKS = ["Counts coins twice, out loud", "Never finishes a sentence", "Whistles when nervous", "Calls everyone 'cousin'", "Collects teeth, cheerfully", "Refuses to stand in doorways", "Speaks to an absent brother", "Laughs at the wrong moments", "Always chewing bitterroot", "Keeps a tally of favors owed", "Flinches at bells", "Polishes one boot constantly"];
const TAVERNS = ["The Gilded Carp", "The Drowned Lantern", "The Sow and Scepter", "The Broken Wheel", "The Laughing Crow", "The Tin Kettle", "The Hollow Stag", "The Last Ember", "The Crooked Mile", "The Salt and Thistle"];
const WEATHER = ["Cold drizzle, low fog by dusk", "Clear and bitterly cold", "Warm wind from the south, restless", "Heavy rain, roads turn to mud", "Still air, a storm building", "First frost on the fields", "Hail in short, violent bursts", "Overcast, smoke hangs low", "Bright and windless", "Sleet, then sudden clearing"];
const RUMORS = ["The miller paid someone to leave his cellar alone", "A stranger has been buying up old keys", "The well water tasted of iron last week", "Lights move in the chapel after midnight", "The tax collector never reached the next town", "Wolves were seen walking upright near the ford", "Someone is digging in the old graveyard", "The smith's apprentice has a new, expensive knife", "A ship was seen far inland, on the river", "The reeve's daughter speaks a language nobody taught her"];
const LOOT_COINS = ["9 gp", "17 gp", "26 gp, 40 sp", "5 gp, a pouch of copper", "33 gp", "12 gp, 2 pp"];
const LOOT_ITEMS = ["potion of healing", "carved bone die", "silver locket", "fine whetstone", "vial of lamp oil", "bundle of letters", "brass spyglass", "signet ring", "jar of dried herbs", "map fragment on vellum", "pair of good gloves", "small jade figure"];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export const GENERATORS: { key: string; label: string; roll: () => string }[] = [
  { key: "name", label: "Name", roll: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}` },
  { key: "quirk", label: "Quirk", roll: () => pick(QUIRKS) },
  { key: "loot", label: "Loot", roll: () => `${pick(LOOT_COINS)}, ${pick(LOOT_ITEMS)}, ${pick(LOOT_ITEMS)}` },
  { key: "tavern", label: "Tavern", roll: () => pick(TAVERNS) },
  { key: "weather", label: "Weather", roll: () => pick(WEATHER) },
  { key: "rumor", label: "Rumor", roll: () => pick(RUMORS) },
];

// Roll dice written like "2d6+1". Returns the total and the individual dice.
export function rollDice(expression: string): { total: number; rolls: number[] } | null {
  const match = expression.trim().toLowerCase().match(/^(\d{0,2})d(\d{1,3})\s*([+-]\s*\d{1,3})?$/);
  if (!match) return null;
  const count = Math.max(1, Number(match[1] || "1"));
  const sides = Number(match[2]);
  if (sides < 2 || count > 40) return null;
  const modifier = match[3] ? Number(match[3].replace(/\s/g, "")) : 0;
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  return { total: rolls.reduce((sum, value) => sum + value, 0) + modifier, rolls };
}
