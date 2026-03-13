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
2. **Previous week's sessions** — Session names and descriptions from the most recent completed week in the same program. Analyses may also be available but treat them with caution — only act on analyses that mention a specific injury or pain. Ignore any analysis observations about adherence, compliance, skipped exercises, warmup completion, session duration, or exercise ordering.
3. **Volume and frequency trends** — Which muscle groups and exercises have been trained recently, to maintain appropriate distribution.

## Rules

1. Return exactly {{DAYS_PER_WEEK}} session plans.
2. Session names should be concise and reflect the primary focus.
3. Descriptions should be robust and explain session goals.
4. order_index starts at 1 and increments sequentially.
5. The response must be a JSON array of SessionPlan objects — nothing else.
6. **Disabled exercises are strictly off-limits.** Before writing any session name or description, query the exercises table and filter out rows where `is_disabled = 1`. Never mention a disabled exercise by name — not in session names, descriptions, or as suggested alternatives. Only reference exercises you have confirmed are enabled.
7. **Maintain prescribed volume and scope.** Do not reduce the number of exercises, sets, or session scope based on session duration, skipped exercises, or perceived adherence issues. Do not assume that incomplete or skipped segments mean the user ran out of time — exercises may be skipped for any reason. Do not reorder, front-load, or deprioritize exercises based on completion patterns. Only reduce scope when there is an explicit injury or pain concern. When in doubt, keep volume consistent with the program's established pattern.

{{TEMPLATE_CONTEXT}}

{{PROFILE_CONTEXT}}
