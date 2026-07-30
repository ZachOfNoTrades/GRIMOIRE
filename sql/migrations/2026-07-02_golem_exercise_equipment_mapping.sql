-- Golem: populate exercise -> equipment requirements so location equipment
-- availability can actually be enforced (exercise_equipment existed but was
-- always empty/unwired). Adds machine/tool equipment types referenced by
-- existing exercise names but missing from the equipment table (leg curl
-- machine, leg press machine, smith machine, etc.), then maps each exercise
-- to its required equipment by name (first-pass, derived from exercise
-- names — refine per-exercise later as needed). Run against the GOLEM database.

-- Add missing golem equipment types (leg curl machine, etc.) and populate the
-- exercise_equipment mapping so location equipment availability can be enforced.

-- New equipment
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Leg Curl Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Leg Curl Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Leg Press Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Leg Press Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Leg Extension Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Leg Extension Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Hip Abduction Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Hip Abduction Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Hip Adduction Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Hip Adduction Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Hip Thrust Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Hip Thrust Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Pec Deck')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Pec Deck', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Chest Press Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Chest Press Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Shoulder Press Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Shoulder Press Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Seated Row Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Seated Row Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Bicep Curl Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Bicep Curl Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Triceps Extension Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Triceps Extension Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Lateral Raise Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Lateral Raise Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Ab Crunch Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Ab Crunch Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Glute Kickback Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Glute Kickback Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Hack Squat Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Hack Squat Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Belt Squat Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Belt Squat Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Reverse Hyper Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Reverse Hyper Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'GHD Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'GHD Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Smith Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Smith Machine', N'strength_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Landmine Attachment')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Landmine Attachment', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Stability Ball')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Stability Ball', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Gymnastic Rings')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Gymnastic Rings', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Ab Wheel')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Ab Wheel', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Wrist Roller')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Wrist Roller', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Jump Rope')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Jump Rope', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Battle Ropes')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Battle Ropes', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Sled')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Sled', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Ski Erg')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Ski Erg', N'cardio_machines', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Tire')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Tire', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Calf Raise Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Calf Raise Machine', N'strength_machines', 0, 0, 0);

