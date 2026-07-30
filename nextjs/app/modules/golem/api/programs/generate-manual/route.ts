import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDayArchetypes } from '../../../lib/dayArchetypeFunctions';
import { createProgramFromSkeleton } from '../../../lib/archetypeProgramSkeleton';
import type { ArchetypeSkeletonBlock } from '../../../lib/archetypeProgramSkeleton';

// Manual, fully deterministic program creation — NO LLM. The client supplies the block/week structure
// and hand-assigns an existing day archetype to each training day; we build the skeleton and persist it.
// Synchronous (just DB inserts), so it returns the new program id directly rather than a polling job.
// Not rate-limited / not logged against the generation quota — no LLM call is made.

interface ManualDayInput {
  dayIndex: number;
  archetypeId: string;
}

interface ManualBlockInput {
  name: string;
  weekCount: number;
  days: ManualDayInput[];
}

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const name: string = typeof body?.name === 'string' ? body.name.trim() : '';
    const description: string | null =
      typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null;
    const blocks: ManualBlockInput[] = Array.isArray(body?.blocks) ? body.blocks : [];

    // VALIDATE — name + at least one block.
    if (!name) {
      return NextResponse.json({ error: 'Program name is required' }, { status: 400 });
    }
    if (blocks.length === 0) {
      return NextResponse.json({ error: 'At least one block is required' }, { status: 400 });
    }

    // The user's archetype library — used to validate ownership and resolve each day's session name.
    const archetypes = await getDayArchetypes(userId!);
    const archetypeNameById = new Map(archetypes.map((a) => [a.id, a.name]));

    // Determine the expected day count from the first block; every block must match it.
    const daysPerWeek = blocks[0].days?.length ?? 0;
    if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
      return NextResponse.json({ error: 'Each block must have between 1 and 7 training days' }, { status: 400 });
    }

    // VALIDATE each block + day, building the normalized skeleton input as we go.
    const skeletonBlocks: ArchetypeSkeletonBlock[] = [];
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      const blockName = typeof block?.name === 'string' && block.name.trim() ? block.name.trim() : `Block ${blockIndex + 1}`;
      const weekCount = Number(block?.weekCount);
      if (!Number.isInteger(weekCount) || weekCount < 1) {
        return NextResponse.json({ error: `Block '${blockName}' must have at least 1 week` }, { status: 400 });
      }
      const days = Array.isArray(block?.days) ? block.days : [];
      if (days.length !== daysPerWeek) {
        return NextResponse.json(
          { error: `Block '${blockName}' must have ${daysPerWeek} training days to match the program` },
          { status: 400 },
        );
      }

      const skeletonDays = days.map((day, dayIndex) => {
        const archetypeId = typeof day?.archetypeId === 'string' ? day.archetypeId : '';
        const archetypeName = archetypeNameById.get(archetypeId);
        if (!archetypeName) {
          // Either missing or not one of the user's archetypes — surfaced as a 404 below via throw.
          throw new Error(`No day archetype found for id: '${archetypeId}'`);
        }
        return { dayIndex: dayIndex + 1, archetypeId, archetypeName };
      });

      skeletonBlocks.push({
        name: blockName,
        order_index: blockIndex + 1,
        tag: null,
        color: null,
        weekCount,
        days: skeletonDays,
      });
    }

    const programId = await createProgramFromSkeleton(userId!, { name, description, blocks: skeletonBlocks });

    return NextResponse.json({ id: programId }, { status: 200 });
  } catch (error: any) {
    if (error?.message?.includes('No day archetype found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error in POST /api/programs/generate-manual:', error);
    return NextResponse.json({ error: 'Failed to create program' }, { status: 500 });
  }
}
