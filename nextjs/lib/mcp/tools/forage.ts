import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '@/lib/mcp/context';
import { json, text } from '@/lib/mcp/format';

import {
  listFoods,
  getFood,
  createFood,
  updateFood,
  setFoodFavorite,
  listFavoriteFoods,
  archiveFood,
} from '@/app/modules/forage/lib/foodFunctions';
import {
  getEntry,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  listRecentFoods,
  listActiveDates,
  computeTotals,
} from '@/app/modules/forage/lib/entryFunctions';
import { listNutrients } from '@/app/modules/forage/lib/nutrientFunctions';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const TIME = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'HH:MM or HH:MM:SS');

// A serving is a unit of measure with how many of that unit make one canonical serving.
const Serving = z.object({
  unit: z.string().describe("Unit name, e.g. 'g', 'cup', 'serving'."),
  units_per_serving: z.number().positive().describe('How many <unit> equal one canonical serving.'),
});

// A micronutrient amount, keyed by the nutrient's UUID, per canonical serving.
const Nutrient = z.object({
  nutrient_id: z.string().describe('Nutrient UUID (from the forage nutrients table).'),
  amount: z.number().min(0).describe('Amount per serving.'),
});

export function registerForageTools(server: McpServer, ctx: McpContext) {
  const userId = ctx.user.id;

  // ─── Foods ────────────────────────────────────────────────────────────────

  server.registerTool(
    'forage_list_foods',
    {
      description:
        "Search the user's food library plus shared generic foods. Filter by name/brand text and/or exact barcode. Returns up to 200, favorites first. Servings are included; nutrients are not (use forage_get_food for those).",
      inputSchema: {
        search: z.string().nullable().optional().describe('Name/brand substring to match.'),
        barcode: z.string().nullable().optional().describe('Exact UPC/barcode lookup.'),
      },
    },
    async ({ search, barcode }) => json(await listFoods(userId, search ?? null, barcode ?? null)),
  );

  server.registerTool(
    'forage_get_food',
    {
      description: 'Full detail for a single food, including its servings and micronutrients.',
      inputSchema: { foodId: z.string() },
    },
    async ({ foodId }) => {
      try {
        return json(await getFood(userId, foodId));
      } catch (err) {
        if (err instanceof Error && err.message.includes('No food found')) {
          return text(`No food found for id '${foodId}'`);
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'forage_list_favorite_foods',
    {
      description: "Foods the user has marked as favorite.",
      inputSchema: {},
    },
    async () => json(await listFavoriteFoods(userId)),
  );

  server.registerTool(
    'forage_create_food',
    {
      description:
        "Create a food in the user's library. Macros are per canonical serving. Provide servings (units of measure) if the food is logged by weight/volume; a 'serving' unit is added automatically unless omit_default_serving is set for per-100g/per-100ml foods.",
      inputSchema: {
        name: z.string().min(1).max(255),
        brand: z.string().nullable().optional(),
        kcal_per_serving: z.number().min(0),
        protein_g_per_serving: z.number().min(0),
        carbs_g_per_serving: z.number().min(0),
        fat_g_per_serving: z.number().min(0),
        icon: z.string().nullable().optional().describe('Preset icon code.'),
        barcode_upc: z.string().nullable().optional(),
        source_url: z
          .string()
          .nullable()
          .optional()
          .describe("Public product/nutrition page this food's data came from. Enables the app's Resync action."),
        servings: z.array(Serving).default([]),
        nutrients: z.array(Nutrient).default([]),
        omit_default_serving: z
          .boolean()
          .default(false)
          .describe("True for per-100g/per-100ml foods whose base unit is the reference."),
      },
    },
    async (args) =>
      json(
        await createFood(userId, {
          name: args.name,
          brand: args.brand ?? null,
          kcal_per_serving: args.kcal_per_serving,
          protein_g_per_serving: args.protein_g_per_serving,
          carbs_g_per_serving: args.carbs_g_per_serving,
          fat_g_per_serving: args.fat_g_per_serving,
          icon: args.icon ?? null,
          barcode_upc: args.barcode_upc ?? null,
          source_url: args.source_url ?? null,
          servings: args.servings,
          nutrients: args.nutrients,
          omit_default_serving: args.omit_default_serving,
        }),
      ),
  );

  server.registerTool(
    'forage_update_food',
    {
      description:
        'Update a food the user owns. This is a full replace of the editable fields, servings, and nutrients — pass the complete desired state, not a partial patch. Servings are reconciled by unit name so existing serving rows (and the log entries pointing at them) keep their ids.',
      inputSchema: {
        foodId: z.string(),
        name: z.string().min(1).max(255),
        brand: z.string().nullable().optional(),
        kcal_per_serving: z.number().min(0),
        protein_g_per_serving: z.number().min(0),
        carbs_g_per_serving: z.number().min(0),
        fat_g_per_serving: z.number().min(0),
        icon: z.string().nullable().optional(),
        barcode_upc: z.string().nullable().optional(),
        source_url: z
          .string()
          .nullable()
          .optional()
          .describe("Public product/nutrition page this food's data came from. Enables the app's Resync action."),
        servings: z.array(Serving).default([]),
        nutrients: z.array(Nutrient).default([]),
      },
    },
    async (args) => {
      try {
        return json(
          await updateFood(userId, args.foodId, {
            name: args.name,
            brand: args.brand ?? null,
            kcal_per_serving: args.kcal_per_serving,
            protein_g_per_serving: args.protein_g_per_serving,
            carbs_g_per_serving: args.carbs_g_per_serving,
            fat_g_per_serving: args.fat_g_per_serving,
            icon: args.icon ?? null,
            barcode_upc: args.barcode_upc ?? null,
            source_url: args.source_url ?? null,
            servings: args.servings,
            nutrients: args.nutrients,
          }),
        );
      } catch (err) {
        if (err instanceof Error && err.message.includes('No food found')) {
          return text(`No food found for id '${args.foodId}'`);
        }
        throw err;
      }
    },
  );

  server.registerTool(
    'forage_set_food_favorite',
    {
      description: 'Mark or unmark a food as favorite.',
      inputSchema: {
        foodId: z.string(),
        isFavorite: z.boolean(),
      },
    },
    async ({ foodId, isFavorite }) => {
      await setFoodFavorite(userId, foodId, isFavorite);
      return text(`Food ${foodId} favorite = ${isFavorite}.`);
    },
  );

  server.registerTool(
    'forage_archive_food',
    {
      description:
        'Soft-delete (archive) a food. It disappears from search, the library, and Recent, but existing log entries are left intact.',
      inputSchema: { foodId: z.string() },
    },
    async ({ foodId }) => {
      await archiveFood(userId, foodId);
      return text(`Archived food ${foodId}.`);
    },
  );

  // ─── Entries (the daily food log) ───────────────────────────────────────────

  server.registerTool(
    'forage_list_entries',
    {
      description: 'All food-log entries for one date plus the rolled-up daily totals (kcal, macros, micros).',
      inputSchema: { date: DATE },
    },
    async ({ date }) => {
      const entries = await listEntries(userId, date);
      return json({ entries, totals: computeTotals(entries) });
    },
  );

  server.registerTool(
    'forage_get_entry',
    {
      description: 'A single food-log entry with its computed macros and micros.',
      inputSchema: { entryId: z.string() },
    },
    async ({ entryId }) => {
      const entry = await getEntry(userId, entryId);
      if (!entry) return text(`No entry found for id '${entryId}'`);
      return json(entry);
    },
  );

  server.registerTool(
    'forage_create_entry',
    {
      description:
        'Log food for a date. Two modes: (1) library food — pass food_id + serving_id + quantity (quantity is the number of that serving unit); (2) quick-add — pass quick_add_name plus the quick_add_* macros and quantity, leaving food_id null. entry_time null logs at the current time.',
      inputSchema: {
        entry_date: DATE,
        entry_time: TIME.nullable().optional().describe('null = now.'),
        food_id: z.string().nullable().optional().describe('Library food UUID; null for quick-add.'),
        serving_id: z.string().nullable().optional().describe("UUID of the food's serving unit being logged."),
        quantity: z.number().describe('Number of serving units (food mode) or multiplier (quick-add).'),
        quick_add_name: z.string().nullable().optional(),
        quick_add_kcal: z.number().nullable().optional(),
        quick_add_protein_g: z.number().nullable().optional(),
        quick_add_carbs_g: z.number().nullable().optional(),
        quick_add_fat_g: z.number().nullable().optional(),
      },
    },
    async (args) => {
      if (!args.food_id && !args.quick_add_name) {
        return text('Provide either food_id (with serving_id) or quick_add_name.');
      }
      return json(
        await createEntry(userId, {
          entry_date: args.entry_date,
          entry_time: args.entry_time ?? null,
          food_id: args.food_id ?? null,
          serving_id: args.serving_id ?? null,
          quantity: args.quantity,
          quick_add_name: args.quick_add_name ?? null,
          quick_add_kcal: args.quick_add_kcal ?? null,
          quick_add_protein_g: args.quick_add_protein_g ?? null,
          quick_add_carbs_g: args.quick_add_carbs_g ?? null,
          quick_add_fat_g: args.quick_add_fat_g ?? null,
        }),
      );
    },
  );

  server.registerTool(
    'forage_update_entry',
    {
      description:
        'Patch a logged entry. Only the fields you pass are changed; omit a field to leave it untouched. Returns the updated entry, or a not-found message.',
      inputSchema: {
        entryId: z.string(),
        entry_date: DATE.optional(),
        entry_time: TIME.nullable().optional(),
        food_id: z.string().nullable().optional(),
        serving_id: z.string().nullable().optional(),
        quantity: z.number().optional(),
        quick_add_name: z.string().nullable().optional(),
        quick_add_kcal: z.number().nullable().optional(),
        quick_add_protein_g: z.number().nullable().optional(),
        quick_add_carbs_g: z.number().nullable().optional(),
        quick_add_fat_g: z.number().nullable().optional(),
      },
    },
    async ({ entryId, ...patch }) => {
      const entry = await updateEntry(userId, entryId, patch);
      if (!entry) return text(`No entry found for id '${entryId}'`);
      return json(entry);
    },
  );

  server.registerTool(
    'forage_delete_entry',
    {
      description: 'Permanently delete a food-log entry.',
      inputSchema: { entryId: z.string() },
    },
    async ({ entryId }) => {
      await deleteEntry(userId, entryId);
      return text(`Deleted entry ${entryId}.`);
    },
  );

  // ─── Reference data ─────────────────────────────────────────────────────────

  server.registerTool(
    'forage_list_nutrients',
    {
      description:
        'The micronutrient reference set (id, code, name, unit, daily_value). Use this to resolve a nutrient name to the nutrient_id required by forage_create_food / forage_update_food.',
      inputSchema: {},
    },
    async () => json(await listNutrients()),
  );

  // ─── Convenience reads ──────────────────────────────────────────────────────

  server.registerTool(
    'forage_list_recent_foods',
    {
      description: 'Food ids the user logged most recently (archived foods excluded), newest first.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ limit }) => json(await listRecentFoods(userId, limit)),
  );

  server.registerTool(
    'forage_list_active_dates',
    {
      description: 'Dates (on or after sinceDate) that have at least one log entry. Useful for calendar/streak views.',
      inputSchema: { sinceDate: DATE },
    },
    async ({ sinceDate }) => json(await listActiveDates(userId, sinceDate)),
  );
}
