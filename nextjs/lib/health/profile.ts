import sql from 'mssql';
import { getHealthConnection } from './db';
import { getLatestValues } from './samples';
import { HealthProfile, HealthProfileUpdate, HealthSnapshot } from '@/types/health';

function mapProfile(row: Record<string, unknown>): HealthProfile {
  return {
    id: Number(row.id),
    user_id: row.user_id as string,
    // DATE columns come back as a Date at UTC midnight; keep only the calendar day.
    date_of_birth: row.date_of_birth ? (row.date_of_birth as Date).toISOString().slice(0, 10) : null,
    biological_sex: (row.biological_sex as HealthProfile['biological_sex']) ?? null,
    height_cm: row.height_cm == null ? null : Number(row.height_cm),
    blood_type: (row.blood_type as string) ?? null,
    resting_heart_rate: row.resting_heart_rate == null ? null : Number(row.resting_heart_rate),
    preferred_mass_unit: row.preferred_mass_unit as HealthProfile['preferred_mass_unit'],
    preferred_height_unit: row.preferred_height_unit as HealthProfile['preferred_height_unit'],
    notes: (row.notes as string) ?? null,
    created_at: (row.created_at as Date).toISOString(),
    modified_at: (row.modified_at as Date).toISOString(),
  };
}

const PROFILE_COLUMNS = `id, user_id, date_of_birth, biological_sex, height_cm, blood_type,
       resting_heart_rate, preferred_mass_unit, preferred_height_unit, notes, created_at, modified_at`;

// Fetch the user's profile, creating the row on first touch. Every read path
// goes through here so callers never have to handle "no profile yet".
export async function ensureHealthProfile(userId: string): Promise<HealthProfile> {
  const pool = await getHealthConnection();
  const result = await pool.request()
    .input('userId', sql.NVarChar(128), userId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM health_profile WHERE user_id = @userId)
        INSERT INTO health_profile (user_id) VALUES (@userId);
      SELECT ${PROFILE_COLUMNS} FROM health_profile WHERE user_id = @userId;
    `);
  if (result.recordset.length === 0) {
    throw new Error(`Failed to resolve health profile for user id: '${userId}'`);
  }
  return mapProfile(result.recordset[0]);
}

// Partial update — only the keys present in `updates` are written.
export async function updateHealthProfile(userId: string, updates: HealthProfileUpdate): Promise<HealthProfile> {
  await ensureHealthProfile(userId);
  const pool = await getHealthConnection();

  const request = pool.request().input('userId', sql.NVarChar(128), userId);
  const setClauses: string[] = [];

  if (updates.date_of_birth !== undefined) {
    request.input('dateOfBirth', sql.Date, updates.date_of_birth ? new Date(updates.date_of_birth) : null);
    setClauses.push('date_of_birth = @dateOfBirth');
  }
  if (updates.biological_sex !== undefined) {
    request.input('biologicalSex', sql.NVarChar(16), updates.biological_sex ?? null);
    setClauses.push('biological_sex = @biologicalSex');
  }
  if (updates.height_cm !== undefined) {
    request.input('heightCm', sql.Decimal(6, 2), updates.height_cm ?? null);
    setClauses.push('height_cm = @heightCm');
  }
  if (updates.blood_type !== undefined) {
    request.input('bloodType', sql.NVarChar(8), updates.blood_type ?? null);
    setClauses.push('blood_type = @bloodType');
  }
  if (updates.resting_heart_rate !== undefined) {
    request.input('restingHeartRate', sql.Int, updates.resting_heart_rate ?? null);
    setClauses.push('resting_heart_rate = @restingHeartRate');
  }
  if (updates.preferred_mass_unit !== undefined) {
    request.input('massUnit', sql.NVarChar(8), updates.preferred_mass_unit);
    setClauses.push('preferred_mass_unit = @massUnit');
  }
  if (updates.preferred_height_unit !== undefined) {
    request.input('heightUnit', sql.NVarChar(8), updates.preferred_height_unit);
    setClauses.push('preferred_height_unit = @heightUnit');
  }
  if (updates.notes !== undefined) {
    request.input('notes', sql.NVarChar(sql.MAX), updates.notes ?? null);
    setClauses.push('notes = @notes');
  }

  // Nothing to change — return the current row rather than issuing a no-op UPDATE.
  if (setClauses.length === 0) return ensureHealthProfile(userId);
  setClauses.push('modified_at = SYSUTCDATETIME()');

  const result = await request.query(`
    UPDATE health_profile
    SET ${setClauses.join(', ')}
    OUTPUT ${PROFILE_COLUMNS.split(',').map((c) => `INSERTED.${c.trim()}`).join(', ')}
    WHERE user_id = @userId
  `);
  if (result.recordset.length === 0) {
    throw new Error(`Failed to update health profile for user id: '${userId}'`);
  }
  return mapProfile(result.recordset[0]);
}

// Whole-number age on today's date, or null with no DOB recorded.
export function ageFromDateOfBirth(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

// Profile + derived age + the latest value of every metric. This is the single
// read every consumer (health page, module context builders) uses.
export async function getHealthSnapshot(userId: string): Promise<HealthSnapshot> {
  const [profile, latest] = await Promise.all([
    ensureHealthProfile(userId),
    getLatestValues(userId),
  ]);
  return { profile, age_years: ageFromDateOfBirth(profile.date_of_birth), latest };
}
