-- 2026-07-30  GRIMOIRE-MAIN
-- Audit trail for every transactional email the app sends (lib/email.ts), which replaced the
-- Discord notify-relay path. The PK doubles as the "tracking ID" printed in the body of each
-- email, so a user quoting an ID resolves straight to the send.
--
-- Failed sends are logged too — without a row, an SMTP outage looks identical to "nothing was
-- scheduled", which is exactly how the old Discord alert path rotted unnoticed.
IF OBJECT_ID('dbo.email_log', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.email_log (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_email_log PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    recipient NVARCHAR(320) NOT NULL,
    -- Matches UNSUBSCRIBE_KINDS in lib/emailUnsubscribe.ts (e.g. 'quest-digest').
    kind VARCHAR(40) NOT NULL,
    subject NVARCHAR(400) NOT NULL,
    -- 'sent' | 'failed' | 'skipped'
    status VARCHAR(20) NOT NULL,
    error NVARCHAR(1000) NULL,
    message_id NVARCHAR(400) NULL,
    ts_created DATETIME2 NOT NULL CONSTRAINT DF_email_log_ts_created DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_email_log_user_created ON dbo.email_log (user_id, ts_created DESC);
  CREATE INDEX IX_email_log_kind_created ON dbo.email_log (kind, ts_created DESC);
END
