-- =============================================================================
-- Migration: Damnation — multiplayer MTG life tracker
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- A signed-in host creates a session and shows it on a shared screen; guests join
-- from their phones with the session's join code and no account. Any seated guest
-- may change any player's life, commander damage and status.
--
-- Cascade layout (SQL Server allows only ONE cascade path into a table, error 1785):
--   users -> damnation_sessions -> { damnation_players, damnation_commander_damage,
--                                    damnation_events }
-- The player/event references inside commander_damage and events are NO ACTION.
-- Deleting a session (or its host user) removes all of its rows in one statement;
-- referential checks run at the end of that statement, so the NO ACTION edges
-- between rows deleted together do not block it.
-- =============================================================================

-- Filtered indexes require these; sqlcmd defaults QUOTED_IDENTIFIER to OFF
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- =============================
-- Damnation Settings (per host)
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_settings' AND xtype='U')
BEGIN
    CREATE TABLE damnation_settings (
        user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        wiki_search_template NVARCHAR(500) NULL, -- NULL = built-in default (mtg.wiki); must contain {query}
        wiki_embed BIT NOT NULL DEFAULT 1, -- 1 = open results in an in-app frame, 0 = new tab only
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_damnation_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
END

-- =============================
-- Damnation Sessions
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_sessions' AND xtype='U')
BEGIN
    CREATE TABLE damnation_sessions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        host_user_id UNIQUEIDENTIFIER NOT NULL,
        join_code VARCHAR(8) NULL, -- NULL once finished; unique among live sessions only
        starting_life INT NOT NULL DEFAULT 40,
        max_seats INT NOT NULL DEFAULT 4,
        status VARCHAR(10) NOT NULL DEFAULT 'lobby', -- lobby = joins open, active = joins closed, finished
        version INT NOT NULL DEFAULT 0, -- bumped by every mutation; doubles as the per-session write lock
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),
        ts_finished DATETIME NULL,

        CONSTRAINT CK_damnation_sessions_status CHECK (status IN ('lobby','active','finished')),
        CONSTRAINT CK_damnation_sessions_starting_life CHECK (starting_life BETWEEN 1 AND 999),
        CONSTRAINT CK_damnation_sessions_max_seats CHECK (max_seats BETWEEN 2 AND 6),
        CONSTRAINT FK_damnation_sessions_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Codes are recycled after a session ends, so uniqueness only covers live codes
    CREATE UNIQUE INDEX UX_damnation_sessions_join_code ON damnation_sessions (join_code) WHERE join_code IS NOT NULL;
    CREATE INDEX IX_damnation_sessions_host ON damnation_sessions (host_user_id, ts_created);
END

-- =============================
-- Damnation Players
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_players' AND xtype='U')
BEGIN
    CREATE TABLE damnation_players (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        session_id UNIQUEIDENTIFIER NOT NULL,
        seat INT NOT NULL,
        display_name NVARCHAR(24) NOT NULL,
        color_key VARCHAR(20) NOT NULL, -- palette key (see lib/constants.ts), never raw CSS
        token_hash VARBINARY(32) NULL, -- SHA-256 of the guest token; NULL = seat freed by the host, claimable
        life_total INT NOT NULL,
        conceded BIT NOT NULL DEFAULT 0,
        eliminated_override BIT NULL, -- NULL = derive from life/commander damage, 1 = forced out, 0 = forced alive
        kicked BIT NOT NULL DEFAULT 0, -- 1 = removed from the game; seat, color and name are released
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT CK_damnation_players_seat CHECK (seat BETWEEN 1 AND 6),
        CONSTRAINT CK_damnation_players_life CHECK (life_total BETWEEN -999 AND 999),
        CONSTRAINT FK_damnation_players_session FOREIGN KEY (session_id) REFERENCES damnation_sessions(id) ON DELETE CASCADE
    );

    -- Seat, color and name are unique among players still in the game (kicked rows keep history)
    CREATE UNIQUE INDEX UX_damnation_players_seat ON damnation_players (session_id, seat) WHERE kicked = 0;
    CREATE UNIQUE INDEX UX_damnation_players_color ON damnation_players (session_id, color_key) WHERE kicked = 0;
    CREATE UNIQUE INDEX UX_damnation_players_name ON damnation_players (session_id, display_name) WHERE kicked = 0;
    CREATE UNIQUE INDEX UX_damnation_players_token ON damnation_players (token_hash) WHERE token_hash IS NOT NULL;
