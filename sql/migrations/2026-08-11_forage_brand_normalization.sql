/*
  2026-08-11 — FORAGE data normalization (GRIMOIRE-FOOD-*)

  Two parts, both data-only (no schema change):

  1. MERGE the two Taco Bell duplicate clusters onto the canonical branded food
     (the one that carries `brand = 'Taco Bell'`):
       - "Chicken quesadilla" + "Taco Bell Chicken Quesadilla" -> "Chicken Quesadilla" [Taco Bell]
       - "Cantina Bowl"                                        -> "Chicken Cantina Bowl" [Taco Bell]
     The homemade recipe-backed "Cantina bowl" (A8EFA436, 10 ingredients, 55 g protein)
     is a DIFFERENT food and is deliberately left alone.

     food_entries has no FK, so entries are repointed by hand (food_id AND serving_id).
     Every serving involved is units_per_serving = 1 and every entry is quantity = 1,
     so the serving count (quantity / units_per_serving) is preserved exactly.
     None of these entries have a food_entry_nutrients snapshot, so their macros
     now resolve off the canonical food's food_nutrients.

     Losers are ARCHIVED (is_archived = 1) rather than deleted — that is exactly
     what the app's own delete path does (foodFunctions.ts deleteFood).

  2. Move brands that were typed into `name` into the `brand` column, and collapse
     the three spellings of H-E-B / two of Chick-fil-A into one value each.
     Where stripping the brand would leave a meaningless fragment ("large",
     "medium"), the name is left as-is and only `brand` is set.

  Rollback: every touched row is copied to _bak_brandnorm20260811_* first.
*/

USE [GRIMOIRE-FOOD-20260520];
GO

/* sqlcmd defaults QUOTED_IDENTIFIER OFF; `foods` carries a filtered index, and
   UPDATE against one requires it ON. */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRAN;

/* ---------------------------------------------------------------- BACKUPS */

DECLARE @touched TABLE (id uniqueidentifier PRIMARY KEY);
INSERT INTO @touched (id) VALUES
  -- merge cluster: quesadilla
  ('3B7F7F99-5A8D-4E99-AD9A-9EB10663A209'),  -- canonical  Chicken Quesadilla [Taco Bell]
  ('FE9EE465-30C9-4B73-9F6E-6809D9232603'),  -- loser      Chicken quesadilla
  ('0B2076CC-3976-45B5-AF61-4E953FE89018'),  -- loser      Taco Bell Chicken Quesadilla
  -- merge cluster: cantina bowl
  ('C3670DB3-4ADD-42EA-AD74-79E9C644D468'),  -- canonical  Chicken Cantina Bowl [Taco Bell]
  ('81171F2E-3AF8-42AC-9EEB-9BE67ED34C2E'),  -- loser      Cantina Bowl
  -- brand-in-name fixes
  ('00149CA9-324A-437E-B93E-5DC8F885114F'),
  ('779C7BA4-4EE3-450D-882B-B5A80792D56A'),
  ('C33F25FC-9C92-4935-84C4-BBC9D35BB36F'),
  ('FC7AF8E1-AC5C-4666-8FF5-FBD44041E85E'),
  ('6DBA7251-4078-4EE9-96F2-083436B29D86'),
  ('8B2D94DA-4153-4DF4-BADE-5287883C53C3'),
  ('F421DFFE-0D9B-4DA3-ADF4-C80EB6B9BB7B'),
  ('F50684E6-3EEF-4DAD-BB5A-CABFD33E9DE6'),
  ('A9EF64DA-B68A-41A4-AE6D-796AF9AF8F9B'),
  ('A18E79F3-B4B0-4BA6-A3D2-BE5B1F2BD7CC'),
  ('AF6AC752-FDC0-4D63-BD64-85DDBCEE56FA'),
  ('BB8B7859-29A3-4F5C-88EA-4E652A0E6A14'),
  ('CB2C8F44-CE3A-4D4D-94EE-81CF90CB5147'),
  ('D03A208C-4A67-4EA8-9CB6-040E50EB2FAF'),
  ('3316D284-D127-48F9-9BAA-22634CB1AE82'),
  ('40B052FD-A3F2-47EE-B566-E0F209E23AFF'),
  ('A4C88A9C-CAEF-46AF-9B5A-8ED3D68981E1'),
  ('C986FD81-B10A-4A7E-9ED4-49C39FEB2371'),
  ('7D89F474-F073-4215-B05C-6315D2AF081C'),
  ('8FA8F0C2-A434-4CF3-9ED9-5FD898A1BD5D'),
  ('3548B5BD-F051-4D77-A5B4-FC5859D68443'),
  ('34F2D4C9-199E-4310-95E1-9B56219E2B64');

