-- Align live user_api_keys index names with the canonical names in sql_init_main.sql
-- (adopted from main's API-key PR). The table was originally created out-of-band with
-- lowercase index names; main's POST /api/users/me/api-keys handler detects a duplicate
-- active key name by matching the index name "UX_user_api_keys_active_name" in the error
-- message, so the index must carry that exact name for the 409 response to fire.
-- Idempotent: each rename only runs if the old index name still exists.
USE [GRIMOIRE-MAIN-20260325];
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.user_api_keys') AND name = 'ux_user_api_keys_user_name')
    EXEC sp_rename N'dbo.user_api_keys.ux_user_api_keys_user_name', N'UX_user_api_keys_active_name', N'INDEX';
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.user_api_keys') AND name = 'ux_user_api_keys_key_hash')
    EXEC sp_rename N'dbo.user_api_keys.ux_user_api_keys_key_hash', N'UQ_user_api_keys_hash', N'INDEX';
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.user_api_keys') AND name = 'ix_user_api_keys_user')
    EXEC sp_rename N'dbo.user_api_keys.ix_user_api_keys_user', N'IX_user_api_keys_user_active', N'INDEX';
GO
