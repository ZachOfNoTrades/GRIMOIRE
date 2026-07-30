import crypto from 'crypto';
import sql from 'mssql';
import { getQuestConnection } from './db';
import { getCurrentDate } from './settingsFunctions';
import { Mantra, MANTRA_MAX_LENGTH } from '../types/mantra';

const MANTRA_COLUMNS = `id, user_id, text, ts_created`;
const MANTRA_OUTPUT_COLUMNS = `INSERTED.id, INSERTED.user_id, INSERTED.text, INSERTED.ts_created`;

export async function listMantras(userId: string): Promise<Mantra[]> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<Mantra>(
      `SELECT ${MANTRA_COLUMNS}
       FROM quest_mantras
       WHERE user_id = @userId
       ORDER BY ts_created ASC`
    );
  // No warn on an empty list: the home page calls this on every load and an empty mantra list is
  // the normal state until the user adds one.
  return result.recordset;
}

export async function createMantra(userId: string, text: string): Promise<Mantra> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('text', sql.NVarChar(MANTRA_MAX_LENGTH), text)
    .query<Mantra>(
      `INSERT INTO quest_mantras (user_id, text)
       OUTPUT ${MANTRA_OUTPUT_COLUMNS}
       VALUES (@userId, @text)`
    );
  return result.recordset[0];
}

export async function updateMantra(userId: string, mantraId: string, text: string): Promise<Mantra | null> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, mantraId)
    .input('text', sql.NVarChar(MANTRA_MAX_LENGTH), text)
    .query<Mantra>(
      `UPDATE quest_mantras
       SET text = @text
       OUTPUT ${MANTRA_OUTPUT_COLUMNS}
       WHERE id = @id AND user_id = @userId`
    );
  return result.recordset[0] ?? null;
}

export async function deleteMantra(userId: string, mantraId: string): Promise<boolean> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, mantraId)
    .query(`DELETE FROM quest_mantras WHERE id = @id AND user_id = @userId`);
  return (result.rowsAffected[0] ?? 0) > 0;
}

// SHA-256 of `input`, first 4 bytes as uint32, normalised to [0, 1). Same helper the todo bonus
// uses — deterministic, so the mantra picked for a given user + day never shifts between requests.
function hashToUnit(input: string): number {
  const buf = crypto.createHash('sha256').update(input).digest();
  return buf.readUInt32BE(0) / 0x100000000;
}

// Picks the mantra to show for `today` out of `mantras`. Random-feeling but stable for the whole
// day: reloading the home page, or hitting the API twice, returns the same one. Sorted by id first
// so SQL row order can't shift the selection.
export function pickMantraOfDay(userId: string, mantras: Mantra[], today: string): Mantra | null {
  if (mantras.length === 0) return null;
  const sorted = mantras.slice().sort((a, b) => a.id.localeCompare(b.id));
  const index = Math.min(sorted.length - 1, Math.floor(hashToUnit(`${userId}:${today}:mantra`) * sorted.length));
  return sorted[index];
}

export interface MantraOfDay {
  date: string;
  mantra: Mantra | null;
}

export async function getMantraOfDay(userId: string): Promise<MantraOfDay> {
  const today = await getCurrentDate(userId);
  const mantras = await listMantras(userId);
  return { date: today, mantra: pickMantraOfDay(userId, mantras, today) };
}
