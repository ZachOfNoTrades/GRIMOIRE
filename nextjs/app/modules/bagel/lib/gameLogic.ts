import { randomInt } from "crypto";

// Pure Pico Fermi Bagel rules — no I/O, no DB. Kept isolated so the scoring
// can be unit-reasoned and reused by both the server (authoritative scoring)
// and, if ever needed, the client. The secret is a string of unique digits.

// Difficulty → number of secret digits. Classic Bagels is 3.
export const DIGIT_RANGE = { min: 3, max: 5 } as const;

// Guess budget scales with difficulty: more digits, more attempts.
export function maxGuessesFor(numDigits: number): number {
  return { 3: 10, 4: 12, 5: 15 }[numDigits] ?? 10;
}

// Generates a secret of `numDigits` UNIQUE digits (0-9), leading zero allowed.
// Uses crypto.randomInt for an unbiased shuffle so the secret isn't guessable
// from a weak PRNG. The secret never leaves the server while a game is active.
export function generateSecret(numDigits: number): string {
  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

  // FISHER-YATES SHUFFLE — unbiased, crypto-backed
  for (let i = digits.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }

  return digits.slice(0, numDigits).join("");
}

// A guess is valid when it is exactly `numDigits` characters, all decimal
// digits, and all unique. Uniqueness keeps Pico/Fermi scoring unambiguous
// (a repeated guess digit could otherwise count as Pico twice).
export function validateGuess(
  guess: string,
  numDigits: number
): { ok: true } | { ok: false; error: string } {
  if (guess.length !== numDigits) {
    return { ok: false, error: `Guess must be exactly ${numDigits} digits.` };
  }
  if (!/^\d+$/.test(guess)) {
    return { ok: false, error: "Guess must contain only digits 0-9." };
  }
  if (new Set(guess).size !== guess.length) {
    return { ok: false, error: "Digits must be unique — no repeats." };
  }
  return { ok: true };
}

// Builds the position-hiding clue text from Fermi/Pico counts. Words are
// sorted so their order can't leak which positions matched; no matches at all
// reads as "Bagels". Shared by live scoring and history replay (where only the
// stored counts are available, not the secret).
export function clueFromCounts(fermi: number, pico: number): string {
  const words = [
    ...Array(fermi).fill("Fermi"),
    ...Array(pico).fill("Pico"),
  ].sort();
  return words.length > 0 ? words.join(" ") : "Bagels";
}

export interface GuessScore {
  // Right digit in the right position.
  fermi: number;
  // Right digit in the wrong position.
  pico: number;
  // Sorted, position-hiding clue text shown to the player.
  clue: string;
  // True when the guess equals the secret (all positions are Fermi).
  won: boolean;
}

// Scores a guess against the secret. Assumes both have unique digits and equal
// length (callers validate first). Clue words are sorted so their order can't
// leak which positions matched.
export function scoreGuess(guess: string, secret: string): GuessScore {
  let fermi = 0;
  let pico = 0;

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) {
      fermi++;
    } else if (secret.includes(guess[i])) {
      pico++;
    }
  }

  return { fermi, pico, clue: clueFromCounts(fermi, pico), won: fermi === guess.length };
}
