-- =============================
-- Workout Tracker (GOLEM) Database Initialization Script
-- Version: 202603070227 (Intitial release v0.2.0)
-- =============================

-- Filtered indexes (used below on locations.is_active and elsewhere) require
-- ANSI_NULLS + QUOTED_IDENTIFIER ON for CREATE.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

BEGIN TRANSACTION GolemDbInitialization
BEGIN TRY

    -- =============================
    -- Exercises
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exercises' AND xtype='U')
    BEGIN
        CREATE TABLE exercises (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NULL, -- NULL = system exercise, non-null = user's custom exercise
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            category NVARCHAR(50) NOT NULL DEFAULT 'Strength',
            is_timed BIT NOT NULL DEFAULT 0,
            distance_type NVARCHAR(10) NULL, -- NULL = no distance tracking, 'short' = feet/yards/meters, 'long' = km/mi
            is_disabled BIT DEFAULT 0, -- LEGACY: enabled state is now per-location in location_exercise_overrides; no longer read
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );

        -- System exercises: unique name when user_id is NULL
        CREATE UNIQUE INDEX UX_exercises_system_name ON exercises (name) WHERE user_id IS NULL;

        -- User exercises: unique name per user
        CREATE UNIQUE INDEX UX_exercises_user_name ON exercises (user_id, name) WHERE user_id IS NOT NULL;
    END

    -- =============================
    -- Muscle Groups
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='muscle_groups' AND xtype='U')
    BEGIN
        CREATE TABLE muscle_groups (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(100) UNIQUE NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Exercise Muscle Groups
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exercise_muscle_groups' AND xtype='U')
    BEGIN
        CREATE TABLE exercise_muscle_groups (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            muscle_group_id UNIQUEIDENTIFIER NOT NULL,
            is_primary BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_exercise_muscle_groups_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_exercise_muscle_groups_muscle_group FOREIGN KEY (muscle_group_id) REFERENCES muscle_groups(id),
            CONSTRAINT UQ_exercise_muscle_group UNIQUE (exercise_id, muscle_group_id)
        );
    END

    -- =============================
    -- User Exercise Overrides
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_exercise_overrides' AND xtype='U')
    BEGIN
        CREATE TABLE user_exercise_overrides (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            custom_name NVARCHAR(255) NULL,
            custom_description NVARCHAR(MAX) NULL,
            is_disabled BIT DEFAULT 0, -- LEGACY: enabled state is now per-location in location_exercise_overrides; no longer read
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_user_exercise_overrides_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT UQ_user_exercise_override UNIQUE (user_id, exercise_id)
        );
    END

    -- =============================
    -- Exercise Modifiers
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exercise_modifiers' AND xtype='U')
    BEGIN
        CREATE TABLE exercise_modifiers (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(100) UNIQUE NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Program Templates
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='program_templates' AND xtype='U')
    BEGIN
        CREATE TABLE program_templates (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            program_prompt NVARCHAR(MAX),
            week_prompt NVARCHAR(MAX),
            session_prompt NVARCHAR(MAX),
            analysis_prompt NVARCHAR(MAX),
            days_per_week INT NOT NULL DEFAULT 4,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- User Profile
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_profiles' AND xtype='U')
    BEGIN
        CREATE TABLE user_profiles (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER UNIQUE NOT NULL,
            profile_prompt NVARCHAR(MAX) NULL,
            distance_unit_short NVARCHAR(10) NULL, -- preferred short-distance display unit: feet/yards/meters (NULL = meters)
            distance_unit_long NVARCHAR(10) NULL, -- preferred long-distance display unit: km/mi (NULL = km)
            rest_timer_enabled BIT NOT NULL DEFAULT 1, -- show the between-sets rest countdown (1 = on)
            created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
            modified_at DATETIME2 NOT NULL DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Programs
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='programs' AND xtype='U')
    BEGIN
        CREATE TABLE programs (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            template_id UNIQUEIDENTIFIER NULL,
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            is_completed BIT CHECK (is_completed IN (0,1)) DEFAULT 0, -- 1 = finished
            is_archived BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_programs_template FOREIGN KEY (template_id) REFERENCES program_templates(id)
        );
    END

    -- =============================
    -- Blocks
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='blocks' AND xtype='U')
    BEGIN
        CREATE TABLE blocks (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            program_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            order_index INT NOT NULL,
            description NVARCHAR(MAX),
            tag NVARCHAR(100), -- short label, e.g. "Hypertrophy", "Deload", "Peaking"
            color NVARCHAR(7), -- hex color code, e.g. "#3B82F6"
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_blocks_program FOREIGN KEY (program_id) REFERENCES programs(id)
        );
    END

    -- =============================
    -- Weeks
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='weeks' AND xtype='U')
    BEGIN
        CREATE TABLE weeks (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            block_id UNIQUEIDENTIFIER NOT NULL,
            week_number INT NOT NULL,
            name NVARCHAR(255),
            description NVARCHAR(MAX),
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_weeks_block FOREIGN KEY (block_id) REFERENCES blocks(id)
        );
    END

    -- =============================
    -- Day Archetypes
    -- Reusable "day" definitions (a composition of slots) that also carry the progression LINEAGE identity:
    -- sessions sharing a day_archetype_id are the same day, so the engine progresses each from the prior one.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='day_archetypes' AND xtype='U')
    BEGIN
        CREATE TABLE day_archetypes (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            program_id UNIQUEIDENTIFIER NULL, -- NULL = user-library archetype, reusable across programs
            name NVARCHAR(255) NOT NULL, -- e.g. "Lower — Low-Axial Squat"
            description NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_day_archetypes_program FOREIGN KEY (program_id) REFERENCES programs(id)
        );
    END

    -- =============================
    -- Day Slots
    -- Ordered roles within a day archetype — the unit the selection scorer FILLS and the loader PROGRESSES.
    -- Holds the slot definition + progression config (model + params); evolving run state is in slot_progression_state.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='day_slots' AND xtype='U')
    BEGIN
        CREATE TABLE day_slots (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            day_archetype_id UNIQUEIDENTIFIER NOT NULL,
            order_index INT NOT NULL,
            role NVARCHAR(40) NOT NULL DEFAULT 'secondary', -- primary|secondary|isolation|unilateral|core|carry|conditioning
            target_muscle_group_id UNIQUEIDENTIFIER NULL, -- primary muscle target driving selection + volume-gap
            category_filter NVARCHAR(40) NOT NULL DEFAULT 'Strength', -- Strength|Cardio|Mobility (hard filter)
            rotation_cadence NVARCHAR(20) NOT NULL DEFAULT 'per_session', -- never|per_block|per_session (a CEILING; novelty is demand-driven)
            pinned_exercise_id UNIQUEIDENTIFIER NULL, -- set for never/per_block specificity slots
            is_optional BIT CHECK (is_optional IN (0,1)) DEFAULT 0, -- min/max: optional slots filled only when readiness/volume allows
            is_warmup BIT NOT NULL CHECK (is_warmup IN (0,1)) DEFAULT 0, -- a warmup-exercise slot: engine fills from is_warmup exercises, emits an is_warmup segment before the working slots (no load progression)
            -- progression DEFINITION (running state lives in slot_progression_state)
            progression_model NVARCHAR(30) NOT NULL DEFAULT 'double_progression', -- double_progression|linear|rpe_pct1rm|time_effort
            rep_low INT NOT NULL DEFAULT 8, -- rep range floor (rep-based models)
            rep_high INT NOT NULL DEFAULT 12, -- rep range ceiling (rep-based models)
            time_low_seconds INT NULL, -- duration range floor in seconds (time_effort model only)
            time_high_seconds INT NULL, -- duration range ceiling in seconds (time_effort model only)
            target_rpe DECIMAL(3,1) NULL, -- NULL when RPE not used for this slot
            load_step_pct DECIMAL(4,3) NOT NULL DEFAULT 0.05, -- fractional load bump on progression (+5%)
            round_to_step DECIMAL(6,2) NOT NULL DEFAULT 5, -- smallest load increment (lb / machine plate)
            set_target INT NOT NULL DEFAULT 3, -- baseline working-set count (volume allocator may adjust)
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_day_slots_archetype FOREIGN KEY (day_archetype_id) REFERENCES day_archetypes(id),
            CONSTRAINT FK_day_slots_muscle FOREIGN KEY (target_muscle_group_id) REFERENCES muscle_groups(id),
            CONSTRAINT FK_day_slots_pinned_ex FOREIGN KEY (pinned_exercise_id) REFERENCES exercises(id),
            CONSTRAINT CK_day_slots_cadence CHECK (rotation_cadence IN ('never','per_block','per_session')),
            CONSTRAINT CK_day_slots_model CHECK (progression_model IN ('double_progression','linear','rpe_pct1rm','time_effort'))
        );
    END

    -- =============================
    -- Slot Progression State
    -- The evolving per-slot run state (model position) that advances each cycle and survives exercise swaps.
    -- Absolute load is re-anchored at generation time to whichever exercise fills the slot; this holds the
    -- last filled exercise + last prescribed load/reps/set-target so the engine can advance from it.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='slot_progression_state' AND xtype='U')
    BEGIN
        CREATE TABLE slot_progression_state (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            day_slot_id UNIQUEIDENTIFIER NOT NULL,
            current_exercise_id UNIQUEIDENTIFIER NULL, -- exercise that filled the slot last cycle (re-anchor reference)
            current_load DECIMAL(7,2) NULL,
            current_reps INT NULL,
            current_set_target INT NULL,
            last_advanced_at DATETIME2 NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_slot_state_slot FOREIGN KEY (day_slot_id) REFERENCES day_slots(id),
            CONSTRAINT FK_slot_state_ex FOREIGN KEY (current_exercise_id) REFERENCES exercises(id),
            CONSTRAINT UQ_slot_state UNIQUE (day_slot_id)
        );
    END

    -- =============================
    -- Workout Sessions
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workout_sessions' AND xtype='U')
    BEGIN
        CREATE TABLE workout_sessions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            week_id UNIQUEIDENTIFIER NULL,
            day_archetype_id UNIQUEIDENTIFIER NULL, -- which reusable "day" this session instantiates (progression lineage)
            order_index INT NULL,
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            review NVARCHAR(MAX),
            analysis NVARCHAR(MAX),
            pre_survey_notes NVARCHAR(MAX) NULL, -- free-text notes captured in pre-workout survey
            started_at DATETIME2 NULL, -- timestamp when session was physically started
            resumed_at DATETIME2 NULL, -- timestamp when a completed session was most recently resumed
            duration INT NULL, -- accumulated duration in seconds
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            is_completed BIT CHECK (is_completed IN (0,1)) DEFAULT 0, -- 1 = finished
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_workout_sessions_week FOREIGN KEY (week_id) REFERENCES weeks(id),
            CONSTRAINT FK_workout_sessions_day_archetype FOREIGN KEY (day_archetype_id) REFERENCES day_archetypes(id)
        );
    END

    -- =============================
    -- Session Pre-Survey Muscles
    -- Per-muscle fatigue (1=fresh, 2=sore, 3=fatigued) captured before a session begins; feeds into exercise generation.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='session_pre_survey_muscles' AND xtype='U')
    BEGIN
        CREATE TABLE session_pre_survey_muscles (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            session_id UNIQUEIDENTIFIER NOT NULL,
            muscle_group_id UNIQUEIDENTIFIER NOT NULL,
            fatigue INT NOT NULL CONSTRAINT CK_session_pre_survey_muscles_fatigue CHECK (fatigue BETWEEN 1 AND 3),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_session_pre_survey_muscles_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_session_pre_survey_muscles_muscle FOREIGN KEY (muscle_group_id) REFERENCES muscle_groups(id),
            CONSTRAINT UQ_session_pre_survey_muscle UNIQUE (session_id, muscle_group_id)
        );
    END

    -- =============================
    -- Target Session Segments
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='target_session_segments' AND xtype='U')
    BEGIN
        CREATE TABLE target_session_segments (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            session_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            modifier_id UNIQUEIDENTIFIER NULL,
            order_index INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            slot_role NVARCHAR(40) NULL,  -- role label of the day-archetype slot that produced this target (engine-generated only; NULL for LLM/manual targets)
            progression_model NVARCHAR(30) NULL,  -- progression model of the originating slot (engine-generated only)
            day_archetype_id UNIQUEIDENTIFIER NULL,  -- archetype this target was generated from (snapshot, for provenance link; not FK-enforced so archetype edits/deletes don't cascade)
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_target_session_segments_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_target_session_segments_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_target_session_segments_modifier FOREIGN KEY (modifier_id) REFERENCES exercise_modifiers(id)
        );
    END

    -- =============================
    -- Target Session Segment Sets
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='target_session_segment_sets' AND xtype='U')
    BEGIN
        CREATE TABLE target_session_segment_sets (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            target_session_segment_id UNIQUEIDENTIFIER NOT NULL,
            set_number INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            reps INT NULL,
            weight DECIMAL(6,1) NOT NULL,
            rpe DECIMAL(3,1),
            time_seconds INT NULL,
            distance DECIMAL(10,3) NULL, -- prescribed distance, stored in meters
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_target_session_segment_sets_segment FOREIGN KEY (target_session_segment_id) REFERENCES target_session_segments(id)
        );
    END

    -- =============================
    -- Session Segments
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='session_segments' AND xtype='U')
    BEGIN
        CREATE TABLE session_segments (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            session_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            target_id UNIQUEIDENTIFIER NULL,
            modifier_id UNIQUEIDENTIFIER NULL,
            order_index INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            notes NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_session_segments_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_session_segments_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_session_segments_target FOREIGN KEY (target_id) REFERENCES target_session_segments(id),
            CONSTRAINT FK_session_segments_modifier FOREIGN KEY (modifier_id) REFERENCES exercise_modifiers(id)
        );
    END

    -- =============================
    -- Session Segment Sets
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='session_segment_sets' AND xtype='U')
    BEGIN
        CREATE TABLE session_segment_sets (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            session_segment_id UNIQUEIDENTIFIER NOT NULL,
            set_number INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            reps INT NULL,
            weight DECIMAL(6,1) NOT NULL,
            rpe DECIMAL(3,1),
            time_seconds INT NULL,
            distance DECIMAL(10,3) NULL, -- logged distance, stored in meters
            notes NVARCHAR(MAX),
            is_completed BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_session_segment_sets_segment FOREIGN KEY (session_segment_id) REFERENCES session_segments(id)
        );
    END

    -- =============================
    -- Equipment
    -- Seeded taxonomy of gear types. has_options = 1 means the user picks specific
    -- weights / sizes / tensions via the weight-picker drill-down.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='equipment' AND xtype='U')
    BEGIN
        CREATE TABLE equipment (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(100) UNIQUE NOT NULL,
            category NVARCHAR(50) NOT NULL, -- small_weights | bars_and_plates | benches_and_racks | cable_machines | strength_machines | resistance_bands | cardio_machines | bodyweight | other
            image_data VARBINARY(MAX) NULL, -- representative photo for the equipment picker, stored in-DB as PNG; NULL falls back to the category icon
            has_options BIT NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 0,
            is_disabled BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Equipment Options
    -- Per-equipment weights / sizes / tensions. value_kg is canonical for numeric
    -- weight items; NULL for non-numeric (band tensions, etc).
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='equipment_options' AND xtype='U')
    BEGIN
        CREATE TABLE equipment_options (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            equipment_id UNIQUEIDENTIFIER NOT NULL,
            label NVARCHAR(50) NOT NULL,
            value_kg DECIMAL(6,2) NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_equipment_options_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
            CONSTRAINT UQ_equipment_options UNIQUE (equipment_id, label)
        );
    END

    -- =============================
    -- Locations
    -- Per-user gym/location profiles. At most one is_active=1 per user, enforced
    -- by the filtered unique index below.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='locations' AND xtype='U')
    BEGIN
        CREATE TABLE locations (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(100) NOT NULL,
            is_active BIT NOT NULL DEFAULT 0, -- the active WORKING location used for generation
            is_warmup_active BIT NOT NULL DEFAULT 0, -- the active WARMUP location; when unset, warmups use the working location
            is_default BIT NOT NULL DEFAULT 0, -- the fallback location; always exactly one per user, cannot be deleted
            bodyweight_only BIT NOT NULL DEFAULT 0, -- 1 = restrict generation to bodyweight movements (equipment ignored)
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT UQ_locations_user_name UNIQUE (user_id, name)
        );

        -- At most one active location per user
        CREATE UNIQUE INDEX UX_locations_active_per_user
            ON locations (user_id)
            WHERE is_active = 1;

        -- At most one default location per user
        CREATE UNIQUE INDEX UX_locations_default_per_user
            ON locations (user_id)
            WHERE is_default = 1;

        -- At most one active warmup location per user
        CREATE UNIQUE INDEX UX_locations_warmup_active_per_user
            ON locations (user_id)
            WHERE is_warmup_active = 1;
    END

    -- =============================
    -- Location Equipment
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='location_equipment' AND xtype='U')
    BEGIN
        CREATE TABLE location_equipment (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            location_id UNIQUEIDENTIFIER NOT NULL,
            equipment_id UNIQUEIDENTIFIER NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_location_equipment_location FOREIGN KEY (location_id) REFERENCES locations(id),
            CONSTRAINT FK_location_equipment_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
            CONSTRAINT UQ_location_equipment UNIQUE (location_id, equipment_id)
        );
    END

    -- =============================
    -- Location Equipment Options
    -- Which specific weights/sizes are selected at this location for a given
    -- equipment item. Only meaningful for equipment with has_options=1.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='location_equipment_options' AND xtype='U')
    BEGIN
        CREATE TABLE location_equipment_options (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            location_equipment_id UNIQUEIDENTIFIER NOT NULL,
            equipment_option_id UNIQUEIDENTIFIER NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_leo_location_equipment FOREIGN KEY (location_equipment_id) REFERENCES location_equipment(id),
            CONSTRAINT FK_leo_equipment_option FOREIGN KEY (equipment_option_id) REFERENCES equipment_options(id),
            CONSTRAINT UQ_location_equipment_options UNIQUE (location_equipment_id, equipment_option_id)
        );
    END

    -- =============================
    -- Location Exercise Overrides
    -- Per-location enabled/disabled state for exercises. This is the source of
    -- truth for whether an exercise is enabled — it supersedes the legacy
    -- exercises.is_disabled / user_exercise_overrides.is_disabled flags. A row
    -- with is_disabled=1 means the exercise is disabled at that location; absence
    -- of a row means the exercise is enabled (all exercises enabled by default).
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='location_exercise_overrides' AND xtype='U')
    BEGIN
        CREATE TABLE location_exercise_overrides (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            location_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            is_disabled BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_location_exercise_overrides_location FOREIGN KEY (location_id) REFERENCES locations(id),
            CONSTRAINT FK_location_exercise_overrides_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT UQ_location_exercise_override UNIQUE (location_id, exercise_id)
        );
    END

    -- =============================
    -- Exercise Equipment
    -- Which equipment each exercise needs. alt_group lets exercises express
    -- "any one of these works" (e.g. dumbbells OR kettlebells satisfies the
    -- 'small_weight' slot for goblet squats).
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exercise_equipment' AND xtype='U')
    BEGIN
        CREATE TABLE exercise_equipment (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            equipment_id UNIQUEIDENTIFIER NOT NULL,
            is_required BIT NOT NULL DEFAULT 1,
            alt_group INT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_exercise_equipment_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_exercise_equipment_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id),
            CONSTRAINT UQ_exercise_equipment UNIQUE (exercise_id, equipment_id)
        );
    END

    -- =============================
    -- Feedback Messages
    -- Multi-turn conversation with the LLM about the user's program. Assistant messages may carry
    -- a proposal_json (FeedbackManifest) which the user can approve to apply.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='feedback_messages' AND xtype='U')
    BEGIN
        CREATE TABLE feedback_messages (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            conversation_id UNIQUEIDENTIFIER NOT NULL, -- groups messages within a single conversation
            role NVARCHAR(20) NOT NULL CONSTRAINT CK_feedback_messages_role CHECK (role IN ('user','assistant')),
            content NVARCHAR(MAX) NOT NULL,
            proposal_json NVARCHAR(MAX) NULL, -- JSON serialized FeedbackManifest, only on assistant messages
            applied_at DATETIME2 NULL, -- timestamp when the user approved & applied this message's proposal
            created_at DATETIME2 DEFAULT GETDATE()
        );
        CREATE INDEX IX_feedback_messages_user_conv ON feedback_messages(user_id, conversation_id, created_at);
    END

    COMMIT TRANSACTION GolemDbInitialization;
    PRINT '';
    PRINT 'Database initialized successfully.'

END TRY
BEGIN CATCH
    -- Rollback the transaction
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION GolemDbInitialization;
    END

    -- Report the error
    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Initialization failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;
    
    -- Re-raise the error
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH