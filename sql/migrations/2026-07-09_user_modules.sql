-- =============================================================================
-- Migration: per-user module access (allow-list)
-- Date: 2026-07-09
-- DB: GRIMOIRE-MAIN
--
-- Adds the user_modules join table backing individual user module access.
-- Semantics (enforced in lib/moduleAccess.ts, NOT in SQL):
--   * A global_admin always sees every enabled module.
--   * A user with ZERO rows here is UNCONFIGURED -> gets EVERY enabled module
--     ("for now give everyone everything" — the table starts empty so nothing
--     changes for existing users).
--   * A user with one or more rows is RESTRICTED to exactly the granted modules.
-- Because empty == full access, this cannot represent "access to zero modules";
-- that is intentional (a user with no modules is not a supported state).
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_modules' AND xtype='U')
BEGIN
    CREATE TABLE user_modules (
        user_id UNIQUEIDENTIFIER NOT NULL,
        module_id UNIQUEIDENTIFIER NOT NULL,
        ts_created DATETIME DEFAULT GETDATE(),

        CONSTRAINT PK_user_modules PRIMARY KEY (user_id, module_id),
        CONSTRAINT FK_user_modules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT FK_user_modules_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
    );
END
