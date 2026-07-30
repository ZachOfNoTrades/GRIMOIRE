import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';

export interface DayNote {
  entry_date: string;
  note: string;
  color_tag: string | null;
}

export async function getDayNote(userId: string, entryDate: string): Promise<DayNote | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('d', sql.Date, entryDate)
      .query<any>(
        `SELECT CONVERT(varchar(10), entry_date, 23) AS entry_date, note, color_tag
         FROM day_notes WHERE user_id=@userId AND entry_date=@d`
      );
    return result.recordset[0] ?? null;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function upsertDayNote(
  userId: string,
  entryDate: string,
  note: string,
  colorTag: string | null
): Promise<DayNote> {
  let pool;
  try {
    pool = await getFoodConnection();
    if (!note || !note.trim()) {
      await pool
        .request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('d', sql.Date, entryDate)
        .query(`DELETE FROM day_notes WHERE user_id=@userId AND entry_date=@d`);
      return { entry_date: entryDate, note: '', color_tag: null };
    }
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('d', sql.Date, entryDate)
      .input('note', sql.NVarChar(sql.MAX), note)
      .input('color', sql.NVarChar(16), colorTag)
      .query(
        `MERGE day_notes AS t
         USING (SELECT @userId AS user_id, @d AS entry_date) AS s
           ON t.user_id=s.user_id AND t.entry_date=s.entry_date
         WHEN MATCHED THEN UPDATE SET note=@note, color_tag=@color, ts_updated=GETDATE()
         WHEN NOT MATCHED THEN INSERT (user_id, entry_date, note, color_tag)
           VALUES (@userId, @d, @note, @color);`
      );
    return { entry_date: entryDate, note, color_tag: colorTag };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
