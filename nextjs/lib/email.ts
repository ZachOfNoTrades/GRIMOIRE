// Transactional email helper, server-side only. Replaces the old Discord notify-relay path
// (lib/notify.ts, removed 2026-07-30) — every user-facing notification now goes to the
// recipient's own email address instead of a shared #grimoire Discord channel.
//
// Three things every send gets, by contract:
//   1. A tracking ID (the email_log row's PK) rendered into BOTH the HTML and plain-text bodies,
//      so a user can quote it and we can find the exact send in dbo.email_log.
//   2. A working unsubscribe link (plus RFC 8058 List-Unsubscribe headers) that turns the
//      originating notification off for that user without needing them to sign in.
//   3. An email_log row, written even when the send fails, so a silent outage is visible.
//
// Like the relay helper before it, this is best-effort: a mail outage must never break the
// caller. Errors are logged and returned as a structured result, never thrown.

import { randomUUID } from 'crypto';
import nodemailer, { Transporter } from 'nodemailer';
import { getMainConnection } from '@/lib/db';
import sql from 'mssql';
import {
  EmailKind,
  UNSUBSCRIBE_KINDS,
  buildUnsubscribeUrl,
  buildUnsubscribeApiUrl,
} from '@/lib/emailUnsubscribe';

export { appBaseUrl } from '@/lib/appUrl';

export interface EmailField {
  name: string;
  value: string;
  // Rendered side-by-side with the neighbouring inline field instead of on its own row.
  inline?: boolean;
}

export interface AppEmailPayload {
  // Owner of the notification. Drives the unsubscribe link and the email_log row.
  userId: string;
  to: string;
  toName?: string | null;
  kind: EmailKind;
  subject: string;
  // Large heading at the top of the email body.
  heading: string;
  // Lead paragraph under the heading. Supports **bold** (converted to <strong> in HTML and
  // left as-is in plain text) so the migrated Discord copy reads the same in both parts.
  intro?: string;
  fields?: EmailField[];
  // Optional call-to-action button linking back into the app.
  ctaUrl?: string;
  ctaLabel?: string;
  // Small line above the unsubscribe footer, e.g. "grimoire · quest".
  footerNote?: string;
}

export interface EmailResult {
  ok: boolean;
  // True when we deliberately did not attempt a send (unconfigured / no recipient).
  skipped: boolean;
  error: string | null;
  // Null only when we skipped before allocating one.
  trackingId: string | null;
}

// ---------------------------------------------------------------- configuration

// Soft-disable when SMTP env is unset (fresh clone, local dev without secrets), mirroring the
// old isNotifyConfigured() gate so schedulers stay quiet instead of erroring every tick.
//
// A half-filled config counts as unconfigured on purpose: if SMTP_USER is set but SMTP_PASSWORD
// isn't, every scheduler tick would attempt a send, fail auth, and write a 'failed' email_log row
// once a minute. Staying quiet until the credential lands is the honest state. A relay that needs
// no auth (no SMTP_USER at all) is still supported.
export function isEmailConfigured(): boolean {
  if (!process.env.SMTP_HOST || !emailFrom()) return false;
  if (process.env.SMTP_USER && !process.env.SMTP_PASSWORD) return false;
  return true;
}

function emailFrom(): string | null {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || null;
}

// Singleton transporter, keyed on the env-derived config — same rationale as the singleton
// mssql pools: reconnecting per send would burn a TLS handshake on every notification.
type GlobalWithMailer = typeof globalThis & {
  __grimoireMailer?: Transporter;
  __grimoireMailerKey?: string;
};

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const from = emailFrom();
  if (!host || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? 465);
  // Implicit TLS on 465, STARTTLS everywhere else, unless explicitly overridden.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  const key = `${host}:${port}:${secure}:${user ?? ''}`;
  const g = globalThis as GlobalWithMailer;
  if (g.__grimoireMailer && g.__grimoireMailerKey === key) return g.__grimoireMailer;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    // Gmail app passwords and most relays need auth; a LAN sink typically doesn't.
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  g.__grimoireMailer = transporter;
  g.__grimoireMailerKey = key;
  return transporter;
}

// ---------------------------------------------------------------- rendering

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The migrated copy came from Discord embeds, which used **bold** and newline-separated
// bullet lists. Honour both so the email reads like the notification it replaced.
function inlineMarkupToHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}

function stripInlineMarkup(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1');
}

// Email HTML has to carry its own inline styles — the app's design-system classes in
// globals.css are unreachable from a mail client, so the repo's "no hardcoded colors in JSX"
// rule can't apply here. Palette below mirrors the app's dark surface tokens.
const COLOR_BG = '#0f1115';
const COLOR_CARD = '#181b22';
const COLOR_BORDER = '#2a2f3a';
const COLOR_TEXT = '#e5e7eb';
const COLOR_MUTED = '#9ca3af';
const COLOR_ACCENT = '#818cf8';

function renderFieldsHtml(fields: EmailField[]): string {
  return fields
    .map(
      (f) => `
        <tr>
          <td style="padding:12px 0;border-top:1px solid ${COLOR_BORDER};">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${COLOR_MUTED};margin-bottom:4px;">${escapeHtml(f.name)}</div>
            <div style="font-size:15px;color:${COLOR_TEXT};line-height:1.5;">${inlineMarkupToHtml(f.value)}</div>
          </td>
        </tr>`,
    )
    .join('');
}

