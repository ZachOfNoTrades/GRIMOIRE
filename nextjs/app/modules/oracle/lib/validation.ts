import { z } from "zod";
import {
  ATTITUDES,
  CAPTION_MAX,
  CHIP_SECONDS_MAX,
  CHIP_SECONDS_MIN,
  DETAILS_MAX,
  DISPLAY_CODE_PATTERN,
  DRAFT_MAX,
  ENTITY_IDEA_MAX,
  ENTITY_KINDS,
  EVENT_MAX,
  FACT_MAX,
  GROUP_NAME_MAX,
  KNOWLEDGE_SKILLS,
  KNOWLEDGE_TIER_KEYS,
  MAP_DESCRIPTION_MAX,
  MEMBER_NAME_MAX,
  NAME_MAX,
  NOTES_MAX,
  PROMPT_MAX,
  RECAP_MAX,
  SCALE_UNITS,
  SCALE_VALUE_MAX,
  SESSION_TITLE_MAX,
  VISION_MAX,
  VISION_MIN,
  TASK_KEYS,
  TEXT_MODEL_KEYS,
  WORLD_MAX,
} from "./constants";
import { OracleError } from "./errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Path segments reach SQL as UNIQUEIDENTIFIER parameters; a malformed value would make the
// driver throw a conversion error (a 500), so reject it up front as a 404.
export function requireUuid(value: string, what: string): string {
  if (!UUID_PATTERN.test(value)) throw new OracleError(404, `${what} not found`);
  return value.toLowerCase();
}

export function requireDisplayCode(value: string): string {
  const code = value.toUpperCase();
  if (!DISPLAY_CODE_PATTERN.test(code)) throw new OracleError(404, "No display with that code");
  return code;
}

