import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import { BagelGame, BagelGameHistoryItem, BagelGuess, BagelStats, GameStatus } from "../types/bagel";
import {
  clueFromCounts,
  generateSecret,
  maxGuessesFor,
  scoreGuess,
  validateGuess,
} from "./gameLogic";

// The Bagel module's tables (bagel_games, bagel_guesses) live in the MAIN
// database alongside `users`, so we reuse the shared singleton main pool rather
// than standing up a separate connection. Same precedent as Quest's origins.

// Row shape for bagel_games as stored in the DB (secret always present here).
interface GameRow {
  id: string;
  user_id: string;
  num_digits: number;
  secret: string;
  max_guesses: number;
  status: GameStatus;
  num_guesses: number;
  ts_created: Date;
}

// Loads a game's guesses ordered by sequence, rebuilding clue text from counts.
async function loadGuesses(
  pool: sql.ConnectionPool,
  gameId: string
): Promise<BagelGuess[]> {
  const result = await pool
    .request()
    .input("gameId", sql.UniqueIdentifier, gameId)
    .query<{ seq: number; guess: string; fermi: number; pico: number }>(
      `SELECT seq, guess, fermi, pico
       FROM dbo.bagel_guesses
       WHERE game_id = @gameId
       ORDER BY seq`
    );

  return result.recordset.map((r) => ({
    seq: r.seq,
    guess: r.guess,
    fermi: r.fermi,
    pico: r.pico,
    clue: clueFromCounts(r.fermi, r.pico),
  }));
}

// Projects an internal game row + its guesses into the client-safe BagelGame.
// The secret is revealed only once the game is finished (won/lost).
function toClientGame(row: GameRow, guesses: BagelGuess[]): BagelGame {
  return {
    id: row.id,
    num_digits: row.num_digits,
    max_guesses: row.max_guesses,
    status: row.status,
    num_guesses: row.num_guesses,
    guesses,
    secret: row.status === "active" ? null : row.secret,
    ts_created: row.ts_created.toISOString(),
  };
}

// Fetches a single game owned by the user, including its guess history.
// Throws when no such game exists for this user, so the API can 404.
async function getGameRow(
  pool: sql.ConnectionPool,
  userId: string,
  gameId: string
): Promise<GameRow> {
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, gameId)
    .input("userId", sql.UniqueIdentifier, userId)
    .query<GameRow>(
      `SELECT id, user_id, num_digits, secret, max_guesses, status, num_guesses, ts_created
       FROM dbo.bagel_games
       WHERE id = @id AND user_id = @userId`
    );

  if (result.recordset.length === 0) {
    throw new Error(`No bagel game found for id: '${gameId}'`);
  }
  return result.recordset[0];
}

// Starts a new game with a freshly generated secret and returns the client view.
// If the user already has an active game, that game is returned unchanged instead
// of starting a second one — navigating away and clicking "Start Game" again should
// resume the in-progress game, not silently orphan it.
export async function createGame(
  userId: string,
  numDigits: number
): Promise<BagelGame> {
  const pool = await getMainConnection();

  const existing = await getCurrentGame(userId);
  if (existing) return existing;

  const secret = generateSecret(numDigits);
  const maxGuesses = maxGuessesFor(numDigits);

  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("numDigits", sql.Int, numDigits)
    .input("secret", sql.VarChar(10), secret)
    .input("maxGuesses", sql.Int, maxGuesses)
    .query<GameRow>(
      `INSERT INTO dbo.bagel_games (user_id, num_digits, secret, max_guesses)
       OUTPUT inserted.id, inserted.user_id, inserted.num_digits, inserted.secret,
              inserted.max_guesses, inserted.status, inserted.num_guesses, inserted.ts_created
       VALUES (@userId, @numDigits, @secret, @maxGuesses)`
    );

  return toClientGame(result.recordset[0], []);
}

// Reads a single game (client-safe view). Throws if not found → 404.
export async function getGame(
  userId: string,
  gameId: string
): Promise<BagelGame> {
  const pool = await getMainConnection();
  const row = await getGameRow(pool, userId, gameId);
  const guesses = await loadGuesses(pool, gameId);
  return toClientGame(row, guesses);
}