SELECT f.* INTO _bak_brandnorm20260811_foods
  FROM foods f
  WHERE f.id IN (SELECT id FROM @touched)
     OR f.brand IN (N'HEB', N'H' + NCHAR(0x2011) + N'E' + NCHAR(0x2011) + N'B', N'Chick-fil-a');

SELECT s.* INTO _bak_brandnorm20260811_servings
  FROM food_servings s WHERE s.food_id IN (SELECT id FROM @touched);

SELECT n.* INTO _bak_brandnorm20260811_nutrients
  FROM food_nutrients n WHERE n.food_id IN (SELECT id FROM @touched);

SELECT e.* INTO _bak_brandnorm20260811_entries
  FROM food_entries e WHERE e.food_id IN (SELECT id FROM @touched);

/* -------------------------------------------------- 1. MERGE — QUESADILLA */
/* Both losers' servings are 1-per-serving, as is the canonical 'serving' row. */

UPDATE food_entries
   SET food_id    = '3B7F7F99-5A8D-4E99-AD9A-9EB10663A209',
       serving_id = '524AFB0B-B743-41A1-9D1E-CA792CF18C99'   -- canonical "serving"
 WHERE food_id IN ('FE9EE465-30C9-4B73-9F6E-6809D9232603',
                   '0B2076CC-3976-45B5-AF61-4E953FE89018');

/* ------------------------------------------------- 1. MERGE — CANTINA BOWL */

UPDATE food_entries
   SET food_id    = 'C3670DB3-4ADD-42EA-AD74-79E9C644D468',
       serving_id = '52A44327-8286-44A6-A8E9-07F75143F63F'   -- canonical "serving"
 WHERE food_id = '81171F2E-3AF8-42AC-9EEB-9BE67ED34C2E';

/* Retire the losers the same way the app does. */
UPDATE foods
   SET is_archived = 1, ts_updated = GETDATE()
 WHERE id IN ('FE9EE465-30C9-4B73-9F6E-6809D9232603',
              '0B2076CC-3976-45B5-AF61-4E953FE89018',
              '81171F2E-3AF8-42AC-9EEB-9BE67ED34C2E');

/* -------------------------------------------- 2. BRAND OUT OF NAME -> BRAND */

