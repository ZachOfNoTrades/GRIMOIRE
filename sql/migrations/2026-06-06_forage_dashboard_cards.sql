-- Per-user dashboard card customization for Forage. Lets a user choose which
-- cards appear in a dashboard section (currently only the Nutrition section)
-- and in what order. No rows for a (user, section) pair means "use the built-in
-- default set" (defined in types/dashboard.ts), so existing users keep the
-- original Nutrition layout until they customize it.
--
-- card_key is either a synthetic macro key ('macros','kcal','protein','fat',
-- 'carbs') or a nutrients.code value ('sugar_total','sat_fat',…). position is a
-- dense 0-based ordering written by the API on every save.

-- DASHBOARD CARDS TABLE
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forage_dashboard_cards' AND xtype='U')
BEGIN
    CREATE TABLE forage_dashboard_cards (
        user_id    UNIQUEIDENTIFIER NOT NULL,
        section    VARCHAR(32)      NOT NULL,
        card_key   NVARCHAR(64)     NOT NULL,
        position   INT              NOT NULL,
        ts_updated DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_forage_dashboard_cards PRIMARY KEY (user_id, section, card_key)
    );

    CREATE INDEX IX_forage_dashboard_cards_user_section ON forage_dashboard_cards (user_id, section, position);
END
GO
