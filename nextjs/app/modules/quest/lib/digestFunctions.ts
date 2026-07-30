import { getCurrentDate, markDigestSent } from './settingsFunctions';
import { listTasks, isOccurrenceOn } from './taskFunctions';
import { ensureUserState } from './userStateFunctions';
import { getCurrentBalance } from './settingsFunctions';
import { sendAppEmail, isEmailConfigured } from '@/lib/email';
import { appBaseUrl } from '@/lib/appUrl';
import { getUserContact } from '@/lib/userContact';

// Builds and sends the Quest daily digest for a single user. Returns a structured result so the
// scheduler can log per-user outcomes and the manual debug button can surface a toast.

export interface DigestResult {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  today: string;
  // Tracking ID of the email that was sent, echoed so the debug button can show it.
  trackingId?: string | null;
}

interface DigestSummary {
  today: string;
  health: number;
  maxHealth: number;
  balance: number;
  dailiesTotal: number;
  dailiesDone: number;
  dailiesPending: string[];
  todosOpen: string[];
}

// Pulls everything needed for the email in a single pass. Pending lists stay capped — a digest is
// a nudge, not a report; the home page remains the source of truth for the full lists.
const MAX_LIST_ITEMS = 8;

async function buildSummary(userId: string): Promise<DigestSummary> {
  const today = await getCurrentDate(userId);
  const [state, balance, tasks] = await Promise.all([
    ensureUserState(userId),
    getCurrentBalance(userId),
    listTasks(userId),
  ]);

  // Dailies due today (matches home-page filtering): kind === 'daily' AND occurrence applies today.
  const todaysDailies = tasks.filter((t) => t.kind === 'daily' && isOccurrenceOn(t, today));
  const dailiesDone = todaysDailies.filter((t) => t.done_today).length;
  const dailiesPending = todaysDailies
    .filter((t) => !t.done_today)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => t.title);

  // Open todos: surfaced status === 'open'.
  const todosOpen = tasks
    .filter((t) => t.kind === 'todo' && t.status === 'open')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => t.title);

  return {
    today,
    health: Number(state.health),
    maxHealth: Number(state.max_health),
    balance: Number(balance),
    dailiesTotal: todaysDailies.length,
    dailiesDone,
    dailiesPending,
    todosOpen,
  };
}

function formatList(items: string[], cap: number): string {
  if (items.length === 0) return '_(none)_';
  const shown = items.slice(0, cap).map((t) => `• ${t.length > 80 ? t.slice(0, 77) + '…' : t}`);
  if (items.length > cap) shown.push(`…and ${items.length - cap} more`);
  return shown.join('\n');
}

export async function sendDigestForUser(
  userId: string,
  opts: { manual?: boolean; userName?: string | null; userEmail?: string | null } = {},
): Promise<DigestResult> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true, reason: 'email not configured', today: '' };
  }

  // The scheduler already joined the address while picking candidates; manual triggers haven't,
  // so fall back to a MAIN-DB lookup rather than making every caller thread it through.
  let email = opts.userEmail ?? null;
  let name = opts.userName ?? null;
  if (!email) {
    const contact = await getUserContact(userId);
    email = contact?.email ?? null;
    name = name ?? contact?.name ?? null;
  }
  if (!email) {
    return { ok: false, skipped: true, reason: 'no email address on file for user', today: '' };
  }

  const summary = await buildSummary(userId);

  const subjectPrefix = opts.manual ? '[Manual] ' : '';
  const result = await sendAppEmail({
    userId,
    to: email,
    toName: name,
    kind: 'quest-digest',
    subject: `${subjectPrefix}Quest daily digest — ${summary.today}`,
    heading: 'Quest daily digest',
    intro: `Status for **${summary.today}** — HP ${summary.health}/${summary.maxHealth} · ${summary.balance.toFixed(2)} coins`,
    fields: [
      {
        name: `Dailies (${summary.dailiesDone}/${summary.dailiesTotal})`,
        value: formatList(summary.dailiesPending, MAX_LIST_ITEMS),
      },
      {
        name: `Open todos (${summary.todosOpen.length})`,
        value: formatList(summary.todosOpen, MAX_LIST_ITEMS),
      },
    ],
    ctaUrl: `${appBaseUrl()}/modules/quest/ui/home`,
    ctaLabel: 'Open Quest',
    footerNote: 'grimoire · quest',
  });

  if (!result.ok) {
    return {
      ok: false,
      skipped: result.skipped,
      reason: result.error,
      today: summary.today,
      trackingId: result.trackingId,
    };
  }
  // Only mark as sent for scheduled (non-manual) sends — manual triggers from the debug button
  // shouldn't suppress the automatic morning digest.
  if (!opts.manual) {
    await markDigestSent(userId, summary.today);
  }
  return {
    ok: true,
    skipped: false,
    reason: null,
    today: summary.today,
    trackingId: result.trackingId,
  };
}
