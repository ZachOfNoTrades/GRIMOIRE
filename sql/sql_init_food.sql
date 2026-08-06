-- =============================
-- Food Tracker (FORAGE) Database Initialization Script
-- Version: 202605200001 (Phase 1 — MVP diary)
-- =============================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

BEGIN TRANSACTION FoodDbInitialization
BEGIN TRY

    -- =============================
    -- Foods (user library + cached USDA + recipe-synthetic)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='foods' AND xtype='U')
    BEGIN
        CREATE TABLE foods (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NULL, -- NULL = shared/USDA cache, non-null = user's custom
            name NVARCHAR(255) NOT NULL,
            brand NVARCHAR(255) NULL,
            source NVARCHAR(16) NOT NULL DEFAULT 'user', -- 'user' | 'usda' | 'recipe'
            usda_fdc_id BIGINT NULL,
            barcode_upc NVARCHAR(32) NULL,
            -- Macros (calories/protein/carbs/fat) are stored as food_nutrients rows
            -- (category='macro'), not columns — see the nutrients seed below.
            is_favorite BIT NOT NULL DEFAULT 0,
            is_archived BIT NOT NULL DEFAULT 0,
            -- Code from the preseeded forage icon set (FOOD_ICONS in lib/foodIcons.tsx).
            -- NULL falls back to the default apple icon at render time.
            icon NVARCHAR(32) NULL,
            -- Public product/nutrition page this food's data came from (or was
            -- pasted in by the user). Drives the "Resync" action on the food
            -- detail page, which re-scrapes this URL and refreshes the nutrition.
            source_url NVARCHAR(1000) NULL,
            -- Set when the food has a photo in food_images; NULL means "no photo,
            -- render the icon". Also the image URL's cache-buster, since it moves
            -- whenever the photo is replaced.
            image_updated_at DATETIME2 NULL,
            ts_created DATETIME2 DEFAULT GETDATE(),
            ts_updated DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT chk_foods_source CHECK (source IN ('user','usda','recipe','generic'))
        );

        CREATE INDEX IX_foods_user_name ON foods (user_id, name);
        CREATE INDEX IX_foods_usda ON foods (usda_fdc_id) WHERE usda_fdc_id IS NOT NULL;
        CREATE INDEX IX_foods_barcode ON foods (barcode_upc) WHERE barcode_upc IS NOT NULL;
    END

    -- =============================
    -- Food Images — one product photo per food, stored as bytes.
    -- Kept in its own table so listing foods never drags blobs along, and stored
    -- rather than hotlinked so a photo survives its source going down or
    -- re-revving its URLs, and no third party sees what the user is browsing.
    -- foods.image_updated_at mirrors "a row exists here" for cheap list queries.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_images' AND xtype='U')
    BEGIN
        CREATE TABLE food_images (
            food_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
            content_type NVARCHAR(64) NOT NULL,
            bytes VARBINARY(MAX) NOT NULL,
            byte_size INT NOT NULL,
            -- Where the photo was downloaded from, kept for provenance/re-fetch.
            source_url NVARCHAR(1000) NULL,
            ts_updated DATETIME2 NOT NULL DEFAULT GETDATE(),
            CONSTRAINT FK_food_images_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
        );
    END

    -- =============================
    -- Food Units — selectable units of measure for serving rows + entry quantities.
    -- The implicit canonical 'serving' is NOT a row here; it's auto-injected server-side.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_units' AND xtype='U')
    BEGIN
        CREATE TABLE food_units (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(32) NOT NULL,
            display_order INT NOT NULL DEFAULT 0,
            CONSTRAINT UQ_food_units_name UNIQUE (name)
        );

        INSERT INTO food_units (name, display_order) VALUES
            ('g', 10), ('kg', 20), ('oz', 30), ('lb', 40),
            ('ml', 50), ('fl oz', 60),
            ('cup', 70), ('tbsp', 80), ('tsp', 90),
            ('slice', 100), ('piece', 110),
            ('unit', 120);
    END

    -- =============================
    -- Food Servings — unit conversions for a food.
    -- Each row encodes "1 serving of this food = <units_per_serving> of <unit>".
    -- The "serving" itself is the canonical reference; macros on foods are per-serving.
    -- Every food should carry at least a {'serving', 1} row so the canonical unit is selectable.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_servings' AND xtype='U')
    BEGIN
        CREATE TABLE food_servings (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            food_id UNIQUEIDENTIFIER NOT NULL,
            unit NVARCHAR(32) NOT NULL, -- 'serving','g','oz','cup','slice','scoop', etc.
            units_per_serving DECIMAL(10,4) NOT NULL, -- how many of <unit> equal 1 serving
            ts_created DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT FK_food_servings_food FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
        );

        CREATE INDEX IX_food_servings_food ON food_servings (food_id);
    END

    -- =============================
    -- Food Entries (the diary log)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_entries' AND xtype='U')
    BEGIN
        CREATE TABLE food_entries (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            entry_date DATE NOT NULL,
            entry_time TIME NOT NULL DEFAULT CONVERT(TIME, GETDATE()), -- time of day consumed; UI groups by hour
            food_id UNIQUEIDENTIFIER NULL,
            serving_id UNIQUEIDENTIFIER NULL,
            quantity DECIMAL(8,3) NOT NULL DEFAULT 1, -- in servings if serving_id, in grams otherwise
            -- Quick-add: a foodless entry carries just a label here; its macros
            -- live in food_entry_nutrients (per-unit), like a food's food_nutrients.
            quick_add_name NVARCHAR(255) NULL,
            ts_logged DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT chk_food_entries_food_or_quick CHECK (
                food_id IS NOT NULL OR quick_add_name IS NOT NULL
            )
        );

        CREATE INDEX IX_food_entries_user_date ON food_entries (user_id, entry_date);
    END

    -- =============================
    -- Weight Log (daily weigh-ins) — stored in pounds (forage_user_settings.weight_unit
    -- controls how this is presented in the UI; conversions happen at the boundary).
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='weight_log' AND xtype='U')
    BEGIN
        CREATE TABLE weight_log (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            log_date DATE NOT NULL,
            weight_lb DECIMAL(6,2) NOT NULL,
            ts_created DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT UQ_weight_log_user_date UNIQUE (user_id, log_date)
        );

        CREATE INDEX IX_weight_log_user_date ON weight_log (user_id, log_date DESC);
    END

    -- =============================
    -- Forage user settings — per-user UI preferences (currently just unit system).
    -- Default 'lbs' to match the storage canon; 'kg' is opt-in for metric users.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forage_user_settings' AND xtype='U')
    BEGIN
        CREATE TABLE forage_user_settings (
            user_id UNIQUEIDENTIFIER PRIMARY KEY,
            weight_unit NVARCHAR(8) NOT NULL DEFAULT 'lbs',
            -- Opt-in Discord reminder for a coached program's weekly check-in.
            checkin_notif_enabled BIT NOT NULL DEFAULT 0,
            checkin_notif_time TIME(0) NOT NULL DEFAULT '09:00:00',
            checkin_notif_last_sent_date DATE NULL,
            -- How far back the picker's hourly "favorites" looks when counting
            -- frequently-logged foods (days). Default 30 = ~one month; older logs
            -- stop counting so a food you ate at 8am months ago drops off.
            favorites_history_days INT NOT NULL DEFAULT 30,
            ts_updated DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT chk_forage_user_settings_unit CHECK (weight_unit IN ('lbs','kg')),
            CONSTRAINT chk_forage_user_settings_fav_days CHECK (favorites_history_days BETWEEN 1 AND 3650)
        );
    END

    -- Macro targets are NOT a dedicated table anymore — daily macro goals (with
    -- effective-date history + source) live in nutrient_targets_v2 (scope='macro').
    -- See that table's definition below.

    -- =============================
    -- Nutrients — reference table for vitamins/minerals/other (fiber, sugar, sat fat, etc.)
    -- Daily values from FDA 2016 label rules (Adults 4+).
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='nutrients' AND xtype='U')
    BEGIN
        CREATE TABLE nutrients (
            id            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            code          NVARCHAR(32)  NOT NULL,
            name          NVARCHAR(64)  NOT NULL,
            category      NVARCHAR(16)  NOT NULL,
            unit          NVARCHAR(8)   NOT NULL,
            daily_value   DECIMAL(12,4) NULL,
            -- FDA-derived DEFAULT target band (floor=reach / target=ideal / ceiling=limit),
            -- each optional. Reach nutrients carry a floor (=DV); limit nutrients a ceiling
            -- (=DV); supplements (caffeine, water) carry NONE — manual-only. Per-user
            -- overrides live in nutrient_targets; these are the fallback.
            default_floor   DECIMAL(12,4) NULL,
            default_target  DECIMAL(12,4) NULL,
            default_ceiling DECIMAL(12,4) NULL,
            -- NOTE: there is deliberately NO display_order column. Nutrient
            -- ordering is owned entirely by the code manifest
            -- (forage/utils/nutrientLedger.ts → byNutrientOrder); the DB never
            -- dictates render order. See migration 2026-06-16_forage_drop_nutrient_display_order.
            is_active     BIT           NOT NULL DEFAULT 1,
            CONSTRAINT UQ_nutrients_code UNIQUE (code),
            CONSTRAINT chk_nutrients_category CHECK (category IN ('macro','vitamin','mineral','other'))
        );
    END

    -- Backfill the default-band columns on databases created before they existed.
    IF COL_LENGTH('nutrients', 'default_floor') IS NULL
        ALTER TABLE nutrients ADD default_floor DECIMAL(12,4) NULL;
    IF COL_LENGTH('nutrients', 'default_target') IS NULL
        ALTER TABLE nutrients ADD default_target DECIMAL(12,4) NULL;
    IF COL_LENGTH('nutrients', 'default_ceiling') IS NULL
        ALTER TABLE nutrients ADD default_ceiling DECIMAL(12,4) NULL;

    -- Widen the category check to admit 'macro' on databases created before
    -- macros became first-class nutrient rows (see the macro seed + the
    -- 2026-06-15 migration). Drop+recreate so re-init is idempotent.
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = 'chk_nutrients_category'
          AND definition NOT LIKE '%macro%'
    )
    BEGIN
        ALTER TABLE nutrients DROP CONSTRAINT chk_nutrients_category;
        ALTER TABLE nutrients ADD CONSTRAINT chk_nutrients_category
            CHECK (category IN ('macro','vitamin','mineral','other'));
    END

    -- =============================
    -- Food Nutrients — EAV: per-food, per-nutrient amount (per canonical serving).
    -- Same scaling as macros: entry amount = serving_count × food_nutrients.amount.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_nutrients' AND xtype='U')
    BEGIN
        CREATE TABLE food_nutrients (
            food_id     UNIQUEIDENTIFIER NOT NULL,
            nutrient_id UNIQUEIDENTIFIER NOT NULL,
            amount      DECIMAL(12,4)    NOT NULL,
            CONSTRAINT PK_food_nutrients PRIMARY KEY (food_id, nutrient_id),
            CONSTRAINT FK_food_nutrients_food FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE,
            CONSTRAINT FK_food_nutrients_nutrient FOREIGN KEY (nutrient_id) REFERENCES nutrients(id)
        );

        CREATE INDEX IX_food_nutrients_nutrient ON food_nutrients (nutrient_id);
    END

    -- =============================
    -- Food Entry Nutrients — entry-level EAV for foodless "quick add" entries,
    -- which have no food row to hang food_nutrients off. `amount` is per-unit
    -- (per quantity = 1) and scaled by food_entries.quantity at read, the same
    -- way the legacy quick_add_* columns were. Food-backed entries derive their
    -- nutrients from the food's food_nutrients instead, so they get no rows here.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_entry_nutrients' AND xtype='U')
    BEGIN
        CREATE TABLE food_entry_nutrients (
            entry_id    UNIQUEIDENTIFIER NOT NULL,
            nutrient_id UNIQUEIDENTIFIER NOT NULL,
            amount      DECIMAL(12,4)    NOT NULL,
            CONSTRAINT PK_food_entry_nutrients PRIMARY KEY (entry_id, nutrient_id),
            CONSTRAINT FK_food_entry_nutrients_entry FOREIGN KEY (entry_id) REFERENCES food_entries(id) ON DELETE CASCADE,
            CONSTRAINT FK_food_entry_nutrients_nutrient FOREIGN KEY (nutrient_id) REFERENCES nutrients(id)
        );

        CREATE INDEX IX_food_entry_nutrients_nutrient ON food_entry_nutrients (nutrient_id);
    END

    -- Reconcile nutrient reference set on every init run (MERGE is idempotent;
    -- existing rows pick up DV updates without duplication).
    -- NOTE: render ORDER is NOT stored here — it lives in the code manifest
    -- (forage/utils/nutrientLedger.ts). This table is an unordered reference set.
    ;WITH src(code, name, category, unit, daily_value) AS (
        SELECT * FROM (VALUES
            ('sat_fat',       'Saturated fat',     'other',   'g',   20),
            ('trans_fat',     'Trans fat',         'other',   'g',   NULL),
            ('cholesterol',   'Cholesterol',       'other',   'mg',  300),
            ('sodium',        'Sodium',            'mineral', 'mg',  2300),
            ('fiber',         'Fiber',             'other',   'g',   28),
            ('sugar_total',   'Total sugar',       'other',   'g',   NULL),
            ('sugar_added',   'Added sugar',       'other',   'g',   50),
            -- Supplements — no FDA DV, no default band (manual-only).
            ('caffeine',      'Caffeine',          'other',   'mg',  NULL),
            ('water',         'Water',             'other',   'ml',  NULL),
            -- The four FDA-required vitamins/minerals
            ('vit_d',         'Vitamin D',         'vitamin', 'mcg', 20),
            ('calcium',       'Calcium',           'mineral', 'mg',  1300),
            ('iron',          'Iron',              'mineral', 'mg',  18),
            ('potassium',     'Potassium',         'mineral', 'mg',  4700),
            -- REMAINING VITAMINS
            ('vit_a',         'Vitamin A',         'vitamin', 'mcg', 900),
            ('vit_c',         'Vitamin C',         'vitamin', 'mg',  90),
            ('vit_e',         'Vitamin E',         'vitamin', 'mg',  15),
            ('vit_k',         'Vitamin K',         'vitamin', 'mcg', 120),
            ('thiamin',       'Thiamin (B1)',      'vitamin', 'mg',  1.2),
            ('riboflavin',    'Riboflavin (B2)',   'vitamin', 'mg',  1.3),
            ('niacin',        'Niacin (B3)',       'vitamin', 'mg',  16),
            ('vit_b6',        'Vitamin B6',        'vitamin', 'mg',  1.7),
            ('folate',        'Folate (B9)',       'vitamin', 'mcg', 400),
            ('vit_b12',       'Vitamin B12',       'vitamin', 'mcg', 2.4),
            ('biotin',        'Biotin',            'vitamin', 'mcg', 30),
            ('pantothenic',   'Pantothenic acid (B5)', 'vitamin', 'mg', 5),
            ('choline',       'Choline',           'vitamin', 'mg',  550),
            -- REMAINING MINERALS
            ('magnesium',     'Magnesium',         'mineral', 'mg',  420),
            ('phosphorus',    'Phosphorus',        'mineral', 'mg',  1250),
            ('zinc',          'Zinc',              'mineral', 'mg',  11),
            ('copper',        'Copper',            'mineral', 'mg',  0.9),
            ('manganese',     'Manganese',         'mineral', 'mg',  2.3),
            ('selenium',      'Selenium',          'mineral', 'mcg', 55),
            ('iodine',        'Iodine',            'mineral', 'mcg', 150),
            ('chromium',      'Chromium',          'mineral', 'mcg', 35),
            ('molybdenum',    'Molybdenum',        'mineral', 'mcg', 45),
            ('chloride',      'Chloride',          'mineral', 'mg',  2300)
        ) AS t(code, name, category, unit, daily_value)
    )
    -- Derive the FDA default band from the DV + a small limit/supplement split:
    --   limit nutrients   → default_ceiling = DV (stay under), no floor/target
    --   supplements       → none (caffeine etc. are manual-only, per product rule)
    --   everything else   → default_floor = DV (reach), no target/ceiling
    -- (caffeine/trans_fat/sugar_total have NULL DV so they resolve to no band anyway;
    -- the supplement guard keeps it true even if a DV is ever added.)
    , defaulted AS (
        SELECT code, name, category, unit, daily_value,
            CASE WHEN code IN ('sat_fat','cholesterol','sodium','sugar_added') THEN NULL
                 WHEN code IN ('caffeine','water') THEN NULL
                 ELSE daily_value END AS default_floor,
            CAST(NULL AS DECIMAL(12,4)) AS default_target,
            CASE WHEN code IN ('sat_fat','cholesterol','sodium','sugar_added') THEN daily_value
                 ELSE NULL END AS default_ceiling
        FROM src
    )
    MERGE nutrients AS tgt
    USING defaulted AS src ON tgt.code = src.code
    WHEN MATCHED THEN UPDATE SET
        name            = src.name,
        category        = src.category,
        unit            = src.unit,
        daily_value     = src.daily_value,
        default_floor   = src.default_floor,
        default_target  = src.default_target,
        default_ceiling = src.default_ceiling,
        is_active       = 1
    WHEN NOT MATCHED THEN INSERT (code, name, category, unit, daily_value, default_floor, default_target, default_ceiling, is_active)
        VALUES (src.code, src.name, src.category, src.unit, src.daily_value, src.default_floor, src.default_target, src.default_ceiling, 1);

    -- Macros as first-class nutrient rows (category='macro'). Seeded separately
    -- because a macro's band differs from the reach/limit micro split: it's a
    -- single reach-a-goal target (default_target = FDA DV), no floor/ceiling. The
    -- per-user/program macro goal layers on top (macro_targets today). Macros
    -- are excluded from the vitamin/mineral/other section loops by category,
    -- so adding them here does not double-count anywhere. (Render order — macros
    -- first — is the manifest's job, not the DB's.)
    ;WITH macro(code, name, unit, daily_value) AS (
        SELECT * FROM (VALUES
            ('kcal',    'Calories', 'kcal', 2000),
            ('protein', 'Protein',  'g',    50),
            ('fat',     'Fat',      'g',    78),
            ('carbs',   'Carbs',    'g',    275)
        ) AS t(code, name, unit, daily_value)
    )
    MERGE nutrients AS tgt
    USING macro AS src ON tgt.code = src.code
    WHEN MATCHED THEN UPDATE SET
        name = src.name, category = 'macro', unit = src.unit,
        daily_value = src.daily_value, default_floor = NULL,
        default_target = src.daily_value, default_ceiling = NULL,
        is_active = 1
    WHEN NOT MATCHED THEN INSERT (code, name, category, unit, daily_value, default_floor, default_target, default_ceiling, is_active)
        VALUES (src.code, src.name, 'macro', src.unit, src.daily_value, NULL, src.daily_value, NULL, 1);

    -- (The former per-program-only `nutrient_targets` table has been replaced by
    -- the unified, history-capable nutrient_targets_v2 below.)

    -- =============================
    -- Nutrient Targets v2 — UNIFIED, HISTORY-CAPABLE target model (Phase 4).
    -- Subsumes BOTH the per-PROGRAM micro band overrides (formerly nutrient_targets)
    -- AND the per-USER macro goal history (formerly macro_targets). The two have
    -- different SCOPES, so each row carries a `scope` discriminator and exactly one
    -- scope key (program_id for micro, user_id for macro):
    --   scope='micro' : program_id NOT NULL, user_id NULL. floor/target/ceiling band,
    --                   is_active=1, source='manual'. One row per program+nutrient
    --                   (filtered unique index = the old composite PK semantics).
    --   scope='macro' : user_id NOT NULL, program_id NULL. The macro goal in `target`
    --                   (floor/ceiling NULL), with full history: effective_date,
    --                   day_of_week (NULL=all days), is_active (current), source
    --                   ('manual'|'program'). 4 rows per goal (kcal/protein/fat/carbs)
    --                   sharing identity, resolved into a MacroTarget by the lib.
    -- The legacy macro_targets / nutrient_targets tables were migrated into this
    -- table and dropped (see the 2026-06-15 macro→nutrient migrations).
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='nutrient_targets_v2' AND xtype='U')
    BEGIN
        CREATE TABLE nutrient_targets_v2 (
            id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
            scope          VARCHAR(8)       NOT NULL,                  -- 'macro' | 'micro'
            user_id        UNIQUEIDENTIFIER NULL,                      -- macro scope
            program_id     UNIQUEIDENTIFIER NULL,                      -- micro scope
            nutrient_id    UNIQUEIDENTIFIER NOT NULL,
            floor          DECIMAL(12,4)    NULL,                      -- micro band lower
            target         DECIMAL(12,4)    NULL,                      -- macro goal / micro band ideal
            ceiling        DECIMAL(12,4)    NULL,                      -- micro band upper
            effective_date DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
            day_of_week    TINYINT          NULL,                      -- macro per-DOW; NULL=all days
            is_active      BIT              NOT NULL DEFAULT 1,
            source         VARCHAR(16)      NOT NULL DEFAULT 'manual', -- 'manual' | 'program'
            updated_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
            CONSTRAINT PK_nutrient_targets_v2 PRIMARY KEY (id),
            CONSTRAINT chk_ntv2_scope CHECK (scope IN ('macro','micro')),
            CONSTRAINT chk_ntv2_scope_keys CHECK (
                (scope='macro' AND user_id IS NOT NULL AND program_id IS NULL)
             OR (scope='micro' AND program_id IS NOT NULL AND user_id IS NULL)
            ),
            CONSTRAINT FK_ntv2_nutrient FOREIGN KEY (nutrient_id) REFERENCES nutrients(id),
            CONSTRAINT FK_ntv2_program  FOREIGN KEY (program_id)  REFERENCES forage_program(id) ON DELETE CASCADE
        );

        -- Macro history lookup (mirrors the old IX_macro_targets_user_eff).
        CREATE INDEX IX_ntv2_macro_lookup
            ON nutrient_targets_v2 (user_id, nutrient_id, effective_date DESC, is_active)
            WHERE scope='macro';

        -- Micro overrides: at most ONE row per program+nutrient.
        CREATE UNIQUE INDEX UX_ntv2_micro_program_nutrient
            ON nutrient_targets_v2 (program_id, nutrient_id)
            WHERE scope='micro';
    END

    -- =============================
    -- Dashboard cards — per-user customization of which cards show in each
    -- dashboard section, and in what order. `section` namespaces the config
    -- (currently only 'nutrition'); `card_key` is a synthetic macro key
    -- ('macros','kcal','protein','fat','carbs') or a nutrients.code micro
    -- ('sugar_total','sat_fat', …). No rows for a (user,section) = fall back to
    -- that section's built-in default set (see types/dashboard.ts).
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forage_dashboard_cards' AND xtype='U')
    BEGIN
        CREATE TABLE forage_dashboard_cards (
            user_id    UNIQUEIDENTIFIER NOT NULL,
            section    VARCHAR(32)      NOT NULL,  -- 'nutrition' (future: 'body_metrics', …)
            card_key   NVARCHAR(64)     NOT NULL,  -- macro key or nutrients.code
            position   INT              NOT NULL,
            ts_updated DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            CONSTRAINT PK_forage_dashboard_cards PRIMARY KEY (user_id, section, card_key)
        );

        CREATE INDEX IX_forage_dashboard_cards_user_section ON forage_dashboard_cards (user_id, section, position);
    END

    -- =============================
    -- Recipes — a recipe is a row in `foods` (source='recipe'). This sidecar table
    -- holds the recipe-only fields (just servings yield, for now) keyed by that
    -- food_id. Treating recipes as a flavor of food means a recipe can appear
    -- anywhere a food can — including as an ingredient of another recipe (recursive)
    -- and as a row in food_entries (the existing diary logging path "just works").
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forage_recipes' AND xtype='U')
    BEGIN
        CREATE TABLE forage_recipes (
            food_id UNIQUEIDENTIFIER PRIMARY KEY, -- FK to foods.id (source='recipe')
            servings DECIMAL(8,3) NOT NULL DEFAULT 1, -- how many servings this recipe makes
            ts_created DATETIME2 DEFAULT GETDATE(),
            ts_updated DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT FK_forage_recipes_food FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
        );
    END

    -- =============================
    -- Recipe Ingredients — ordered list of ingredient rows for a recipe.
    --
    -- A row is either:
    --   * RESOLVED — ingredient_food_id IS NOT NULL; quantity + serving_id reference
    --     a real food in the library, and contribute to the computed recipe macros.
    --   * PLACEHOLDER — ingredient_food_id IS NULL; placeholder_name (+ optional
    --     placeholder_quantity_text) carries the human-readable description from
    --     a URL/AI import. Placeholders contribute 0 to recipe macros until the
    --     user clicks "Replace" on the row and resolves to a real food.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forage_recipe_ingredients' AND xtype='U')
    BEGIN
        CREATE TABLE forage_recipe_ingredients (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            recipe_food_id UNIQUEIDENTIFIER NOT NULL, -- FK to foods.id (the recipe)
            display_order INT NOT NULL DEFAULT 0,
            -- Resolved path
            ingredient_food_id UNIQUEIDENTIFIER NULL, -- FK to foods.id (the ingredient)
            serving_id UNIQUEIDENTIFIER NULL, -- FK to food_servings (the unit picked)
            quantity DECIMAL(10,3) NOT NULL DEFAULT 1, -- in <serving_id.unit> if set, else grams
            -- Placeholder path (URL/AI imports start here; user resolves later)
            placeholder_name NVARCHAR(255) NULL,
            placeholder_quantity_text NVARCHAR(64) NULL, -- raw "2 cups", "1 lb chicken", etc.
            ts_created DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT FK_forage_recipe_ingredients_recipe FOREIGN KEY (recipe_food_id) REFERENCES foods(id) ON DELETE CASCADE,
            CONSTRAINT FK_forage_recipe_ingredients_food FOREIGN KEY (ingredient_food_id) REFERENCES foods(id),
            CONSTRAINT FK_forage_recipe_ingredients_serving FOREIGN KEY (serving_id) REFERENCES food_servings(id),
            CONSTRAINT chk_forage_recipe_ingredients_resolved CHECK (
                ingredient_food_id IS NOT NULL OR placeholder_name IS NOT NULL
            )
        );

        CREATE INDEX IX_forage_recipe_ingredients_recipe ON forage_recipe_ingredients (recipe_food_id, display_order);
        CREATE INDEX IX_forage_recipe_ingredients_food ON forage_recipe_ingredients (ingredient_food_id) WHERE ingredient_food_id IS NOT NULL;
    END

    -- =============================
    -- Day Notes (free-text per-day note with optional color tag)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='day_notes' AND xtype='U')
    BEGIN
        CREATE TABLE day_notes (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            entry_date DATE NOT NULL,
            note NVARCHAR(MAX) NOT NULL,
            color_tag NVARCHAR(16) NULL,
            ts_updated DATETIME2 DEFAULT GETDATE(),
            CONSTRAINT UQ_day_notes_user_date UNIQUE (user_id, entry_date)
        );
    END

    COMMIT TRANSACTION FoodDbInitialization;
    PRINT '';
    PRINT 'SUCCESS: Forage (food) database initialized successfully.'

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION FoodDbInitialization;
    END
    PRINT '';
    PRINT 'ERROR: Forage DB init failed.';
    PRINT ERROR_MESSAGE();
    THROW;
END CATCH
