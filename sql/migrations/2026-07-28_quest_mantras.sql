-- 2026-07-28  GRIMOIRE-QUEST
-- Mantras: a per-user list of short reminder texts. One is picked deterministically per day
-- and shown as a banner on the quest home page.
IF OBJECT_ID('dbo.quest_mantras', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_mantras (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    text NVARCHAR(500) NOT NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX ix_quest_mantras_user ON dbo.quest_mantras(user_id, ts_created);
END;
