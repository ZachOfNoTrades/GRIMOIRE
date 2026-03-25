-- =============================
-- Workout Tracker (GOLEM) Sample Data
-- Version: 202603070227 (Intitial release v0.2.0)
-- =============================

BEGIN TRANSACTION GolemDbSampleRecords;
BEGIN TRY

    -- Sample user ID (must match sql_samples_main.sql admin user)
    DECLARE @sampleUserId UNIQUEIDENTIFIER = '10000000-0000-0000-0000-000000000001';

    -- =============================
    -- Programs
    -- =============================
    INSERT INTO programs (id, user_id, name, description, template_id, is_current, is_completed, is_archived) VALUES
    ('11111111-1111-1111-1111-111111111111', @sampleUserId, 'Push/Pull/Legs Program', NULL, NULL, 1, 0, 0),
    ('66666666-6666-6666-6666-666666666666', @sampleUserId, '5/3/1 Strength Program', 'Jim Wendler strength base-building', NULL, 0, 0, 0);

    -- =============================
    -- Blocks
    -- =============================
    -- Push/Pull/Legs Program blocks
    INSERT INTO blocks (id, user_id, program_id, name, order_index, tag, color, is_current) VALUES
    ('22222222-2222-2222-2222-222222222222', @sampleUserId, '11111111-1111-1111-1111-111111111111', 'Block 1', 1, 'Hypertrophy', '#3B82F6', 1),
    ('44444444-4444-4444-4444-444444444444', @sampleUserId, '11111111-1111-1111-1111-111111111111', 'Block 2', 2, 'Peaking', '#EF4444', 0);

    -- 5/3/1 Strength Program blocks
    INSERT INTO blocks (id, user_id, program_id, name, order_index, tag, color, is_current) VALUES
    ('77777777-7777-7777-7777-777777777777', @sampleUserId, '66666666-6666-6666-6666-666666666666', 'Accumulation', 1, 'Volume', '#8B5CF6', 0);

    -- =============================
    -- Weeks
    -- =============================
    -- Push/Pull/Legs Block 1 weeks
    INSERT INTO weeks (id, user_id, block_id, week_number, is_current) VALUES
    ('33333333-3333-3333-3333-333333333333', @sampleUserId, '22222222-2222-2222-2222-222222222222', 1, 0),
    ('55555555-5555-5555-5555-555555555555', @sampleUserId, '22222222-2222-2222-2222-222222222222', 2, 1);

    -- Push/Pull/Legs Block 2 weeks
    INSERT INTO weeks (id, user_id, block_id, week_number, is_current) VALUES
    ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', @sampleUserId, '44444444-4444-4444-4444-444444444444', 1, 0);

    -- 5/3/1 Accumulation weeks
    INSERT INTO weeks (id, user_id, block_id, week_number, is_current) VALUES
    ('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', @sampleUserId, '77777777-7777-7777-7777-777777777777', 1, 0),
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', @sampleUserId, '77777777-7777-7777-7777-777777777777', 2, 0);

    -- =============================
    -- Workout Sessions
    -- =============================
    INSERT INTO workout_sessions (user_id, name, description, review, analysis, week_id, order_index, started_at, resumed_at, duration, is_current, is_completed) VALUES
    -- PPL Block 1 Week 1 (completed week)
    (@sampleUserId, 'Push Day', 'Felt strong today', 'Hit a PR on bench press. Slight twinge in right shoulder on last set of overhead press — will monitor.', 'Strong push session. Bench press exceeded targets on all working sets. Overhead press RPE was higher than prescribed — monitor right shoulder. Tricep and lateral raise volume was solid. Consider adding a warmup set for overhead press next session.', '33333333-3333-3333-3333-333333333333', 1, '2026-02-20 06:00:00', NULL, 3720, 0, 1),
    (@sampleUserId, 'Pull Day', 'Good pump on back', 'Great mind-muscle connection on rows. Need to work on grip strength for heavier deadlift sets.', NULL, '33333333-3333-3333-3333-333333333333', 2, '2026-02-21 06:30:00', NULL, 4080, 0, 1),
    (@sampleUserId, 'Leg Day', 'Heavy squats', 'Squats felt solid. Left knee slightly achy after split squats — try warming up more next time.', NULL, '33333333-3333-3333-3333-333333333333', 3, '2026-02-22 07:00:00', NULL, 5400, 0, 1),
    -- PPL Block 1 Week 2 (current week)
    (@sampleUserId, 'Push Day', NULL, NULL, NULL, '55555555-5555-5555-5555-555555555555', 1, '2026-02-27 06:00:00', NULL, 3900, 0, 1),
    (@sampleUserId, 'Pull Day', NULL, NULL, NULL, '55555555-5555-5555-5555-555555555555', 2, '2026-02-26 06:30:00', NULL, NULL, 1, 0),
    (@sampleUserId, 'Leg Day', NULL, NULL, NULL, '55555555-5555-5555-5555-555555555555', 3, NULL, NULL, NULL, 0, 0),
    -- PPL Block 2 Week 1 (not started)
    (@sampleUserId, 'Peak Push', NULL, NULL, NULL, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 1, NULL, NULL, NULL, 0, 0),
    (@sampleUserId, 'Peak Pull', NULL, NULL, NULL, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 2, NULL, NULL, NULL, 0, 0),
    (@sampleUserId, 'Peak Legs', NULL, NULL, NULL, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 3, NULL, NULL, NULL, 0, 0),
    -- 5/3/1 Accumulation Week 1 (not started)
    (@sampleUserId, 'Squat Day', NULL, NULL, NULL, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', 1, NULL, NULL, NULL, 0, 0),
    (@sampleUserId, 'Press Day', NULL, NULL, NULL, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', 2, NULL, NULL, NULL, 0, 0),
    (@sampleUserId, 'Deadlift Day', NULL, NULL, NULL, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', 3, NULL, NULL, NULL, 0, 0),
    -- 5/3/1 Accumulation Week 2 (not started)
    (@sampleUserId, 'Squat Day', NULL, NULL, NULL, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', 1, NULL, NULL, NULL, 0, 0),
    (@sampleUserId, 'Press Day', NULL, NULL, NULL, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', 2, NULL, NULL, NULL, 0, 0),
    (@sampleUserId, 'Deadlift Day', NULL, NULL, NULL, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', 3, NULL, NULL, NULL, 0, 0),
    -- Standalone sessions
    (@sampleUserId, 'Upper Body', NULL, 'Good session overall. Energy was high.', NULL, NULL, NULL, '2026-02-23 08:00:00', NULL, 2700, 0, 1),
    (@sampleUserId, 'Lower Body', 'Recovery session', 'Kept it light as planned. Hamstrings still tight from Thursday.', NULL, NULL, NULL, '2026-02-24 09:00:00', NULL, 3300, 0, 1),
    (@sampleUserId, 'Full Body', 'Quick workout', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0);

    -- =============================
    -- Target Session Segments and Sets (Push Day - Week 1)
    -- =============================

    DECLARE @pushDayId UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE week_id = '33333333-3333-3333-3333-333333333333' AND order_index = 1);
    DECLARE @benchPressId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Bench Press');
    DECLARE @inclineBenchId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Incline Bench Press');
    DECLARE @overheadPressId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Overhead Press');
    DECLARE @tricepExtensionId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Tricep Pushdown With Bar');
    DECLARE @lateralRaiseId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Dumbbell Lateral Raise');

    -- Target segments for Push Day
    DECLARE @tse_bench UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_incline UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_segments (id, user_id, session_id, exercise_id, order_index, is_warmup) VALUES
    (@tse_bench, @sampleUserId, @pushDayId, @benchPressId, 1, 0),
    (@tse_incline, @sampleUserId, @pushDayId, @inclineBenchId, 2, 0);

    -- Target sets for Bench Press: 1 warmup + 3 working
    DECLARE @tss_bench_w1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_bench_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_bench_2 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_bench_3 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_segment_sets (id, user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds) VALUES
    (@tss_bench_w1, @sampleUserId, @tse_bench, 1, 1, 8, 185.0, 6.0, NULL),
    (@tss_bench_1, @sampleUserId, @tse_bench, 1, 0, 6, 205.0, 7.0, NULL),
    (@tss_bench_2, @sampleUserId, @tse_bench, 2, 0, 6, 215.0, 8.0, NULL),
    (@tss_bench_3, @sampleUserId, @tse_bench, 3, 0, 6, 225.0, 8.5, NULL);

    -- Target sets for Incline Bench: 3 working
    DECLARE @tss_incline_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_incline_2 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_incline_3 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_segment_sets (id, user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds) VALUES
    (@tss_incline_1, @sampleUserId, @tse_incline, 1, 0, 8, 145.0, 7.0, NULL),
    (@tss_incline_2, @sampleUserId, @tse_incline, 2, 0, 8, 145.0, 7.5, NULL),
    (@tss_incline_3, @sampleUserId, @tse_incline, 3, 0, 8, 145.0, 8.0, NULL);

    -- =============================
    -- Session Segments and Sets
    -- =============================

    DECLARE @se_push_bench UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_incline UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_ohp UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_tricep UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_push_lateral UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_segments (id, user_id, session_id, exercise_id, target_id, order_index, is_warmup, notes) VALUES
    (@se_push_bench, @sampleUserId, @pushDayId, @benchPressId, @tse_bench, 1, 0, 'Felt strong on warmups'),
    (@se_push_incline, @sampleUserId, @pushDayId, @inclineBenchId, @tse_incline, 2, 0, NULL),
    (@se_push_ohp, @sampleUserId, @pushDayId, @overheadPressId, NULL, 3, 0, NULL),
    (@se_push_tricep, @sampleUserId, @pushDayId, @tricepExtensionId, NULL, 4, 0, NULL),
    (@se_push_lateral, @sampleUserId, @pushDayId, @lateralRaiseId, NULL, 5, 0, NULL);

    INSERT INTO session_segment_sets (user_id, session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds, notes, is_completed) VALUES
    -- Bench Press: 1 warmup + 3 working sets
    (@sampleUserId, @se_push_bench, 1, 1, 8, 185.0, 6.5, NULL, NULL, 1),
    (@sampleUserId, @se_push_bench, 1, 0, 6, 205.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_push_bench, 2, 0, 5, 215.0, 8.0, NULL, NULL, 1),
    (@sampleUserId, @se_push_bench, 3, 0, 4, 225.0, 8.5, NULL, 'Grind on last rep', 1),
    -- Incline Bench: 3 working sets
    (@sampleUserId, @se_push_incline, 1, 0, 8, 145.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_push_incline, 2, 0, 7, 145.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_push_incline, 3, 0, 6, 145.0, 8.0, NULL, NULL, 1),
    -- Overhead Press: 3 working sets
    (@sampleUserId, @se_push_ohp, 1, 0, 8, 105.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_push_ohp, 2, 0, 6, 115.0, 8.0, NULL, NULL, 1),
    (@sampleUserId, @se_push_ohp, 3, 0, 5, 115.0, 8.5, NULL, NULL, 1),
    -- Tricep Extension: 3 working sets
    (@sampleUserId, @se_push_tricep, 1, 0, 12, 50.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_push_tricep, 2, 0, 10, 50.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_push_tricep, 3, 0, 10, 50.0, 8.0, NULL, NULL, 1),
    -- Lateral Raise: 3 working sets
    (@sampleUserId, @se_push_lateral, 1, 0, 15, 20.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_push_lateral, 2, 0, 12, 20.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_push_lateral, 3, 0, 12, 20.0, 8.0, NULL, NULL, 1);

    -- Leg Day segments
    DECLARE @legDayId UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE week_id = '33333333-3333-3333-3333-333333333333' AND order_index = 3);
    DECLARE @backSquatId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Back Squat');
    DECLARE @romanianDeadliftId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Romanian Deadlift');
    DECLARE @legPressId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Leg Press');
    DECLARE @splitSquatId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Bulgarian Split Squat');
    DECLARE @plankId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Plank');

    DECLARE @se_leg_squat UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_rdl UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_press UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_split UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_leg_plank UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_segments (id, user_id, session_id, exercise_id, target_id, order_index, is_warmup, notes) VALUES
    (@se_leg_squat, @sampleUserId, @legDayId, @backSquatId, NULL, 1, 0, 'Heavy day'),
    (@se_leg_rdl, @sampleUserId, @legDayId, @romanianDeadliftId, NULL, 2, 0, NULL),
    (@se_leg_press, @sampleUserId, @legDayId, @legPressId, NULL, 3, 0, NULL),
    (@se_leg_split, @sampleUserId, @legDayId, @splitSquatId, NULL, 4, 0, 'Left side weaker'),
    (@se_leg_plank, @sampleUserId, @legDayId, @plankId, NULL, 5, 0, NULL);

    INSERT INTO session_segment_sets (user_id, session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds, notes, is_completed) VALUES
    -- Back Squat: 1 warmup + 4 working sets
    (@sampleUserId, @se_leg_squat, 1, 1, 5, 135.0, NULL, NULL, NULL, 1),
    (@sampleUserId, @se_leg_squat, 1, 0, 5, 205.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_leg_squat, 2, 0, 5, 215.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_leg_squat, 3, 0, 4, 225.0, 8.0, NULL, NULL, 1),
    (@sampleUserId, @se_leg_squat, 4, 0, 3, 235.0, 8.5, NULL, NULL, 1),
    -- Romanian Deadlift: 3 working sets
    (@sampleUserId, @se_leg_rdl, 1, 0, 8, 185.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_leg_rdl, 2, 0, 8, 185.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_leg_rdl, 3, 0, 6, 195.0, 8.0, NULL, NULL, 1),
    -- Leg Press: 3 working sets
    (@sampleUserId, @se_leg_press, 1, 0, 10, 360.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_leg_press, 2, 0, 10, 360.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_leg_press, 3, 0, 8, 380.0, 8.0, NULL, NULL, 1),
    -- Split Squat: 3 working sets (per leg, weight is per dumbbell)
    (@sampleUserId, @se_leg_split, 1, 0, 10, 40.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_leg_split, 2, 0, 8, 40.0, 8.0, NULL, NULL, 1),
    (@sampleUserId, @se_leg_split, 3, 0, 8, 40.0, 8.5, NULL, NULL, 1),
    -- Plank: 3 timed working sets
    (@sampleUserId, @se_leg_plank, 1, 0, NULL, 0.0, 7.0, 45, NULL, 1),
    (@sampleUserId, @se_leg_plank, 2, 0, NULL, 0.0, 7.5, 40, NULL, 1),
    (@sampleUserId, @se_leg_plank, 3, 0, NULL, 0.0, 8.0, 35, NULL, 1);

    -- Pull Day segments
    DECLARE @pullDayId UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE week_id = '33333333-3333-3333-3333-333333333333' AND order_index = 2);
    DECLARE @pullUpId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Pull-Up');
    DECLARE @barbellRowId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Barbell Row');
    DECLARE @latPulldownId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lat Pulldown With Pronated Grip');
    DECLARE @facePullId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Face Pull');
    DECLARE @bicepCurlId UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Barbell Curl');

    DECLARE @se_pull_pullup UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_row UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_lat UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_face UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull_curl UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_segments (id, user_id, session_id, exercise_id, target_id, order_index, is_warmup, notes) VALUES
    (@se_pull_pullup, @sampleUserId, @pullDayId, @pullUpId, NULL, 1, 0, NULL),
    (@se_pull_row, @sampleUserId, @pullDayId, @barbellRowId, NULL, 2, 0, 'Overhand grip'),
    (@se_pull_lat, @sampleUserId, @pullDayId, @latPulldownId, NULL, 3, 0, NULL),
    (@se_pull_face, @sampleUserId, @pullDayId, @facePullId, NULL, 4, 0, NULL),
    (@se_pull_curl, @sampleUserId, @pullDayId, @bicepCurlId, NULL, 5, 0, 'Hammer curls to avoid elbow');

    INSERT INTO session_segment_sets (user_id, session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds, notes, is_completed) VALUES
    -- Pull-Up: 1 warmup (bodyweight) + 2 working sets (weighted)
    (@sampleUserId, @se_pull_pullup, 1, 1, 8, 0.0, NULL, NULL, 'Bodyweight', 1),
    (@sampleUserId, @se_pull_pullup, 1, 0, 6, 25.0, 8.0, NULL, 'Added 25lb', 1),
    (@sampleUserId, @se_pull_pullup, 2, 0, 5, 25.0, 8.5, NULL, NULL, 1),
    -- Barbell Row: 3 working sets
    (@sampleUserId, @se_pull_row, 1, 0, 8, 155.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull_row, 2, 0, 6, 165.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_pull_row, 3, 0, 6, 165.0, 8.0, NULL, NULL, 1),
    -- Lat Pulldown: 3 working sets
    (@sampleUserId, @se_pull_lat, 1, 0, 10, 140.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull_lat, 2, 0, 8, 150.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_pull_lat, 3, 0, 8, 150.0, 8.0, NULL, NULL, 1),
    -- Face Pull: 3 working sets
    (@sampleUserId, @se_pull_face, 1, 0, 15, 40.0, 6.5, NULL, NULL, 1),
    (@sampleUserId, @se_pull_face, 2, 0, 12, 45.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull_face, 3, 0, 12, 45.0, 7.5, NULL, NULL, 1),
    -- Bicep Curl: 3 working sets
    (@sampleUserId, @se_pull_curl, 1, 0, 12, 30.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull_curl, 2, 0, 10, 30.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_pull_curl, 3, 0, 10, 30.0, 8.0, NULL, NULL, 1);

    -- =============================
    -- Target Session Segments and Sets (Pull Day - Week 2, currently active)
    -- =============================

    DECLARE @pullDay2Id UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE week_id = '55555555-5555-5555-5555-555555555555' AND order_index = 2);
    DECLARE @pullUpId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Pull-Up');
    DECLARE @barbellRowId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Barbell Row');
    DECLARE @latPulldownId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Lat Pulldown With Pronated Grip');
    DECLARE @facePullId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Face Pull');
    DECLARE @bicepCurlId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Barbell Curl');

    -- Target segments for Pull Day Week 2
    DECLARE @tse_pull2_pullup UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_pull2_row UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_segments (id, user_id, session_id, exercise_id, order_index, is_warmup) VALUES
    (@tse_pull2_pullup, @sampleUserId, @pullDay2Id, @pullUpId2, 1, 0),
    (@tse_pull2_row, @sampleUserId, @pullDay2Id, @barbellRowId2, 2, 0);

    -- Target sets for Pull-Up: 1 warmup + 2 working
    DECLARE @tss_pull2_pullup_w1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_pullup_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_pullup_2 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_segment_sets (id, user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds) VALUES
    (@tss_pull2_pullup_w1, @sampleUserId, @tse_pull2_pullup, 1, 1, 8, 0.0, NULL, NULL),
    (@tss_pull2_pullup_1, @sampleUserId, @tse_pull2_pullup, 1, 0, 6, 25.0, 7.5, NULL),
    (@tss_pull2_pullup_2, @sampleUserId, @tse_pull2_pullup, 2, 0, 6, 25.0, 8.0, NULL);

    -- Target sets for Barbell Row: 3 working
    DECLARE @tss_pull2_row_1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_row_2 UNIQUEIDENTIFIER = NEWID();
    DECLARE @tss_pull2_row_3 UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_segment_sets (id, user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds) VALUES
    (@tss_pull2_row_1, @sampleUserId, @tse_pull2_row, 1, 0, 8, 165.0, 7.0, NULL),
    (@tss_pull2_row_2, @sampleUserId, @tse_pull2_row, 2, 0, 8, 165.0, 7.5, NULL),
    (@tss_pull2_row_3, @sampleUserId, @tse_pull2_row, 3, 0, 8, 165.0, 8.0, NULL);

    -- Session segments for Pull Day Week 2 (linked to targets where applicable)
    DECLARE @se_pull2_pullup UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_row UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_lat UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_face UNIQUEIDENTIFIER = NEWID();
    DECLARE @se_pull2_curl UNIQUEIDENTIFIER = NEWID();

    INSERT INTO session_segments (id, user_id, session_id, exercise_id, target_id, order_index, is_warmup, notes) VALUES
    (@se_pull2_pullup, @sampleUserId, @pullDay2Id, @pullUpId2, @tse_pull2_pullup, 1, 0, NULL),
    (@se_pull2_row, @sampleUserId, @pullDay2Id, @barbellRowId2, @tse_pull2_row, 2, 0, NULL),
    (@se_pull2_lat, @sampleUserId, @pullDay2Id, @latPulldownId2, NULL, 3, 0, NULL),
    (@se_pull2_face, @sampleUserId, @pullDay2Id, @facePullId2, NULL, 4, 0, NULL),
    (@se_pull2_curl, @sampleUserId, @pullDay2Id, @bicepCurlId2, NULL, 5, 0, NULL);

    INSERT INTO session_segment_sets (user_id, session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds, notes, is_completed) VALUES
    -- Pull-Up: 1 warmup + 2 working (some values differ from targets)
    (@sampleUserId, @se_pull2_pullup, 1, 1, 8, 0.0, NULL, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_pullup, 1, 0, 7, 25.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_pullup, 2, 0, 5, 30.0, 8.5, NULL, NULL, 1),
    -- Barbell Row: 3 working (some values differ from targets)
    (@sampleUserId, @se_pull2_row, 1, 0, 8, 165.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_row, 2, 0, 7, 170.0, 8.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_row, 3, 0, 6, 170.0, 8.5, NULL, NULL, 1),
    -- Lat Pulldown: 3 working (no target)
    (@sampleUserId, @se_pull2_lat, 1, 0, 10, 145.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_lat, 2, 0, 8, 155.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_lat, 3, 0, 8, 155.0, 8.0, NULL, NULL, 1),
    -- Face Pull: 3 working (no target)
    (@sampleUserId, @se_pull2_face, 1, 0, 15, 45.0, 6.5, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_face, 2, 0, 12, 45.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_face, 3, 0, 12, 45.0, 7.5, NULL, NULL, 1),
    -- Bicep Curl: 3 working (no target)
    (@sampleUserId, @se_pull2_curl, 1, 0, 12, 30.0, 7.0, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_curl, 2, 0, 10, 35.0, 7.5, NULL, NULL, 1),
    (@sampleUserId, @se_pull2_curl, 3, 0, 10, 35.0, 8.0, NULL, NULL, 1);

    -- =============================
    -- Target Session Segments and Sets (Leg Day - Week 2, not started)
    -- =============================

    DECLARE @legDay2Id UNIQUEIDENTIFIER = (SELECT id FROM workout_sessions WHERE week_id = '55555555-5555-5555-5555-555555555555' AND order_index = 3);
    DECLARE @backSquatId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Back Squat');
    DECLARE @romanianDeadliftId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Romanian Deadlift');
    DECLARE @legPressId2 UNIQUEIDENTIFIER = (SELECT id FROM exercises WHERE name = 'Leg Press');

    -- Target segments for Leg Day Week 2
    DECLARE @tse_leg2_squat UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_leg2_rdl UNIQUEIDENTIFIER = NEWID();
    DECLARE @tse_leg2_press UNIQUEIDENTIFIER = NEWID();

    INSERT INTO target_session_segments (id, user_id, session_id, exercise_id, order_index, is_warmup) VALUES
    (@tse_leg2_squat, @sampleUserId, @legDay2Id, @backSquatId2, 1, 0),
    (@tse_leg2_rdl, @sampleUserId, @legDay2Id, @romanianDeadliftId2, 2, 0),
    (@tse_leg2_press, @sampleUserId, @legDay2Id, @legPressId2, 3, 0);

    -- Target sets for Back Squat: 1 warmup + 4 working
    INSERT INTO target_session_segment_sets (user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds) VALUES
    (@sampleUserId, @tse_leg2_squat, 1, 1, 5, 135.0, NULL, NULL),
    (@sampleUserId, @tse_leg2_squat, 1, 0, 5, 215.0, 7.0, NULL),
    (@sampleUserId, @tse_leg2_squat, 2, 0, 5, 225.0, 7.5, NULL),
    (@sampleUserId, @tse_leg2_squat, 3, 0, 4, 235.0, 8.0, NULL),
    (@sampleUserId, @tse_leg2_squat, 4, 0, 3, 245.0, 8.5, NULL);

    -- Target sets for Romanian Deadlift: 3 working
    INSERT INTO target_session_segment_sets (user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds) VALUES
    (@sampleUserId, @tse_leg2_rdl, 1, 0, 8, 195.0, 7.0, NULL),
    (@sampleUserId, @tse_leg2_rdl, 2, 0, 8, 195.0, 7.5, NULL),
    (@sampleUserId, @tse_leg2_rdl, 3, 0, 6, 205.0, 8.0, NULL);

    -- Target sets for Leg Press: 3 working
    INSERT INTO target_session_segment_sets (user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds) VALUES
    (@sampleUserId, @tse_leg2_press, 1, 0, 10, 380.0, 7.0, NULL),
    (@sampleUserId, @tse_leg2_press, 2, 0, 10, 380.0, 7.5, NULL),
    (@sampleUserId, @tse_leg2_press, 3, 0, 8, 400.0, 8.0, NULL);

    COMMIT TRANSACTION GolemDbSampleRecords;
    PRINT '';
    PRINT 'GOLEM records created successfully.'

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION GolemDbSampleRecords;
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
