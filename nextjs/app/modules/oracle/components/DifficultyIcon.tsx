import { Feather, Flame, Skull, Swords } from "lucide-react";
import { chipDifficulty, type ChipDifficulty } from "../lib/encounter";
import type { ChipContent } from "../types/oracle";

const ICONS = { easy: Feather, medium: Swords, hard: Flame, impossible: Skull } as const;
const LABELS: Record<ChipDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", impossible: "Impossible" };
const ORDER: ChipDifficulty[] = ["easy", "medium", "hard", "impossible"];

// How hard the creatures in a banner item would be for this party: the hardest of its options.
export function chipContentDifficulty(content: ChipContent, levels: number[]): ChipDifficulty | null {
  if (content.type !== "text") return null;
  let hardest: ChipDifficulty | null = null;
  for (const option of content.options) {
    const rating = option.encounter ? chipDifficulty(option.encounter, levels) : null;
    if (rating && (hardest === null || ORDER.indexOf(rating) > ORDER.indexOf(hardest))) hardest = rating;
  }
  return hardest;
}

// One icon for four steps, easy to impossible (a skull). The tint comes from the step.
//
// The name is carried by role + aria-label rather than an SVG <title> child: React treats
// <title> as document metadata and hoists it into <head> unless it is written inside an
// <svg> element, and here it was a child of the icon COMPONENT, so React never saw the SVG
// context. The hoisted title then differed between the server and the client and broke
// hydration for the whole table.
export default function DifficultyIcon({ difficulty }: { difficulty: ChipDifficulty }) {
  const Icon = ICONS[difficulty];
  return <Icon className="orc-difficulty" data-difficulty={difficulty} role="img" aria-label={`${LABELS[difficulty]} for this party`} />;
}
