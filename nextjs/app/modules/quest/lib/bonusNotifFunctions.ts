import { getCurrentDate, markBonusNotifSent } from './settingsFunctions';
import { listTasks } from './taskFunctions';
import { sendAppEmail, isEmailConfigured } from '@/lib/email';
import { appBaseUrl } from '@/lib/appUrl';
import { getUserContact } from '@/lib/userContact';

// Sends the "today's bonus task" email for a single user. The bonus pick itself already lives
// inside listTasks (via attachReward → pickTodayBonus / forced override), so we just surface
// whichever todo has todo_bonus_today set. If no bonus fired today the email says so rather than
// going silent — users with the notification enabled want a clear yes/no signal.

export interface BonusNotifResult {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  today: string;
  hadBonus: boolean;
  // The email that was built and sent (null on early skips before one is built). Surfaced so the
  // manual debug trigger can echo back exactly what was pushed, without opening a mailbox.
  email?: Record<string, unknown> | null;
  trackingId?: string | null;
}

export async function sendBonusNotifForUser(
  userId: string,
  opts: { manual?: boolean; userName?: string | null; always?: boolean; userEmail?: string | null } = {},
): Promise<BonusNotifResult> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true, reason: 'email not configured', today: '', hadBonus: false };
  }

  // Scheduled sends arrive with the address already joined; manual ones don't.
  let recipient = opts.userEmail ?? null;
  let name = opts.userName ?? null;
  if (!recipient) {
    const contact = await getUserContact(userId);
    recipient = contact?.email ?? null;
    name = name ?? contact?.name ?? null;
  }
  if (!recipient) {
    return {
      ok: false,
      skipped: true,
      reason: 'no email address on file for user',
      today: '',
      hadBonus: false,
    };
  }

  const [today, tasks] = await Promise.all([getCurrentDate(userId), listTasks(userId)]);
  const bonus = tasks.find((t) => t.todo_bonus_today);

  // Default behaviour for scheduled sends is to skip on no-bonus days; the user opts in to
  // every-day pings via `always`. Manual debug sends always go through so the user can verify
  // the notification path even on dry days. We still stamp today on a skip so the scheduler
  // doesn't re-evaluate this user every tick until midnight.
  if (!opts.manual && !opts.always && !bonus) {
    await markBonusNotifSent(userId, today);
    return { ok: true, skipped: true, reason: 'no bonus today', today, hadBonus: false };
  }

  // Don't ping about a bonus the user has already completed — that's just noise, mirroring the
  // reminder leg which suppresses fires once the task is done today. Manual debug sends still go
  // through so the notification path stays verifiable. We stamp today on the skip so the scheduler
  // doesn't re-evaluate this user every tick until midnight.
  if (!opts.manual && bonus && bonus.status === 'done') {
    await markBonusNotifSent(userId, today);
    return { ok: true, skipped: true, reason: 'bonus already completed', today, hadBonus: true };
  }

  const subjectPrefix = opts.manual ? '[Manual] ' : '';

  // Truncated task title, reused in both the lead paragraph and the field. Mail clients preview
  // the subject and the first line of the body but not the detail rows, so the bonus task name
  // has to live in the intro for the user to know which todo it is without opening the message.
  const bonusTitle = bonus
    ? bonus.title.length > 200 ? `${bonus.title.slice(0, 197)}…` : bonus.title
    : '';
  const bonusMultiplier = bonus ? Number(bonus.todo_bonus_multiplier ?? 1).toFixed(2) : '';

  const fields = bonus
    ? [
        { name: 'Bonus task', value: bonusTitle, inline: false },
        { name: 'Multiplier', value: `${bonusMultiplier}x`, inline: true },
        { name: 'Reward', value: `${Number(bonus.reward_value).toFixed(2)} coins`, inline: true },
        { name: 'Status', value: bonus.status === 'done' ? 'Completed' : 'Open', inline: true },
      ]
    : [{ name: 'No bonus today', value: 'The daily roll didn’t land a bonus on any todo.', inline: false }];

  const intro = bonus
    ? `Today (**${today}**) **${bonusTitle}** is paying a ${bonusMultiplier}x bonus.`
    : `Status for **${today}** — no bonus task rolled today.`;

  const subject = bonus
    ? `${subjectPrefix}Quest bonus task — ${bonusTitle}`
    : `${subjectPrefix}Quest bonus task — none today (${today})`;

  const emailPayload = {
    userId,
    to: recipient,
    toName: name,
    kind: 'quest-bonus' as const,
    subject,
    heading: 'Quest bonus task',
    intro,
    fields,
    ctaUrl: `${appBaseUrl()}/modules/quest/ui/home`,
    ctaLabel: 'Open Quest',
    footerNote: 'grimoire · quest',
  };

  const res = await sendAppEmail(emailPayload);
  if (!res.ok) {
    return {
      ok: false,
      skipped: res.skipped,
      reason: res.error,
      today,
      hadBonus: Boolean(bonus),
      email: emailPayload,
      trackingId: res.trackingId,
    };
  }
  if (!opts.manual) {
    await markBonusNotifSent(userId, today);
  }
  return {
    ok: true,
    skipped: false,
    reason: null,
    today,
    hadBonus: Boolean(bonus),
    email: emailPayload,
    trackingId: res.trackingId,
  };
}