END

-- =============================
-- Damnation Commander Damage
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_commander_damage' AND xtype='U')
BEGIN
    CREATE TABLE damnation_commander_damage (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        session_id UNIQUEIDENTIFIER NOT NULL,
        source_player_id UNIQUEIDENTIFIER NOT NULL, -- whose commander dealt the damage
        target_player_id UNIQUEIDENTIFIER NOT NULL, -- who took it
        damage INT NOT NULL DEFAULT 0,
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT UK_damnation_commander_damage_pair UNIQUE (source_player_id, target_player_id), -- one grid cell per ordered pair
        CONSTRAINT CK_damnation_commander_damage_range CHECK (damage BETWEEN 0 AND 999),
        CONSTRAINT CK_damnation_commander_damage_self CHECK (source_player_id <> target_player_id),
        CONSTRAINT FK_damnation_commander_damage_session FOREIGN KEY (session_id) REFERENCES damnation_sessions(id) ON DELETE CASCADE,
        CONSTRAINT FK_damnation_commander_damage_source FOREIGN KEY (source_player_id) REFERENCES damnation_players(id),
        CONSTRAINT FK_damnation_commander_damage_target FOREIGN KEY (target_player_id) REFERENCES damnation_players(id)
    );
END

-- =============================
-- Damnation Events
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_events' AND xtype='U')
BEGIN
    CREATE TABLE damnation_events (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        session_id UNIQUEIDENTIFIER NOT NULL,
        op_id UNIQUEIDENTIFIER NOT NULL, -- client-generated; makes retried writes idempotent
        session_version INT NOT NULL, -- the session version this event produced; orders events
        event_type VARCHAR(24) NOT NULL,
        actor_player_id UNIQUEIDENTIFIER NULL, -- NULL = the host
        target_player_id UNIQUEIDENTIFIER NULL,
        payload NVARCHAR(1000) NULL, -- small JSON: the deltas actually applied, so undo is exact
        undoes_event_id UNIQUEIDENTIFIER NULL,
        ts_created DATETIME DEFAULT GETDATE(),

        CONSTRAINT UK_damnation_events_op UNIQUE (op_id),
        CONSTRAINT CK_damnation_events_type CHECK (event_type IN
            ('join','claim','life','commander_damage','status','undo','kick','free_seat','start','reopen','rotate_code','end')),
        CONSTRAINT FK_damnation_events_session FOREIGN KEY (session_id) REFERENCES damnation_sessions(id) ON DELETE CASCADE,
        CONSTRAINT FK_damnation_events_actor FOREIGN KEY (actor_player_id) REFERENCES damnation_players(id),
        CONSTRAINT FK_damnation_events_target FOREIGN KEY (target_player_id) REFERENCES damnation_players(id),
        CONSTRAINT FK_damnation_events_undoes FOREIGN KEY (undoes_event_id) REFERENCES damnation_events(id)
    );

    CREATE INDEX IX_damnation_events_session ON damnation_events (session_id, session_version);
    -- An event can be undone at most once
    CREATE UNIQUE INDEX UX_damnation_events_undoes ON damnation_events (undoes_event_id) WHERE undoes_event_id IS NOT NULL;
END

-- =============================
-- Lookup indexes
-- =============================
-- Snapshot reads filter by session_id. Without a plain index they scan the clustered key and
-- take shared locks on other games' rows, widening the window for lock conflicts with writes.
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_damnation_players_session')
BEGIN
    CREATE INDEX IX_damnation_players_session ON damnation_players (session_id) INCLUDE (seat, kicked);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_damnation_commander_damage_session')
BEGIN
    CREATE INDEX IX_damnation_commander_damage_session ON damnation_commander_damage (session_id);
END

-- =============================
-- Module registration
-- =============================
IF NOT EXISTS (SELECT * FROM modules WHERE slug = 'damnation')
BEGIN
    INSERT INTO modules (id, name, slug, description, icon) VALUES
    ('A0000000-0000-0000-0000-000000000006', 'Damnation', 'damnation', 'MTG life tracker for the whole table', 'Skull');
END
