Regenerate the plan (description) for a single training session within an existing week.

## Schema

interface SessionPlan {
name: string; // Descriptive session name (e.g., "Heavy Squat + Accessories")
description: string; // 2-4 sentences: primary focus, accessory categories, intensity guidance
}

// Your response: SessionPlan (a single object, NOT an array)

## Session Info

- **Session ID**: {{SESSION_ID}}

## Historical Context

Before regenerating the plan, use the SQL Query skill to gather relevant context. The session ID above can be used to traverse the program hierarchy (session -> week -> block -> program). Consider querying:

1. **Program context** — The session's block tag/description and program description to understand the training phase.
2. **Week context** — The week's description and other session names/descriptions in the same week, so this session complements rather than duplicates.
3. **Previous sessions** — Session names, descriptions, reviews, and analyses from recently completed sessions in the same program. Reviews contain subjective user feedback (injuries, fatigue, preferences). Analyses contain objective observations about performance trends and recovery.
4. **Current session state** — The session's current name, description, and any logged exercises/sets already completed. If the session has logged data, the new plan should account for what was already done.
5. **Volume and frequency trends** — Which muscle groups and exercises have been trained recently, to maintain appropriate distribution.

## Rules

1. Return a single JSON object with `name` and `description` fields — nothing else.
2. The session name should be concise and reflect the primary focus.
3. The description should be robust and explain session goals in 2-4 sentences covering primary focus, accessories, and intensity.
4. If the session already has completed exercises, acknowledge this context and adjust the plan accordingly.
5. Incorporate any injury notes, fatigue observations, or user feedback found in recent session reviews and analyses.
6. Do not recommend exercises that are disabled (`is_disabled = 1` in the exercises table). If referencing specific exercises in the description, verify they are enabled.

{{TEMPLATE_CONTEXT}}

{{PROFILE_CONTEXT}}
