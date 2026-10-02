import { getMainConnection } from "@/lib/db";
import type { OracleSettings } from "../types/oracle";
import { CHIP_SECONDS_DEFAULT } from "./constants";

const DEFAULT_SETTINGS: OracleSettings = { chip_seconds: CHIP_SECONDS_DEFAULT, banner_images: true };

// A DM with no row yet gets the defaults; the row is only written on the first save.
export async function getSettings(userId: string): Promise<OracleSettings> {
  const pool = await getMainConnection();
  const result = await pool.request().input("userId", userId).query(`
    SELECT chip_seconds, banner_images FROM oracle_settings WHERE user_id = @userId
  `);
  if (result.recordset.length === 0) return { ...DEFAULT_SETTINGS };
  return { chip_seconds: result.recordset[0].chip_seconds, banner_images: !!result.recordset[0].banner_images };
}

export async function saveSettings(userId: string, patch: Partial<OracleSettings>): Promise<OracleSettings> {
  const current = await getSettings(userId);
  const next: OracleSettings = {
    chip_seconds: patch.chip_seconds ?? current.chip_seconds,
    banner_images: patch.banner_images ?? current.banner_images,
  };
  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", userId)
    .input("chipSeconds", next.chip_seconds)
    .input("bannerImages", next.banner_images ? 1 : 0)
    .query(`
      MERGE oracle_settings WITH (HOLDLOCK) AS target
      USING (SELECT @userId AS user_id) AS source ON target.user_id = source.user_id
      WHEN MATCHED THEN UPDATE SET chip_seconds = @chipSeconds, banner_images = @bannerImages, ts_updated = GETDATE()
      WHEN NOT MATCHED THEN INSERT (user_id, chip_seconds, banner_images) VALUES (@userId, @chipSeconds, @bannerImages);
    `);
  return next;
}