function renderHtml(payload: AppEmailPayload, trackingId: string, unsubscribeUrl: string): string {
  const fields = payload.fields?.length ? renderFieldsHtml(payload.fields) : '';
  const cta =
    payload.ctaUrl && payload.ctaLabel
      ? `<tr><td style="padding-top:20px;">
           <a href="${escapeHtml(payload.ctaUrl)}" style="display:inline-block;padding:10px 18px;background:${COLOR_ACCENT};color:#0f1115;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(payload.ctaLabel)}</a>
         </td></tr>`
      : '';
  const intro = payload.intro
    ? `<tr><td style="padding-bottom:8px;font-size:15px;line-height:1.6;color:${COLOR_TEXT};">${inlineMarkupToHtml(payload.intro)}</td></tr>`
    : '';
  const footerNote = payload.footerNote
    ? `<div style="margin-bottom:6px;">${escapeHtml(payload.footerNote)}</div>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${COLOR_BG};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR_BG};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};border-radius:10px;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding-bottom:12px;font-size:20px;font-weight:700;color:${COLOR_TEXT};">${escapeHtml(payload.heading)}</td>
            </tr>
            ${intro}
            ${fields}
            ${cta}
            <tr>
              <td style="padding-top:24px;margin-top:8px;border-top:1px solid ${COLOR_BORDER};font-size:12px;line-height:1.6;color:${COLOR_MUTED};">
                ${footerNote}
                <div style="margin-bottom:6px;">Tracking ID: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${COLOR_TEXT};">${escapeHtml(trackingId)}</span></div>
                <div><a href="${escapeHtml(unsubscribeUrl)}" style="color:${COLOR_ACCENT};">Unsubscribe from these emails</a></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(payload: AppEmailPayload, trackingId: string, unsubscribeUrl: string): string {
  const parts: string[] = [payload.heading, ''];
  if (payload.intro) parts.push(stripInlineMarkup(payload.intro), '');
  for (const f of payload.fields ?? []) {
    parts.push(`${f.name}:`, stripInlineMarkup(f.value), '');
  }
  if (payload.ctaUrl && payload.ctaLabel) parts.push(`${payload.ctaLabel}: ${payload.ctaUrl}`, '');
  parts.push('---');
  if (payload.footerNote) parts.push(payload.footerNote);
  parts.push(`Tracking ID: ${trackingId}`);
  parts.push(`Unsubscribe: ${unsubscribeUrl}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------- email_log

async function writeEmailLog(row: {
  trackingId: string;
  userId: string;
  recipient: string;
  kind: EmailKind;
  subject: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  messageId: string | null;
}): Promise<void> {
  try {
    const pool = await getMainConnection();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, row.trackingId)
      .input('userId', sql.UniqueIdentifier, row.userId)
      .input('recipient', sql.NVarChar(320), row.recipient)
      .input('kind', sql.VarChar(40), row.kind)
      .input('subject', sql.NVarChar(400), row.subject.slice(0, 400))
      .input('status', sql.VarChar(20), row.status)
      .input('error', sql.NVarChar(1000), row.error ? row.error.slice(0, 1000) : null)
      .input('messageId', sql.NVarChar(400), row.messageId)
      .query(
        `INSERT INTO dbo.email_log (id, user_id, recipient, kind, subject, status, error, message_id)
         VALUES (@id, @userId, @recipient, @kind, @subject, @status, @error, @messageId)`,
      );
  } catch (e) {
    // Logging the send must never be the reason a notification fails.
    console.warn(`email_log write failed for tracking id '${row.trackingId}':`, e);
  }
}

// ---------------------------------------------------------------- send

export async function sendAppEmail(payload: AppEmailPayload): Promise<EmailResult> {
  if (!UNSUBSCRIBE_KINDS.includes(payload.kind)) {
    return { ok: false, skipped: true, error: `unknown email kind '${payload.kind}'`, trackingId: null };
  }
  if (!payload.to) {
    return { ok: false, skipped: true, error: 'no recipient email on file for this user', trackingId: null };
  }
  const transporter = getTransporter();
  const from = emailFrom();
  if (!transporter || !from) {
    return {
      ok: false,
      skipped: true,
      error: 'email not configured (SMTP_HOST / EMAIL_FROM missing)',
      trackingId: null,
    };
  }

  // The tracking ID is the email_log PK, minted up front so it can be rendered into the body.
  const trackingId = randomUUID();
  const unsubscribeUrl = buildUnsubscribeUrl(payload.userId, payload.kind);
  const html = renderHtml(payload, trackingId, unsubscribeUrl);
  const text = renderText(payload, trackingId, unsubscribeUrl);

  try {
    const info = await transporter.sendMail({
      from,
      to: payload.toName ? `"${payload.toName.replace(/"/g, '')}" <${payload.to}>` : payload.to,
      subject: payload.subject,
      text,
      html,
      headers: {
        // RFC 8058: lets the mail client show a native one-click unsubscribe control. Points at
        // the API (which acts on POST), not the confirmation page in the body.
        'List-Unsubscribe': `<${buildUnsubscribeApiUrl(payload.userId, payload.kind)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Grimoire-Tracking-Id': trackingId,
        'X-Grimoire-Notification-Kind': payload.kind,
      },
    });
    await writeEmailLog({
      trackingId,
      userId: payload.userId,
      recipient: payload.to,
      kind: payload.kind,
      subject: payload.subject,
      status: 'sent',
      error: null,
      messageId: info.messageId ?? null,
    });
    return { ok: true, skipped: false, error: null, trackingId };
  } catch (e) {
    const error = `email send failed: ${(e as Error).message ?? String(e)}`;
    console.warn(error);
    await writeEmailLog({
      trackingId,
      userId: payload.userId,
      recipient: payload.to,
      kind: payload.kind,
      subject: payload.subject,
      status: 'failed',
      error,
      messageId: null,
    });
    return { ok: false, skipped: false, error, trackingId };
  }
}
