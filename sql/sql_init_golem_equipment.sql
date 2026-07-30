-- =============================
-- Seed Equipment + Equipment Options
-- Idempotent inserts for the equipment taxonomy used by the Locations feature.
-- =============================

-- =============================
-- Equipment
-- =============================
INSERT INTO equipment (name, category, has_options, sort_order)
SELECT name, category, has_options, sort_order FROM (VALUES
    -- small_weights
    ('Dumbbells',          'small_weights',   1,  1),
    ('Kettlebells',        'small_weights',   1,  2),
    ('Medicine Balls',     'small_weights',   1,  3),
    -- bars_and_plates
    ('Barbells',           'bars_and_plates', 0, 10),
    ('EZ Curl Bar',        'bars_and_plates', 0, 11),
    ('Trap Bar',           'bars_and_plates', 0, 12),
    ('Weight Plates',      'bars_and_plates', 1, 13),
    -- benches_and_racks
    ('Pull Up Bar',        'benches_and_racks', 0, 20),
    ('Squat Rack',         'benches_and_racks', 0, 21),
    ('Flat Bench',         'benches_and_racks', 0, 22),
    ('Incline Bench',      'benches_and_racks', 0, 23),
    ('Decline Bench',      'benches_and_racks', 0, 24),
    ('Vertical Bench',     'benches_and_racks', 0, 25),
    -- cable_machines
    ('Crossover Cable',    'cable_machines',  0, 30),
    ('Lat Pulldown',       'cable_machines',  0, 31),
    ('Hi-Lo Pulley',       'cable_machines',  0, 32),
    ('Row Cable',          'cable_machines',  0, 33),
    ('Rope Cable',         'cable_machines',  0, 34),
    -- resistance_bands
    ('Handle Bands',       'resistance_bands', 1, 40),
    ('Loop Bands',         'resistance_bands', 1, 41),
    -- cardio_machines
    ('Treadmill',          'cardio_machines', 0, 50),
    ('Stationary Bike',    'cardio_machines', 0, 51),
    ('Rowing Machine',     'cardio_machines', 0, 52),
    ('Elliptical',         'cardio_machines', 0, 53),
    ('Stair Stepper',      'cardio_machines', 0, 54),
    ('Air Bike',           'cardio_machines', 0, 55),
    -- bodyweight / other
    ('Bodyweight',         'bodyweight',      0, 60),
    ('Foam Roller',        'other',           0, 70),
    ('Yoga Mat',           'other',           0, 71),
    ('Plyo Box',           'other',           0, 72)
) AS v(name, category, has_options, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM equipment WHERE equipment.name = v.name);

-- =============================
-- Equipment Options
-- =============================

-- Dumbbells: 5–100 lb (lb is canonical for label; value_kg derived 1 lb = 0.4536 kg)
DECLARE @eq_dumbbells UNIQUEIDENTIFIER = (SELECT id FROM equipment WHERE name = 'Dumbbells');
INSERT INTO equipment_options (equipment_id, label, value_kg, sort_order)
SELECT @eq_dumbbells, label, value_kg, sort_order FROM (VALUES
    ('5 lb',   2.27,  1),
    ('10 lb',  4.54,  2),
    ('15 lb',  6.80,  3),
    ('20 lb',  9.07,  4),
    ('25 lb',  11.34, 5),
    ('30 lb',  13.61, 6),
    ('35 lb',  15.88, 7),
    ('40 lb',  18.14, 8),
    ('45 lb',  20.41, 9),
    ('50 lb',  22.68, 10),
    ('55 lb',  24.95, 11),
    ('60 lb',  27.22, 12),
    ('65 lb',  29.48, 13),
    ('70 lb',  31.75, 14),
    ('75 lb',  34.02, 15),
    ('80 lb',  36.29, 16),
    ('85 lb',  38.56, 17),
    ('90 lb',  40.82, 18),
    ('95 lb',  43.09, 19),
    ('100 lb', 45.36, 20)
) AS v(label, value_kg, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM equipment_options WHERE equipment_id = @eq_dumbbells AND label = v.label
);

