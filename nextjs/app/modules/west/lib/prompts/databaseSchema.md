## Database Schema Reference (T-SQL / MSSQL)

Use this schema to write SELECT queries against the workout tracking database.

### exercises

| Column      | Type                  | Notes                               |
| ----------- | --------------------- | ----------------------------------- |
| id          | UNIQUEIDENTIFIER (PK) |                                     |
| name        | NVARCHAR(255)         | Unique                              |
| description | NVARCHAR(MAX)         |                                     |
| category    | NVARCHAR(50)          | 'Strength', 'Cardio', or 'Mobility' |
| is_disabled | BIT                   | 0 = active, 1 = disabled            |
| created_at  | DATETIME2             |                                     |
| modified_at | DATETIME2             |                                     |

### muscle_groups

| Column      | Type                  | Notes  |
| ----------- | --------------------- | ------ |
| id          | UNIQUEIDENTIFIER (PK) |        |
| name        | NVARCHAR(100)         | Unique |
| created_at  | DATETIME2             |        |
| modified_at | DATETIME2             |        |

### exercise_muscle_groups

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

### exercise_modifiers

Optional modifiers that can be applied to exercises at the segment level (e.g., "Pause", "Tempo", "Deficit").

| Column      | Type                  | Notes  |
| ----------- | --------------------- | ------ |
| id          | UNIQUEIDENTIFIER (PK) |        |
| name        | NVARCHAR(100)         | Unique |
| created_at  | DATETIME2             |        |
| modified_at | DATETIME2             |        |

### program_templates

Reusable templates that drive LLM-based program generation.

| Column         | Type                  | Notes                                   |
| -------------- | --------------------- | --------------------------------------- |
| id             | UNIQUEIDENTIFIER (PK) |                                         |
| name           | NVARCHAR(255)         |                                         |
| description    | NVARCHAR(MAX)         |                                         |
| program_prompt | NVARCHAR(MAX)         | Prompt context for program structure    |
| week_prompt    | NVARCHAR(MAX)         | Prompt context for weekly session plans |
| session_prompt | NVARCHAR(MAX)         | Prompt context for session exercises    |
| days_per_week  | INT                   | Default 4                               |
| created_at     | DATETIME2             |                                         |
| modified_at    | DATETIME2             |                                         |

### programs

| Column       | Type                                      | Notes                        |
| ------------ | ----------------------------------------- | ---------------------------- |
| id           | UNIQUEIDENTIFIER (PK)                     |                              |
| name         | NVARCHAR(255)                             |                              |
| description  | NVARCHAR(MAX)                             |                              |
| template_id  | UNIQUEIDENTIFIER (FK → program_templates) | Nullable                     |
| is_current   | BIT                                       | 1 = currently active program |
| is_completed | BIT                                       | 1 = finished                 |
| created_at   | DATETIME2                                 |                              |
| modified_at  | DATETIME2                                 |                              |

### blocks

A block is a training phase within a program (e.g., Hypertrophy, Peaking, Deload).

| Column       | Type                             | Notes                                     |
| ------------ | -------------------------------- | ----------------------------------------- |
| id           | UNIQUEIDENTIFIER (PK)            |                                           |
| program_id   | UNIQUEIDENTIFIER (FK → programs) |                                           |
| name         | NVARCHAR(255)                    |                                           |
| order_index  | INT                              | Position within the program               |
| description  | NVARCHAR(MAX)                    |                                           |
| tag          | NVARCHAR(100)                    | Short label, e.g. "Hypertrophy", "Deload" |
| color        | NVARCHAR(7)                      | Hex color, e.g. "#3B82F6"                 |
| is_current   | BIT                              | 1 = currently active                      |
| is_completed | BIT                              | 1 = finished                              |
| created_at   | DATETIME2                        |                                           |
| modified_at  | DATETIME2                        |                                           |

### weeks

| Column       | Type                           | Notes                        |
| ------------ | ------------------------------ | ---------------------------- |
| id           | UNIQUEIDENTIFIER (PK)          |                              |
| block_id     | UNIQUEIDENTIFIER (FK → blocks) |                              |
| week_number  | INT                            | Week number within the block |
| name         | NVARCHAR(255)                  |                              |
| description  | NVARCHAR(MAX)                  |                              |
| is_current   | BIT                            | 1 = currently active         |
| is_completed | BIT                            | 1 = finished                 |
| created_at   | DATETIME2                      |                              |
| modified_at  | DATETIME2                      |                              |

### workout_sessions