// Fetches the user's most recently started still-active game, if any. Returns
// null (not a thrown error) when there is none — "no active game" is a normal
// steady state, not a missing-record error. This is the server-authoritative
// answer to "what should I resume when I open the module" — unlike a
// client-side pointer (e.g. localStorage), it survives a cleared cache, a new
// device, or a closed tab.
//
// Games left "active" from before the abandon feature existed (or any other
// orphan — a crashed tab, a dropped request) are indistinguishable from a
// genuinely paused game by status alone. If the user has since finished a
// newer game, that's proof the active row was abandoned, not paused — so it's
// auto-closed here (same effect as clicking Abandon) and the search keeps
// going, rather than resurfacing a stale game as "current" forever.
export async function getCurrentGame(userId: string): Promise<BagelGame | null> {
  const pool = await getMainConnection();

  for (;;) {
    const result = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query<GameRow>(
        `SELECT TOP 1 id, user_id, num_digits, secret, max_guesses, status, num_guesses, ts_created
         FROM dbo.bagel_games
         WHERE user_id = @userId AND status = 'active'
         ORDER BY ts_created DESC`
      );

    if (result.recordset.length === 0) {
      console.warn(`No active bagel game found for user id: '${userId}'`);
      return null;
    }

    const row = result.recordset[0];

    const newerFinished = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("since", sql.DateTime2, row.ts_created)
      .query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM dbo.bagel_games
         WHERE user_id = @userId AND status <> 'active' AND ts_updated > @since`
      );

    if (newerFinished.recordset[0].cnt > 0) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, row.id)
        .query(`UPDATE dbo.bagel_games SET status = 'skipped', ts_updated = GETDATE() WHERE id = @id`);
      continue;
    }

    const guesses = await loadGuesses(pool, row.id);
    return toClientGame(row, guesses);
  }
}

// Either of the two ways a player can end an active game early without a final guess:
// "skipped" doesn't count toward games played/won and doesn't touch the win streak (as
// if the game never happened); "lost" counts as a real loss, same as running out of guesses.
export type EndReason = "skipped" | "lost";

// Ends an active game early (revealing the secret) as either a skip or a give-up — see
// EndReason above. Now that the current game is resolved server-side (see getCurrentGame),
// this is what actually takes a game out of "active" — without it, the ended game would
// just resurface as current again the next time the module loads. No-ops if the game is
// already finished. Throws if the game does not exist → 404.
export async function endGame(
  userId: string,
  gameId: string,
  reason: EndReason
): Promise<BagelGame> {
  const pool = await getMainConnection();
  const row = await getGameRow(pool, userId, gameId);

  if (row.status === "active") {
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, gameId)
      .input("status", sql.VarChar(10), reason)
      .query(`UPDATE dbo.bagel_games SET status = @status, ts_updated = GETDATE() WHERE id = @id`);
  }

  return getGame(userId, gameId);
}

// Result of submitting a guess: either a validation rejection, or the updated
// game plus the score for the guess just made.
export type SubmitResult =
  | { ok: false; error: string }
  | { ok: true; game: BagelGame; lastClue: string; won: boolean };

// Authoritatively scores a guess server-side, persists it, advances the game
// status (won when solved, lost when the guess budget is exhausted), and
// returns the refreshed game view. Throws if the game does not exist → 404.
export async function submitGuess(
  userId: string,
  gameId: string,
  rawGuess: string
): Promise<SubmitResult> {
  const guess = rawGuess.trim();
  const pool = await getMainConnection();
  const row = await getGameRow(pool, userId, gameId);

  // GAME ALREADY OVER — reject further guesses.
  if (row.status !== "active") {
    return { ok: false, error: "This game is already finished." };
  }

  // INPUT VALIDATION — length / digits / uniqueness.
  const valid = validateGuess(guess, row.num_digits);
  if (!valid.ok) {
    return { ok: false, error: valid.error };
  }

  // SCORE + DERIVE NEXT STATE.
  const score = scoreGuess(guess, row.secret);
  const nextSeq = row.num_guesses + 1;
  const outOfGuesses = nextSeq >= row.max_guesses;
  const nextStatus: GameStatus = score.won
    ? "won"
    : outOfGuesses
    ? "lost"
    : "active";

  // PERSIST — insert the guess and update the game in one transaction so the
  // guess count and status never drift apart.
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input("gameId", sql.UniqueIdentifier, gameId)
      .input("seq", sql.Int, nextSeq)
      .input("guess", sql.VarChar(10), guess)
      .input("fermi", sql.Int, score.fermi)
      .input("pico", sql.Int, score.pico)
      .query(
        `INSERT INTO dbo.bagel_guesses (game_id, seq, guess, fermi, pico)
         VALUES (@gameId, @seq, @guess, @fermi, @pico)`
      );

    await new sql.Request(tx)
      .input("id", sql.UniqueIdentifier, gameId)
      .input("status", sql.VarChar(10), nextStatus)
      .input("numGuesses", sql.Int, nextSeq)
      .query(
        `UPDATE dbo.bagel_games
         SET status = @status, num_guesses = @numGuesses, ts_updated = GETDATE()
         WHERE id = @id`
      );

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  // Re-read so the returned view reflects the committed state (incl. revealed
  // secret on a finished game).
  const game = await getGame(userId, gameId);
  return { ok: true, game, lastClue: score.clue, won: score.won };
}

// Computes aggregate play stats for a user, including the current win streak
// (consecutive wins counting back from the most recent finished game).
export async function getStats(userId: string): Promise<BagelStats> {
  const pool = await getMainConnection();

  // AGGREGATES — totals and best (fewest) guesses among wins. 'skipped' games are
  // excluded entirely (not played, not a loss, doesn't touch the streak below).
  const agg = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query<{ played: number; won: number; best: number | null }>(
      `SELECT
         SUM(CASE WHEN status IN ('won','lost') THEN 1 ELSE 0 END) AS played,
         SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won,
         MIN(CASE WHEN status = 'won' THEN num_guesses END) AS best
       FROM dbo.bagel_games
       WHERE user_id = @userId`
    );

  const played = agg.recordset[0]?.played ?? 0;
  const won = agg.recordset[0]?.won ?? 0;
  const best = agg.recordset[0]?.best ?? null;

  // CURRENT STREAK — walk finished games newest-first; stop at the first loss.
  const finished = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query<{ status: GameStatus }>(
      `SELECT status FROM dbo.bagel_games
       WHERE user_id = @userId AND status IN ('won','lost')
       ORDER BY ts_updated DESC`
    );

  let streak = 0;
  for (const g of finished.recordset) {
    if (g.status === "won") streak++;
    else break;
  }

  return {
    games_played: played,
    games_won: won,
    win_rate: played > 0 ? won / played : 0,
    best_guesses: best,
    current_streak: streak,
  };
}

// Fetches a page of the user's game history (all statuses), newest first, for the
// history table. Unlike getGame, this skips loading per-game guess history since the
// list view only shows the outcome.
export async function getGameHistory(
  userId: string,
  page?: number,
  pageSize?: number
): Promise<{ games: BagelGameHistoryItem[]; totalCount: number }> {
  const pool = await getMainConnection();

  const request = pool.request().input("userId", sql.UniqueIdentifier, userId);

  let paginationClause = "";
  if (page && pageSize) {
    const offset = (page - 1) * pageSize;
    // BigInt, not Int — the table's "All" page-size option sends
    // Number.MAX_SAFE_INTEGER, which overflows a 32-bit sql.Int.
    request.input("offset", sql.BigInt, offset).input("pageSize", sql.BigInt, pageSize);
    paginationClause = "OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY";
  }

  const result = await request.query<GameRow & { _total_count: number }>(
    `SELECT id, num_digits, secret, max_guesses, status, num_guesses, ts_created,
            COUNT(*) OVER() AS _total_count
     FROM dbo.bagel_games
     WHERE user_id = @userId
     ORDER BY ts_created DESC
     ${paginationClause}`
  );

  if (result.recordset.length === 0) {
    console.warn(`No bagel game history found for user id: '${userId}'`);
    return { games: [], totalCount: 0 };
  }

  const totalCount = result.recordset[0]._total_count;
  const games: BagelGameHistoryItem[] = result.recordset.map((row) => ({
    id: row.id,
    num_digits: row.num_digits,
    max_guesses: row.max_guesses,
    status: row.status,
    num_guesses: row.num_guesses,
    secret: row.status === "active" ? null : row.secret,
    ts_created: row.ts_created.toISOString(),
  }));

  return { games, totalCount };
}
