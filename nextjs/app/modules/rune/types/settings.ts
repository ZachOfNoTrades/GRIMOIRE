export interface RuneSettings {
  user_id: string;
  digest_enabled: boolean;
  // Stored HH:MM:SS in the DB; surface as HH:MM to the UI.
  digest_time: string;
  digest_last_sent_date: string | null;
  // NULL means the user hasn't customized it — fall back to the matching bundled default template.
  evaluation_system_prompt: string | null;
  evaluation_personality_prompt: string | null;
  // When set, clicking "Evaluate" during a normal (non-hands-free) study session
  // auto-accepts the AI-suggested rating and advances to the next card after
  // `auto_advance_seconds`, mirroring hands-free mode's auto-advance.
  auto_advance_on_evaluate: boolean;
  auto_advance_seconds: number;
  // Play a short pleasant chime on evaluation, pitched to the evaluated rating.
  evaluation_sound_enabled: boolean;
  // Soft daily study targets. NULL = user hasn't set one; fall back to DEFAULT_*.
  // daily_goal is a motivational progress target; daily_max_renew is a soft
  // ceiling that only warns. Neither limits the study queue.
  daily_goal: number | null;
  daily_max_renew: number | null;
  ts_created: Date;
  ts_modified: Date;
}

export const DEFAULT_DIGEST_ENABLED = false;
export const DEFAULT_DIGEST_TIME = '08:00';

// Study-session behavior defaults. Auto-advance is off by default so existing
// study sessions are unaffected; the delay default matches hands-free mode's
// historical hard-coded 5s. Sound is on by default.
export const DEFAULT_AUTO_ADVANCE_ON_EVALUATE = false;
export const DEFAULT_AUTO_ADVANCE_SECONDS = 5;
export const MIN_AUTO_ADVANCE_SECONDS = 1;
export const MAX_AUTO_ADVANCE_SECONDS = 30;
export const DEFAULT_EVALUATION_SOUND_ENABLED = true;

// Soft daily study targets. Defaults mirror Anki's conventional new/review limits
// (20 / 200) but here they only drive a progress indicator + a soft warning —
// they never cap the study queue.
export const DEFAULT_DAILY_GOAL = 20;
export const DEFAULT_DAILY_MAX_RENEW = 200;
export const MIN_DAILY_TARGET = 1;
export const MAX_DAILY_TARGET = 9999;
