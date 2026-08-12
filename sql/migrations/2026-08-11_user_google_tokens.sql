-- 2026-08-11  GRIMOIRE-MAIN
-- Lets the app send its notification emails through the signed-in user's own Gmail account.
--
-- Every notification already goes to the recipient's own address (lib/email.ts), but sending
-- needed an SMTP credential that does not exist on this box, so every send returned
-- "email not configured" and nothing was ever delivered. Since everyone signs in with Google,
-- the account we need is already there: ask for the gmail.send scope at sign-in, keep the
-- refresh token here, and each user's notifications are sent from — and to — their own mailbox.
-- No shared mail credential to provision, and revoking Grimoire in the Google account settings
-- turns the sending off.
--
-- Kept out of dbo.users deliberately: the refresh token is a live credential, and users rows are
-- read by the settings UI and the user API. A separate table means it can only be reached by the
-- one lib that needs it (lib/googleMail.ts).
IF OBJECT_ID('dbo.user_google_tokens', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_google_tokens (
    user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_user_google_tokens PRIMARY KEY,
    -- Google refresh token from the sign-in code exchange (access_type=offline).
    refresh_token NVARCHAR(512) NOT NULL,
    -- Space-separated scope list Google actually granted, so the app can tell an account that
    -- consented to gmail.send from one that only granted the sign-in scopes.
    scope NVARCHAR(1000) NULL,
    ts_created DATETIME2 NOT NULL CONSTRAINT DF_user_google_tokens_ts_created DEFAULT SYSUTCDATETIME(),
    ts_updated DATETIME2 NOT NULL CONSTRAINT DF_user_google_tokens_ts_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_user_google_tokens_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
  );
END
