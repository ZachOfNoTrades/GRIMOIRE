Design the sessions for the first week of a training program.

## Schema

interface SessionPlan {
order_index: number; // Sequential starting at 1
name: string; // Descriptive session name (e.g., "Heavy Squat + Accessories")
description: string; // 2-4 sentences: primary focus, accessory categories, intensity guidance
}

// Your response: SessionPlan[]

## Schedule

- **Week ID**: {{WEEK_ID}}
- **Days per week**: {{DAYS_PER_WEEK}}

## Historical Context

Before designing sessions, use the SQL Query skill to gather relevant context. The week ID above can be used to find the block, program, and preceding weeks. Consider querying:

1. **Block and program context** — The current block's tag/description and program description to understand the training phase.
2. **Previous week's sessions** — Session names, descriptions, and analyses from the most recent completed week in the same program. Analyses contain objective observations about performance trends, injury concerns, and warmup compliance that should inform the next week's plan.
3. **Volume and frequency trends** — Which muscle groups and exercises have been trained recently, to maintain appropriate distribution.

## Rules

1. Return exactly {{DAYS_PER_WEEK}} session plans.
2. Session names should be concise and reflect the primary focus.
3. Descriptions should be robust and explain session goals.
4. order_index starts at 1 and increments sequentially.
5. The response must be a JSON array of SessionPlan objects — nothing else.
6. Do not recommend exercises that are disabled (`is_disabled = 1` in the exercises table). If referencing specific exercises in session names or descriptions, verify they are enabled.

{{TEMPLATE_CONTEXT}}

{{PROFILE_CONTEXT}}
