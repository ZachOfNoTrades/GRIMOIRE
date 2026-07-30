export type WeightUnit = "lbs" | "kg";

export interface ForageUserSettings {
  user_id: string;
  weight_unit: WeightUnit;
  // Opt-in email reminder for a coached program's weekly check-in.
  checkin_notif_enabled: boolean;
  checkin_notif_time: string; // HH:MM (24h, local clock)
  checkin_notif_last_sent_date: string | null; // YYYY-MM-DD (UTC day) de-dupe stamp
  // How many days back the picker's hourly "favorites" counts logged foods. Default 30.
  favorites_history_days: number;
  // Homepage Forage card badge: once the clock passes this time and today's diary is still
  // empty, the dashboard card shows a "nothing logged" badge. Passive — no notification.
  unlogged_badge_enabled: boolean;
  unlogged_badge_time: string; // HH:MM (24h, local clock)
}

// Allowed history windows for the hourly "favorites" suggestions (days).
export const FAVORITES_HISTORY_MIN_DAYS = 1;
export const FAVORITES_HISTORY_MAX_DAYS = 3650;

export const DEFAULT_SETTINGS: Omit<ForageUserSettings, "user_id"> = {
  weight_unit: "lbs",
  checkin_notif_enabled: false,
  checkin_notif_time: "09:00",
  checkin_notif_last_sent_date: null,
  favorites_history_days: 30,
  unlogged_badge_enabled: true,
  unlogged_badge_time: "12:00",
};
