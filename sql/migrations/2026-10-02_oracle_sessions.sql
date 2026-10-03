-- =============================================================================
-- Migration: Oracle — sessions replace scenes
-- Date: 2026-10-02
-- DB: GRIMOIRE-MAIN
-- Version: 202610021800
--
-- Campaign and session are the only units. A session is one night at the table:
-- rough notes going in, a recap coming out. The campaign's rough draft moves
-- into a first session; scenes are dropped (log entries keep their copied
-- title, now called session_title).
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_sessions' AND xtype='U')
BEGIN
    CREATE TABLE oracle_sessions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        title NVARCHAR(160) NOT NULL,
        session_date DATE NULL,
        notes NVARCHAR(MAX) NOT NULL DEFAULT '', -- the DM's rough plan for the night, in any shape
        recap NVARCHAR(4000) NOT NULL DEFAULT '', -- what happened, written after or during the night
        is_done BIT NOT NULL DEFAULT 0,
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_sessions_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_oracle_sessions_campaign ON oracle_sessions (campaign_id, ts_created);
END
GO

-- The live-session pointer (no foreign key; the application clears it).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_campaigns') AND name = 'current_session_id')
    ALTER TABLE oracle_campaigns ADD current_session_id UNIQUEIDENTIFIER NULL;
GO

-- A campaign's rough draft becomes its first session's notes.
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_campaigns') AND name = 'draft')
BEGIN
    EXEC('INSERT INTO oracle_sessions (campaign_id, title, notes)
          SELECT id, ''Session 1'', draft FROM oracle_campaigns WHERE LEN(draft) > 0');
    -- The column's unnamed default constraint must go first.
    DECLARE @draftDefault NVARCHAR(200) = (SELECT dc.name FROM sys.default_constraints dc
        JOIN sys.columns c ON c.default_object_id = dc.object_id
        WHERE c.object_id = OBJECT_ID('oracle_campaigns') AND c.name = 'draft');
    IF @draftDefault IS NOT NULL EXEC('ALTER TABLE oracle_campaigns DROP CONSTRAINT [' + @draftDefault + ']');
    ALTER TABLE oracle_campaigns DROP COLUMN draft;
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_campaigns') AND name = 'current_scene_id')
    ALTER TABLE oracle_campaigns DROP COLUMN current_scene_id;
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_events') AND name = 'scene_title')
    EXEC sp_rename 'oracle_events.scene_title', 'session_title', 'COLUMN';
GO

IF EXISTS (SELECT * FROM sysobjects WHERE name='oracle_scenes' AND xtype='U')
    DROP TABLE oracle_scenes;
GO
