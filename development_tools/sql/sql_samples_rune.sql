-- =============================
-- Flash Cards (RUNE) Sample Data
-- Version: 202603180000
-- =============================

BEGIN TRANSACTION RuneDbSampleRecords;
BEGIN TRY

    -- Sample user ID (must match sql_samples_main.sql admin user)
    DECLARE @sampleUserId UNIQUEIDENTIFIER = '10000000-0000-0000-0000-000000000001';

    -- =============================
    -- Decks
    -- =============================
    INSERT INTO decks (id, user_id, name, description, is_archived) VALUES
    ('11111111-1111-1111-1111-111111111111', @sampleUserId, 'Anatomy & Physiology', 'Major muscles, bones, and body systems', 0),
    ('22222222-2222-2222-2222-222222222222', @sampleUserId, 'Japanese N5 Vocabulary', 'JLPT N5 level vocabulary', 0),
    ('33333333-3333-3333-3333-333333333333', @sampleUserId, 'SQL Fundamentals', 'Core SQL concepts and syntax', 1);

    -- =============================
    -- Cards
    -- =============================
    -- Anatomy deck cards
    INSERT INTO cards (id, user_id, deck_id, front, back, notes, source, source_id, order_index, is_disabled) VALUES
    ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', @sampleUserId, '11111111-1111-1111-1111-111111111111', 'What muscle is the primary hip extensor?', 'Gluteus Maximus', 'Also assists with external rotation of the hip', 'manual', NULL, 1, 0),
    ('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', @sampleUserId, '11111111-1111-1111-1111-111111111111', 'What are the three heads of the triceps?', 'Long head, lateral head, medial head', 'The long head crosses the shoulder joint', 'manual', NULL, 2, 0),
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', @sampleUserId, '11111111-1111-1111-1111-111111111111', 'What is the origin of the pectoralis major?', 'Clavicle, sternum, and upper ribs', NULL, 'manual', NULL, 3, 0),
    ('DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD', @sampleUserId, '11111111-1111-1111-1111-111111111111', 'What does the anterior deltoid do?', 'Shoulder flexion and internal rotation', NULL, 'manual', NULL, 4, 0);

    -- Japanese deck cards
    INSERT INTO cards (id, user_id, deck_id, front, back, notes, source, source_id, order_index, is_disabled) VALUES
    ('EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE', @sampleUserId, '22222222-2222-2222-2222-222222222222', '食べる', 'たべる — to eat', 'Ichidan (ru-verb)', 'manual', NULL, 1, 0),
    ('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', @sampleUserId, '22222222-2222-2222-2222-222222222222', '飲む', 'のむ — to drink', 'Godan (u-verb)', 'manual', NULL, 2, 0),
    ('44444444-4444-4444-4444-444444444444', @sampleUserId, '22222222-2222-2222-2222-222222222222', '大きい', 'おおきい — big, large', 'i-adjective', 'manual', NULL, 3, 0);

    -- SQL deck cards (archived deck)
    INSERT INTO cards (id, user_id, deck_id, front, back, notes, source, source_id, order_index, is_disabled) VALUES
    ('55555555-5555-5555-5555-555555555555', @sampleUserId, '33333333-3333-3333-3333-333333333333', 'What does INNER JOIN do?', 'Returns only rows that have matching values in both tables', NULL, 'manual', NULL, 1, 0),
    ('66666666-6666-6666-6666-666666666666', @sampleUserId, '33333333-3333-3333-3333-333333333333', 'Difference between WHERE and HAVING?', 'WHERE filters rows before grouping; HAVING filters groups after GROUP BY', NULL, 'manual', NULL, 2, 0);

    -- =============================
    -- Study Sessions
    -- =============================
    INSERT INTO study_sessions (id, user_id, deck_id, started_at, completed_at, duration, cards_studied, cards_correct) VALUES
    ('77777777-7777-7777-7777-777777777777', @sampleUserId, '11111111-1111-1111-1111-111111111111', '2026-03-15 09:00:00', '2026-03-15 09:08:00', 480, 4, 3),
    ('88888888-8888-8888-8888-888888888888', @sampleUserId, '11111111-1111-1111-1111-111111111111', '2026-03-17 08:30:00', '2026-03-17 08:35:00', 300, 4, 4),
    ('99999999-9999-9999-9999-999999999999', @sampleUserId, '22222222-2222-2222-2222-222222222222', '2026-03-16 20:00:00', '2026-03-16 20:05:00', 300, 3, 2);

    -- =============================
    -- Card Reviews
    -- =============================
    -- Session 1: Anatomy (March 15)
    INSERT INTO card_reviews (user_id, card_id, study_session_id, rating, response_time_ms) VALUES
    ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', @sampleUserId, '77777777-7777-7777-7777-777777777777', 4, 2100),
    ('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', @sampleUserId, '77777777-7777-7777-7777-777777777777', 3, 4500),
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', @sampleUserId, '77777777-7777-7777-7777-777777777777', 2, 8200),
    ('DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD', @sampleUserId, '77777777-7777-7777-7777-777777777777', 3, 3800);

    -- Session 2: Anatomy (March 17)
    INSERT INTO card_reviews (user_id, card_id, study_session_id, rating, response_time_ms) VALUES
    ('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', @sampleUserId, '88888888-8888-8888-8888-888888888888', 4, 1500),
    ('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', @sampleUserId, '88888888-8888-8888-8888-888888888888', 4, 2800),
    ('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', @sampleUserId, '88888888-8888-8888-8888-888888888888', 3, 5100),
    ('DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD', @sampleUserId, '88888888-8888-8888-8888-888888888888', 4, 2200);

    -- Session 3: Japanese (March 16)
    INSERT INTO card_reviews (user_id, card_id, study_session_id, rating, response_time_ms) VALUES
    ('EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE', @sampleUserId, '99999999-9999-9999-9999-999999999999', 3, 3200),
    ('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', @sampleUserId, '99999999-9999-9999-9999-999999999999', 1, 9500),
    ('44444444-4444-4444-4444-444444444444', @sampleUserId, '99999999-9999-9999-9999-999999999999', 3, 4100);

    -- =============================
    -- Card Progress (current spaced repetition state)
    -- =============================
    INSERT INTO card_progress (user_id, card_id, ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at) VALUES
    (@sampleUserId, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 2.70, 6, 2, '2026-03-23 00:00:00', '2026-03-17 08:30:00'),
    (@sampleUserId, 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', 2.60, 4, 2, '2026-03-21 00:00:00', '2026-03-17 08:30:00'),
    (@sampleUserId, 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC', 2.36, 1, 1, '2026-03-18 00:00:00', '2026-03-17 08:30:00'),
    (@sampleUserId, 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD', 2.70, 6, 2, '2026-03-23 00:00:00', '2026-03-17 08:30:00'),
    (@sampleUserId, 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE', 2.50, 1, 1, '2026-03-17 00:00:00', '2026-03-16 20:00:00'),
    (@sampleUserId, 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', 2.20, 0, 0, '2026-03-16 00:00:00', '2026-03-16 20:00:00'),
    (@sampleUserId, '44444444-4444-4444-4444-444444444444', 2.50, 1, 1, '2026-03-17 00:00:00', '2026-03-16 20:00:00');

    COMMIT TRANSACTION RuneDbSampleRecords;
    PRINT '';
    PRINT 'Sample data inserted successfully.'

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION RuneDbSampleRecords;
    END

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Sample data insertion failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;

    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH