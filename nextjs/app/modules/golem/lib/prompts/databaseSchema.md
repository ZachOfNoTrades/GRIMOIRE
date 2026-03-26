## Database Schema Reference (T-SQL / MSSQL)

Use this schema to write SELECT queries against the workout tracking database.

**IMPORTANT:** All user-owned tables have a `user_id` column. You MUST filter by `WHERE user_id = @userId` on these tables. The `@userId` parameter is bound server-side — never hardcode user IDs.

### exercises

System exercises have `user_id = NULL` (shared). User custom exercises have `user_id` set. Always query both: `WHERE (e.user_id IS NULL OR e.user_id = @userId)`.

| Column      | Type                  | Notes                                                   |
| ----------- | --------------------- | ------------------------------------------------------- |
| id          | UNIQUEIDENTIFIER (PK) |                                                         |
| user_id     | UNIQUEIDENTIFIER      | NULL = system exercise, non-null = user custom exercise |
| name        | NVARCHAR(255)         | Unique per user (system exercises unique globally)      |
| description | NVARCHAR(MAX)         |                                                         |
| category    | NVARCHAR(50)          | 'Strength', 'Cardio', or 'Mobility'                     |
| is_timed    | BIT                   | 1 = timed exercise (uses time_seconds instead of reps)  |
| is_disabled | BIT                   | 0 = active, 1 = disabled                                |
| created_at  | DATETIME2             |                                                         |
| modified_at | DATETIME2             |                                                         |

### user_exercise_overrides

Per-user overrides for system exercises (custom name, description, disabled state).

| Column             | Type                              | Notes                              |
| ------------------ | --------------------------------- | ---------------------------------- |
| id                 | UNIQUEIDENTIFIER (PK)             |                                    |
| user_id            | UNIQUEIDENTIFIER                  | Required — filter by `@userId`     |
| exercise_id        | UNIQUEIDENTIFIER (FK → exercises) |                                    |
| custom_name        | NVARCHAR(255)                     | Nullable — overrides exercise name |
| custom_description | NVARCHAR(MAX)                     | Nullable — overrides description   |
| is_disabled        | BIT                               | Overrides exercise disabled state  |
| created_at         | DATETIME2                         |                                    |
| modified_at        | DATETIME2                         |                                    |

Unique constraint on (user_id, exercise_id).

**To query exercises with user overrides applied:**

```sql
SELECT e.id, COALESCE(o.custom_name, e.name) AS name,
       COALESCE(o.custom_description, e.description) AS description,
       COALESCE(o.is_disabled, e.is_disabled) AS is_disabled,
       e.category, e.is_timed
FROM exercises e
LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
WHERE (e.user_id IS NULL OR e.user_id = @userId)
  AND COALESCE(o.is_disabled, e.is_disabled) = 0
```

### muscle_groups (shared — no user_id)

| Column      | Type                  | Notes  |
| ----------- | --------------------- | ------ |
| id          | UNIQUEIDENTIFIER (PK) |        |
| name        | NVARCHAR(100)         | Unique |
| created_at  | DATETIME2             |        |
| modified_at | DATETIME2             |        |

### exercise_muscle_groups (shared — no user_id)

Links exercises to muscle groups (many-to-many).

| Column          | Type                                  | Notes                            |
| --------------- | ------------------------------------- | -------------------------------- |
| id              | UNIQUEIDENTIFIER (PK)                 |                                  |
| exercise_id     | UNIQUEIDENTIFIER (FK → exercises)     |                                  |
| muscle_group_id | UNIQUEIDENTIFIER (FK → muscle_groups) |                                  |
| is_primary      | BIT                                   | 1 = primary mover, 0 = secondary |
| created_at      | DATETIME2                             |                                  |
| modified_at     | DATETIME2                             |                                  |

Unique constraint on (exercise_id, muscle_group_id).

### exercise_modifiers (shared — no user_id)

Optional modifiers that can be applied to exercises at the segment level (e.g., "Pause", "Tempo", "Deficit").

| Column      | Type                  | Notes  |
| ----------- | --------------------- | ------ |
| id          | UNIQUEIDENTIFIER (PK) |        |
| name        | NVARCHAR(100)         | Unique |
| created_at  | DATETIME2             |        |
| modified_at | DATETIME2             |        |

### program_templates

