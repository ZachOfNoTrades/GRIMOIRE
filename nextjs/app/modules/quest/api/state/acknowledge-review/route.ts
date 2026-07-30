import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  acknowledgeReview,
  ensureUserState,
  setReviewCompletionCache,
} from '../../../lib/userStateFunctions';
import { completeTask, toggleSubtask } from '../../../lib/taskFunctions';

export async function POST(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    let forDate: string | undefined;
    let completedTaskIds: string[] = [];
    let completedSubtasks: { taskId: string; subtaskId: string }[] = [];
    try {
      const body = await request.json();
      if (body && typeof body.forDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.forDate)) {
        forDate = body.forDate;
      }
      if (body && Array.isArray(body.completedTaskIds)) {
        completedTaskIds = body.completedTaskIds.filter((v: unknown) => typeof v === 'string');
      }
      if (body && Array.isArray(body.completedSubtasks)) {
        completedSubtasks = body.completedSubtasks.filter(
          (v: unknown): v is { taskId: string; subtaskId: string } =>
            !!v && typeof (v as { taskId: unknown }).taskId === 'string'
                && typeof (v as { subtaskId: unknown }).subtaskId === 'string'
        );
      }
    } catch {
      // empty body — proceed with no backdated completions
    }

    // Apply any backdated completions the user committed in the review modal BEFORE the damage
    // check runs. Each completion is a separate transaction; aggregate awards for the client.
    // Subtask completions run BEFORE parent completions — completeTask clears subtasks to done=0
    // when a daily parent completes, which would wipe out the subtask work the user just credited.
    let totalAwarded = 0;
    const completedResults: { id: string; awarded: number }[] = [];
    for (const { taskId, subtaskId } of completedSubtasks) {
      const subResult = await toggleSubtask(session.user.id!, taskId, subtaskId, true);
      if (subResult) totalAwarded += subResult.delta;
    }
    if (forDate && completedTaskIds.length > 0) {
      for (const taskId of completedTaskIds) {
        const result = await completeTask(session.user.id!, taskId, { forDate });
        if (result) {
          totalAwarded += result.awarded;
          completedResults.push({ id: taskId, awarded: result.awarded });
        }
      }
    }

    const damage = await acknowledgeReview(session.user.id!);
    const state = await ensureUserState(session.user.id!);

    // Cache the user's selections so a debug clearTodayReview can re-pop the modal with the
    // same checkboxes filled in. Only meaningful when we have a forDate to key against — a
    // missing forDate means the request didn't actually reference a review day.
    if (forDate) {
      await setReviewCompletionCache(session.user.id!, forDate, completedTaskIds, completedSubtasks);
    }

    return NextResponse.json({ state, damage, totalAwarded, completedResults });
  } catch (error) {
    console.error('Error in POST /quest/api/state/acknowledge-review:', error);
    return NextResponse.json({ error: 'Failed to acknowledge review' }, { status: 500 });
  }
}