// Control characters other than newline and tab are stripped from every text field: they are
// never typed on purpose and can break the display or a generation prompt.
function clean(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

// A required single-line text: trimmed, inner whitespace collapsed, 1..max characters.
function line(max: number, what: string) {
  return z
    .string()
    .transform((value) => clean(value).trim().replace(/\s+/g, " "))
    .refine((value) => value.length >= 1, `Enter ${what}`)
    .refine((value) => [...value].length <= max, `${what[0].toUpperCase()}${what.slice(1)} is at most ${max} characters`);
}

// An optional multi-line text: trimmed, 0..max characters.
function block(max: number, what: string) {
  return z
    .string()
    .transform((value) => clean(value).trim())
    .refine((value) => [...value].length <= max, `${what} is at most ${max} characters`);
}

const uuid = z.string().regex(UUID_PATTERN, "Invalid id");
const nullableUuid = uuid.nullable();
const coordinate = z.number().finite().min(-5000).max(5000);

const abilityScore = z.number().int().min(1).max(30);
export const statBlockSchema = z.object({
  ac: z.number().int().min(0).max(40),
  hp: z.number().int().min(0).max(9999),
  hp_max: z.number().int().min(1).max(9999),
  speed: z.number().int().min(0).max(300),
  cr: z.string().trim().min(1).max(6),
  abilities: z.object({ str: abilityScore, dex: abilityScore, con: abilityScore, int: abilityScore, wis: abilityScore, cha: abilityScore }),
  attacks: z
    .array(z.object({ name: line(60, "an attack name"), bonus: z.number().int().min(-10).max(30), damage: line(60, "the damage") }))
    .max(8),
});

export const createCampaignSchema = z.object({ name: line(NAME_MAX, "a name") });

export const updateCampaignSchema = z
  .object({
    name: line(NAME_MAX, "a name").optional(),
    world: block(WORLD_MAX, "World notes").optional(),
    current_session_id: nullableUuid.optional(),
    active_map_id: nullableUuid.optional(),
    chips_paused: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const displaySchema = z
  .object({
    panel_kind: z.enum(["entity", "image"]).nullable().optional(),
    panel_id: nullableUuid.optional(),
    blank: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");


// A new map is either blank (name only) or generated from a description.
const pictureRect = z.object({ x: z.number().finite(), y: z.number().finite(), w: z.number().finite().min(20), h: z.number().finite().min(20) });
const scaleValue = z.number().finite().positive("The scale must be more than zero").max(SCALE_VALUE_MAX);

export const createMapSchema = z.object({
  name: line(NAME_MAX, "a name"),
  prompt: block(PROMPT_MAX, "The description").optional(),
  // What a tile stands for. Omitted: a generated map reads it from the description, else 5 feet.
  scale_value: scaleValue.optional(),
  scale_unit: z.enum(SCALE_UNITS).optional(),
});

const exploredCircle = z.object({ x: coordinate, y: coordinate, r: z.number().finite().min(1).max(2000) });

export const updateMapSchema = z
  .object({
    name: line(NAME_MAX, "a name").optional(),
    party_x: coordinate.optional(),
    party_y: coordinate.optional(),
    vision_radius: z.number().finite().min(VISION_MIN).max(VISION_MAX).optional(),
    explored: z.array(exploredCircle).max(600).optional(),
    background_image_id: nullableUuid.optional(),
    description: z.string().max(MAP_DESCRIPTION_MAX).optional(),
    scale_value: scaleValue.optional(),
    scale_unit: z.enum(SCALE_UNITS).optional(),
    background: pictureRect.nullable().optional(), // where the picture sits; null puts it back over the whole map
    disabled: z.boolean().optional(), // hides the map from the Table's map list
    // Whole-map replacement (MCP and the in-app feature editor). Coerced server-side.
    data: z.unknown().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const createEntitySchema = z.object({
  id: uuid.optional(), // lets the page pick the id, so the row it paints at once is the real one
  kind: z.enum(ENTITY_KINDS as [string, ...string[]]),
  name: line(NAME_MAX, "a name"),
  details: block(DETAILS_MAX, "Details").default(""),
  attitude: z.enum(ATTITUDES as [string, ...string[]]).default("neutral"),
  dm_notes: block(NOTES_MAX, "DM notes").default(""),
  source: z.string().trim().max(200).nullable().default(null),
  stats: statBlockSchema.nullable().default(null),
  map_id: nullableUuid.default(null),
  map_x: coordinate.nullable().default(null),
  map_y: coordinate.nullable().default(null),
});

export const updateEntitySchema = z
  .object({
    kind: z.enum(ENTITY_KINDS as [string, ...string[]]).optional(),
    name: line(NAME_MAX, "a name").optional(),
    details: block(DETAILS_MAX, "Details").optional(),
    attitude: z.enum(ATTITUDES as [string, ...string[]]).optional(),
    dm_notes: block(NOTES_MAX, "DM notes").optional(),
    stats: statBlockSchema.nullable().optional(),
    map_id: nullableUuid.optional(),
    map_x: coordinate.nullable().optional(),
    map_y: coordinate.nullable().optional(),
    image_id: nullableUuid.optional(),
    visibility: z.enum(["hidden", "sight", "revealed"]).optional(),
    is_down: z.boolean().optional(),
    in_party: z.boolean().optional(),
    party_group_id: nullableUuid.optional(),
    source: z.string().trim().max(200).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

const skill = z.enum(KNOWLEDGE_SKILLS as [string, ...string[]]);
const tier = z.enum(KNOWLEDGE_TIER_KEYS as [string, ...string[]]);

export const generateKnowledgeSchema = z.object({ skill, tier });

// A write-up for a new entry from a name, a short idea, or both. Nothing is saved.
export const draftEntitySchema = z
  .object({
    kind: z.enum(ENTITY_KINDS as [string, ...string[]]),
    name: z.string().trim().max(NAME_MAX).default(""),
    idea: z.string().trim().max(ENTITY_IDEA_MAX).default(""),
    // What is on the page already, when the DM is asking for a change rather than a first draft.
    draft: z
      .object({
        name: z.string().trim().max(NAME_MAX).default(""),
        details: z.string().trim().max(DETAILS_MAX).default(""),
        dm_notes: z.string().trim().max(NOTES_MAX).default(""),
      })
      .optional(),
  })
  .refine((body) => body.name.length > 0 || body.idea.length > 0, { message: "Give it a name or say what it is" });

export const addKnowledgeSchema = z.object({
  fact: line(FACT_MAX, "a fact"),
  skill: skill.nullable().default(null),
  tier: tier.nullable().default(null),
});

export const addEventSchema = z.object({
  body: line(EVENT_MAX, "a note"),
  entity_id: nullableUuid.default(null),
});


export const updateChipSchema = z.object({ is_pinned: z.boolean() });

export const chipActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fill") }),
  z.object({ action: z.literal("recycle"), chip_id: uuid }),
]);

export const adoptChipSchema = z.object({
  kind: z.enum(ENTITY_KINDS as [string, ...string[]]),
  name: line(NAME_MAX, "a name"),
  show: z.boolean().default(false),
});

export const settingsSchema = z
  .object({
    chip_seconds: z.number().int().min(CHIP_SECONDS_MIN, `At least ${CHIP_SECONDS_MIN} seconds`).max(CHIP_SECONDS_MAX, `At most ${CHIP_SECONDS_MAX} seconds`).optional(),
    banner_images: z.boolean().optional(),
    ai_creatures: z.boolean().optional(),
    // Any subset of tasks; each must name a known model.
    models: z.object(Object.fromEntries(TASK_KEYS.map((task) => [task, z.enum(TEXT_MODEL_KEYS as [string, ...string[]]).optional()]))).strict().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const updateImageSchema = z.object({ caption: line(CAPTION_MAX, "a caption") });

// What the DM accepts from a "build entities" run. Sent back whole so nothing is saved until
// the DM has seen it.
export const applyBuildSchema = z.object({
  entities: z
    .array(
      z.object({
        kind: z.enum(ENTITY_KINDS as [string, ...string[]]),
        name: line(NAME_MAX, "a name"),
        details: block(DETAILS_MAX, "Details").default(""),
        attitude: z.enum(ATTITUDES as [string, ...string[]]).default("neutral"),
        dm_notes: block(NOTES_MAX, "DM notes").default(""),
        cr: z.string().trim().max(6).nullable().default(null),
        source: z.string().trim().max(200).nullable().default(null),
      })
    )
    .max(40),
});

// Reads and validates a JSON body. A missing body, malformed JSON and a schema miss are all a
// 400 with the first problem as the message — never a 500.
export async function parseBody<Schema extends z.ZodType>(request: Request, schema: Schema): Promise<z.output<Schema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new OracleError(400, "Invalid request body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new OracleError(400, result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

// `detail` is what the page knows about the subject (an entry's description), used to steer the search words and the drawing.
export const imageSearchSchema = z.object({ query: line(120, "something to search for"), detail: z.string().max(DETAILS_MAX).optional() });

export const imageImportSchema = z.object({
  source_id: z.string().regex(UUID_PATTERN, "Unknown search result"),
  caption: line(CAPTION_MAX, "a caption"),
});

export const imageGenerateSchema = z.object({
  prompt: line(PROMPT_MAX, "a description"),
  detail: z.string().max(DETAILS_MAX).optional(),
  caption: line(CAPTION_MAX, "a caption"),
  kind: z.enum(ENTITY_KINDS as [string, ...string[]]).optional(), // the entry it is for; picks the framing
});

export const generateWorldSchema = z.object({ seed: z.string().max(WORLD_MAX).default("") });

const sessionDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-02").nullable();
export const createPartyMemberSchema = z.object({ name: line(MEMBER_NAME_MAX, "a name"), level: z.number().int().min(1).max(20).default(1) });
export const updatePartyMemberSchema = z
  .object({
    name: line(MEMBER_NAME_MAX, "a name").optional(),
    level: z.number().int().min(1).max(20).optional(),
    group_id: nullableUuid.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const createPartyGroupSchema = z.object({
  name: line(GROUP_NAME_MAX, "a name"),
  map_id: nullableUuid.default(null),
  map_x: coordinate.nullable().default(null),
  map_y: coordinate.nullable().default(null),
});

export const updatePartyGroupSchema = z
  .object({
    name: line(GROUP_NAME_MAX, "a name").optional(),
    map_id: nullableUuid.optional(),
    map_x: coordinate.nullable().optional(),
    map_y: coordinate.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const createSessionSchema = z.object({ title: line(SESSION_TITLE_MAX, "a title"), session_date: sessionDate.default(null) });
export const updateSessionSchema = z
  .object({
    title: line(SESSION_TITLE_MAX, "a title").optional(),
    session_date: sessionDate.optional(),
    notes: block(DRAFT_MAX, "The notes").optional(),
    recap: block(RECAP_MAX, "The recap").optional(),
    is_done: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");