| Column          | Type                  | Notes                                   |
| --------------- | --------------------- | --------------------------------------- |
| id              | UNIQUEIDENTIFIER (PK) |                                         |
| user_id         | UNIQUEIDENTIFIER      | Required — filter by `@userId`          |
| name            | NVARCHAR(255)         |                                         |
| description     | NVARCHAR(MAX)         |                                         |
| program_prompt  | NVARCHAR(MAX)         | Prompt context for program structure    |
| week_prompt     | NVARCHAR(MAX)         | Prompt context for weekly session plans |
| session_prompt  | NVARCHAR(MAX)         | Prompt context for session exercises    |
| analysis_prompt | NVARCHAR(MAX)         | Prompt context for session analysis     |
| days_per_week   | INT                   | Default 4                               |
| created_at      | DATETIME2             |                                         |
| modified_at     | DATETIME2             |                                         |

### user_profiles

| Column         | Type                  | Notes                        |
| -------------- | --------------------- | ---------------------------- |
| id             | UNIQUEIDENTIFIER (PK) |                              |
| user_id        | UNIQUEIDENTIFIER      | Required — unique per user   |
| profile_prompt | NVARCHAR(MAX)         | User profile context for LLM |
| created_at     | DATETIME2             |                              |
| modified_at    | DATETIME2             |                              |

### programs

| Column       | Type                                      | Notes                          |
| ------------ | ----------------------------------------- | ------------------------------ |
| id           | UNIQUEIDENTIFIER (PK)                     |                                |
| user_id      | UNIQUEIDENTIFIER                          | Required — filter by `@userId` |
| name         | NVARCHAR(255)                             |                                |
| description  | NVARCHAR(MAX)                             |                                |
| template_id  | UNIQUEIDENTIFIER (FK → program_templates) | Nullable                       |
| is_current   | BIT                                       | 1 = currently active program   |
| is_completed | BIT                                       | 1 = finished                   |
| is_archived  | BIT                                       | 1 = archived                   |
| created_at   | DATETIME2                                 |                                |
| modified_at  | DATETIME2                                 |                                |

### blocks

A block is a training phase within a program (e.g., Hypertrophy, Peaking, Deload).

| Column      | Type                             | Notes                                     |
| ----------- | -------------------------------- | ----------------------------------------- |
| id          | UNIQUEIDENTIFIER (PK)            |                                           |
| user_id     | UNIQUEIDENTIFIER                 | Required — filter by `@userId`            |
| program_id  | UNIQUEIDENTIFIER (FK → programs) |                                           |
| name        | NVARCHAR(255)                    |                                           |
| order_index | INT                              | Position within the program               |
| description | NVARCHAR(MAX)                    |                                           |
| tag         | NVARCHAR(100)                    | Short label, e.g. "Hypertrophy", "Deload" |
| color       | NVARCHAR(7)                      | Hex color, e.g. "#3B82F6"                 |
| is_current  | BIT                              | 1 = currently active                      |
| created_at  | DATETIME2                        |                                           |
| modified_at | DATETIME2                        |                                           |

### weeks

| Column      | Type                           | Notes                          |
| ----------- | ------------------------------ | ------------------------------ |
| id          | UNIQUEIDENTIFIER (PK)          |                                |
| user_id     | UNIQUEIDENTIFIER               | Required — filter by `@userId` |
| block_id    | UNIQUEIDENTIFIER (FK → blocks) |                                |
| week_number | INT                            | Week number within the block   |
| name        | NVARCHAR(255)                  |                                |
| description | NVARCHAR(MAX)                  |                                |
| is_current  | BIT                            | 1 = currently active           |
| created_at  | DATETIME2                      |                                |
| modified_at | DATETIME2                      |                                |

### workout_sessions

| Column       | Type                          | Notes                                              |
| ------------ | ----------------------------- | -------------------------------------------------- |
| id           | UNIQUEIDENTIFIER (PK)         |                                                    |
| user_id      | UNIQUEIDENTIFIER              | Required — filter by `@userId`                     |
| week_id      | UNIQUEIDENTIFIER (FK → weeks) | Nullable (standalone sessions)                     |
| order_index  | INT                           | Position within the week                           |
| name         | NVARCHAR(255)                 |                                                    |
| description  | NVARCHAR(MAX)                 | Session description/goals                          |
| started_at   | DATETIME2                     | When the session was physically started            |
| resumed_at   | DATETIME2                     | When a completed session was most recently resumed |
| duration     | INT                           | Accumulated duration in seconds                    |
| is_current   | BIT                           | 1 = currently active                               |
| is_completed | BIT                           | 1 = finished                                       |
| review       | NVARCHAR(MAX)                 | User-written post-session review (nullable)        |
| analysis     | NVARCHAR(MAX)                 | LLM-generated session analysis (nullable)          |
| created_at   | DATETIME2                     |                                                    |
| modified_at  | DATETIME2                     |                                                    |

