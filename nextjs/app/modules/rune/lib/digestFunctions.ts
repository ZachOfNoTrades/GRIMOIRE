import sql from 'mssql';
import { getRuneConnection } from './db';
import { markDigestSent } from './settingsFunctions';
import { sendAppEmail, isEmailConfigured } from '@/lib/email';
import { appBaseUrl } from '@/lib/appUrl';
import { getUserContact } from '@/lib/userContact';

// Builds and sends the Rune daily review notification for a single user. Mirrors the Quest digest
// pipeline: a single buildSummary pass, an email to the user's own address, and a per-user dedupe
// stamp written only for non-manual sends.

export interface DigestResult {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  today: string;
  dueCount: number;
  newCount: number;
  trackingId?: string | null;
}

interface DeckDue {
  deckId: string;
  name: string;
  dueCount: number;
}

interface DigestSummary {
  today: string;
  dueCount: number;
  newCount: number;
  deckCount: number;
  deckBreakdown: DeckDue[];
}

const MAX_DECKS_LISTED = 8;

function calendarToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function buildSummary(userId: string): Promise<DigestSummary> {
  const pool = await getRuneConnection();

  // Cards due now, grouped by deck. Excludes archived decks, decks the user has disabled
  // (paused decks are never nagged about) and disabled cards.
  const dueRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ deck_id: string; name: string; due_count: number }>(
      `SELECT d.id AS deck_id, d.name, COUNT(*) AS due_count
       FROM card_progress cp
       JOIN cards c ON c.id = cp.card_id AND c.is_disabled = 0
       JOIN decks d ON d.id = c.deck_id AND d.is_archived = 0 AND d.is_disabled = 0
       WHERE cp.user_id = @userId AND cp.next_review_at <= GETDATE()
       GROUP BY d.id, d.name
       ORDER BY due_count DESC`
    );

  // New (never-reviewed) cards across non-archived, non-disabled decks.
  const newRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ new_count: number }>(
      `SELECT COUNT(*) AS new_count
       FROM cards c
       JOIN decks d ON d.id = c.deck_id AND d.is_archived = 0 AND d.is_disabled = 0
       LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId -- a sharee's review must not mark the owner's card as seen
       WHERE c.user_id = @userId AND c.is_disabled = 0 AND cp.id IS NULL`
    );

  const deckBreakdown: DeckDue[] = dueRes.recordset.map((r) => ({
    deckId: r.deck_id,
    name: r.name,
    dueCount: Number(r.due_count),
  }));
  const dueCount = deckBreakdown.reduce((acc, d) => acc + d.dueCount, 0);
  const newCount = Number(newRes.recordset[0]?.new_count ?? 0);

  return {
    today: calendarToday(),
    dueCount,
    newCount,
    deckCount: deckBreakdown.length,
    deckBreakdown,
  };
}

function formatDeckList(decks: DeckDue[], cap: number): string {
  if (decks.length === 0) return '_(none)_';
  const shown = decks.slice(0, cap).map((d) => {
    const name = d.name.length > 80 ? d.name.slice(0, 77) + '…' : d.name;
    return `• ${name} — ${d.dueCount}`;
  });
  if (decks.length > cap) shown.push(`…and ${decks.length - cap} more`);
  return shown.join('\n');
}

export async function sendDigestForUser(
  userId: string,
  opts: { manual?: boolean; userName?: string | null; userEmail?: string | null } = {},
): Promise<DigestResult> {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      skipped: true,
      reason: 'email not configured',
      today: '',
      dueCount: 0,
      newCount: 0,
    };
  }

  // The scheduler joins the address while picking candidates; manual triggers don't.
  let email = opts.userEmail ?? null;
  let name = opts.userName ?? null;
  if (!email) {
    const contact = await getUserContact(userId);
    email = contact?.email ?? null;
    name = name ?? contact?.name ?? null;
  }
  if (!email) {
    return {
      ok: false,
      skipped: true,
      reason: 'no email address on file for user',
      today: '',
      dueCount: 0,
      newCount: 0,
    };
  }

  const summary = await buildSummary(userId);

  // Nothing to study: skip the email but still mark sent (for non-manual) so the scheduler
  // doesn't re-check every minute for the rest of today.
  if (!opts.manual && summary.dueCount === 0 && summary.newCount === 0) {
    await markDigestSent(userId, summary.today);
    return {
      ok: true,
      skipped: true,
      reason: 'nothing due',
      today: summary.today,
      dueCount: 0,
      newCount: 0,
    };
  }

  const subjectPrefix = opts.manual ? '[Manual] ' : '';
  const res = await sendAppEmail({
    userId,
    to: email,
    toName: name,
    kind: 'rune-digest',
    subject: `${subjectPrefix}Rune daily review — ${summary.dueCount} due, ${summary.newCount} new`,
    heading: 'Rune daily review',
    intro: `**${summary.dueCount}** cards due · **${summary.newCount}** new · across **${summary.deckCount}** deck${summary.deckCount === 1 ? '' : 's'}`,
    fields: [
      {
        name: `Due by deck (${summary.deckBreakdown.length})`,
        value: formatDeckList(summary.deckBreakdown, MAX_DECKS_LISTED),
      },
    ],
    ctaUrl: `${appBaseUrl()}/modules/rune/ui/decks`,
    ctaLabel: 'Open Rune',
    footerNote: 'grimoire · rune',
  });

  if (!res.ok) {
    return {
      ok: false,
      skipped: res.skipped,
      reason: res.error,
      today: summary.today,
      dueCount: summary.dueCount,
      newCount: summary.newCount,
      trackingId: res.trackingId,
    };
  }

  if (!opts.manual) {
    await markDigestSent(userId, summary.today);
  }
  return {
    ok: true,
    skipped: false,
    reason: null,
    today: summary.today,
    dueCount: summary.dueCount,
    newCount: summary.newCount,
    trackingId: res.trackingId,
  };
}
