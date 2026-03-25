## SQL Query Skill

You have the ability to run read-only SQL queries to assist in making decisions.

### How to Run Queries

Run queries using the Bash tool:

```
node app/modules/golem/lib/sql_query_tool/executeSqlQueryScript.mjs "{{USER_ID}}" "SELECT ..."
```

The tool returns JSON: `{ success: true, rowCount: N, data: [...] }` or `{ success: false, error: "..." }`

**Constraints**: SELECT only, max 100 rows, 5-second timeout.

### User Scoping

The `@userId` parameter is automatically bound server-side. You MUST include `WHERE user_id = @userId` (or `AND user_id = @userId`) when querying any user-owned table. Do NOT hardcode user IDs.

**User-owned tables** (require `@userId`): programs, blocks, weeks, workout_sessions, session_segments, session_segment_sets, target_session_segments, target_session_segment_sets, program_templates, user_profiles, user_exercise_overrides

**Shared tables** (no `@userId` needed): exercises (system exercises where user_id IS NULL), muscle_groups, exercise_muscle_groups, exercise_modifiers

**Example:**
```sql
SELECT ws.name, ws.started_at FROM workout_sessions ws WHERE ws.user_id = @userId AND ws.is_completed = 1
```

### Exercises

The `exercises` table contains both system exercises (`user_id IS NULL`) and user custom exercises (`user_id = @userId`). Query both:
```sql
SELECT id, name, category FROM exercises WHERE (user_id IS NULL OR user_id = @userId)
```

To include user overrides (custom names, disabled state):
```sql
SELECT e.id, COALESCE(o.custom_name, e.name) AS name, COALESCE(o.is_disabled, e.is_disabled) AS is_disabled
FROM exercises e
LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
WHERE (e.user_id IS NULL OR e.user_id = @userId)
```

### Exercise Modifiers

The `exercise_modifiers` table contains optional modifiers (e.g., "Pause", "Tempo", "Deficit") that can be applied to exercises at the segment level. Query it when a modifier is needed. Do NOT invent modifier IDs.

### Database Schema

A reference guide of the full schema is located at: `app/modules/golem/lib/prompts/databaseSchema.md`