### target_session_segments

Prescribed exercises for a session (the plan before execution).

| Column      | Type                                       | Notes                                               |
| ----------- | ------------------------------------------ | --------------------------------------------------- |
| id          | UNIQUEIDENTIFIER (PK)                      |                                                     |
| user_id     | UNIQUEIDENTIFIER                           | Required — filter by `@userId`                      |
| session_id  | UNIQUEIDENTIFIER (FK → workout_sessions)   |                                                     |
| exercise_id | UNIQUEIDENTIFIER (FK → exercises)          |                                                     |
| modifier_id | UNIQUEIDENTIFIER (FK → exercise_modifiers) | Nullable; optional modifier applied to the exercise |
| order_index | INT                                        | Exercise order within the session                   |
| is_warmup   | BIT                                        | 1 = warmup/mobility exercise, 0 = working exercise  |
| created_at  | DATETIME2                                  |                                                     |
| modified_at | DATETIME2                                  |                                                     |

### target_session_segment_sets

Prescribed sets within a target segment.

| Column                    | Type                                            | Notes                                 |
| ------------------------- | ----------------------------------------------- | ------------------------------------- |
| id                        | UNIQUEIDENTIFIER (PK)                           |                                       |
| user_id                   | UNIQUEIDENTIFIER                                | Required — filter by `@userId`        |
| target_session_segment_id | UNIQUEIDENTIFIER (FK → target_session_segments) |                                       |
| set_number                | INT                                             |                                       |
| is_warmup                 | BIT                                             |                                       |
| reps                      | INT                                             |                                       |
| weight                    | DECIMAL(6,1)                                    | Pounds                                |
| rpe                       | DECIMAL(3,1)                                    | Rate of perceived exertion (nullable) |
| time_seconds              | INT                                             | For timed exercises (nullable)        |
| created_at                | DATETIME2                                       |                                       |
| modified_at               | DATETIME2                                       |                                       |

### session_segments

Actual performed exercises (what the user did).

| Column      | Type                                            | Notes                                               |
| ----------- | ----------------------------------------------- | --------------------------------------------------- |
| id          | UNIQUEIDENTIFIER (PK)                           |                                                     |
| user_id     | UNIQUEIDENTIFIER                                | Required — filter by `@userId`                      |
| session_id  | UNIQUEIDENTIFIER (FK → workout_sessions)        |                                                     |
| exercise_id | UNIQUEIDENTIFIER (FK → exercises)               |                                                     |
| target_id   | UNIQUEIDENTIFIER (FK → target_session_segments) | Nullable; links to the prescribed target            |
| modifier_id | UNIQUEIDENTIFIER (FK → exercise_modifiers)      | Nullable; optional modifier applied to the exercise |
| order_index | INT                                             |                                                     |
| is_warmup   | BIT                                             | 1 = warmup/mobility exercise, 0 = working exercise  |
| notes       | NVARCHAR(MAX)                                   |                                                     |
| created_at  | DATETIME2                                       |                                                     |
| modified_at | DATETIME2                                       |                                                     |

### session_segment_sets

Actual performed sets.

| Column             | Type                                     | Notes                          |
| ------------------ | ---------------------------------------- | ------------------------------ |
| id                 | UNIQUEIDENTIFIER (PK)                    |                                |
| user_id            | UNIQUEIDENTIFIER                         | Required — filter by `@userId` |
| session_segment_id | UNIQUEIDENTIFIER (FK → session_segments) |                                |
| set_number         | INT                                      |                                |
| is_warmup          | BIT                                      |                                |
| reps               | INT                                      |                                |
| weight             | DECIMAL(6,1)                             | Pounds                         |
| rpe                | DECIMAL(3,1)                             | Nullable                       |
| time_seconds       | INT                                      | For timed exercises (nullable) |
| notes              | NVARCHAR(MAX)                            |                                |
| is_completed       | BIT                                      |                                |
| created_at         | DATETIME2                                |                                |
| modified_at        | DATETIME2                                |                                |

### Hierarchy

```
program_templates (user_id)
  └─ programs (user_id, via template_id, nullable)
       └─ blocks (user_id, ordered by order_index)
            └─ weeks (user_id, ordered by week_number)
                 └─ workout_sessions (user_id, ordered by order_index)
                      ├─ target_session_segments (user_id) → target_session_segment_sets (user_id)  (the plan)
                      └─ session_segments (user_id) → session_segment_sets (user_id)               (what was done)

exercises (user_id nullable: NULL = system, set = custom)
  └─ user_exercise_overrides (user_id — per-user customizations of system exercises)

muscle_groups (shared)
exercise_muscle_groups (shared)
exercise_modifiers (shared)
user_profiles (user_id)
```

