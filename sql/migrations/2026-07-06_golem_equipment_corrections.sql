-- Golem: correct exercise->equipment mappings the 2026-07-02 first-pass migration got wrong,
-- plus 3 new equipment items for props that weren't represented at all (Captain's Chair,
-- Lacrosse Ball, PVC Pipe). The first-pass classifier lumped several genuinely-weighted "*Row"
-- exercises (dumbbell/barbell rows) and a few bench/box-elevated bodyweight movements into its
-- generic Bodyweight catch-all by mistake. Run against the GOLEM database.

-- New equipment
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Captain''s Chair')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Captain''s Chair', N'benches_and_racks', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Lacrosse Ball')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Lacrosse Ball', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'PVC Pipe')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'PVC Pipe', N'other', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM equipment WHERE name = N'Assisted Pull-Up Machine')
  INSERT INTO equipment (id, name, category, has_options, sort_order, is_disabled) VALUES (NEWID(), N'Assisted Pull-Up Machine', N'strength_machines', 0, 0, 0);

-- Remove the incorrect Bodyweight-only mapping for exercises being corrected below.
DELETE ee FROM exercise_equipment ee
JOIN exercises e ON e.id = ee.exercise_id
JOIN equipment eq ON eq.id = ee.equipment_id AND eq.name = N'Bodyweight'
WHERE e.name IN (
  N'Goblet Squat', N'Gorilla Row', N'Kroc Row', N'Monkey Row', N'Renegade Row', N'Shotgun Row',
  N'Pendlay Row', N'T-Bar Row', N'Seal Row', N'Inverted Row', N'Inverted Row with Underhand Grip',
  N'Towel Row', N'Turkish Get-Up', N'Weighted Plank', N'Decline Sit Ups', N'Bulgarian Split Squat',
  N'Copenhagen Plank', N'Decline Push-Up', N'Dragon Flag', N'Step Up', N'Poliquin Step-Up',
  N'Captain''s Chair Knee Raise', N'Captain''s Chair Leg Raise', N'Lacrosse Ball Release',
  N'Overhead PVC Shoulder Stretch', N'PVC Forearm Stretch', N'PVC Helicopter', N'Poliquin Raise',
  N'Standing Glute Push Down'
);

-- Assisted Chin-Up/Dip/Pull-Up were mapped to a plain Pull Up Bar in the first pass; they're
-- actually performed on a dedicated assisted pull-up/dip machine (counterbalanced platform).
DELETE ee FROM exercise_equipment ee
JOIN exercises e ON e.id = ee.exercise_id
JOIN equipment eq ON eq.id = ee.equipment_id AND eq.name = N'Pull Up Bar'
WHERE e.name IN (N'Assisted Chin-Up', N'Assisted Dip', N'Assisted Pull-Up');

-- Corrected mappings (exercise_name, equipment_name)
DECLARE @corrections TABLE (exercise_name NVARCHAR(200), equipment_name NVARCHAR(200));
INSERT INTO @corrections (exercise_name, equipment_name) VALUES
  (N'Goblet Squat', N'Dumbbells'),
  (N'Gorilla Row', N'Dumbbells'),
  (N'Kroc Row', N'Dumbbells'),
  (N'Monkey Row', N'Dumbbells'),
  (N'Renegade Row', N'Dumbbells'),
  (N'Shotgun Row', N'Dumbbells'),
  (N'Pendlay Row', N'Barbells'),
  (N'T-Bar Row', N'Landmine Attachment'),
  (N'T-Bar Row', N'Barbells'),
  (N'Seal Row', N'Barbells'),
  (N'Seal Row', N'Flat Bench'),
  (N'Inverted Row', N'Pull Up Bar'),
  (N'Inverted Row with Underhand Grip', N'Pull Up Bar'),
  (N'Towel Row', N'Pull Up Bar'),
  (N'Turkish Get-Up', N'Kettlebells'),
  (N'Weighted Plank', N'Weight Plates'),
  (N'Decline Sit Ups', N'Decline Bench'),
  (N'Bulgarian Split Squat', N'Flat Bench'),
  (N'Copenhagen Plank', N'Flat Bench'),
  (N'Decline Push-Up', N'Flat Bench'),
  (N'Dragon Flag', N'Flat Bench'),
  (N'Step Up', N'Plyo Box'),
  (N'Poliquin Step-Up', N'Plyo Box'),
  (N'Captain''s Chair Knee Raise', N'Captain''s Chair'),
  (N'Captain''s Chair Leg Raise', N'Captain''s Chair'),
  (N'Lacrosse Ball Release', N'Lacrosse Ball'),
  (N'Overhead PVC Shoulder Stretch', N'PVC Pipe'),
  (N'PVC Forearm Stretch', N'PVC Pipe'),
  (N'PVC Helicopter', N'PVC Pipe'),
  (N'Poliquin Raise', N'Dumbbells'),
  (N'Standing Glute Push Down', N'Assisted Pull-Up Machine'),
  (N'Assisted Chin-Up', N'Assisted Pull-Up Machine'),
  (N'Assisted Dip', N'Assisted Pull-Up Machine'),
  (N'Assisted Pull-Up', N'Assisted Pull-Up Machine');

INSERT INTO exercise_equipment (id, exercise_id, equipment_id, is_required, alt_group)
SELECT NEWID(), e.id, eq.id, 1, NULL
FROM @corrections c
JOIN exercises e ON e.name = c.exercise_name
JOIN equipment eq ON eq.name = c.equipment_name
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_equipment ee WHERE ee.exercise_id = e.id AND ee.equipment_id = eq.id
);
