import { getLatestSample, recordSamples } from './samples';
import { ageFromDateOfBirth, ensureHealthProfile } from './profile';
import { kgToLb, lbToKg } from './units';

// The cross-module surface. Modules import from here rather than from
// samples/profile directly, and NEVER reach into another module's database:
// forage writes a weigh-in through mirrorBodyComposition(), golem reads the
// same number back through getLatestBodyMassLb(). Both sides only know the
// master store. Everything is best-effort — see the note on mirror failures.

export interface HealthContext {
  age_years: number | null;
  biological_sex: string | null;
  height_cm: number | null;
  body_mass_kg: number | null;
  body_mass_lb: number | null;
  body_fat_pct: number | null;
  resting_heart_rate: number | null;
  // When the body-mass reading was taken, so a consumer can judge staleness.
  body_mass_measured_at: string | null;
}

// Everything a module needs to reason about the user's body, in one read.
export async function getHealthContext(userId: string): Promise<HealthContext> {
  const [profile, mass, fat] = await Promise.all([
    ensureHealthProfile(userId),
    getLatestSample(userId, 'body_mass'),
    getLatestSample(userId, 'body_fat'),
  ]);

  return {
    age_years: ageFromDateOfBirth(profile.date_of_birth),
    biological_sex: profile.biological_sex,
    height_cm: profile.height_cm,
    body_mass_kg: mass ? mass.value : null,
    body_mass_lb: mass ? kgToLb(mass.value) : null,
    body_fat_pct: fat ? fat.value : null,
    resting_heart_rate: profile.resting_heart_rate,
    body_mass_measured_at: mass ? mass.start_at : null,
  };
}

// Latest bodyweight in pounds, or null when nothing has been recorded anywhere.
export async function getLatestBodyMassLb(userId: string): Promise<number | null> {
  const sample = await getLatestSample(userId, 'body_mass');
  return sample ? kgToLb(sample.value) : null;
}

// Mirror a weigh-in into the master store. Called by whichever module captured
// it; `sourceRef` is that module's own row id so re-saving the same weigh-in
// updates rather than duplicates.
export async function mirrorBodyComposition(
  userId: string,
  input: {
    measuredAt: string | Date;
    weightLb?: number | null;
    bodyFatPct?: number | null;
    source: string;
    sourceRef?: string | null;
  },
): Promise<void> {
  const samples = [];
  if (input.weightLb != null && Number.isFinite(input.weightLb) && input.weightLb > 0) {
    samples.push({
      metric_code: 'body_mass',
      value: lbToKg(input.weightLb),
      start_at: input.measuredAt,
      source: input.source,
      source_ref: input.sourceRef ?? null,
    });
  }
  if (input.bodyFatPct != null && Number.isFinite(input.bodyFatPct)) {
    samples.push({
      metric_code: 'body_fat',
      value: input.bodyFatPct,
      start_at: input.measuredAt,
      source: input.source,
      source_ref: input.sourceRef ?? null,
    });
  }
  if (samples.length === 0) return;
  await recordSamples(userId, samples);
}

// Fire-and-log wrapper for the mirror. The module's own write is the source of
// truth and has already committed by the time we get here, so a health-store
// failure must never turn a successful weigh-in into a 500.
export function mirrorBodyCompositionSafe(
  userId: string,
  input: Parameters<typeof mirrorBodyComposition>[1],
): void {
  mirrorBodyComposition(userId, input).catch((error) => {
    console.error('Failed to mirror body composition into the health store:', error);
  });
}

// One-line summary for an LLM prompt. Returns null when the profile is empty,
// so callers can omit the section entirely rather than emitting "unknown".
export function describeHealthContext(context: HealthContext): string | null {
  const parts: string[] = [];
  if (context.age_years != null) parts.push(`${context.age_years} years old`);
  if (context.biological_sex && context.biological_sex !== 'unspecified') parts.push(context.biological_sex);
  if (context.height_cm != null) parts.push(`${context.height_cm.toFixed(0)} cm tall`);
  if (context.body_mass_lb != null) parts.push(`${context.body_mass_lb.toFixed(1)} lb bodyweight`);
  if (context.body_fat_pct != null) parts.push(`${context.body_fat_pct.toFixed(1)}% body fat`);
  return parts.length ? parts.join(', ') : null;
}
