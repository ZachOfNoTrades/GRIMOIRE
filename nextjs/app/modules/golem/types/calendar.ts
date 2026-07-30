// A lightweight workout-session row projected onto a single calendar day, used by the
// golem calendar view. The calendar anchors each session on its actual workout day
// (started_at) — or, for not-yet-started standalone/ad-hoc sessions, the day it was
// created. Unstarted program sessions have no calendar date (they are future plan) and
// are excluded by the query, so calendar_date is always a real YYYY-MM-DD here.
export interface GolemCalendarSession {
  id: string;
  name: string;
  calendar_date: string; // YYYY-MM-DD (server-local) the session lands on
  is_completed: boolean;
  is_current: boolean;
  is_standalone: boolean; // week_id IS NULL — an ad-hoc workout outside any program
  program_name: string | null; // program context for program-bound sessions, null for standalone
  day_archetype_name: string | null; // engine archetype the session was generated from, if any
  duration: number | null; // logged duration in seconds, when completed
}
