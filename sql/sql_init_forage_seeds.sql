-- =============================
-- Seed Forage Reference Data
-- Populates the units picker list and the FDA nutrient reference set.
-- =============================

-- =============================
-- Units
-- =============================
INSERT INTO units (name)
SELECT name FROM (VALUES
    ('g'), ('kg'), ('oz'), ('lb'),
    ('ml'), ('fl oz'),
    ('cup'), ('tbsp'), ('tsp'),
    ('slice'), ('piece'),
    ('unit')
) AS t(name)
WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.name = t.name);

-- =============================
-- Nutrients
-- =============================
INSERT INTO nutrients (code, name, unit, daily_value)
SELECT code, name, unit, daily_value FROM (VALUES
    ('sat_fat',       'Saturated fat',         'g',   20),
    ('trans_fat',     'Trans fat',             'g',   NULL),
    ('cholesterol',   'Cholesterol',           'mg',  300),
    ('sodium',        'Sodium',                'mg',  2300),
    ('fiber',         'Fiber',                 'g',   28),
    ('sugar_total',   'Total sugar',           'g',   NULL),
    ('sugar_added',   'Added sugar',           'g',   50),
    ('caffeine',      'Caffeine',              'mg',  NULL),
    ('vit_d',         'Vitamin D',             'mcg', 20),
    ('calcium',       'Calcium',               'mg',  1300),
    ('iron',          'Iron',                  'mg',  18),
    ('potassium',     'Potassium',             'mg',  4700),
    ('vit_a',         'Vitamin A',             'mcg', 900),
    ('vit_c',         'Vitamin C',             'mg',  90),
    ('vit_e',         'Vitamin E',             'mg',  15),
    ('vit_k',         'Vitamin K',             'mcg', 120),
    ('thiamin',       'Thiamin (B1)',          'mg',  1.2),
    ('riboflavin',    'Riboflavin (B2)',       'mg',  1.3),
    ('niacin',        'Niacin (B3)',           'mg',  16),
    ('vit_b6',        'Vitamin B6',            'mg',  1.7),
    ('folate',        'Folate (B9)',           'mcg', 400),
    ('vit_b12',       'Vitamin B12',           'mcg', 2.4),
    ('biotin',        'Biotin',                'mcg', 30),
    ('pantothenic',   'Pantothenic acid (B5)', 'mg',  5),
    ('choline',       'Choline',               'mg',  550),
    ('magnesium',     'Magnesium',             'mg',  420),
    ('phosphorus',    'Phosphorus',            'mg',  1250),
    ('zinc',          'Zinc',                  'mg',  11),
    ('copper',        'Copper',                'mg',  0.9),
    ('manganese',     'Manganese',             'mg',  2.3),
    ('selenium',      'Selenium',              'mcg', 55),
    ('iodine',        'Iodine',                'mcg', 150),
    ('chromium',      'Chromium',              'mcg', 35),
    ('molybdenum',    'Molybdenum',            'mcg', 45),
    ('chloride',      'Chloride',              'mg',  2300)
) AS v(code, name, unit, daily_value)
WHERE NOT EXISTS (SELECT 1 FROM nutrients n WHERE n.code = v.code);
