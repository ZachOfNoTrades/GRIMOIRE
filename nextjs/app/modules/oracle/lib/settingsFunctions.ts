import { getMainConnection } from "@/lib/db";
import type { OracleSettings } from "../types/oracle";
import { CHIP_SECONDS_DEFAULT, DEFAULT_MODEL, TASK_KEYS, TEXT_MODEL_KEYS, type GenerationTask, type TaskModels, type TextModel } from "./constants";
import { parseJson } from "./mapData";

export function defaultModels(): TaskModels {
  return Object.fromEntries(TASK_KEYS.map((task) => [task, DEFAULT_MODEL])) as TaskModels;
}

// The models column is JSON; anything missing or unknown in it falls back to the default, so a
// model that is retired later cannot break a DM's settings.
function coerceModels(raw: unknown): TaskModels {
  const models = defaultModels();
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const task of TASK_KEYS) {
    if (TEXT_MODEL_KEYS.includes(item[task] as TextModel)) models[task] = item[task] as TextModel;
  }
  return models;
}

const DEFAULT_SETTINGS: OracleSettings = { chip_seconds: CHIP_SECONDS_DEFAULT, banner_images: true, models: defaultModels() };

// A DM with no row yet gets the defaults; the row is only written on the first save.
export async function getSettings(userId: string): Promise<OracleSettings> {
  const pool = await getMainConnection();
  const result = await pool.request().input("userId", userId).query(`
    SELECT chip_seconds, banner_images, models FROM oracle_settings WHERE user_id = @userId
  `);
  if (result.recordset.length === 0) return { ...DEFAULT_SETTINGS, models: defaultModels() };
  const row = result.recordset[0];
  return { chip_seconds: row.chip_seconds, banner_images: !!row.banner_images, models: coerceModels(parseJson<unknown>(row.models, null)) };
}

// The model this DM chose for one kind of generation.
export async function modelFor(userId: string, task: GenerationTask): Promise<TextModel> {
  return (await getSettings(userId)).models[task];
}

export type SettingsPatch = Partial<Omit<OracleSettings, "models">> & { models?: Partial<TaskModels> };

export async function saveSettings(userId: string, patch: SettingsPatch): Promise<OracleSettings> {
  const current = await getSettings(userId);
  const next: OracleSettings = {
    chip_seconds: patch.chip_seconds ?? current.chip_seconds,
    banner_images: patch.banner_images ?? current.banner_images,
    models: coerceModels({ ...current.models, ...(patch.models ?? {}) }),
  };
  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", userId)
    .input("chipSeconds", next.chip_seconds)
    .input("bannerImages", next.banner_images ? 1 : 0)
    .input("models", JSON.stringify(next.models))
    .query(`
      MERGE oracle_settings WITH (HOLDLOCK) AS target
      USING (SELECT @userId AS user_id) AS source ON target.user_id = source.user_id
      WHEN MATCHED THEN UPDATE SET chip_seconds = @chipSeconds, banner_images = @bannerImages, models = @models, ts_updated = GETDATE()
      WHEN NOT MATCHED THEN INSERT (user_id, chip_seconds, banner_images, models) VALUES (@userId, @chipSeconds, @bannerImages, @models);
    `);
  return next;
}
