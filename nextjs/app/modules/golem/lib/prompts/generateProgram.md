Generate a structured workout program as a JSON object. Create the program structure only — blocks and weeks. Sessions and exercises are generated separately.

## Schema

interface CreateProgramWeek {
week_number: number; // Sequential starting at 1 within the block
name: string | null; // Optional week name (e.g., "Deload")
description: string | null;
}

interface CreateProgramBlock {
name: string; // Block name (e.g., "Hypertrophy Phase", "Strength Phase")
order_index: number; // Sequential starting at 1
description: string | null;
tag: string | null; // Short label (e.g., "Hypertrophy", "Strength", "Deload")
color: string | null; // Hex color code (e.g., "#3B82F6")
weeks: CreateProgramWeek[];
}

interface CreateProgramPayload {
name: string; // Program name
description: string | null;
blocks: CreateProgramBlock[];
}

## Rules

1. The file must be a single JSON object matching CreateProgramPayload — nothing else.
2. Each block must have at least one week.
3. week_number starts at 1 and increments sequentially within each block.
4. Use descriptive block names and appropriate tags.

{{TEMPLATE_CONTEXT}}

{{PROFILE_CONTEXT}}