| Column       | Type                          | Notes                                              |
| ------------ | ----------------------------- | -------------------------------------------------- |
| id           | UNIQUEIDENTIFIER (PK)         |                                                    |
| week_id      | UNIQUEIDENTIFIER (FK → weeks) | Nullable (standalone sessions)                     |
| order_index  | INT                           | Position within the week                           |
| name         | NVARCHAR(255)                 |                                                    |
| notes        | NVARCHAR(MAX)                 | User-provided session notes                        |
| started_at   | DATETIME2                     | When the session was physically started            |
| resumed_at   | DATETIME2                     | When a completed session was most recently resumed |
| duration     | INT                           | Accumulated duration in seconds                    |
| is_current   | BIT                           | 1 = currently active                               |
| is_completed | BIT                           | 1 = finished                                       |
| created_at   | DATETIME2                     |                                                    |
| modified_at  | DATETIME2                     |                                                    |

### target_session_segments

Prescribed exercises for a session (the plan before execution).

| Column      | Type                                       | Notes                                               |
| ----------- | ------------------------------------------ | --------------------------------------------------- |
| id          | UNIQUEIDENTIFIER (PK)                      |                                                     |
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
| target_session_segment_id | UNIQUEIDENTIFIER (FK → target_session_segments) |                                       |
| set_number                | INT                                             |                                       |
| is_warmup                 | BIT                                             |                                       |
| reps                      | INT                                             |                                       |
| weight                    | DECIMAL(6,1)                                    | Pounds                                |
| rpe                       | DECIMAL(3,1)                                    | Rate of perceived exertion (nullable) |
| created_at                | DATETIME2                                       |                                       |
| modified_at               | DATETIME2                                       |                                       |

### session_segments

Actual performed exercises (what the user did).

| Column      | Type                                            | Notes                                               |
| ----------- | ----------------------------------------------- | --------------------------------------------------- |
| id          | UNIQUEIDENTIFIER (PK)                           |                                                     |
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

| Column             | Type                                     | Notes    |
| ------------------ | ---------------------------------------- | -------- |
| id                 | UNIQUEIDENTIFIER (PK)                    |          |
| session_segment_id | UNIQUEIDENTIFIER (FK → session_segments) |          |
| set_number         | INT                                      |          |
| is_warmup          | BIT                                      |          |
| reps               | INT                                      |          |
| weight             | DECIMAL(6,1)                             | Pounds   |
| rpe                | DECIMAL(3,1)                             | Nullable |
| notes              | NVARCHAR(MAX)                            |          |
| is_completed       | BIT                                      |          |
| created_at         | DATETIME2                                |          |
| modified_at        | DATETIME2                                |          |

### Hierarchy

```
program_templates
  └─ programs (via template_id, nullable)
       └─ blocks (ordered by order_index)
            └─ weeks (ordered by week_number)
                 └─ workout_sessions (ordered by order_index)
                      ├─ target_session_segments → target_session_segment_sets  (the plan)
                      └─ session_segments → session_segment_sets               (what was done)
```

### Useful Query Patterns

**Last time an exercise was performed:**

```sql
SELECT TOP 1 ws.started_at, ws.name AS session_name
FROM session_segments ss
JOIN workout_sessions ws ON ss.session_id = ws.id
WHERE ss.exercise_id = '<exercise_id>'
  AND ws.is_completed = 1
ORDER BY ws.started_at DESC
```

**Exercise frequency (how many sessions included each exercise in the last 30 days):**

```sql
SELECT e.name, COUNT(DISTINCT ss.session_id) AS session_count
FROM session_segments ss
JOIN exercises e ON ss.exercise_id = e.id
JOIN workout_sessions ws ON ss.session_id = ws.id
WHERE ws.is_completed = 1
  AND ws.started_at >= DATEADD(DAY, -30, GETDATE())
GROUP BY e.name
ORDER BY session_count DESC
```

**Total volume (sets × reps × weight) by muscle group over a period:**

```sql
SELECT mg.name AS muscle_group, SUM(sss.reps * sss.weight) AS total_volume
FROM session_segment_sets sss
JOIN session_segments ss ON sss.session_segment_id = ss.id
JOIN workout_sessions ws ON ss.session_id = ws.id
JOIN exercise_muscle_groups emg ON ss.exercise_id = emg.exercise_id
JOIN muscle_groups mg ON emg.muscle_group_id = mg.id
WHERE ws.is_completed = 1
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
  AND ws.is_completed = 1
  AND sss.is_warmup = 0
  AND ws.id IN (
    SELECT TOP 3 ws2.id FROM workout_sessions ws2
    JOIN session_segments ss2 ON ws2.id = ss2.session_id
    WHERE ss2.exercise_id = '<exercise_id>' AND ws2.is_completed = 1
    ORDER BY ws2.started_at DESC
  )
ORDER BY ws.started_at DESC, sss.set_number
```

**Exercises not used in the last N days:**

```sql
SELECT e.id, e.name
FROM exercises e
WHERE e.is_disabled = 0
  AND e.id NOT IN (
    SELECT DISTINCT ss.exercise_id
    FROM session_segments ss
    JOIN workout_sessions ws ON ss.session_id = ws.id
    WHERE ws.is_completed = 1
      AND ws.started_at >= DATEADD(DAY, -30, GETDATE())
  )
```