### Useful Query Patterns

**All queries MUST include `WHERE user_id = @userId` on user-owned tables.**

**Last time an exercise was performed:**

```sql
SELECT TOP 1 ws.started_at, ws.name AS session_name
FROM session_segments ss
JOIN workout_sessions ws ON ss.session_id = ws.id
WHERE ss.exercise_id = '<exercise_id>'
  AND ss.user_id = @userId
  AND ws.is_completed = 1
ORDER BY ws.started_at DESC
```

**Exercise frequency (how many sessions included each exercise in the last 30 days):**

```sql
SELECT COALESCE(o.custom_name, e.name) AS name, COUNT(DISTINCT ss.session_id) AS session_count
FROM session_segments ss
JOIN exercises e ON ss.exercise_id = e.id
LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
JOIN workout_sessions ws ON ss.session_id = ws.id
WHERE ss.user_id = @userId
  AND ws.is_completed = 1
  AND ws.started_at >= DATEADD(DAY, -30, GETDATE())
GROUP BY COALESCE(o.custom_name, e.name)
ORDER BY session_count DESC
```

**Total volume (sets x reps x weight) by muscle group over a period:**

```sql
SELECT mg.name AS muscle_group, SUM(sss.reps * sss.weight) AS total_volume
FROM session_segment_sets sss
JOIN session_segments ss ON sss.session_segment_id = ss.id
JOIN workout_sessions ws ON ss.session_id = ws.id
JOIN exercise_muscle_groups emg ON ss.exercise_id = emg.exercise_id
JOIN muscle_groups mg ON emg.muscle_group_id = mg.id
WHERE sss.user_id = @userId
  AND ws.is_completed = 1
  AND ws.started_at >= DATEADD(DAY, -30, GETDATE())
  AND sss.is_warmup = 0
GROUP BY mg.name
ORDER BY total_volume DESC
```

**Recent performance on a specific exercise (last 3 sessions):**

```sql
SELECT ws.started_at, sss.set_number, sss.reps, sss.weight, sss.rpe
FROM session_segment_sets sss
JOIN session_segments ss ON sss.session_segment_id = ss.id
JOIN workout_sessions ws ON ss.session_id = ws.id
WHERE ss.exercise_id = '<exercise_id>'
  AND sss.user_id = @userId
  AND ws.is_completed = 1
  AND sss.is_warmup = 0
  AND ws.id IN (
    SELECT TOP 3 ws2.id FROM workout_sessions ws2
    JOIN session_segments ss2 ON ws2.id = ss2.session_id
    WHERE ss2.exercise_id = '<exercise_id>'
      AND ws2.user_id = @userId
      AND ws2.is_completed = 1
    ORDER BY ws2.started_at DESC
  )
ORDER BY ws.started_at DESC, sss.set_number
```

**Recent session analyses in a program (for informing future generation):**

```sql
SELECT ws.name, ws.analysis, ws.started_at
FROM workout_sessions ws
JOIN weeks w ON ws.week_id = w.id
JOIN blocks b ON w.block_id = b.id
WHERE b.program_id = '<program_id>'
  AND ws.user_id = @userId
  AND ws.is_completed = 1
  AND ws.analysis IS NOT NULL
ORDER BY ws.started_at DESC
```

**Session's program context (block, week, sibling sessions):**

```sql
SELECT ws.id, ws.name, ws.description,
       w.week_number, w.name AS week_name, w.description AS week_description,
       b.name AS block_name, b.tag AS block_tag, b.description AS block_description,
       p.name AS program_name, p.description AS program_description
FROM workout_sessions ws
JOIN weeks w ON ws.week_id = w.id
JOIN blocks b ON w.block_id = b.id
JOIN programs p ON b.program_id = p.id
WHERE ws.id = '<session_id>'
  AND ws.user_id = @userId
```

**Exercises not used in the last N days:**

```sql
SELECT e.id, COALESCE(o.custom_name, e.name) AS name
FROM exercises e
LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
WHERE (e.user_id IS NULL OR e.user_id = @userId)
  AND COALESCE(o.is_disabled, e.is_disabled) = 0
  AND e.id NOT IN (
    SELECT DISTINCT ss.exercise_id
    FROM session_segments ss
    JOIN workout_sessions ws ON ss.session_id = ws.id
    WHERE ws.user_id = @userId
      AND ws.is_completed = 1
      AND ws.started_at >= DATEADD(DAY, -30, GETDATE())
  )
```