-- Exercise -> equipment mapping (is_required = 1 for all; first-pass, name-derived)
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'1" Conv Deficit Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'1" Conv Deficit Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'1" Sumo Deficit Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'1" Sumo Deficit Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'3" Conv Block Pull' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'3" Conv Block Pull' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'90/90 Hip Switch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Air Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Ankle Circles' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Arm Circles' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Arm Swings' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Arnold Press' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'A-Skips' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Assault Bike' AND eq.name = N'Air Bike'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Assisted Chin-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Assisted Dip' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Assisted Pull-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Back Extension' AND eq.name = N'GHD Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Back Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Back Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Backward Arm Circle' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Ball Slams' AND eq.name = N'Medicine Balls'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Band Dislocates' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Band External Shoulder Rotation' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Band Internal Shoulder Rotation' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Band Pull-Apart' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Band Pull-Apart (Warmup)' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Band-Assisted Bench Press' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Banded Face Pull' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Banded Hip Distraction' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Banded Hip March' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Banded Muscle-Up' AND eq.name = N'Handle Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Banded Muscle-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Banded Shoulder Distraction' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Banded Side Kicks' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bar Dip' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bar Hang' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Front Raise' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Hack Squat' AND eq.name = N'Hack Squat Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Hip Thrust' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Incline Triceps Extension' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Lunge' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Lying Triceps Extension' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Preacher Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Rear Delt Row' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Row' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Seated Calf Raise' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Shrug' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Standing Calf Raise' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Standing Triceps Extension' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Upright Row' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Walking Lunge' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Wrist Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Barbell Wrist Curl Behind the Back' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Battle Ropes' AND eq.name = N'Battle Ropes'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bayesian Curl' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bear Crawl' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Behind the Neck Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Behind the Neck Press' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Belt Squat' AND eq.name = N'Belt Squat Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bench Dip' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bench Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bench Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bench Press Against Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bicycle Crunch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Block Clean' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Block Snatch' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Board Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Board Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Body Weight Lunge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bodyweight Curl' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bodyweight Leg Curl' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Box Jump' AND eq.name = N'Plyo Box'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Box Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Box Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bretzel Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Bulgarian Split Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Burpee' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Burpees' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Butt Kick' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Butt Kicks' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Bicep Curl, Behind The Back' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Chest Fly' AND eq.name = N'Crossover Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Chest Fly, Standing' AND eq.name = N'Crossover Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Chest Press' AND eq.name = N'Crossover Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Close Grip Seated Row' AND eq.name = N'Row Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Crossover Bicep Curl' AND eq.name = N'Crossover Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Crunch' AND eq.name = N'Rope Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Curl With Bar' AND eq.name = N'Row Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Curl With Rope' AND eq.name = N'Rope Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable External Shoulder Rotation' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Front Raise' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Glute Kickback' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Internal Shoulder Rotation' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Lateral Raise' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Machine Hip Abduction' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Machine Hip Adduction' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Pull Through' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Rear Delt Row' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cable Wide Grip Seated Row' AND eq.name = N'Row Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Calf Raise in Leg Press' AND eq.name = N'Leg Press Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Captain''s Chair Knee Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Captain''s Chair Leg Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cat-Cow' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Chair Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Chest to Bar' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Chest-Supported Dumbbell Row' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Child''s Pose' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Chin-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Clamshells' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Clap Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Clean' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Clean and Jerk' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Close-Grip Bench Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Close-Grip Bench Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Close-Grip Chin-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Close-Grip Feet-Up Bench Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Close-Grip Feet-Up Bench Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Close-Grip Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cobra Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Concentration Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Conventional Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Conventional Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Copenhagen Plank' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Core Twist' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cossack Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Couch Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Crossbody Cable Triceps Extension' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Crunch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cuban Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Cuban Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Curtsy Lunge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dead Bug' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dead Bug With Dumbbells' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Death March with Dumbbells' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Decline Bench Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Decline Bench Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Decline Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Decline Sit Ups' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Deep Squat Hold' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Deficit Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Deficit Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Depth Jump' AND eq.name = N'Plyo Box'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Devils Press' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Donkey Calf Raise' AND eq.name = N'Calf Raise Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Donkey Kicks' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Double Unders' AND eq.name = N'Jump Rope'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Downward Dog' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Drag Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dragon Flag' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Chest Fly' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Chest Press' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Clean' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Decline Chest Press' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Floor Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Floor Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Frog Pumps' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Front Raise' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Horizontal External Shoulder Rotation' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Horizontal Internal Shoulder Rotation' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Lateral Raise' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Lunge' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Lying Skullcrushers' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Preacher Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Pullover' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Rear Delt Row' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Romanian Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Romanian Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Row' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Shoulder Press' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Shrug' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Side Bend' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Squat' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Triceps Extension' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Walking Lunge' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dumbbell Wrist Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Dynamic Side Plank' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Eccentric Heel Drop' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Elliptical' AND eq.name = N'Elliptical'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'EZ Bar Lying Triceps Extension' AND eq.name = N'EZ Curl Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'EZ Curl' AND eq.name = N'EZ Curl Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Face Pull' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Fan Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Farmer''s Hold' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Farmer''s Walk' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Fat Grip Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Feet-Up Bench Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Feet-Up Bench Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Fire Hydrants' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Floor Back Extension' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Floor Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Floor Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Calves' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Chest' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Glutes' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Hamstrings' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Hip Abductors' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Hip Flexors' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Lats' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Lower Back' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Quadriceps' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Roll Upper Back' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Foam Rolling' AND eq.name = N'Foam Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Forward Arm Circle' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Frog Pumps' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Front Hold' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Front Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Front Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Glute Bridge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Glute Ham Raise' AND eq.name = N'GHD Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Goblet Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Good Morning' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Good Morning' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Gorilla Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Ground to Overhead' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hack Squat Machine' AND eq.name = N'Hack Squat Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Half Air Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hammer Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Handstand Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hang Clean' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hang Power Clean' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hang Power Snatch' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hang Snatch' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hanging Knee Raise' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hanging Leg Raise' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hanging Sit-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hanging Windshield Wiper' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Heel Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Heel Walk' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'High Knees' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'High to Low Wood Chop with Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'High to Low Wood Chop with Cable' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hill Sprints' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Abduction Against Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Abduction Machine' AND eq.name = N'Hip Abduction Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Adduction Against Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Adduction Machine' AND eq.name = N'Hip Adduction Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Circles' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Thrust' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Thrust' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Thrust Machine' AND eq.name = N'Hip Thrust Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hip Thrust With Band Around Knees' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hollow Body Crunch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Hollow Hold' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Horizontal Wood Chop with Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Horizontal Wood Chop with Cable' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Inchworm' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Incline Bench Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Incline Bench Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Incline Dumbbell Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Incline Dumbbell Press' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Incline Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Inverted Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Inverted Row with Underhand Grip' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Iron Cross Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Jackknife Sit-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Jefferson Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Jerk' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Jump Rope' AND eq.name = N'Jump Rope'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Jump Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Jumping Lunge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Jumping Muscle-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Karaoke' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Clean' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Clean & Jerk' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Clean & Press' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Curl' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Floor Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Floor Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Front Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Front Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Halo' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Plank Pull Through' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Press' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Push Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Row' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Snatch' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Swing' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Thrusters' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Tibialis Raise' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kettlebell Windmill' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kneeling Ab Wheel Roll-Out' AND eq.name = N'Ab Wheel'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kneeling Incline Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kneeling Plank' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kneeling Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kneeling Side Plank' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Kroc Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lacrosse Ball Release' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Landmine Hack Squat' AND eq.name = N'Landmine Attachment'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Landmine Press' AND eq.name = N'Landmine Attachment'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Landmine Rotation' AND eq.name = N'Landmine Attachment'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Landmine Squat' AND eq.name = N'Landmine Attachment'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lat Pulldown With Neutral Grip' AND eq.name = N'Lat Pulldown'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lat Pulldown With Pronated Grip' AND eq.name = N'Lat Pulldown'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lat Pulldown With Supinated Grip' AND eq.name = N'Lat Pulldown'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lateral Bound' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lateral Lunge Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lateral Walk With Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Leg Curl On Ball' AND eq.name = N'Stability Ball'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Leg Extension' AND eq.name = N'Leg Extension Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Leg Press' AND eq.name = N'Leg Press Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Leg Swings' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Low to High Wood Chop with Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Low to High Wood Chop with Cable' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'L-Sit' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Bicep Cable Curl on Bench' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Bicep Cable Curl on Floor' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Dumbbell External Shoulder Rotation' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Dumbbell Internal Shoulder Rotation' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Leg Curl' AND eq.name = N'Leg Curl Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Leg Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Windshield Wiper' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Lying Windshield Wiper with Bent Knees' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Bicep Curl' AND eq.name = N'Bicep Curl Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Chest Fly' AND eq.name = N'Pec Deck'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Chest Press' AND eq.name = N'Chest Press Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Crunch' AND eq.name = N'Ab Crunch Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Glute Kickbacks' AND eq.name = N'Glute Kickback Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Incline Chest Press' AND eq.name = N'Chest Press Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Lat Pulldown' AND eq.name = N'Lat Pulldown'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Lateral Raise' AND eq.name = N'Lateral Raise Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Overhead Triceps Extension' AND eq.name = N'Triceps Extension Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Machine Shoulder Press' AND eq.name = N'Shoulder Press Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Medicine Ball Chest Pass' AND eq.name = N'Medicine Balls'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Monkey Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Mountain Climbers' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Muscle-Up (Bar)' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Muscle-Up (Rings)' AND eq.name = N'Gymnastic Rings'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Neck Rolls' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Neutral Close-Grip Lat Pulldown' AND eq.name = N'Lat Pulldown'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Nordic Hamstring Eccentric' AND eq.name = N'GHD Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Oblique Crunch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Oblique Sit-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Arm Landmine Press' AND eq.name = N'Landmine Attachment'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Handed Cable Row' AND eq.name = N'Row Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Handed Kettlebell Swing' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Handed Lat Pulldown' AND eq.name = N'Lat Pulldown'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Legged Glute Bridge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Legged Hip Thrust' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Legged Leg Extension' AND eq.name = N'Leg Extension Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Legged Lying Leg Curl' AND eq.name = N'Leg Curl Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'One-Legged Seated Leg Curl' AND eq.name = N'Leg Curl Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Opposite Leg Toe Touch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Overhead Cable Curl' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Overhead Cable Triceps Extension (High)' AND eq.name = N'Rope Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Overhead Cable Triceps Extension (Low)' AND eq.name = N'Rope Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Overhead Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Overhead Press' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Overhead PVC Shoulder Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pallof Press' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pause Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pause Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pause Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pause Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pec Deck' AND eq.name = N'Pec Deck'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pendlay Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pendulum Squat' AND eq.name = N'Hack Squat Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pigeon Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pin Bench Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pin Bench Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pin Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pin Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pistol Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Plank' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Plank to Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Plank with Leg Lifts' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Plank with Shoulder Taps' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Plate Front Raise' AND eq.name = N'Weight Plates'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Plate Pinch' AND eq.name = N'Weight Plates'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Poliquin Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Poliquin Step-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Power Clean' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Power Jerk' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Power Snatch' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Prisoner Get Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pull-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Pull-Up With a Neutral Grip' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Push Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Push-Up Against Wall' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Push-Ups With Feet in Rings' AND eq.name = N'Gymnastic Rings'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'PVC Forearm Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'PVC Good Morning' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'PVC Good Morning' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'PVC Helicopter' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Rack Pull' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Rack Pull' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Renegade Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Resistance Band Chest Fly' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Resistance Band Curl' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Resistance Band Lateral Raise' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Barbell Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Barbell Lunge' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Body Weight Lunge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Cable Curl' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Cable Flyes' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Dumbbell Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Dumbbell Flyes' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Dumbbell Flyes on Incline Bench' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Dumbbell Lunge' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Hyperextension' AND eq.name = N'Reverse Hyper Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Machine Fly' AND eq.name = N'Pec Deck'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Nordic' AND eq.name = N'GHD Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Reverse Wrist Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Ring Dip' AND eq.name = N'Gymnastic Rings'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Ring Pull-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Ring Row' AND eq.name = N'Gymnastic Rings'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Romanian Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Romanian Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Rope Pulldown' AND eq.name = N'Rope Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Rowing Machine' AND eq.name = N'Rowing Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Safety Bar Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Safety Bar Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Scap Pull-Up' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Scapular Push-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Scorpion Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seal Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Barbell Overhead Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Barbell Overhead Press' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Cable Chest Fly' AND eq.name = N'Crossover Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Calf Raise' AND eq.name = N'Calf Raise Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Hamstring Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Kettlebell Press' AND eq.name = N'Kettlebells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Leg Curl' AND eq.name = N'Leg Curl Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Machine Row' AND eq.name = N'Seated Row Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Seated Smith Machine Shoulder Press' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Shallow Body Weight Lunge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Shotgun Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Shoulder Squeeze' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Side Lunges' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Side Plank' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Single Leg Deadlift with Kettlebell' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Single Leg Romanian Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Single Leg Romanian Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sit-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Ski Erg' AND eq.name = N'Ski Erg'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sled Pull' AND eq.name = N'Sled'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sled Push' AND eq.name = N'Sled'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Bench Press' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Bulgarian Split Squat' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Deadlift' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Front Squat' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Hip Thrust' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Incline Bench Press' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Landmine Press' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Lunge' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine One-Handed Row' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Reverse Grip Bench Press' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Romanian Deadlift' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Skull Crushers' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Smith Machine Squat' AND eq.name = N'Smith Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Snatch' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Snatch Grip Behind the Neck Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Snatch Grip Behind the Neck Press' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Snatch Grip Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Snatch Grip Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Spider Curl' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Spider Curl' AND eq.name = N'Incline Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Spiderman Lunge' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Split Jerk' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sprints' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Squat' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Squat Jerk' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Stair Climber' AND eq.name = N'Stair Stepper'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Cable Leg Extension' AND eq.name = N'Hi-Lo Pulley'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Calf Raise' AND eq.name = N'Calf Raise Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Calf Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Glute Kickback in Machine' AND eq.name = N'Glute Kickback Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Glute Push Down' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Hamstring Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Hip Abduction Against Band' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Hip Flexor Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Hip Flexor Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Leg Curl' AND eq.name = N'Leg Curl Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Standing Resistance Band Chest Fly' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Stationary Bike' AND eq.name = N'Air Bike'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Step Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Stiff-Legged Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Stiff-Legged Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Straight Arm Lat Pulldown' AND eq.name = N'Lat Pulldown'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sumo Deadlift' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sumo Deadlift' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sumo Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Sumo Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Superman Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Swimming' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Tate Press' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'T-Bar Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Thoracic Spine Rotation' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Thread the Needle' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Tibialis Band Pull' AND eq.name = N'Loop Bands'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Tibialis Raise' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Tire Flips' AND eq.name = N'Tire'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Towel Hang' AND eq.name = N'Pull Up Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Towel Row' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Trap Bar Deadlift With High Handles' AND eq.name = N'Trap Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Trap Bar Deadlift With Low Handles' AND eq.name = N'Trap Bar'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Treadmill Incline Walk' AND eq.name = N'Treadmill'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Treadmill Run' AND eq.name = N'Treadmill'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Treadmill Walk' AND eq.name = N'Treadmill'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Tricep Bodyweight Extension' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Tricep Pushdown With Bar' AND eq.name = N'Row Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Tricep Pushdown With Rope' AND eq.name = N'Rope Cable'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Turkish Get-Up' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Vertical Leg Press' AND eq.name = N'Leg Press Machine'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Walking Knee Hugs' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Walking Quad Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Wall Slide' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Wall Walk' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Weighted Plank' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'World''s Greatest Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Wrist Circles' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Wrist Roller' AND eq.name = N'Wrist Roller'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Wrist Stretch' AND eq.name = N'Bodyweight'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Z Press' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Z Press' AND eq.name = N'Flat Bench'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Zercher Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Zercher Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Zombie Squat' AND eq.name = N'Barbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Zombie Squat' AND eq.name = N'Squat Rack'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL FROM exercises e, equipment eq
WHERE e.name = N'Zottman Curl' AND eq.name = N'Dumbbells'
  AND NOT EXISTS (SELECT 1 FROM exercise_equipment WHERE exercise_id = e.id AND equipment_id = eq.id);