-- Kettlebells: standard kg increments
DECLARE @eq_kettlebells UNIQUEIDENTIFIER = (SELECT id FROM equipment WHERE name = 'Kettlebells');
INSERT INTO equipment_options (equipment_id, label, value_kg, sort_order)
SELECT @eq_kettlebells, label, value_kg, sort_order FROM (VALUES
    ('8 kg',  8.00, 1),
    ('12 kg', 12.00, 2),
    ('16 kg', 16.00, 3),
    ('20 kg', 20.00, 4),
    ('24 kg', 24.00, 5),
    ('28 kg', 28.00, 6),
    ('32 kg', 32.00, 7),
    ('36 kg', 36.00, 8),
    ('40 kg', 40.00, 9),
    ('48 kg', 48.00, 10)
) AS v(label, value_kg, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM equipment_options WHERE equipment_id = @eq_kettlebells AND label = v.label
);

-- Medicine Balls
DECLARE @eq_med_balls UNIQUEIDENTIFIER = (SELECT id FROM equipment WHERE name = 'Medicine Balls');
INSERT INTO equipment_options (equipment_id, label, value_kg, sort_order)
SELECT @eq_med_balls, label, value_kg, sort_order FROM (VALUES
    ('4 lb',  1.81, 1),
    ('6 lb',  2.72, 2),
    ('8 lb',  3.63, 3),
    ('10 lb', 4.54, 4),
    ('12 lb', 5.44, 5),
    ('15 lb', 6.80, 6),
    ('20 lb', 9.07, 7),
    ('25 lb', 11.34, 8)
) AS v(label, value_kg, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM equipment_options WHERE equipment_id = @eq_med_balls AND label = v.label
);

-- Weight Plates
DECLARE @eq_plates UNIQUEIDENTIFIER = (SELECT id FROM equipment WHERE name = 'Weight Plates');
INSERT INTO equipment_options (equipment_id, label, value_kg, sort_order)
SELECT @eq_plates, label, value_kg, sort_order FROM (VALUES
    ('2.5 lb', 1.13, 1),
    ('5 lb',   2.27, 2),
    ('10 lb',  4.54, 3),
    ('15 lb',  6.80, 4),
    ('25 lb',  11.34, 5),
    ('35 lb',  15.88, 6),
    ('45 lb',  20.41, 7),
    ('55 lb',  24.95, 8)
) AS v(label, value_kg, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM equipment_options WHERE equipment_id = @eq_plates AND label = v.label
);

-- Handle Bands (resistance)
DECLARE @eq_handle_bands UNIQUEIDENTIFIER = (SELECT id FROM equipment WHERE name = 'Handle Bands');
INSERT INTO equipment_options (equipment_id, label, value_kg, sort_order)
SELECT @eq_handle_bands, label, value_kg, sort_order FROM (VALUES
    ('Light',       NULL, 1),
    ('Medium',      NULL, 2),
    ('Heavy',       NULL, 3),
    ('Extra Heavy', NULL, 4)
) AS v(label, value_kg, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM equipment_options WHERE equipment_id = @eq_handle_bands AND label = v.label
);

-- Loop Bands
DECLARE @eq_loop_bands UNIQUEIDENTIFIER = (SELECT id FROM equipment WHERE name = 'Loop Bands');
INSERT INTO equipment_options (equipment_id, label, value_kg, sort_order)
SELECT @eq_loop_bands, label, value_kg, sort_order FROM (VALUES
    ('Light',       NULL, 1),
    ('Medium',      NULL, 2),
    ('Heavy',       NULL, 3),
    ('Extra Heavy', NULL, 4)
) AS v(label, value_kg, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM equipment_options WHERE equipment_id = @eq_loop_bands AND label = v.label
);

PRINT 'Equipment + equipment_options seeded.';
