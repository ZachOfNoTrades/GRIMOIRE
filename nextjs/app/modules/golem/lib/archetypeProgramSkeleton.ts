import { createProgram } from './programFunctions';
import type {
  CreateProgramPayload,
  CreateProgramBlock,
  CreateProgramWeek,
  CreateProgramSession,
} from '../types/program';

// Normalized, LLM-agnostic description of a program skeleton: blocks → weeks → archetype-tagged
// sessions, with NO exercises (the deterministic engine fills those per session later). Shared by the
// archetype-LLM path (llmArchetypeProgramFunctions) and the manual/deterministic generate-manual route.
export interface ArchetypeSkeletonDay {
  dayIndex: number; // 1..daysPerWeek — becomes the session order_index within a week
  archetypeId: string;
  archetypeName: string; // resolved name; used as the session name
}

export interface ArchetypeSkeletonBlock {
  name: string;
  order_index: number;
  tag: string | null;
  color: string | null;
  weekCount: number; // weeks in this block; each week repeats the block's day→archetype assignment
  days: ArchetypeSkeletonDay[];
}

export interface ArchetypeSkeletonInput {
  name: string;
  description: string | null;
  blocks: ArchetypeSkeletonBlock[];
}

// Builds the deterministic blocks → weeks (1..weekCount) → sessions (one per day) payload and persists
// it via createProgram. Every week in a block repeats that block's day→archetype assignment; sessions
// carry the archetype but no exercises. Returns the new program id.
export async function createProgramFromSkeleton(
  userId: string,
  input: ArchetypeSkeletonInput,
): Promise<string> {
  const blocks: CreateProgramBlock[] = input.blocks
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map((block, blockIndex) => {
      const days = block.days.slice().sort((a, b) => a.dayIndex - b.dayIndex);
      const weeks: CreateProgramWeek[] = [];

      for (let weekNumber = 1; weekNumber <= block.weekCount; weekNumber++) {
        const sessions: CreateProgramSession[] = days.map((day) => ({
          order_index: day.dayIndex,
          name: day.archetypeName,
          description: null,
          day_archetype_id: day.archetypeId,
          target_exercises: [],
        }));
        weeks.push({ week_number: weekNumber, name: null, description: null, sessions });
      }

      return {
        name: block.name,
        order_index: block.order_index ?? blockIndex + 1,
        description: null,
        tag: block.tag ?? null,
        color: block.color ?? null,
        weeks,
      };
    });

  const payload: CreateProgramPayload = {
    name: input.name,
    description: input.description ?? null,
    blocks,
  };

  return createProgram(userId, payload, null);
}
