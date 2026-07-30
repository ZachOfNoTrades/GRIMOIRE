-- Adds an opt-in Discord notification for a coached program's weekly check-in.
-- When enabled, an in-process scheduler (lib/checkinScheduler.ts, mirrors the
-- quest digest scheduler) fires a reminder on the user's check-in weekday once
-- the chosen local time has passed, but only while the check-in is still due
-- (i.e. the lazy recompute on GET /api/program hasn't already consumed it).
--
--   checkin_notif_enabled        BIT  — off by default; users opt in.
--   checkin_notif_time           TIME — local HH:MM the reminder may fire at.
--   checkin_notif_last_sent_date DATE — de-dupe stamp (UTC day), like quest's
--                                       digest_last_sent_date, so the scheduler
--                                       fires at most once per check-in day.

-- CHECK-IN NOTIFICATION COLUMNS
ALTER TABLE forage_user_settings
    ADD checkin_notif_enabled BIT NOT NULL
            CONSTRAINT DF_forage_user_settings_checkin_notif_enabled DEFAULT 0,
        checkin_notif_time TIME(0) NOT NULL
            CONSTRAINT DF_forage_user_settings_checkin_notif_time DEFAULT '09:00:00',
        checkin_notif_last_sent_date DATE NULL;
GO
