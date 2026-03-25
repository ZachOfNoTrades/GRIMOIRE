-- =============================
-- Seed Exercises
-- Inserts a comprehensive exercise library, muscle groups, modifiers,
-- and exercise-muscle group assignments.
--
-- System exercises (user_id = NULL) are shared across all users.
-- =============================

-- =============================
-- Chest
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Bench Press', 'Strength'),
    ('Incline Bench Press', 'Strength'),
    ('Decline Bench Press', 'Strength'),
    ('Dumbbell Chest Press', 'Strength'),
    ('Incline Dumbbell Press', 'Strength'),
    ('Dumbbell Decline Chest Press', 'Strength'),
    ('Dumbbell Floor Press', 'Strength'),
    ('Floor Press', 'Strength'),
    ('Close-Grip Bench Press', 'Strength'),
    ('Close-Grip Feet-Up Bench Press', 'Strength'),
    ('Feet-Up Bench Press', 'Strength'),
    ('Pin Bench Press', 'Strength'),
    ('Board Press', 'Strength'),
    ('Bench Press Against Band', 'Strength'),
    ('Band-Assisted Bench Press', 'Strength'),
    ('Smith Machine Bench Press', 'Strength'),
    ('Smith Machine Incline Bench Press', 'Strength'),
    ('Smith Machine Reverse Grip Bench Press', 'Strength'),
    ('Machine Chest Press', 'Strength'),
    ('Cable Chest Press', 'Strength'),
    ('Dumbbell Chest Fly', 'Strength'),
    ('Machine Chest Fly', 'Strength'),
    ('Seated Cable Chest Fly', 'Strength'),
    ('Standing Cable Chest Fly', 'Strength'),
    ('Standing Resistance Band Chest Fly', 'Strength'),
    ('Resistance Band Chest Fly', 'Strength'),
    ('Pec Deck', 'Strength'),
    ('Dumbbell Pullover', 'Strength'),
    ('Push-Up', 'Strength'),
    ('Decline Push-Up', 'Strength'),
    ('Incline Push-Up', 'Strength'),
    ('Kneeling Push-Up', 'Strength'),
    ('Kneeling Incline Push-Up', 'Strength'),
    ('Push-Up Against Wall', 'Strength'),
    ('Close-Grip Push-Up', 'Strength'),
    ('Cobra Push-Up', 'Strength'),
    ('Clap Push-Up', 'Strength'),
    ('Plank to Push-Up', 'Strength'),
    ('Push-Ups With Feet in Rings', 'Strength'),
    ('Bar Dip', 'Strength'),
    ('Ring Dip', 'Strength'),
    ('Assisted Dip', 'Strength'),
    ('Kettlebell Floor Press', 'Strength'),
    ('Medicine Ball Chest Pass', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Shoulders
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Overhead Press', 'Strength'),
    ('Seated Barbell Overhead Press', 'Strength'),
    ('Dumbbell Shoulder Press', 'Strength'),
    ('Arnold Press', 'Strength'),
    ('Machine Shoulder Press', 'Strength'),
    ('Seated Smith Machine Shoulder Press', 'Strength'),
    ('Z Press', 'Strength'),
    ('Behind the Neck Press', 'Strength'),
    ('Snatch Grip Behind the Neck Press', 'Strength'),
    ('Landmine Press', 'Strength'),
    ('One-Arm Landmine Press', 'Strength'),
    ('Smith Machine Landmine Press', 'Strength'),
    ('Kettlebell Press', 'Strength'),
    ('Seated Kettlebell Press', 'Strength'),
    ('Kettlebell Push Press', 'Strength'),
    ('Push Press', 'Strength'),
    ('Handstand Push-Up', 'Strength'),
    ('Wall Walk', 'Strength'),
    ('Jerk', 'Strength'),
    ('Power Jerk', 'Strength'),
    ('Split Jerk', 'Strength'),
    ('Squat Jerk', 'Strength'),
    ('Dumbbell Lateral Raise', 'Strength'),
    ('Cable Lateral Raise', 'Strength'),
    ('Machine Lateral Raise', 'Strength'),
    ('Resistance Band Lateral Raise', 'Strength'),
    ('Dumbbell Front Raise', 'Strength'),
    ('Cable Front Raise', 'Strength'),
    ('Barbell Front Raise', 'Strength'),
    ('Plate Front Raise', 'Strength'),
    ('Barbell Upright Row', 'Strength'),
    ('Monkey Row', 'Strength'),
    ('Cuban Press', 'Strength'),
    ('Poliquin Raise', 'Strength'),
    ('Front Hold', 'Strength'),
    ('Devils Press', 'Strength'),
    ('Barbell Rear Delt Row', 'Strength'),
    ('Cable Rear Delt Row', 'Strength'),
    ('Dumbbell Rear Delt Row', 'Strength'),
    ('Reverse Dumbbell Flyes', 'Strength'),
    ('Reverse Dumbbell Flyes on Incline Bench', 'Strength'),
    ('Reverse Cable Flyes', 'Strength'),
    ('Reverse Machine Fly', 'Strength'),
    ('Face Pull', 'Strength'),
    ('Banded Face Pull', 'Strength'),
    ('Band Pull-Apart', 'Strength'),
    ('Cable External Shoulder Rotation', 'Strength'),
    ('Cable Internal Shoulder Rotation', 'Strength'),
    ('Band External Shoulder Rotation', 'Strength'),
    ('Band Internal Shoulder Rotation', 'Strength'),
    ('Dumbbell Horizontal External Shoulder Rotation', 'Strength'),
    ('Dumbbell Horizontal Internal Shoulder Rotation', 'Strength'),
    ('Lying Dumbbell External Shoulder Rotation', 'Strength'),
    ('Lying Dumbbell Internal Shoulder Rotation', 'Strength'),
    ('Kettlebell Halo', 'Strength'),
    ('Turkish Get-Up', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Back
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Conventional Deadlift', 'Strength'),
    ('Deadlift', 'Strength'),
    ('Sumo Deadlift', 'Strength'),
    ('Trap Bar Deadlift With High Handles', 'Strength'),
    ('Trap Bar Deadlift With Low Handles', 'Strength'),
    ('Snatch Grip Deadlift', 'Strength'),
    ('Deficit Deadlift', 'Strength'),
    ('Pause Deadlift', 'Strength'),
    ('Stiff-Legged Deadlift', 'Strength'),
    ('Dumbbell Deadlift', 'Strength'),
    ('Smith Machine Deadlift', 'Strength'),
    ('Rack Pull', 'Strength'),
    ('Pull-Up', 'Strength'),
    ('Chin-Up', 'Strength'),
    ('Close-Grip Chin-Up', 'Strength'),
    ('Pull-Up With a Neutral Grip', 'Strength'),
    ('Ring Pull-Up', 'Strength'),
    ('Scap Pull-Up', 'Strength'),
    ('Assisted Pull-Up', 'Strength'),
    ('Assisted Chin-Up', 'Strength'),
    ('Lat Pulldown With Pronated Grip', 'Strength'),
    ('Lat Pulldown With Supinated Grip', 'Strength'),
    ('Lat Pulldown With Neutral Grip', 'Strength'),
    ('Neutral Close-Grip Lat Pulldown', 'Strength'),
    ('Machine Lat Pulldown', 'Strength'),
    ('One-Handed Lat Pulldown', 'Strength'),
    ('Straight Arm Lat Pulldown', 'Strength'),
    ('Rope Pulldown', 'Strength'),
    ('Barbell Row', 'Strength'),
    ('Pendlay Row', 'Strength'),
    ('Dumbbell Row', 'Strength'),
    ('Chest-Supported Dumbbell Row', 'Strength'),
    ('One-Handed Cable Row', 'Strength'),
    ('Cable Close Grip Seated Row', 'Strength'),
    ('Cable Wide Grip Seated Row', 'Strength'),
    ('Seated Machine Row', 'Strength'),
    ('Seal Row', 'Strength'),
    ('Kroc Row', 'Strength'),
    ('Gorilla Row', 'Strength'),
    ('Kettlebell Row', 'Strength'),
    ('Renegade Row', 'Strength'),
    ('T-Bar Row', 'Strength'),
    ('Towel Row', 'Strength'),
    ('Smith Machine One-Handed Row', 'Strength'),
    ('Inverted Row', 'Strength'),
    ('Inverted Row with Underhand Grip', 'Strength'),
    ('Ring Row', 'Strength'),
    ('Back Extension', 'Strength'),
    ('Floor Back Extension', 'Strength'),
    ('Superman Raise', 'Strength'),
    ('Good Morning', 'Strength'),
    ('Jefferson Curl', 'Strength'),
    ('Barbell Shrug', 'Strength'),
    ('Dumbbell Shrug', 'Strength'),
    ('Muscle-Up (Bar)', 'Strength'),
    ('Muscle-Up (Rings)', 'Strength'),
    ('Banded Muscle-Up', 'Strength'),
    ('Jumping Muscle-Up', 'Strength'),
    ('Chest to Bar', 'Strength'),
    ('Clean', 'Strength'),
    ('Clean and Jerk', 'Strength'),
    ('Hang Clean', 'Strength'),
    ('Hang Power Clean', 'Strength'),
    ('Power Clean', 'Strength'),
    ('Block Clean', 'Strength'),
    ('Snatch', 'Strength'),
    ('Hang Snatch', 'Strength'),
    ('Hang Power Snatch', 'Strength'),
    ('Power Snatch', 'Strength'),
    ('Block Snatch', 'Strength'),
    ('Kettlebell Swing', 'Strength'),
    ('One-Handed Kettlebell Swing', 'Strength'),
    ('Kettlebell Snatch', 'Strength'),
    ('Kettlebell Clean', 'Strength'),
    ('Kettlebell Clean & Jerk', 'Strength'),
    ('Kettlebell Clean & Press', 'Strength'),
    ('Single Leg Deadlift with Kettlebell', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Legs
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Back Squat', 'Strength'),
    ('Squat', 'Strength'),
    ('Front Squat', 'Strength'),
    ('Goblet Squat', 'Strength'),
    ('Box Squat', 'Strength'),
    ('Pause Squat', 'Strength'),
    ('Pin Squat', 'Strength'),
    ('Air Squat', 'Strength'),
    ('Half Air Squat', 'Strength'),
    ('Jump Squat', 'Strength'),
    ('Zercher Squat', 'Strength'),
    ('Zombie Squat', 'Strength'),
    ('Safety Bar Squat', 'Strength'),
    ('Barbell Hack Squat', 'Strength'),
    ('Hack Squat Machine', 'Strength'),
    ('Belt Squat', 'Strength'),
    ('Sumo Squat', 'Strength'),
    ('Pendulum Squat', 'Strength'),
    ('Landmine Squat', 'Strength'),
    ('Landmine Hack Squat', 'Strength'),
    ('Pistol Squat', 'Strength'),
    ('Dumbbell Squat', 'Strength'),
    ('Smith Machine Squat', 'Strength'),
    ('Smith Machine Front Squat', 'Strength'),
    ('Kettlebell Front Squat', 'Strength'),
    ('Chair Squat', 'Strength'),
    ('Leg Press', 'Strength'),
    ('Vertical Leg Press', 'Strength'),
    ('Leg Extension', 'Strength'),
    ('One-Legged Leg Extension', 'Strength'),
    ('Standing Cable Leg Extension', 'Strength'),
    ('Barbell Lunge', 'Strength'),
    ('Dumbbell Lunge', 'Strength'),
    ('Body Weight Lunge', 'Strength'),
    ('Barbell Walking Lunge', 'Strength'),
    ('Dumbbell Walking Lunge', 'Strength'),
    ('Jumping Lunge', 'Strength'),
    ('Reverse Barbell Lunge', 'Strength'),
    ('Reverse Body Weight Lunge', 'Strength'),
    ('Reverse Dumbbell Lunge', 'Strength'),
    ('Curtsy Lunge', 'Strength'),
    ('Shallow Body Weight Lunge', 'Strength'),
    ('Bulgarian Split Squat', 'Strength'),
    ('Smith Machine Bulgarian Split Squat', 'Strength'),
    ('Smith Machine Lunge', 'Strength'),
    ('Lying Leg Curl', 'Strength'),
    ('Seated Leg Curl', 'Strength'),
    ('Standing Leg Curl', 'Strength'),
    ('One-Legged Lying Leg Curl', 'Strength'),
    ('One-Legged Seated Leg Curl', 'Strength'),
    ('Bodyweight Leg Curl', 'Strength'),
    ('Leg Curl On Ball', 'Strength'),
    ('Nordic Hamstring Eccentric', 'Strength'),
    ('Reverse Nordic', 'Strength'),
    ('Romanian Deadlift', 'Strength'),
    ('Dumbbell Romanian Deadlift', 'Strength'),
    ('Smith Machine Romanian Deadlift', 'Strength'),
    ('Glute Ham Raise', 'Strength'),
    ('Step Up', 'Strength'),
    ('Poliquin Step-Up', 'Strength'),
    ('Box Jump', 'Strength'),
    ('Depth Jump', 'Strength'),
    ('Lateral Bound', 'Strength'),
    ('Standing Hip Flexor Raise', 'Strength'),
    ('Banded Hip March', 'Strength'),
    ('Kettlebell Thrusters', 'Strength'),
    ('Ground to Overhead', 'Strength'),
    ('Prisoner Get Up', 'Strength'),
    ('Heel Walk', 'Strength'),
    ('Tibialis Raise', 'Strength'),
    ('Kettlebell Tibialis Raise', 'Strength'),
    ('Tibialis Band Pull', 'Strength'),
    ('Side Lunges', 'Strength'),
    ('Cossack Squat', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Glutes
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Hip Thrust', 'Strength'),
    ('Hip Thrust Machine', 'Strength'),
    ('Smith Machine Hip Thrust', 'Strength'),
    ('Barbell Hip Thrust', 'Strength'),
    ('One-Legged Hip Thrust', 'Strength'),
    ('Hip Thrust With Band Around Knees', 'Strength'),
    ('Glute Bridge', 'Strength'),
    ('One-Legged Glute Bridge', 'Strength'),
    ('Dumbbell Frog Pumps', 'Strength'),
    ('Frog Pumps', 'Strength'),
    ('Cable Pull Through', 'Strength'),
    ('Reverse Hyperextension', 'Strength'),
    ('Cable Glute Kickback', 'Strength'),
    ('Machine Glute Kickbacks', 'Strength'),
    ('Standing Glute Kickback in Machine', 'Strength'),
    ('Standing Glute Push Down', 'Strength'),
    ('Donkey Kicks', 'Strength'),
    ('Fire Hydrants', 'Strength'),
    ('Clamshells', 'Strength'),
    ('Hip Abduction Machine', 'Strength'),
    ('Cable Machine Hip Abduction', 'Strength'),
    ('Standing Hip Abduction Against Band', 'Strength'),
    ('Hip Abduction Against Band', 'Strength'),
    ('Lateral Walk With Band', 'Strength'),
    ('Banded Side Kicks', 'Strength'),
    ('Hip Adduction Machine', 'Strength'),
    ('Cable Machine Hip Adduction', 'Strength'),
    ('Hip Adduction Against Band', 'Strength'),
    ('Death March with Dumbbells', 'Strength'),
    ('Kettlebell Windmill', 'Strength'),
    ('Single Leg Romanian Deadlift', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Biceps
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Barbell Curl', 'Strength'),
    ('EZ Curl', 'Strength'),
    ('Dumbbell Curl', 'Strength'),
    ('Hammer Curl', 'Strength'),
    ('Concentration Curl', 'Strength'),
    ('Incline Dumbbell Curl', 'Strength'),
    ('Barbell Preacher Curl', 'Strength'),
    ('Dumbbell Preacher Curl', 'Strength'),
    ('Spider Curl', 'Strength'),
    ('Drag Curl', 'Strength'),
    ('Bayesian Curl', 'Strength'),
    ('Zottman Curl', 'Strength'),
    ('Reverse Barbell Curl', 'Strength'),
    ('Reverse Dumbbell Curl', 'Strength'),
    ('Cable Curl With Bar', 'Strength'),
    ('Cable Curl With Rope', 'Strength'),
    ('Overhead Cable Curl', 'Strength'),
    ('Lying Bicep Cable Curl on Bench', 'Strength'),
    ('Lying Bicep Cable Curl on Floor', 'Strength'),
    ('Cable Crossover Bicep Curl', 'Strength'),
    ('Machine Bicep Curl', 'Strength'),
    ('Bodyweight Curl', 'Strength'),
    ('Kettlebell Curl', 'Strength'),
    ('Resistance Band Curl', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Triceps
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Tricep Pushdown With Bar', 'Strength'),
    ('Tricep Pushdown With Rope', 'Strength'),
    ('Overhead Cable Triceps Extension (Low)', 'Strength'),
    ('Overhead Cable Triceps Extension (High)', 'Strength'),
    ('Crossbody Cable Triceps Extension', 'Strength'),
    ('Barbell Lying Triceps Extension', 'Strength'),
    ('EZ Bar Lying Triceps Extension', 'Strength'),
    ('Dumbbell Lying Triceps Extension', 'Strength'),
    ('Barbell Standing Triceps Extension', 'Strength'),
    ('Dumbbell Standing Triceps Extension', 'Strength'),
    ('Barbell Incline Triceps Extension', 'Strength'),
    ('Smith Machine Skull Crushers', 'Strength'),
    ('Machine Overhead Triceps Extension', 'Strength'),
    ('Bench Dip', 'Strength'),
    ('Tricep Bodyweight Extension', 'Strength'),
    ('Tate Press', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Abs & Core
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Crunch', 'Strength'),
    ('Bicycle Crunch', 'Strength'),
    ('Oblique Crunch', 'Strength'),
    ('Hollow Body Crunch', 'Strength'),
    ('Cable Crunch', 'Strength'),
    ('Machine Crunch', 'Strength'),
    ('Sit-Up', 'Strength'),
    ('Oblique Sit-Up', 'Strength'),
    ('Jackknife Sit-Up', 'Strength'),
    ('Hanging Sit-Up', 'Strength'),
    ('Plank', 'Strength'),
    ('Weighted Plank', 'Strength'),
    ('Kneeling Plank', 'Strength'),
    ('Side Plank', 'Strength'),
    ('Kneeling Side Plank', 'Strength'),
    ('Dynamic Side Plank', 'Strength'),
    ('Copenhagen Plank', 'Strength'),
    ('Plank with Leg Lifts', 'Strength'),
    ('Plank with Shoulder Taps', 'Strength'),
    ('Hanging Knee Raise', 'Strength'),
    ('Hanging Leg Raise', 'Strength'),
    ('Captain''s Chair Knee Raise', 'Strength'),
    ('Captain''s Chair Leg Raise', 'Strength'),
    ('Lying Leg Raise', 'Strength'),
    ('Hanging Windshield Wiper', 'Strength'),
    ('Lying Windshield Wiper', 'Strength'),
    ('Lying Windshield Wiper with Bent Knees', 'Strength'),
    ('Dead Bug', 'Strength'),
    ('Dead Bug With Dumbbells', 'Strength'),
    ('Dragon Flag', 'Strength'),
    ('Hollow Hold', 'Strength'),
    ('L-Sit', 'Strength'),
    ('Kneeling Ab Wheel Roll-Out', 'Strength'),
    ('Mountain Climbers', 'Strength'),
    ('Pallof Press', 'Strength'),
    ('Core Twist', 'Strength'),
    ('Ball Slams', 'Strength'),
    ('Dumbbell Side Bend', 'Strength'),
    ('Landmine Rotation', 'Strength'),
    ('Kettlebell Plank Pull Through', 'Strength'),
    ('High to Low Wood Chop with Band', 'Strength'),
    ('High to Low Wood Chop with Cable', 'Strength'),
    ('Horizontal Wood Chop with Band', 'Strength'),
    ('Horizontal Wood Chop with Cable', 'Strength'),
    ('Low to High Wood Chop with Band', 'Strength'),
    ('Low to High Wood Chop with Cable', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Calves
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Standing Calf Raise', 'Strength'),
    ('Barbell Standing Calf Raise', 'Strength'),
    ('Seated Calf Raise', 'Strength'),
    ('Barbell Seated Calf Raise', 'Strength'),
    ('Calf Raise in Leg Press', 'Strength'),
    ('Donkey Calf Raise', 'Strength'),
    ('Eccentric Heel Drop', 'Strength'),
    ('Heel Raise', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Forearms & Grip
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Barbell Wrist Curl', 'Strength'),
    ('Barbell Wrist Curl Behind the Back', 'Strength'),
    ('Dumbbell Wrist Curl', 'Strength'),
    ('Reverse Wrist Curl', 'Strength'),
    ('Bar Hang', 'Strength'),
    ('Farmer''s Walk', 'Strength'),
    ('Farmer''s Hold', 'Strength'),
    ('Plate Pinch', 'Strength'),
    ('Towel Hang', 'Strength'),
    ('Fat Grip Curl', 'Strength'),
    ('Wrist Roller', 'Strength')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Warmup & Mobility
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Arm Circles', 'Mobility'),
    ('Arm Swings', 'Mobility'),
    ('Leg Swings', 'Mobility'),
    ('Hip Circles', 'Mobility'),
    ('High Knees', 'Mobility'),
    ('Butt Kicks', 'Mobility'),
    ('Karaoke', 'Mobility'),
    ('A-Skips', 'Mobility'),
    ('Walking Knee Hugs', 'Mobility'),
    ('Walking Quad Stretch', 'Mobility'),
    ('Inchworm', 'Mobility'),
    ('World''s Greatest Stretch', 'Mobility'),
    ('Cat-Cow', 'Mobility'),
    ('Thoracic Spine Rotation', 'Mobility'),
    ('Band Dislocates', 'Mobility'),
    ('Ankle Circles', 'Mobility'),
    ('Wrist Circles', 'Mobility'),
    ('Neck Rolls', 'Mobility'),
    ('Deep Squat Hold', 'Mobility'),
    ('90/90 Hip Switch', 'Mobility'),
    ('Pigeon Stretch', 'Mobility'),
    ('Couch Stretch', 'Mobility'),
    ('Child''s Pose', 'Mobility'),
    ('Downward Dog', 'Mobility'),
    ('Scorpion Stretch', 'Mobility'),
    ('Iron Cross Stretch', 'Mobility'),
    ('Foam Rolling', 'Mobility'),
    ('Lacrosse Ball Release', 'Mobility'),
    ('Banded Shoulder Distraction', 'Mobility'),
    ('Banded Hip Distraction', 'Mobility'),
    ('Wall Slide', 'Mobility'),
    ('Scapular Push-Up', 'Mobility'),
    ('Thread the Needle', 'Mobility'),
    ('Bretzel Stretch', 'Mobility'),
    ('Spiderman Lunge', 'Mobility'),
    ('Lateral Lunge Stretch', 'Mobility'),
    ('Standing Hamstring Stretch', 'Mobility'),
    ('Seated Hamstring Stretch', 'Mobility'),
    ('Standing Calf Stretch', 'Mobility'),
    ('Band Pull-Apart (Warmup)', 'Mobility')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Cardio & Conditioning
-- =============================
INSERT INTO exercises (name, category)
SELECT name, category FROM (VALUES
    ('Treadmill Run', 'Cardio'),
    ('Treadmill Walk', 'Cardio'),
    ('Treadmill Incline Walk', 'Cardio'),
    ('Stationary Bike', 'Cardio'),
    ('Rowing Machine', 'Cardio'),
    ('Assault Bike', 'Cardio'),
    ('Ski Erg', 'Cardio'),
    ('Stair Climber', 'Cardio'),
    ('Elliptical', 'Cardio'),
    ('Jump Rope', 'Cardio'),
    ('Double Unders', 'Cardio'),
    ('Sled Push', 'Cardio'),
    ('Sled Pull', 'Cardio'),
    ('Battle Ropes', 'Cardio'),
    ('Burpees', 'Cardio'),
    ('Bear Crawl', 'Cardio'),
    ('Swimming', 'Cardio'),
    ('Sprints', 'Cardio'),
    ('Hill Sprints', 'Cardio'),
    ('Tire Flips', 'Cardio')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Muscle Groups
-- =============================
INSERT INTO muscle_groups (name)
SELECT name FROM (VALUES
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
    ('Lower Back'),
    ('Hip Flexors'),
    ('Adductors'),
    ('Abductors')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM muscle_groups WHERE muscle_groups.name = v.name);

-- =============================
-- Exercise Modifiers
-- =============================
INSERT INTO exercise_modifiers (name)
SELECT name FROM (VALUES
    ('Pause'),
    ('Tempo'),
    ('Explosive'),
    ('Deficit'),
    ('Banded'),
    ('Close-Grip'),
    ('Wide-Grip'),
    ('Single-Arm'),
    ('Single-Leg'),
    ('Incline'),
    ('Decline'),
    ('Seated'),
    ('Standing')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM exercise_modifiers WHERE exercise_modifiers.name = v.name);

-- =============================
-- Exercise Muscle Group Assignments
-- =============================
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
DECLARE @mg_hip_flexors UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Hip Flexors');
DECLARE @mg_adductors UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Adductors');
DECLARE @mg_abductors UNIQUEIDENTIFIER = (SELECT id FROM muscle_groups WHERE name = 'Abductors');

-- Chest exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1), (@mg_triceps, 0), (@mg_shoulders, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Bench Press', 'Dumbbell Chest Press', 'Floor Press', 'Dumbbell Floor Press', 'Feet-Up Bench Press', 'Pin Bench Press', 'Board Press', 'Bench Press Against Band', 'Band-Assisted Bench Press', 'Smith Machine Bench Press', 'Machine Chest Press', 'Cable Chest Press', 'Kettlebell Floor Press')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1), (@mg_shoulders, 0), (@mg_triceps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Incline Bench Press', 'Incline Dumbbell Press', 'Smith Machine Incline Bench Press')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1), (@mg_triceps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Decline Bench Press', 'Dumbbell Decline Chest Press', 'Close-Grip Bench Press', 'Close-Grip Feet-Up Bench Press', 'Smith Machine Reverse Grip Bench Press')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Dumbbell Chest Fly', 'Machine Chest Fly', 'Seated Cable Chest Fly', 'Standing Cable Chest Fly', 'Standing Resistance Band Chest Fly', 'Resistance Band Chest Fly', 'Pec Deck', 'Medicine Ball Chest Pass')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1), (@mg_lats, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Dumbbell Pullover'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Push-Up variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1), (@mg_triceps, 0), (@mg_shoulders, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Push-Up', 'Decline Push-Up', 'Incline Push-Up', 'Kneeling Push-Up', 'Kneeling Incline Push-Up', 'Push-Up Against Wall', 'Cobra Push-Up', 'Clap Push-Up', 'Push-Ups With Feet in Rings')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_triceps, 1), (@mg_chest, 0), (@mg_shoulders, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Close-Grip Push-Up'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1), (@mg_core, 0), (@mg_triceps, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Plank to Push-Up'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Dips
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_chest, 1), (@mg_triceps, 0), (@mg_shoulders, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Bar Dip', 'Ring Dip', 'Assisted Dip')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Shoulder pressing exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_shoulders, 1), (@mg_triceps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Overhead Press', 'Seated Barbell Overhead Press', 'Dumbbell Shoulder Press', 'Arnold Press', 'Machine Shoulder Press', 'Seated Smith Machine Shoulder Press', 'Z Press', 'Behind the Neck Press', 'Snatch Grip Behind the Neck Press', 'Landmine Press', 'One-Arm Landmine Press', 'Smith Machine Landmine Press', 'Kettlebell Press', 'Seated Kettlebell Press', 'Kettlebell Push Press', 'Push Press', 'Handstand Push-Up', 'Jerk', 'Power Jerk', 'Split Jerk', 'Squat Jerk')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_shoulders, 1), (@mg_core, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Wall Walk', 'Turkish Get-Up', 'Kettlebell Halo')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Lateral / front raises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_shoulders, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Dumbbell Lateral Raise', 'Cable Lateral Raise', 'Machine Lateral Raise', 'Resistance Band Lateral Raise', 'Dumbbell Front Raise', 'Cable Front Raise', 'Barbell Front Raise', 'Plate Front Raise', 'Barbell Upright Row', 'Monkey Row', 'Cuban Press', 'Poliquin Raise', 'Front Hold', 'Lateral Raise')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_shoulders, 1), (@mg_chest, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Devils Press'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Rear delt exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_shoulders, 1), (@mg_upper_back, 0), (@mg_traps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Barbell Rear Delt Row', 'Cable Rear Delt Row', 'Dumbbell Rear Delt Row', 'Reverse Dumbbell Flyes', 'Reverse Dumbbell Flyes on Incline Bench', 'Reverse Cable Flyes', 'Reverse Machine Fly', 'Face Pull', 'Banded Face Pull', 'Band Pull-Apart')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Shoulder rotation exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_shoulders, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Cable External Shoulder Rotation', 'Cable Internal Shoulder Rotation', 'Band External Shoulder Rotation', 'Band Internal Shoulder Rotation', 'Dumbbell Horizontal External Shoulder Rotation', 'Dumbbell Horizontal Internal Shoulder Rotation', 'Lying Dumbbell External Shoulder Rotation', 'Lying Dumbbell Internal Shoulder Rotation')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Deadlift variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_hamstrings, 1), (@mg_glutes, 0), (@mg_lower_back, 0), (@mg_quads, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Conventional Deadlift', 'Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift With High Handles', 'Trap Bar Deadlift With Low Handles', 'Snatch Grip Deadlift', 'Deficit Deadlift', 'Pause Deadlift', 'Dumbbell Deadlift', 'Smith Machine Deadlift', 'Rack Pull')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_hamstrings, 1), (@mg_glutes, 0), (@mg_lower_back, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Stiff-Legged Deadlift', 'Romanian Deadlift', 'Dumbbell Romanian Deadlift', 'Smith Machine Romanian Deadlift', 'Single Leg Romanian Deadlift', 'Single Leg Deadlift with Kettlebell')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Pull-up / chin-up variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_lats, 1), (@mg_biceps, 0), (@mg_upper_back, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Pull-Up', 'Chin-Up', 'Close-Grip Chin-Up', 'Pull-Up With a Neutral Grip', 'Ring Pull-Up', 'Assisted Pull-Up', 'Assisted Chin-Up', 'Chest to Bar')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_upper_back, 1)
) AS v(mg_id, is_primary)
WHERE e.name = 'Scap Pull-Up'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Lat pulldown variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_lats, 1), (@mg_biceps, 0), (@mg_upper_back, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Lat Pulldown', 'Lat Pulldown With Pronated Grip', 'Lat Pulldown With Supinated Grip', 'Lat Pulldown With Neutral Grip', 'Neutral Close-Grip Lat Pulldown', 'Machine Lat Pulldown', 'One-Handed Lat Pulldown', 'Rope Pulldown')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_lats, 1)
) AS v(mg_id, is_primary)
WHERE e.name = 'Straight Arm Lat Pulldown'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Row variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_upper_back, 1), (@mg_lats, 0), (@mg_biceps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Barbell Row', 'Pendlay Row', 'Dumbbell Row', 'Chest-Supported Dumbbell Row', 'One-Handed Cable Row', 'Cable Close Grip Seated Row', 'Cable Wide Grip Seated Row', 'Cable Row', 'Seated Machine Row', 'Seal Row', 'Kroc Row', 'Gorilla Row', 'Kettlebell Row', 'T-Bar Row', 'Towel Row', 'Smith Machine One-Handed Row', 'Inverted Row', 'Inverted Row with Underhand Grip', 'Ring Row')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_upper_back, 1), (@mg_core, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Renegade Row'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Back extensions and lower back
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_lower_back, 1), (@mg_glutes, 0), (@mg_hamstrings, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Back Extension', 'Floor Back Extension', 'Superman Raise', 'Good Morning')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_lower_back, 1), (@mg_hamstrings, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Jefferson Curl'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Shrugs
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_traps, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Barbell Shrug', 'Dumbbell Shrug')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Muscle-ups
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_lats, 1), (@mg_chest, 0), (@mg_triceps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Muscle-Up (Bar)', 'Muscle-Up (Rings)', 'Banded Muscle-Up', 'Jumping Muscle-Up')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Olympic lifts
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_quads, 1), (@mg_glutes, 0), (@mg_hamstrings, 0), (@mg_traps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Clean', 'Clean and Jerk', 'Hang Clean', 'Hang Power Clean', 'Power Clean', 'Block Clean', 'Snatch', 'Hang Snatch', 'Hang Power Snatch', 'Power Snatch', 'Block Snatch')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Kettlebell swings
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_glutes, 1), (@mg_hamstrings, 0), (@mg_core, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Kettlebell Swing', 'One-Handed Kettlebell Swing', 'Kettlebell Snatch', 'Kettlebell Clean', 'Kettlebell Clean & Jerk', 'Kettlebell Clean & Press')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Squat variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_quads, 1), (@mg_glutes, 0), (@mg_core, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Back Squat', 'Squat', 'Front Squat', 'Goblet Squat', 'Box Squat', 'Pause Squat', 'Pin Squat', 'Air Squat', 'Half Air Squat', 'Jump Squat', 'Zercher Squat', 'Zombie Squat', 'Safety Bar Squat', 'Barbell Hack Squat', 'Hack Squat Machine', 'Belt Squat', 'Sumo Squat', 'Pendulum Squat', 'Landmine Squat', 'Landmine Hack Squat', 'Pistol Squat', 'Dumbbell Squat', 'Smith Machine Squat', 'Smith Machine Front Squat', 'Kettlebell Front Squat', 'Chair Squat')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Leg press
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_quads, 1), (@mg_glutes, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Leg Press', 'Vertical Leg Press')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Leg extensions
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_quads, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Leg Extension', 'One-Legged Leg Extension', 'Standing Cable Leg Extension', 'Reverse Nordic')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Lunge variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_quads, 1), (@mg_glutes, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Barbell Lunge', 'Dumbbell Lunge', 'Body Weight Lunge', 'Barbell Walking Lunge', 'Dumbbell Walking Lunge', 'Jumping Lunge', 'Reverse Barbell Lunge', 'Reverse Body Weight Lunge', 'Reverse Dumbbell Lunge', 'Curtsy Lunge', 'Shallow Body Weight Lunge', 'Bulgarian Split Squat', 'Smith Machine Bulgarian Split Squat', 'Smith Machine Lunge', 'Split Squat', 'Lunges', 'Side Lunges', 'Cossack Squat')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Leg curl variations
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_hamstrings, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Lying Leg Curl', 'Seated Leg Curl', 'Standing Leg Curl', 'One-Legged Lying Leg Curl', 'One-Legged Seated Leg Curl', 'Bodyweight Leg Curl', 'Leg Curl On Ball', 'Nordic Hamstring Eccentric')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Glute ham raise
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_hamstrings, 1), (@mg_glutes, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Glute Ham Raise'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Step ups and jumps
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_quads, 1), (@mg_glutes, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Step Up', 'Poliquin Step-Up', 'Box Jump', 'Depth Jump', 'Lateral Bound', 'Kettlebell Thrusters', 'Ground to Overhead', 'Prisoner Get Up')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Hip flexor exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_hip_flexors, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Standing Hip Flexor Raise', 'Banded Hip March')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Tibialis exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_calves, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Heel Walk', 'Tibialis Raise', 'Kettlebell Tibialis Raise', 'Tibialis Band Pull')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Glute exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_glutes, 1), (@mg_hamstrings, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Hip Thrust', 'Hip Thrust Machine', 'Smith Machine Hip Thrust', 'Barbell Hip Thrust', 'One-Legged Hip Thrust', 'Hip Thrust With Band Around Knees', 'Glute Bridge', 'One-Legged Glute Bridge', 'Dumbbell Frog Pumps', 'Frog Pumps', 'Cable Pull Through', 'Reverse Hyperextension', 'Death March with Dumbbells')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_glutes, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Cable Glute Kickback', 'Machine Glute Kickbacks', 'Standing Glute Kickback in Machine', 'Standing Glute Push Down', 'Donkey Kicks', 'Fire Hydrants')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_glutes, 1), (@mg_core, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Kettlebell Windmill'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Hip abduction
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_abductors, 1), (@mg_glutes, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Clamshells', 'Hip Abduction Machine', 'Cable Machine Hip Abduction', 'Standing Hip Abduction Against Band', 'Hip Abduction Against Band', 'Lateral Walk With Band', 'Banded Side Kicks')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Hip adduction
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_adductors, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Hip Adduction Machine', 'Cable Machine Hip Adduction', 'Hip Adduction Against Band')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Bicep exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_biceps, 1), (@mg_forearms, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Barbell Curl', 'EZ Curl', 'Dumbbell Curl', 'Hammer Curl', 'Concentration Curl', 'Incline Dumbbell Curl', 'Barbell Preacher Curl', 'Dumbbell Preacher Curl', 'Spider Curl', 'Drag Curl', 'Bayesian Curl', 'Zottman Curl', 'Cable Curl With Bar', 'Cable Curl With Rope', 'Overhead Cable Curl', 'Lying Bicep Cable Curl on Bench', 'Lying Bicep Cable Curl on Floor', 'Cable Crossover Bicep Curl', 'Machine Bicep Curl', 'Bodyweight Curl', 'Kettlebell Curl', 'Resistance Band Curl', 'Bicep Curl')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_forearms, 1), (@mg_biceps, 0)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Reverse Barbell Curl', 'Reverse Dumbbell Curl')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Tricep exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_triceps, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Tricep Pushdown With Bar', 'Tricep Pushdown With Rope', 'Overhead Cable Triceps Extension (Low)', 'Overhead Cable Triceps Extension (High)', 'Crossbody Cable Triceps Extension', 'Barbell Lying Triceps Extension', 'EZ Bar Lying Triceps Extension', 'Dumbbell Lying Triceps Extension', 'Barbell Standing Triceps Extension', 'Dumbbell Standing Triceps Extension', 'Barbell Incline Triceps Extension', 'Smith Machine Skull Crushers', 'Machine Overhead Triceps Extension', 'Bench Dip', 'Tricep Bodyweight Extension', 'Tate Press', 'Tricep Extension')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Core exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_core, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Crunch', 'Bicycle Crunch', 'Oblique Crunch', 'Hollow Body Crunch', 'Cable Crunch', 'Machine Crunch', 'Sit-Up', 'Oblique Sit-Up', 'Jackknife Sit-Up', 'Hanging Sit-Up', 'Plank', 'Weighted Plank', 'Kneeling Plank', 'Side Plank', 'Kneeling Side Plank', 'Dynamic Side Plank', 'Plank with Leg Lifts', 'Plank with Shoulder Taps', 'Hanging Knee Raise', 'Hanging Leg Raise', 'Captain''s Chair Knee Raise', 'Captain''s Chair Leg Raise', 'Lying Leg Raise', 'Hanging Windshield Wiper', 'Lying Windshield Wiper', 'Lying Windshield Wiper with Bent Knees', 'Dead Bug', 'Dead Bug With Dumbbells', 'Dragon Flag', 'Hollow Hold', 'L-Sit', 'Kneeling Ab Wheel Roll-Out', 'Mountain Climbers', 'Pallof Press', 'Core Twist', 'Ball Slams', 'Dumbbell Side Bend', 'Landmine Rotation', 'Kettlebell Plank Pull Through', 'High to Low Wood Chop with Band', 'High to Low Wood Chop with Cable', 'Horizontal Wood Chop with Band', 'Horizontal Wood Chop with Cable', 'Low to High Wood Chop with Band', 'Low to High Wood Chop with Cable')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_core, 1), (@mg_adductors, 0)
) AS v(mg_id, is_primary)
WHERE e.name = 'Copenhagen Plank'
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Calf exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_calves, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Standing Calf Raise', 'Barbell Standing Calf Raise', 'Seated Calf Raise', 'Barbell Seated Calf Raise', 'Calf Raise in Leg Press', 'Donkey Calf Raise', 'Eccentric Heel Drop', 'Heel Raise')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);

-- Forearm exercises
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
SELECT e.id, mg_id, is_primary FROM exercises e
CROSS APPLY (VALUES
    (@mg_forearms, 1)
) AS v(mg_id, is_primary)
WHERE e.name IN ('Barbell Wrist Curl', 'Barbell Wrist Curl Behind the Back', 'Dumbbell Wrist Curl', 'Reverse Wrist Curl', 'Bar Hang', 'Farmer''s Walk', 'Farmer''s Hold', 'Plate Pinch', 'Towel Hang', 'Fat Grip Curl', 'Wrist Roller')
AND NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg WHERE emg.exercise_id = e.id AND emg.muscle_group_id = v.mg_id);