UPDATE foods SET brand = N'Chick-fil-A',   name = N'Chicken Sandwich'                       WHERE id = '00149CA9-324A-437E-B93E-5DC8F885114F';
UPDATE foods SET brand = N'Chick-fil-A',   name = N'Spicy Chicken Deluxe Sandwich'           WHERE id = '779C7BA4-4EE3-450D-882B-B5A80792D56A';
UPDATE foods SET brand = N'Chick-fil-A',   name = N'Chicken Biscuit'                         WHERE id = 'C33F25FC-9C92-4935-84C4-BBC9D35BB36F';
UPDATE foods SET brand = N'Chick-fil-A',   name = N'Sauce'                                   WHERE id = 'FC7AF8E1-AC5C-4666-8FF5-FBD44041E85E';
UPDATE foods SET brand = N'Taco Bell',     name = N'Beef Chalupa Supreme'                    WHERE id = '6DBA7251-4078-4EE9-96F2-083436B29D86';
UPDATE foods SET brand = N'Taco Bell',     name = N'Chicken Burrito Supreme'                 WHERE id = '8B2D94DA-4153-4DF4-BADE-5287883C53C3';
UPDATE foods SET brand = N'Taco Bell',     name = N'Spicy Potato Soft Taco'                  WHERE id = 'F421DFFE-0D9B-4DA3-ADF4-C80EB6B9BB7B';
UPDATE foods SET brand = N'Taco Bell',     name = N'Chicken Power Bowl'                      WHERE id = 'F50684E6-3EEF-4DAD-BB5A-CABFD33E9DE6';
UPDATE foods SET brand = N'Taco Bell',     name = N'Original with Beef'                      WHERE id = 'A9EF64DA-B68A-41A4-AE6D-796AF9AF8F9B';
UPDATE foods SET brand = N'Domino''s',     name = N'14" Pepperoni Pizza, Crunchy Thin Crust' WHERE id = 'A18E79F3-B4B0-4BA6-A3D2-BE5B1F2BD7CC';
UPDATE foods SET brand = N'Clif Bar',      name = N'Chocolate Chip'                          WHERE id = 'AF6AC752-FDC0-4D63-BD64-85DDBCEE56FA';
UPDATE foods SET brand = N'Oreo',          name = N'White Fudge Covered Sandwich Cookies'    WHERE id = 'BB8B7859-29A3-4F5C-88EA-4E652A0E6A14';
UPDATE foods SET brand = N'General Mills', name = N'Multi Grain Cheerios'                    WHERE id = 'CB2C8F44-CE3A-4D4D-94EE-81CF90CB5147';
UPDATE foods SET brand = N'General Mills', name = N'Limited Edition Honey Nut Cheerios'      WHERE id = 'D03A208C-4A67-4EA8-9CB6-040E50EB2FAF';
UPDATE foods SET brand = N'C4',            name = N'Energy Drink'                            WHERE id = '3316D284-D127-48F9-9BAA-22634CB1AE82';
UPDATE foods SET brand = N'Jif',           name = N'Peanut Butter'                           WHERE id = '7D89F474-F073-4215-B05C-6315D2AF081C';
UPDATE foods SET brand = N'Jif',           name = N'Reduced Fat Crunchy Peanut Butter'       WHERE id = '8FA8F0C2-A434-4CF3-9ED9-5FD898A1BD5D';
UPDATE foods SET brand = N'Sara Lee',      name = N'Angel Food Bundt Cake'                   WHERE id = '34F2D4C9-199E-4310-95E1-9B56219E2B64';

/* Brand only — stripping it would leave a bare size word / nothing. */
UPDATE foods SET brand = N'Powerade'        WHERE id = '40B052FD-A3F2-47EE-B566-E0F209E23AFF';  -- "Powerade large"
UPDATE foods SET brand = N'Sprite'          WHERE id = 'A4C88A9C-CAEF-46AF-9B5A-8ED3D68981E1';  -- "Sprite medium"
UPDATE foods SET brand = N'Gatorade'        WHERE id = 'C986FD81-B10A-4A7E-9ED4-49C39FEB2371';  -- "Gatorade"
UPDATE foods SET brand = N'Ben''s Original' WHERE id = '3548B5BD-F051-4D77-A5B4-FC5859D68443';  -- "Ready rice pilaf with orzo pasta"

UPDATE foods SET ts_updated = GETDATE() WHERE id IN (SELECT id FROM @touched);

/* --------------------------------------- 2b. COLLAPSE BRAND-VALUE VARIANTS */
/* One brand, three spellings — the third uses a non-breaking hyphen (U+2011). */

UPDATE foods SET brand = N'H-E-B', ts_updated = GETDATE()
 WHERE brand IN (N'HEB', N'H' + NCHAR(0x2011) + N'E' + NCHAR(0x2011) + N'B');

/* The DB collation is case-insensitive, so this one predicate catches both
   "Chick-fil-a" and "Chick-fil-A" and lands them all on the canonical casing. */
UPDATE foods SET brand = N'Chick-fil-A', ts_updated = GETDATE()
 WHERE brand = N'Chick-fil-a';

COMMIT;
GO
