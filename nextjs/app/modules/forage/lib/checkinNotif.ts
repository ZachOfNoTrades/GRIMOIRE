// Builds + sends the Forage weekly check-in reminder as an email to the user's own address.
// Used by both the in-process scheduler (checkinScheduler.ts) and the manual "send test"
// endpoint so the message stays identical.

import { sendAppEmail, isEmailConfigured, EmailResult, AppEmailPayload } from '@/lib/email';
import { appBaseUrl } from '@/lib/appUrl';
import { getUserContact } from '@/lib/userContact';
import { lastCheckInOccurrence, todayIsoUtc } from './program';

// check_in_weekday is 1=Mon..7=Sun (matches lib/program.ts ISO weekday math).
const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

// The scheduler keeps firing this reminder on every day after a missed check-in
// (see checkinScheduler.ts), so the field can't always name the configured weekday
// as if it were "today" — on a late day that reads as wrong (e.g. "Check-in day:
// Friday" showing up on a Monday). Label it as still-pending only on the actual
// check-in day; otherwise frame it as overdue, day-agnostically.
export function buildCheckinEmail(
  weekday: number | null,
  recipient: { userId: string; email: string; name: string | null },
): AppEmailPayload {
  const dayLabel = weekday != null ? WEEKDAY_LABELS[weekday] ?? null : null;
  const today = todayIsoUtc();
  const isToday = weekday != null && lastCheckInOccurrence(weekday, today) === today;
  const fields = dayLabel
    ? [{ name: isToday ? 'Check-in day' : 'Was due', value: dayLabel, inline: true }]
    : undefined;

  return {
    userId: recipient.userId,
    to: recipient.email,
    toName: recipient.name,
    kind: 'forage-checkin',
    subject: isToday ? 'Forage check-in ready' : 'Forage check-in overdue',
    heading: '🍎 Forage check-in ready',
    intro:
      'Time for your weekly strategy check-in. Log your latest weight and open Forage to recalculate your targets.',
    fields,
    ctaUrl: `${appBaseUrl()}/modules/forage/ui/strategy`,
    ctaLabel: 'Open Forage strategy',
    footerNote: 'Forage · Strategy',
  };
}

export async function sendCheckinReminder(
  userId: string,
  weekday: number | null,
  opts: { userEmail?: string | null; userName?: string | null } = {},
): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true, error: 'email not configured', trackingId: null };
  }

  // Forage settings live in their own DB and don't carry the address, so resolve it here unless
  // the caller already has one.
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
      error: 'no email address on file for user',
      trackingId: null,
    };
  }

  return sendAppEmail(buildCheckinEmail(weekday, { userId, email, name }));
}
