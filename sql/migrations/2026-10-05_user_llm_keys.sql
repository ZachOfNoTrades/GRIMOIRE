-- 2026-10-05  GRIMOIRE-MAIN
-- Per-user OpenRouter API keys, sealed with AES-256-GCM under the app-wide
-- USER_SECRETS_KEY (Infisical) and bound to their user_id (GCM additional data), so
-- a row cannot be read for any other user even by copying it. Only
-- nextjs/lib/llm/userKeys.ts touches this table; no API ever returns the key.
-- One row per user per provider; removed with the user.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_llm_keys' AND xtype='U')
BEGIN
  CREATE TABLE dbo.user_llm_keys (
    user_id UNIQUEIDENTIFIER NOT NULL,
    provider NVARCHAR(32) NOT NULL CONSTRAINT DF_user_llm_keys_provider DEFAULT 'openrouter',
    key_ciphertext VARBINARY(512) NOT NULL,
    key_iv BINARY(12) NOT NULL,
    key_tag BINARY(16) NOT NULL,
    key_last4 CHAR(4) NOT NULL,
    key_label NVARCHAR(100) NULL,
    ts_created DATETIME2 NOT NULL CONSTRAINT DF_user_llm_keys_ts_created DEFAULT SYSUTCDATETIME(),
    ts_updated DATETIME2 NOT NULL CONSTRAINT DF_user_llm_keys_ts_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_user_llm_keys PRIMARY KEY (user_id, provider),
    CONSTRAINT FK_user_llm_keys_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
  );
END;
GO
