// App-level health domain types. These describe the master health database
// (SQL_HEALTH_DB) that every module reads from and writes to via lib/health/*.
// Modules keep their own dedicated databases; nothing here is module-scoped.

// How a metric's samples roll up when several land in the same day.
export type HealthAggregation = 'latest' | 'sum' | 'avg';

export type HealthCategory = 'body' | 'vitals' | 'activity' | 'sleep' | 'nutrition';

// One row of dbo.health_metric — the catalog of trackable metrics.
export interface HealthMetric {
  code: string;
  display_name: string;
  category: HealthCategory;
  // Every stored sample is normalized to this unit on write.
  canonical_unit: string;
  aggregation: HealthAggregation;
  // The Android Health Connect record type this maps to (null = no mapping),
  // plus the field inside that record carrying the value. This pairing is what
  // makes the export/import round-trip work before an Android app exists.
  health_connect_type: string | null;
  health_connect_field: string | null;
  // True when samples span a window (steps, sleep) rather than an instant.
  is_interval: boolean;
  sort_order: number;
  is_active: boolean;
}

// One row of dbo.health_sample — the master time series.
export interface HealthSample {
  id: number;
  user_id: string;
  metric_code: string;
  // Always expressed in the metric's canonical_unit.
  value: number;
  start_at: string;
  end_at: string | null;
  // Which module or importer produced this row.
  source: string;
  // The originating row id in that module's own database, or the external
  // record id for imports — lets a mirror re-sync without duplicating.
  source_ref: string | null;
  note: string | null;
  created_at: string;
  modified_at: string;
}

// One row of dbo.health_profile — the slow-changing per-user facts every
// module wants (age, sex, height, unit preferences).
export interface HealthProfile {
  id: number;
  user_id: string;
  date_of_birth: string | null;
  biological_sex: 'male' | 'female' | 'other' | 'unspecified' | null;
  height_cm: number | null;
  blood_type: string | null;
  resting_heart_rate: number | null;
  preferred_mass_unit: 'lb' | 'kg';
  preferred_height_unit: 'in' | 'cm';
  notes: string | null;
  created_at: string;
  modified_at: string;
}

// Fields a caller may change on the profile. Omitted keys are left untouched.
export interface HealthProfileUpdate {
  date_of_birth?: string | null;
  biological_sex?: HealthProfile['biological_sex'];
  height_cm?: number | null;
  blood_type?: string | null;
  resting_heart_rate?: number | null;
  preferred_mass_unit?: HealthProfile['preferred_mass_unit'];
  preferred_height_unit?: HealthProfile['preferred_height_unit'];
  notes?: string | null;
}

// A measurement on its way in. `unit` may be any unit convertible to the
// metric's canonical_unit; recordSamples() normalizes it.
export interface HealthSampleInput {
  metric_code: string;
  value: number;
  unit?: string | null;
  start_at: string | Date;
  end_at?: string | Date | null;
  source?: string;
  source_ref?: string | null;
  note?: string | null;
}

// The profile plus the latest value of every metric that has one — the shape
// the health page and the cross-module context helpers consume.
export interface HealthSnapshot {
  profile: HealthProfile;
  // Derived from date_of_birth at read time; null when no DOB is set.
  age_years: number | null;
  latest: HealthLatestValue[];
}

export interface HealthLatestValue {
  metric_code: string;
  display_name: string;
  category: HealthCategory;
  value: number;
  unit: string;
  measured_at: string;
  source: string;
}
