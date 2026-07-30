"use client";

import { BagelGuess } from "../types/bagel";

// Renders a guess string as monospaced digit tiles.
function DigitTiles({ value }: { value: string }) {
  return (

    // TILE ROW
    <div className="flex gap-1.5">
      {value.split("").map((d, i) => (
        <span key={i} className="bagel-tile">{d}</span>
      ))}
    </div>
  );
}

// Renders a clue's Fermi/Pico/Bagels words as colored badges.
function ClueBadges({ clue }: { clue: string }) {
  if (clue === "Bagels") {
    return <span className="badge-gray">Bagels</span>;
  }
  return (

    // CLUE BADGE ROW
    <div className="flex flex-wrap gap-1.5">
      {clue.split(" ").map((word, i) => (
        <span key={i} className={word === "Fermi" ? "badge-green" : "badge-yellow"}>{word}</span>
      ))}
    </div>
  );
}

// Ordered list of a game's scored guesses — sequence number, the guessed digits
// as tiles, and the Fermi/Pico/Bagels clue as badges. Shared by the live game
// (home page) and the history game-details modal so both read identically.
export default function GuessHistory({ guesses }: { guesses: BagelGuess[] }) {
  return (

    // GUESS LIST
    <div>
      {guesses.map((g) => (

        // GUESS ROW
        <div key={g.seq} className="bagel-guess-row">
          <span className="bagel-guess-seq">{g.seq}</span>
          <DigitTiles value={g.guess} />
          <ClueBadges clue={g.clue} />
        </div>
      ))}
    </div>
  );
}
