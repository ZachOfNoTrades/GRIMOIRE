import sql from "mssql";
import { getMainConnection } from "@/lib/db";

// APP-WIDE SETTINGS — dbo.app_settings in the MAIN database: JSON values under a
// string key, written only by a global admin. A missing key reads as null.

export async function getAppSetting<T>(key: string): Promise<T | null> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("key", sql.NVarChar(100), key)
    .query<{ setting_value: string | null }>(`SELECT setting_value FROM app_settings WHERE setting_key = @key`);
  const raw = result.recordset[0]?.setting_value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`Unreadable app setting '${key}'`);
    return null;
  }
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input("key", sql.NVarChar(100), key)
    .input("value", sql.NVarChar(sql.MAX), JSON.stringify(value))
    .query(
      `MERGE app_settings AS target
       USING (SELECT @key AS setting_key) AS source
          ON target.setting_key = source.setting_key
       WHEN MATCHED THEN
          UPDATE SET setting_value = @value, ts_updated = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
          INSERT (setting_key, setting_value) VALUES (@key, @value);`
    );
}
