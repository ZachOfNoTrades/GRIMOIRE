-- =============================
-- Workout Tracker (WEST) Sample Data
-- Version: 202602251933 (Initial Release v0.1.0)
-- =============================

BEGIN TRANSACTION WestDbSampleRecords;
BEGIN TRY

    INSERT INTO exercises (name, description, is_disabled) VALUES
    ('Back Squat', 'Primary competition squat', 0),
    ('Front Squat', 'Quad emphasis variation', 0),
    ('Leg Press', 'Machine variation', 0),
    ('Conventional Deadlift', 'Competition deadlift', 0),
    ('Romanian Deadlift', 'Hamstring emphasis', 0),
    ('Bench Press', 'Competition bench', 0),
    ('Incline Bench Press', 'Upper chest emphasis', 0),
    ('Overhead Press', 'Standing press', 0),
    ('Pull-Up', 'Vertical pull', 0),
    ('Barbell Row', 'Horizontal pull', 0),
    ('Lat Pulldown', 'Machine vertical pull', 0),
    ('Cable Row', 'Machine horizontal pull', 0),
    ('Split Squat', 'Unilateral leg work', 0),
    ('Lunges', 'Dynamic unilateral', 0),
    ('Bicep Curl', 'Arm isolation', 0),
    ('Tricep Extension', 'Arm isolation', 0),
    ('Lateral Raise', 'Side delt isolation', 0),
    ('Face Pull', 'Rear delt and rotator cuff', 0),
    ('Plank', 'Core stability', 0),
    ('Dead Bug', 'Core activation', 0);

    -- =============================
    -- Muscle Groups
    -- =============================
    INSERT INTO muscle_groups (name) VALUES
    ('Chest'),
    ('Upper Back'),
    ('Lats'),
    ('Shoulders'),
    ('Biceps'),
    ('Triceps'),
    ('Forearms'),
    ('Quads'),
    ('Hamstrings'),
    ('Glutes'),
    ('Calves'),
    ('Core'),
    ('Traps'),
    ('Lower Back');

    -- =============================
    -- Exercise Muscle Group Assignments
    -- =============================
    -- Look up exercise IDs
    DECLARE @ex_back_squat UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Back Squat');
    DECLARE @ex_front_squat UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Front Squat');
    DECLARE @ex_leg_press UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Leg Press');
    DECLARE @ex_conv_deadlift UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Conventional Deadlift');
    DECLARE @ex_romanian_deadlift UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Romanian Deadlift');
    DECLARE @ex_bench_press UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Bench Press');
    DECLARE @ex_incline_bench UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Incline Bench Press');
    DECLARE @ex_overhead_press UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Overhead Press');
    DECLARE @ex_pull_up UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Pull-Up');
    DECLARE @ex_barbell_row UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Barbell Row');
    DECLARE @ex_lat_pulldown UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lat Pulldown');
    DECLARE @ex_cable_row UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Cable Row');
    DECLARE @ex_split_squat UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Split Squat');
    DECLARE @ex_lunges UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lunges');
    DECLARE @ex_bicep_curl UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Bicep Curl');
    DECLARE @ex_tricep_extension UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Tricep Extension');
    DECLARE @ex_lateral_raise UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lateral Raise');
    DECLARE @ex_face_pull UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Face Pull');
    DECLARE @ex_plank UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Plank');
    DECLARE @ex_dead_bug UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Dead Bug');

    -- Look up muscle group IDs
    DECLARE @mg_chest UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Chest');
    DECLARE @mg_upper_back UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Upper Back');
    DECLARE @mg_lats UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Lats');
    DECLARE @mg_shoulders UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Shoulders');
    DECLARE @mg_biceps UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Biceps');
    DECLARE @mg_triceps UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Triceps');
    DECLARE @mg_forearms UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Forearms');
    DECLARE @mg_quads UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Quads');
    DECLARE @mg_hamstrings UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Hamstrings');
    DECLARE @mg_glutes UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Glutes');
    DECLARE @mg_calves UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Calves');
    DECLARE @mg_core UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Core');
    DECLARE @mg_traps UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Traps');
    DECLARE @mg_lower_back UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Lower Back');

    INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary) VALUES
    -- Back Squat → Quads (primary), Glutes, Core
    (@ex_back_squat, @mg_quads, 1),
    (@ex_back_squat, @mg_glutes, 0),
    (@ex_back_squat, @mg_core, 0),
    -- Front Squat → Quads (primary), Core, Glutes
    (@ex_front_squat, @mg_quads, 1),
    (@ex_front_squat, @mg_core, 0),
    (@ex_front_squat, @mg_glutes, 0),
    -- Leg Press → Quads (primary), Glutes
    (@ex_leg_press, @mg_quads, 1),
    (@ex_leg_press, @mg_glutes, 0),
    -- Conventional Deadlift → Hamstrings (primary), Glutes, Lower Back, Quads
    (@ex_conv_deadlift, @mg_hamstrings, 1),
    (@ex_conv_deadlift, @mg_glutes, 0),
    (@ex_conv_deadlift, @mg_lower_back, 0),
    (@ex_conv_deadlift, @mg_quads, 0),
    -- Romanian Deadlift → Hamstrings (primary), Glutes, Lower Back
    (@ex_romanian_deadlift, @mg_hamstrings, 1),
    (@ex_romanian_deadlift, @mg_glutes, 0),
    (@ex_romanian_deadlift, @mg_lower_back, 0),
    -- Bench Press → Chest (primary), Triceps, Shoulders
    (@ex_bench_press, @mg_chest, 1),
    (@ex_bench_press, @mg_triceps, 0),
    (@ex_bench_press, @mg_shoulders, 0),
    -- Incline Bench Press → Chest (primary), Shoulders, Triceps
    (@ex_incline_bench, @mg_chest, 1),
    (@ex_incline_bench, @mg_shoulders, 0),
    (@ex_incline_bench, @mg_triceps, 0),
    -- Overhead Press → Shoulders (primary), Triceps
    (@ex_overhead_press, @mg_shoulders, 1),
    (@ex_overhead_press, @mg_triceps, 0),
    -- Pull-Up → Lats (primary), Biceps, Upper Back
    (@ex_pull_up, @mg_lats, 1),
    (@ex_pull_up, @mg_biceps, 0),
    (@ex_pull_up, @mg_upper_back, 0),
    -- Barbell Row → Upper Back (primary), Lats, Biceps
    (@ex_barbell_row, @mg_upper_back, 1),
    (@ex_barbell_row, @mg_lats, 0),
    (@ex_barbell_row, @mg_biceps, 0),
    -- Lat Pulldown → Lats (primary), Biceps, Upper Back
    (@ex_lat_pulldown, @mg_lats, 1),
    (@ex_lat_pulldown, @mg_biceps, 0),
    (@ex_lat_pulldown, @mg_upper_back, 0),
    -- Cable Row → Upper Back (primary), Lats, Biceps
    (@ex_cable_row, @mg_upper_back, 1),
    (@ex_cable_row, @mg_lats, 0),
    (@ex_cable_row, @mg_biceps, 0),
    -- Split Squat → Quads (primary), Glutes
    (@ex_split_squat, @mg_quads, 1),
    (@ex_split_squat, @mg_glutes, 0),
    -- Lunges → Quads (primary), Glutes
    (@ex_lunges, @mg_quads, 1),
    (@ex_lunges, @mg_glutes, 0),
    -- Bicep Curl → Biceps (primary), Forearms
    (@ex_bicep_curl, @mg_biceps, 1),
    (@ex_bicep_curl, @mg_forearms, 0),
    -- Tricep Extension → Triceps (primary)
    (@ex_tricep_extension, @mg_triceps, 1),
    -- Lateral Raise → Shoulders (primary)
    (@ex_lateral_raise, @mg_shoulders, 1),
    -- Face Pull → Shoulders (primary), Upper Back, Traps
    (@ex_face_pull, @mg_shoulders, 1),
    (@ex_face_pull, @mg_upper_back, 0),
    (@ex_face_pull, @mg_traps, 0),
    -- Plank → Core (primary)
    (@ex_plank, @mg_core, 1),
    -- Dead Bug → Core (primary)
    (@ex_dead_bug, @mg_core, 1);

    -- =============================
    -- Programs
    -- =============================
    INSERT INTO programs (id, name, description, is_current, is_completed) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Push/Pull/Legs Program', NULL, 1, 0),
    ('66666666-6666-6666-6666-666666666666', '5/3/1 Strength Program', 'Jim Wendler strength base-building', 0, 0);

    -- =============================
    -- Blocks
    -- =============================
    -- Push/Pull/Legs Program blocks
    INSERT INTO blocks (id, program_id, name, order_index, tag, color, is_current, is_completed) VALUES
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Block 1', 1, 'Hypertrophy', '#3B82F6', 1, 0),
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Block 2', 2, 'Peaking', '#EF4444', 0, 0);

    -- 5/3/1 Strength Program blocks
    INSERT INTO blocks (id, program_id, name, order_index, tag, color, is_current, is_completed) VALUES
    ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'Accumulation', 1, 'Volume', '#8B5CF6', 0, 0);

    -- =============================
    -- Weeks
    -- =============================
    -- Push/Pull/Legs Block 1 weeks
    INSERT INTO weeks (id, block_id, week_number, is_current, is_completed) VALUES
    ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1, 0, 1),
    ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 2, 1, 0);

    -- Push/Pull/Legs Block 2 weeks
    INSERT INTO weeks (id, block_id, week_number, is_current, is_completed) VALUES
    ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', '44444444-4444-4444-4444-444444444444', 1, 0, 0);

    -- 5/3/1 Accumulation weeks
    INSERT INTO weeks (id, block_id, week_number, is_current, is_completed) VALUES
    ('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', '77777777-7777-7777-7777-777777777777', 1, 0, 0),
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', '77777777-7777-7777-7777-777777777777', 2, 0, 0);

    -- =============================
    -- Workout Sessions
    -- =============================
    INSERT INTO workout_sessions (name, session_date, notes, week_id, order_index, started_at, resumed_at, duration, is_current, is_completed) VALUES
    -- PPL Block 1 Week 1 (completed week)
    ('Push Day', '2026-02-20', 'Felt strong today', '33333333-3333-3333-3333-333333333333', 1, '2026-02-20 06:00:00', NULL, 3720, 0, 1),
    ('Pull Day', '2026-02-21', 'Good pump on back', '33333333-3333-3333-3333-333333333333', 2, '2026-02-21 06:30:00', NULL, 4080, 0, 1),
    ('Leg Day', '2026-02-22', 'Heavy squats', '33333333-3333-3333-3333-333333333333', 3, '2026-02-22 07:00:00', NULL, 5400, 0, 1),
    -- PPL Block 1 Week 2 (current week)
    ('Push Day', '2026-02-27', NULL, '55555555-5555-5555-5555-555555555555', 1, '2026-02-27 06:00:00', NULL, 3900, 0, 1),
    ('Pull Day', '2026-02-28', NULL, '55555555-5555-5555-5555-555555555555', 2, '2026-02-26 06:30:00', NULL, NULL, 1, 0),
    ('Leg Day', '2026-03-01', NULL, '55555555-5555-5555-5555-555555555555', 3, NULL, NULL, NULL, 0, 0),
    -- PPL Block 2 Week 1 (not started)
    ('Peak Push', '2026-03-06', NULL, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 1, NULL, NULL, NULL, 0, 0),
    ('Peak Pull', '2026-03-07', NULL, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 2, NULL, NULL, NULL, 0, 0),
    ('Peak Legs', '2026-03-08', NULL, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 3, NULL, NULL, NULL, 0, 0),
    -- 5/3/1 Accumulation Week 1 (not started)
    ('Squat Day', '2026-03-10', NULL, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', 1, NULL, NULL, NULL, 0, 0),
    ('Press Day', '2026-03-12', NULL, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', 2, NULL, NULL, NULL, 0, 0),
    ('Deadlift Day', '2026-03-14', NULL, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', 3, NULL, NULL, NULL, 0, 0),
    -- 5/3/1 Accumulation Week 2 (not started)
    ('Squat Day', '2026-03-17', NULL, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', 1, NULL, NULL, NULL, 0, 0),
    ('Press Day', '2026-03-19', NULL, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', 2, NULL, NULL, NULL, 0, 0),
    ('Deadlift Day', '2026-03-21', NULL, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', 3, NULL, NULL, NULL, 0, 0),
    -- Standalone sessions
    ('Upper Body', '2026-02-23', NULL, NULL, NULL, '2026-02-23 08:00:00', NULL, 2700, 0, 1),
    ('Lower Body', '2026-02-24', 'Recovery session', NULL, NULL, '2026-02-24 09:00:00', NULL, 3300, 0, 1),
    ('Full Body', '2026-02-25', 'Quick workout', NULL, NULL, NULL, NULL, NULL, 0, 0);

    -- =============================
    -- Target Session Exercises and Sets (Push Day - Week 1)
    -- =============================

    DECLARE @pushDayId UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE name = 'Push Day' AND session_date = '2026-02-20');
    DECLARE @benchPressId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Bench Press');
    DECLARE @inclineBenchId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Incline Bench Press');
    DECLARE @overheadPressId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Overhead Press');
    DECLARE @tricepExtensionId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Tricep Extension');
    DECLARE @lateralRaiseId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lateral Raise');

    -- Target exercises for Push Day
    DECLARE @tse_bench UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_incline UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_exercises (id, session_id, exercise_id, order_index) VALUES
    (@tse_bench, @pushDayId, @benchPressId, 1),
    (@tse_incline, @pushDayId, @inclineBenchId, 2);

    -- Target sets for Bench Press: 1 warmup + 3 working
    DECLARE @tss_bench_w1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_bench_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_bench_2 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_bench_3 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_exercise_sets (id, target_session_exercise_id, set_number, is_warmup, reps, weight, rpe) VALUES
    (@tss_bench_w1, @tse_bench, 1, 1, 8, 185.0, 6.0),
    (@tss_bench_1, @tse_bench, 1, 0, 6, 205.0, 7.0),
    (@tss_bench_2, @tse_bench, 2, 0, 6, 215.0, 8.0),
    (@tss_bench_3, @tse_bench, 3, 0, 6, 225.0, 8.5);

    -- Target sets for Incline Bench: 3 working
    DECLARE @tss_incline_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_incline_2 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_incline_3 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_exercise_sets (id, target_session_exercise_id, set_number, is_warmup, reps, weight, rpe) VALUES
    (@tss_incline_1, @tse_incline, 1, 0, 8, 145.0, 7.0),
    (@tss_incline_2, @tse_incline, 2, 0, 8, 145.0, 7.5),
    (@tss_incline_3, @tse_incline, 3, 0, 8, 145.0, 8.0);

    -- =============================
    -- Session Exercises and Sets
    -- =============================

    DECLARE @se_push_bench UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_incline UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_ohp UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_tricep UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_lateral UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_exercises (id, session_id, exercise_id, target_id, order_index, notes) VALUES
    (@se_push_bench, @pushDayId, @benchPressId, @tse_bench, 1, 'Felt strong on warmups'),
    (@se_push_incline, @pushDayId, @inclineBenchId, @tse_incline, 2, NULL),
    (@se_push_ohp, @pushDayId, @overheadPressId, NULL, 3, NULL),
    (@se_push_tricep, @pushDayId, @tricepExtensionId, NULL, 4, NULL),
    (@se_push_lateral, @pushDayId, @lateralRaiseId, NULL, 5, NULL);

    INSERT INTO session_exercise_sets (session_exercise_id, set_number, is_warmup, reps, weight, rpe, notes) VALUES
    -- Bench Press: 1 warmup + 3 working sets
    (@se_push_bench, 1, 1, 8, 185.0, 6.5, NULL),
    (@se_push_bench, 1, 0, 6, 205.0, 7.5, NULL),
    (@se_push_bench, 2, 0, 5, 215.0, 8.0, NULL),
    (@se_push_bench, 3, 0, 4, 225.0, 8.5, 'Grind on last rep'),
    -- Incline Bench: 3 working sets
    (@se_push_incline, 1, 0, 8, 145.0, 7.0, NULL),
    (@se_push_incline, 2, 0, 7, 145.0, 7.5, NULL),
    (@se_push_incline, 3, 0, 6, 145.0, 8.0, NULL),
    -- Overhead Press: 3 working sets
    (@se_push_ohp, 1, 0, 8, 105.0, 7.0, NULL),
    (@se_push_ohp, 2, 0, 6, 115.0, 8.0, NULL),
    (@se_push_ohp, 3, 0, 5, 115.0, 8.5, NULL),
    -- Tricep Extension: 3 working sets
    (@se_push_tricep, 1, 0, 12, 50.0, 7.0, NULL),
    (@se_push_tricep, 2, 0, 10, 50.0, 7.5, NULL),
    (@se_push_tricep, 3, 0, 10, 50.0, 8.0, NULL),
    -- Lateral Raise: 3 working sets
    (@se_push_lateral, 1, 0, 15, 20.0, 7.0, NULL),
    (@se_push_lateral, 2, 0, 12, 20.0, 7.5, NULL),
    (@se_push_lateral, 3, 0, 12, 20.0, 8.0, NULL);

    -- Leg Day exercises
    DECLARE @legDayId UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE name = 'Leg Day' AND session_date = '2026-02-22');
    DECLARE @backSquatId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Back Squat');
    DECLARE @romanianDeadliftId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Romanian Deadlift');
    DECLARE @legPressId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Leg Press');
    DECLARE @splitSquatId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Split Squat');
    DECLARE @plankId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Plank');

    DECLARE @se_leg_squat UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_rdl UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_press UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_split UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_plank UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_exercises (id, session_id, exercise_id, target_id, order_index, notes) VALUES
    (@se_leg_squat, @legDayId, @backSquatId, NULL, 1, 'Heavy day'),
    (@se_leg_rdl, @legDayId, @romanianDeadliftId, NULL, 2, NULL),
    (@se_leg_press, @legDayId, @legPressId, NULL, 3, NULL),
    (@se_leg_split, @legDayId, @splitSquatId, NULL, 4, 'Left side weaker'),
    (@se_leg_plank, @legDayId, @plankId, NULL, 5, NULL);

    INSERT INTO session_exercise_sets (session_exercise_id, set_number, is_warmup, reps, weight, rpe, notes) VALUES
    -- Back Squat: 1 warmup + 4 working sets
    (@se_leg_squat, 1, 1, 5, 135.0, NULL, NULL),
    (@se_leg_squat, 1, 0, 5, 205.0, 7.0, NULL),
    (@se_leg_squat, 2, 0, 5, 215.0, 7.5, NULL),
    (@se_leg_squat, 3, 0, 4, 225.0, 8.0, NULL),
    (@se_leg_squat, 4, 0, 3, 235.0, 8.5, NULL),
    -- Romanian Deadlift: 3 working sets
    (@se_leg_rdl, 1, 0, 8, 185.0, 7.0, NULL),
    (@se_leg_rdl, 2, 0, 8, 185.0, 7.5, NULL),
    (@se_leg_rdl, 3, 0, 6, 195.0, 8.0, NULL),
    -- Leg Press: 3 working sets
    (@se_leg_press, 1, 0, 10, 360.0, 7.0, NULL),
    (@se_leg_press, 2, 0, 10, 360.0, 7.5, NULL),
    (@se_leg_press, 3, 0, 8, 380.0, 8.0, NULL),
    -- Split Squat: 3 working sets (per leg, weight is per dumbbell)
    (@se_leg_split, 1, 0, 10, 40.0, 7.5, NULL),
    (@se_leg_split, 2, 0, 8, 40.0, 8.0, NULL),
    (@se_leg_split, 3, 0, 8, 40.0, 8.5, NULL),
    -- Plank: 3 working sets (weight in seconds held, using 0 for bodyweight)
    (@se_leg_plank, 1, 0, 1, 0.0, 7.0, '45 seconds'),
    (@se_leg_plank, 2, 0, 1, 0.0, 7.5, '40 seconds'),
    (@se_leg_plank, 3, 0, 1, 0.0, 8.0, '35 seconds');

    -- Pull Day exercises
    DECLARE @pullDayId UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE name = 'Pull Day' AND session_date = '2026-02-21');
    DECLARE @pullUpId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Pull-Up');
    DECLARE @barbellRowId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Barbell Row');
    DECLARE @latPulldownId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lat Pulldown');
    DECLARE @facePullId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Face Pull');
    DECLARE @bicepCurlId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Bicep Curl');

    DECLARE @se_pull_pullup UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_row UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_lat UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_face UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_curl UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_exercises (id, session_id, exercise_id, target_id, order_index, notes) VALUES
    (@se_pull_pullup, @pullDayId, @pullUpId, NULL, 1, NULL),
    (@se_pull_row, @pullDayId, @barbellRowId, NULL, 2, 'Overhand grip'),
    (@se_pull_lat, @pullDayId, @latPulldownId, NULL, 3, NULL),
    (@se_pull_face, @pullDayId, @facePullId, NULL, 4, NULL),
    (@se_pull_curl, @pullDayId, @bicepCurlId, NULL, 5, 'Hammer curls to avoid elbow');

    INSERT INTO session_exercise_sets (session_exercise_id, set_number, is_warmup, reps, weight, rpe, notes) VALUES
    -- Pull-Up: 1 warmup (bodyweight) + 2 working sets (weighted)
    (@se_pull_pullup, 1, 1, 8, 0.0, NULL, 'Bodyweight'),
    (@se_pull_pullup, 1, 0, 6, 25.0, 8.0, 'Added 25lb'),
    (@se_pull_pullup, 2, 0, 5, 25.0, 8.5, NULL),
    -- Barbell Row: 3 working sets
    (@se_pull_row, 1, 0, 8, 155.0, 7.0, NULL),
    (@se_pull_row, 2, 0, 6, 165.0, 7.5, NULL),
    (@se_pull_row, 3, 0, 6, 165.0, 8.0, NULL),
    -- Lat Pulldown: 3 working sets
    (@se_pull_lat, 1, 0, 10, 140.0, 7.0, NULL),
    (@se_pull_lat, 2, 0, 8, 150.0, 7.5, NULL),
    (@se_pull_lat, 3, 0, 8, 150.0, 8.0, NULL),
    -- Face Pull: 3 working sets
    (@se_pull_face, 1, 0, 15, 40.0, 6.5, NULL),
    (@se_pull_face, 2, 0, 12, 45.0, 7.0, NULL),
    (@se_pull_face, 3, 0, 12, 45.0, 7.5, NULL),
    -- Bicep Curl: 3 working sets
    (@se_pull_curl, 1, 0, 12, 30.0, 7.0, NULL),
    (@se_pull_curl, 2, 0, 10, 30.0, 7.5, NULL),
    (@se_pull_curl, 3, 0, 10, 30.0, 8.0, NULL);

    -- =============================
    -- Target Session Exercises and Sets (Pull Day - Week 2, currently active)
    -- =============================

    DECLARE @pullDay2Id UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE name = 'Pull Day' AND session_date = '2026-02-28');
    DECLARE @pullUpId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Pull-Up');
    DECLARE @barbellRowId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Barbell Row');
    DECLARE @latPulldownId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lat Pulldown');
    DECLARE @facePullId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Face Pull');
    DECLARE @bicepCurlId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Bicep Curl');

    -- Target exercises for Pull Day Week 2
    DECLARE @tse_pull2_pullup UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_pull2_row UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_exercises (id, session_id, exercise_id, order_index) VALUES
    (@tse_pull2_pullup, @pullDay2Id, @pullUpId2, 1),
    (@tse_pull2_row, @pullDay2Id, @barbellRowId2, 2);

    -- Target sets for Pull-Up: 1 warmup + 2 working
    DECLARE @tss_pull2_pullup_w1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_pullup_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_pullup_2 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_exercise_sets (id, target_session_exercise_id, set_number, is_warmup, reps, weight, rpe) VALUES
    (@tss_pull2_pullup_w1, @tse_pull2_pullup, 1, 1, 8, 0.0, NULL),
    (@tss_pull2_pullup_1, @tse_pull2_pullup, 1, 0, 6, 25.0, 7.5),
    (@tss_pull2_pullup_2, @tse_pull2_pullup, 2, 0, 6, 25.0, 8.0);

    -- Target sets for Barbell Row: 3 working
    DECLARE @tss_pull2_row_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_row_2 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_row_3 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_exercise_sets (id, target_session_exercise_id, set_number, is_warmup, reps, weight, rpe) VALUES
    (@tss_pull2_row_1, @tse_pull2_row, 1, 0, 8, 165.0, 7.0),
    (@tss_pull2_row_2, @tse_pull2_row, 2, 0, 8, 165.0, 7.5),
    (@tss_pull2_row_3, @tse_pull2_row, 3, 0, 8, 165.0, 8.0);

    -- Session exercises for Pull Day Week 2 (linked to targets where applicable)
    DECLARE @se_pull2_pullup UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_row UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_lat UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_face UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_curl UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_exercises (id, session_id, exercise_id, target_id, order_index, notes) VALUES
    (@se_pull2_pullup, @pullDay2Id, @pullUpId2, @tse_pull2_pullup, 1, NULL),
    (@se_pull2_row, @pullDay2Id, @barbellRowId2, @tse_pull2_row, 2, NULL),
    (@se_pull2_lat, @pullDay2Id, @latPulldownId2, NULL, 3, NULL),
    (@se_pull2_face, @pullDay2Id, @facePullId2, NULL, 4, NULL),
    (@se_pull2_curl, @pullDay2Id, @bicepCurlId2, NULL, 5, NULL);

    INSERT INTO session_exercise_sets (session_exercise_id, set_number, is_warmup, reps, weight, rpe, notes) VALUES
    -- Pull-Up: 1 warmup + 2 working (some values differ from targets)
    (@se_pull2_pullup, 1, 1, 8, 0.0, NULL, NULL),
    (@se_pull2_pullup, 1, 0, 7, 25.0, 7.0, NULL),
    (@se_pull2_pullup, 2, 0, 5, 30.0, 8.5, NULL),
    -- Barbell Row: 3 working (some values differ from targets)
    (@se_pull2_row, 1, 0, 8, 165.0, 7.0, NULL),
    (@se_pull2_row, 2, 0, 7, 170.0, 8.0, NULL),
    (@se_pull2_row, 3, 0, 6, 170.0, 8.5, NULL),
    -- Lat Pulldown: 3 working (no target)
    (@se_pull2_lat, 1, 0, 10, 145.0, 7.0, NULL),
    (@se_pull2_lat, 2, 0, 8, 155.0, 7.5, NULL),
    (@se_pull2_lat, 3, 0, 8, 155.0, 8.0, NULL),
    -- Face Pull: 3 working (no target)
    (@se_pull2_face, 1, 0, 15, 45.0, 6.5, NULL),
    (@se_pull2_face, 2, 0, 12, 45.0, 7.0, NULL),
    (@se_pull2_face, 3, 0, 12, 45.0, 7.5, NULL),
    -- Bicep Curl: 3 working (no target)
    (@se_pull2_curl, 1, 0, 12, 30.0, 7.0, NULL),
    (@se_pull2_curl, 2, 0, 10, 35.0, 7.5, NULL),
    (@se_pull2_curl, 3, 0, 10, 35.0, 8.0, NULL);

    -- =============================
    -- Target Session Exercises and Sets (Leg Day - Week 2, not started)
    -- =============================

    DECLARE @legDay2Id UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE name = 'Leg Day' AND session_date = '2026-03-01');
    DECLARE @backSquatId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Back Squat');
    DECLARE @romanianDeadliftId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Romanian Deadlift');
    DECLARE @legPressId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Leg Press');

    -- Target exercises for Leg Day Week 2
    DECLARE @tse_leg2_squat UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_leg2_rdl UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_leg2_press UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_exercises (id, session_id, exercise_id, order_index) VALUES
    (@tse_leg2_squat, @legDay2Id, @backSquatId2, 1),
    (@tse_leg2_rdl, @legDay2Id, @romanianDeadliftId2, 2),
    (@tse_leg2_press, @legDay2Id, @legPressId2, 3);

    -- Target sets for Back Squat: 1 warmup + 4 working
    INSERT INTO target_session_exercise_sets (target_session_exercise_id, set_number, is_warmup, reps, weight, rpe) VALUES
    (@tse_leg2_squat, 1, 1, 5, 135.0, NULL),
    (@tse_leg2_squat, 1, 0, 5, 215.0, 7.0),
    (@tse_leg2_squat, 2, 0, 5, 225.0, 7.5),
    (@tse_leg2_squat, 3, 0, 4, 235.0, 8.0),
    (@tse_leg2_squat, 4, 0, 3, 245.0, 8.5);

    -- Target sets for Romanian Deadlift: 3 working
    INSERT INTO target_session_exercise_sets (target_session_exercise_id, set_number, is_warmup, reps, weight, rpe) VALUES
    (@tse_leg2_rdl, 1, 0, 8, 195.0, 7.0),
    (@tse_leg2_rdl, 2, 0, 8, 195.0, 7.5),
    (@tse_leg2_rdl, 3, 0, 6, 205.0, 8.0);

    -- Target sets for Leg Press: 3 working
    INSERT INTO target_session_exercise_sets (target_session_exercise_id, set_number, is_warmup, reps, weight, rpe) VALUES
    (@tse_leg2_press, 1, 0, 10, 380.0, 7.0),
    (@tse_leg2_press, 2, 0, 10, 380.0, 7.5),
    (@tse_leg2_press, 3, 0, 8, 400.0, 8.0);

    COMMIT TRANSACTION WestDbSampleRecords;
    PRINT '';
    PRINT 'WEST records created successfully.'

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION WestDbSampleRecords;
    END

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Migration failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;

    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH
