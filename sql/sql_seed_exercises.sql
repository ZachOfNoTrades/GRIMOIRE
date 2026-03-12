-- =============================
-- Seed Exercises
-- Inserts a comprehensive exercise library, muscle groups, modifiers,
-- and exercise-muscle group assignments.
-- =============================

-- =============================
-- Chest
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Bench Press', 'Strength', 0),
    ('Incline Bench Press', 'Strength', 0),
    ('Decline Bench Press', 'Strength', 0),
    ('Dumbbell Chest Press', 'Strength', 0),
    ('Incline Dumbbell Press', 'Strength', 0),
    ('Dumbbell Decline Chest Press', 'Strength', 0),
    ('Dumbbell Floor Press', 'Strength', 0),
    ('Floor Press', 'Strength', 0),
    ('Close-Grip Bench Press', 'Strength', 0),
    ('Close-Grip Feet-Up Bench Press', 'Strength', 0),
    ('Feet-Up Bench Press', 'Strength', 0),
    ('Pin Bench Press', 'Strength', 0),
    ('Board Press', 'Strength', 0),
    ('Bench Press Against Band', 'Strength', 0),
    ('Band-Assisted Bench Press', 'Strength', 0),
    ('Smith Machine Bench Press', 'Strength', 0),
    ('Smith Machine Incline Bench Press', 'Strength', 0),
    ('Smith Machine Reverse Grip Bench Press', 'Strength', 0),
    ('Machine Chest Press', 'Strength', 0),
    ('Cable Chest Press', 'Strength', 0),
    ('Dumbbell Chest Fly', 'Strength', 0),
    ('Machine Chest Fly', 'Strength', 0),
    ('Seated Cable Chest Fly', 'Strength', 0),
    ('Standing Cable Chest Fly', 'Strength', 0),
    ('Standing Resistance Band Chest Fly', 'Strength', 0),
    ('Resistance Band Chest Fly', 'Strength', 0),
    ('Pec Deck', 'Strength', 0),
    ('Dumbbell Pullover', 'Strength', 0),
    ('Push-Up', 'Strength', 0),
    ('Decline Push-Up', 'Strength', 0),
    ('Incline Push-Up', 'Strength', 0),
    ('Kneeling Push-Up', 'Strength', 0),
    ('Kneeling Incline Push-Up', 'Strength', 0),
    ('Push-Up Against Wall', 'Strength', 0),
    ('Close-Grip Push-Up', 'Strength', 0),
    ('Cobra Push-Up', 'Strength', 0),
    ('Clap Push-Up', 'Strength', 0),
    ('Plank to Push-Up', 'Strength', 0),
    ('Push-Ups With Feet in Rings', 'Strength', 0),
    ('Bar Dip', 'Strength', 0),
    ('Ring Dip', 'Strength', 0),
    ('Assisted Dip', 'Strength', 0),
    ('Kettlebell Floor Press', 'Strength', 0),
    ('Medicine Ball Chest Pass', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Shoulders
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Overhead Press', 'Strength', 0),
    ('Seated Barbell Overhead Press', 'Strength', 0),
    ('Dumbbell Shoulder Press', 'Strength', 0),
    ('Seated Dumbbell Shoulder Press', 'Strength', 0),
    ('Arnold Press', 'Strength', 0),
    ('Machine Shoulder Press', 'Strength', 0),
    ('Seated Smith Machine Shoulder Press', 'Strength', 0),
    ('Z Press', 'Strength', 0),
    ('Behind the Neck Press', 'Strength', 0),
    ('Snatch Grip Behind the Neck Press', 'Strength', 0),
    ('Landmine Press', 'Strength', 0),
    ('One-Arm Landmine Press', 'Strength', 0),
    ('Smith Machine Landmine Press', 'Strength', 0),
    ('Kettlebell Press', 'Strength', 0),
    ('Seated Kettlebell Press', 'Strength', 0),
    ('Kettlebell Push Press', 'Strength', 0),
    ('Push Press', 'Strength', 0),
    ('Handstand Push-Up', 'Strength', 0),
    ('Wall Walk', 'Strength', 0),
    ('Jerk', 'Strength', 0),
    ('Power Jerk', 'Strength', 0),
    ('Split Jerk', 'Strength', 0),
    ('Squat Jerk', 'Strength', 0),
    ('Dumbbell Lateral Raise', 'Strength', 0),
    ('Cable Lateral Raise', 'Strength', 0),
    ('Machine Lateral Raise', 'Strength', 0),
    ('Resistance Band Lateral Raise', 'Strength', 0),
    ('Dumbbell Front Raise', 'Strength', 0),
    ('Cable Front Raise', 'Strength', 0),
    ('Barbell Front Raise', 'Strength', 0),
    ('Plate Front Raise', 'Strength', 0),
    ('Barbell Upright Row', 'Strength', 0),
    ('Monkey Row', 'Strength', 0),
    ('Cuban Press', 'Strength', 0),
    ('Poliquin Raise', 'Strength', 0),
    ('Front Hold', 'Strength', 1),
    ('Devils Press', 'Strength', 0),
    ('Barbell Rear Delt Row', 'Strength', 0),
    ('Cable Rear Delt Row', 'Strength', 0),
    ('Dumbbell Rear Delt Row', 'Strength', 0),
    ('Reverse Dumbbell Flyes', 'Strength', 0),
    ('Reverse Dumbbell Flyes on Incline Bench', 'Strength', 0),
    ('Reverse Cable Flyes', 'Strength', 0),
    ('Reverse Machine Fly', 'Strength', 0),
    ('Face Pull', 'Strength', 0),
    ('Banded Face Pull', 'Strength', 0),
    ('Band Pull-Apart', 'Strength', 0),
    ('Cable External Shoulder Rotation', 'Strength', 0),
    ('Cable Internal Shoulder Rotation', 'Strength', 0),
    ('Band External Shoulder Rotation', 'Strength', 0),
    ('Band Internal Shoulder Rotation', 'Strength', 0),
    ('Dumbbell Horizontal External Shoulder Rotation', 'Strength', 0),
    ('Dumbbell Horizontal Internal Shoulder Rotation', 'Strength', 0),
    ('Lying Dumbbell External Shoulder Rotation', 'Strength', 0),
    ('Lying Dumbbell Internal Shoulder Rotation', 'Strength', 0),
    ('Kettlebell Halo', 'Strength', 0),
    ('Turkish Get-Up', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Back
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Conventional Deadlift', 'Strength', 0),
    ('Deadlift', 'Strength', 0),
    ('Sumo Deadlift', 'Strength', 0),
    ('Trap Bar Deadlift With High Handles', 'Strength', 0),
    ('Trap Bar Deadlift With Low Handles', 'Strength', 0),
    ('Snatch Grip Deadlift', 'Strength', 0),
    ('Deficit Deadlift', 'Strength', 0),
    ('Pause Deadlift', 'Strength', 0),
    ('Stiff-Legged Deadlift', 'Strength', 0),
    ('Dumbbell Deadlift', 'Strength', 0),
    ('Smith Machine Deadlift', 'Strength', 0),
    ('Rack Pull', 'Strength', 0),
    ('Pull-Up', 'Strength', 0),
    ('Chin-Up', 'Strength', 0),
    ('Close-Grip Chin-Up', 'Strength', 0),
    ('Pull-Up With a Neutral Grip', 'Strength', 0),
    ('Ring Pull-Up', 'Strength', 0),
    ('Scap Pull-Up', 'Strength', 0),
    ('Assisted Pull-Up', 'Strength', 0),
    ('Assisted Chin-Up', 'Strength', 0),
    ('Lat Pulldown With Pronated Grip', 'Strength', 0),
    ('Lat Pulldown With Supinated Grip', 'Strength', 0),
    ('Lat Pulldown With Neutral Grip', 'Strength', 0),
    ('Neutral Close-Grip Lat Pulldown', 'Strength', 0),
    ('Machine Lat Pulldown', 'Strength', 0),
    ('One-Handed Lat Pulldown', 'Strength', 0),
    ('Straight Arm Lat Pulldown', 'Strength', 0),
    ('Rope Pulldown', 'Strength', 0),
    ('Barbell Row', 'Strength', 0),
    ('Pendlay Row', 'Strength', 0),
    ('Dumbbell Row', 'Strength', 0),
    ('Chest-Supported Dumbbell Row', 'Strength', 0),
    ('One-Handed Cable Row', 'Strength', 0),
    ('Cable Close Grip Seated Row', 'Strength', 0),
    ('Cable Wide Grip Seated Row', 'Strength', 0),
    ('Seated Machine Row', 'Strength', 0),
    ('Seal Row', 'Strength', 0),
    ('Kroc Row', 'Strength', 0),
    ('Gorilla Row', 'Strength', 0),
    ('Kettlebell Row', 'Strength', 0),
    ('Renegade Row', 'Strength', 0),
    ('T-Bar Row', 'Strength', 0),
    ('Towel Row', 'Strength', 0),
    ('Smith Machine One-Handed Row', 'Strength', 0),
    ('Inverted Row', 'Strength', 0),
    ('Inverted Row with Underhand Grip', 'Strength', 0),
    ('Ring Row', 'Strength', 0),
    ('Back Extension', 'Strength', 0),
    ('Floor Back Extension', 'Strength', 0),
    ('Superman Raise', 'Strength', 0),
    ('Good Morning', 'Strength', 0),
    ('Jefferson Curl', 'Strength', 0),
    ('Barbell Shrug', 'Strength', 0),
    ('Dumbbell Shrug', 'Strength', 0),
    ('Muscle-Up (Bar)', 'Strength', 0),
    ('Muscle-Up (Rings)', 'Strength', 0),
    ('Banded Muscle-Up', 'Strength', 0),
    ('Jumping Muscle-Up', 'Strength', 0),
    ('Chest to Bar', 'Strength', 0),
    ('Clean', 'Strength', 0),
    ('Clean and Jerk', 'Strength', 0),
    ('Hang Clean', 'Strength', 0),
    ('Hang Power Clean', 'Strength', 0),
    ('Power Clean', 'Strength', 0),
    ('Block Clean', 'Strength', 0),
    ('Snatch', 'Strength', 0),
    ('Hang Snatch', 'Strength', 0),
    ('Hang Power Snatch', 'Strength', 0),
    ('Power Snatch', 'Strength', 0),
    ('Block Snatch', 'Strength', 0),
    ('Kettlebell Swing', 'Strength', 0),
    ('One-Handed Kettlebell Swing', 'Strength', 0),
    ('Kettlebell Snatch', 'Strength', 0),
    ('Kettlebell Clean', 'Strength', 0),
    ('Kettlebell Clean & Jerk', 'Strength', 0),
    ('Kettlebell Clean & Press', 'Strength', 0),
    ('Single Leg Deadlift with Kettlebell', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Legs
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Back Squat', 'Strength', 0),
    ('Squat', 'Strength', 0),
    ('Front Squat', 'Strength', 0),
    ('Goblet Squat', 'Strength', 0),
    ('Box Squat', 'Strength', 0),
    ('Pause Squat', 'Strength', 0),
    ('Pin Squat', 'Strength', 0),
    ('Air Squat', 'Strength', 0),
    ('Half Air Squat', 'Strength', 0),
    ('Jump Squat', 'Strength', 0),
    ('Zercher Squat', 'Strength', 0),
    ('Zombie Squat', 'Strength', 0),
    ('Safety Bar Squat', 'Strength', 0),
    ('Barbell Hack Squat', 'Strength', 0),
    ('Hack Squat Machine', 'Strength', 0),
    ('Belt Squat', 'Strength', 0),
    ('Sumo Squat', 'Strength', 0),
    ('Pendulum Squat', 'Strength', 0),
    ('Landmine Squat', 'Strength', 0),
    ('Landmine Hack Squat', 'Strength', 0),
    ('Pistol Squat', 'Strength', 0),
    ('Dumbbell Squat', 'Strength', 0),
    ('Smith Machine Squat', 'Strength', 0),
    ('Smith Machine Front Squat', 'Strength', 0),
    ('Kettlebell Front Squat', 'Strength', 0),
    ('Chair Squat', 'Strength', 0),
    ('Leg Press', 'Strength', 0),
    ('Vertical Leg Press', 'Strength', 0),
    ('Leg Extension', 'Strength', 0),
    ('One-Legged Leg Extension', 'Strength', 0),
    ('Standing Cable Leg Extension', 'Strength', 0),
    ('Barbell Lunge', 'Strength', 0),
    ('Dumbbell Lunge', 'Strength', 0),
    ('Body Weight Lunge', 'Strength', 0),
    ('Barbell Walking Lunge', 'Strength', 0),
    ('Dumbbell Walking Lunge', 'Strength', 0),
    ('Jumping Lunge', 'Strength', 0),
    ('Reverse Barbell Lunge', 'Strength', 0),
    ('Reverse Body Weight Lunge', 'Strength', 0),
    ('Reverse Dumbbell Lunge', 'Strength', 0),
    ('Curtsy Lunge', 'Strength', 0),
    ('Shallow Body Weight Lunge', 'Strength', 0),
    ('Bulgarian Split Squat', 'Strength', 0),
    ('Smith Machine Bulgarian Split Squat', 'Strength', 0),
    ('Smith Machine Lunge', 'Strength', 0),
    ('Lying Leg Curl', 'Strength', 0),
    ('Seated Leg Curl', 'Strength', 0),
    ('Standing Leg Curl', 'Strength', 0),
    ('One-Legged Lying Leg Curl', 'Strength', 0),
    ('One-Legged Seated Leg Curl', 'Strength', 0),
    ('Bodyweight Leg Curl', 'Strength', 0),
    ('Leg Curl On Ball', 'Strength', 0),
    ('Nordic Hamstring Eccentric', 'Strength', 0),
    ('Reverse Nordic', 'Strength', 0),
    ('Romanian Deadlift', 'Strength', 0),
    ('Dumbbell Romanian Deadlift', 'Strength', 0),
    ('Smith Machine Romanian Deadlift', 'Strength', 0),
    ('Glute Ham Raise', 'Strength', 0),
    ('Step Up', 'Strength', 0),
    ('Poliquin Step-Up', 'Strength', 0),
    ('Box Jump', 'Strength', 0),
    ('Depth Jump', 'Strength', 0),
    ('Lateral Bound', 'Strength', 0),
    ('Standing Hip Flexor Raise', 'Strength', 0),
    ('Banded Hip March', 'Strength', 0),
    ('Kettlebell Thrusters', 'Strength', 0),
    ('Ground to Overhead', 'Strength', 0),
    ('Prisoner Get Up', 'Strength', 0),
    ('Heel Walk', 'Strength', 0),
    ('Tibialis Raise', 'Strength', 0),
    ('Kettlebell Tibialis Raise', 'Strength', 0),
    ('Tibialis Band Pull', 'Strength', 0),
    ('Side Lunges', 'Strength', 0),
    ('Cossack Squat', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Glutes
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Hip Thrust', 'Strength', 0),
    ('Hip Thrust Machine', 'Strength', 0),
    ('Smith Machine Hip Thrust', 'Strength', 0),
    ('Barbell Hip Thrust', 'Strength', 0),
    ('One-Legged Hip Thrust', 'Strength', 0),
    ('Hip Thrust With Band Around Knees', 'Strength', 0),
    ('Glute Bridge', 'Strength', 0),
    ('One-Legged Glute Bridge', 'Strength', 0),
    ('Dumbbell Frog Pumps', 'Strength', 0),
    ('Frog Pumps', 'Strength', 0),
    ('Cable Pull Through', 'Strength', 0),
    ('Reverse Hyperextension', 'Strength', 0),
    ('Cable Glute Kickback', 'Strength', 0),
    ('Machine Glute Kickbacks', 'Strength', 0),
    ('Standing Glute Kickback in Machine', 'Strength', 0),
    ('Standing Glute Push Down', 'Strength', 0),
    ('Donkey Kicks', 'Strength', 0),
    ('Fire Hydrants', 'Strength', 0),
    ('Clamshells', 'Strength', 0),
    ('Hip Abduction Machine', 'Strength', 0),
    ('Cable Machine Hip Abduction', 'Strength', 0),
    ('Standing Hip Abduction Against Band', 'Strength', 0),
    ('Hip Abduction Against Band', 'Strength', 0),
    ('Lateral Walk With Band', 'Strength', 0),
    ('Banded Side Kicks', 'Strength', 0),
    ('Hip Adduction Machine', 'Strength', 0),
    ('Cable Machine Hip Adduction', 'Strength', 0),
    ('Hip Adduction Against Band', 'Strength', 0),
    ('Death March with Dumbbells', 'Strength', 0),
    ('Kettlebell Windmill', 'Strength', 0),
    ('Single Leg Romanian Deadlift', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Biceps
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Barbell Curl', 'Strength', 0),
    ('EZ Curl', 'Strength', 0),
    ('Dumbbell Curl', 'Strength', 0),
    ('Hammer Curl', 'Strength', 0),
    ('Concentration Curl', 'Strength', 0),
    ('Incline Dumbbell Curl', 'Strength', 0),
    ('Barbell Preacher Curl', 'Strength', 0),
    ('Dumbbell Preacher Curl', 'Strength', 0),
    ('Spider Curl', 'Strength', 0),
    ('Drag Curl', 'Strength', 0),
    ('Bayesian Curl', 'Strength', 0),
    ('Zottman Curl', 'Strength', 0),
    ('Reverse Barbell Curl', 'Strength', 0),
    ('Reverse Dumbbell Curl', 'Strength', 0),
    ('Cable Curl With Bar', 'Strength', 0),
    ('Cable Curl With Rope', 'Strength', 0),
    ('Overhead Cable Curl', 'Strength', 0),
    ('Lying Bicep Cable Curl on Bench', 'Strength', 0),
    ('Lying Bicep Cable Curl on Floor', 'Strength', 0),
    ('Cable Crossover Bicep Curl', 'Strength', 0),
    ('Machine Bicep Curl', 'Strength', 0),
    ('Bodyweight Curl', 'Strength', 0),
    ('Kettlebell Curl', 'Strength', 0),
    ('Resistance Band Curl', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Triceps
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Tricep Pushdown With Bar', 'Strength', 0),
    ('Tricep Pushdown With Rope', 'Strength', 0),
    ('Overhead Cable Triceps Extension (Low)', 'Strength', 0),
    ('Overhead Cable Triceps Extension (High)', 'Strength', 0),
    ('Crossbody Cable Triceps Extension', 'Strength', 0),
    ('Barbell Lying Triceps Extension', 'Strength', 0),
    ('EZ Bar Lying Triceps Extension', 'Strength', 0),
    ('Dumbbell Lying Triceps Extension', 'Strength', 0),
    ('Barbell Standing Triceps Extension', 'Strength', 0),
    ('Dumbbell Standing Triceps Extension', 'Strength', 0),
    ('Barbell Incline Triceps Extension', 'Strength', 0),
    ('Smith Machine Skull Crushers', 'Strength', 0),
    ('Machine Overhead Triceps Extension', 'Strength', 0),
    ('Bench Dip', 'Strength', 0),
    ('Tricep Bodyweight Extension', 'Strength', 0),
    ('Tate Press', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Abs & Core
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Crunch', 'Strength', 0),
    ('Bicycle Crunch', 'Strength', 0),
    ('Oblique Crunch', 'Strength', 0),
    ('Hollow Body Crunch', 'Strength', 0),
    ('Cable Crunch', 'Strength', 0),
    ('Machine Crunch', 'Strength', 0),
    ('Sit-Up', 'Strength', 0),
    ('Oblique Sit-Up', 'Strength', 0),
    ('Jackknife Sit-Up', 'Strength', 0),
    ('Hanging Sit-Up', 'Strength', 0),
    ('Plank', 'Strength', 1),
    ('Weighted Plank', 'Strength', 1),
    ('Kneeling Plank', 'Strength', 1),
    ('Side Plank', 'Strength', 1),
    ('Kneeling Side Plank', 'Strength', 1),
    ('Dynamic Side Plank', 'Strength', 1),
    ('Copenhagen Plank', 'Strength', 1),
    ('Plank with Leg Lifts', 'Strength', 1),
    ('Plank with Shoulder Taps', 'Strength', 1),
    ('Hanging Knee Raise', 'Strength', 0),
    ('Hanging Leg Raise', 'Strength', 0),
    ('Captain''s Chair Knee Raise', 'Strength', 0),
    ('Captain''s Chair Leg Raise', 'Strength', 0),
    ('Lying Leg Raise', 'Strength', 0),
    ('Hanging Windshield Wiper', 'Strength', 0),
    ('Lying Windshield Wiper', 'Strength', 0),
    ('Lying Windshield Wiper with Bent Knees', 'Strength', 0),
    ('Dead Bug', 'Strength', 0),
    ('Dead Bug With Dumbbells', 'Strength', 0),
    ('Dragon Flag', 'Strength', 0),
    ('Hollow Hold', 'Strength', 1),
    ('L-Sit', 'Strength', 1),
    ('Kneeling Ab Wheel Roll-Out', 'Strength', 0),
    ('Mountain Climbers', 'Strength', 0),
    ('Pallof Press', 'Strength', 0),
    ('Core Twist', 'Strength', 0),
    ('Ball Slams', 'Strength', 0),
    ('Dumbbell Side Bend', 'Strength', 0),
    ('Landmine Rotation', 'Strength', 0),
    ('Kettlebell Plank Pull Through', 'Strength', 0),
    ('High to Low Wood Chop with Band', 'Strength', 0),
    ('High to Low Wood Chop with Cable', 'Strength', 0),
    ('Horizontal Wood Chop with Band', 'Strength', 0),
    ('Horizontal Wood Chop with Cable', 'Strength', 0),
    ('Low to High Wood Chop with Band', 'Strength', 0),
    ('Low to High Wood Chop with Cable', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Calves
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Standing Calf Raise', 'Strength', 0),
    ('Barbell Standing Calf Raise', 'Strength', 0),
    ('Seated Calf Raise', 'Strength', 0),
    ('Barbell Seated Calf Raise', 'Strength', 0),
    ('Calf Raise in Leg Press', 'Strength', 0),
    ('Donkey Calf Raise', 'Strength', 0),
    ('Eccentric Heel Drop', 'Strength', 0),
    ('Heel Raise', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Forearms & Grip
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Barbell Wrist Curl', 'Strength', 0),
    ('Barbell Wrist Curl Behind the Back', 'Strength', 0),
    ('Dumbbell Wrist Curl', 'Strength', 0),
    ('Reverse Wrist Curl', 'Strength', 0),
    ('Bar Hang', 'Strength', 1),
    ('Farmer''s Walk', 'Strength', 0),
    ('Farmer''s Hold', 'Strength', 1),
    ('Plate Pinch', 'Strength', 1),
    ('Towel Hang', 'Strength', 1),
    ('Fat Grip Curl', 'Strength', 0),
    ('Wrist Roller', 'Strength', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Warmup & Mobility
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Arm Circles', 'Mobility', 0),
    ('Arm Swings', 'Mobility', 0),
    ('Leg Swings', 'Mobility', 0),
    ('Hip Circles', 'Mobility', 0),
    ('High Knees', 'Mobility', 0),
    ('Butt Kicks', 'Mobility', 0),
    ('Karaoke', 'Mobility', 0),
    ('A-Skips', 'Mobility', 0),
    ('Walking Knee Hugs', 'Mobility', 0),
    ('Walking Quad Stretch', 'Mobility', 0),
    ('Inchworm', 'Mobility', 0),
    ('World''s Greatest Stretch', 'Mobility', 0),
    ('Cat-Cow', 'Mobility', 0),
    ('Thoracic Spine Rotation', 'Mobility', 0),
    ('Band Dislocates', 'Mobility', 0),
    ('Ankle Circles', 'Mobility', 0),
    ('Wrist Circles', 'Mobility', 0),
    ('Neck Rolls', 'Mobility', 0),
    ('Deep Squat Hold', 'Mobility', 1),
    ('90/90 Hip Switch', 'Mobility', 0),
    ('Pigeon Stretch', 'Mobility', 1),
    ('Couch Stretch', 'Mobility', 1),
    ('Child''s Pose', 'Mobility', 1),
    ('Downward Dog', 'Mobility', 1),
    ('Scorpion Stretch', 'Mobility', 1),
    ('Iron Cross Stretch', 'Mobility', 1),
    ('Foam Rolling', 'Mobility', 1),
    ('Lacrosse Ball Release', 'Mobility', 1),
    ('Banded Shoulder Distraction', 'Mobility', 1),
    ('Banded Hip Distraction', 'Mobility', 1),
    ('Wall Slide', 'Mobility', 0),
    ('Scapular Push-Up', 'Mobility', 0),
    ('Thread the Needle', 'Mobility', 0),
    ('Bretzel Stretch', 'Mobility', 1),
    ('Spiderman Lunge', 'Mobility', 0),
    ('Lateral Lunge Stretch', 'Mobility', 1),
    ('Standing Hamstring Stretch', 'Mobility', 1),
    ('Seated Hamstring Stretch', 'Mobility', 1),
    ('Standing Calf Stretch', 'Mobility', 1),
    ('Band Pull-Apart (Warmup)', 'Mobility', 0)
) AS v(name, category, is_timed)
WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE exercises.name = v.name);

-- =============================
-- Cardio & Conditioning
-- =============================
INSERT INTO exercises (name, category, is_timed)
SELECT name, category, is_timed FROM (VALUES
    ('Treadmill Run', 'Cardio', 1),
    ('Treadmill Walk', 'Cardio', 1),
    ('Treadmill Incline Walk', 'Cardio', 1),
    ('Stationary Bike', 'Cardio', 1),
    ('Rowing Machine', 'Cardio', 1),
    ('Assault Bike', 'Cardio', 1),
    ('Ski Erg', 'Cardio', 1),
    ('Stair Climber', 'Cardio', 1),
    ('Elliptical', 'Cardio', 1),
    ('Jump Rope', 'Cardio', 1),
    ('Double Unders', 'Cardio', 1),
    ('Sled Push', 'Cardio', 1),
    ('Sled Pull', 'Cardio', 1),
    ('Battle Ropes', 'Cardio', 1),
    ('Burpees', 'Cardio', 1),
    ('Bear Crawl', 'Cardio', 1),
    ('Swimming', 'Cardio', 1),
    ('Sprints', 'Cardio', 1),
    ('Hill Sprints', 'Cardio', 1),
    ('Tire Flips', 'Cardio', 1)
) AS v(name, category, is_timed)
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
WHERE e.name IN ('Overhead Press', 'Seated Barbell Overhead Press', 'Dumbbell Shoulder Press', 'Seated Dumbbell Shoulder Press', 'Arnold Press', 'Machine Shoulder Press', 'Seated Smith Machine Shoulder Press', 'Z Press', 'Behind the Neck Press', 'Snatch Grip Behind the Neck Press', 'Landmine Press', 'One-Arm Landmine Press', 'Smith Machine Landmine Press', 'Kettlebell Press', 'Seated Kettlebell Press', 'Kettlebell Push Press', 'Push Press', 'Handstand Push-Up', 'Jerk', 'Power Jerk', 'Split Jerk', 'Squat Jerk')
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
