import { z } from "zod";
import {
  COLOR_KEYS,
  DEFAULT_WIKI_SEARCH_TEMPLATE,
  JOIN_CODE_PATTERN,
  MAX_DELTA,
  MAX_SEATS,
  MIN_SEATS,
  NAME_MAX_LENGTH,
  PUBLIC_ORIGIN,
  WIKI_QUERY_PLACEHOLDER,
  WIKI_TEMPLATE_MAX_LENGTH,
} from "./constants";
import { DamnationError } from "./errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Path segments reach SQL as UNIQUEIDENTIFIER parameters; a malformed value would make the
// driver throw a conversion error (a 500), so reject it up front as a 404.
export function requireUuid(value: string, what: string): string {
  if (!UUID_PATTERN.test(value)) throw new DamnationError(404, `${what} not found`);
  return value.toLowerCase();
}

export function requireJoinCode(value: string): string {
  const code = value.toUpperCase();
  if (!JOIN_CODE_PATTERN.test(code)) throw new DamnationError(404, "No game with that code");
  return code;
}

const uuid = z.string().regex(UUID_PATTERN, "Invalid id");
const delta = z.number().int().min(-MAX_DELTA).max(MAX_DELTA).refine((value) => value !== 0, "Delta must not be zero");

// Control characters and invisible format characters (bidi overrides, zero-width joiners)
// are rejected outright: an RLO override can make one guest's name impersonate another's.
const FORBIDDEN_NAME_CHARACTERS = /[\p{Cc}\p{Cf}\p{Co}]/u;

const displayName = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .refine((value) => value.length >= 1, "Enter a name")
  .refine((value) => [...value].length <= NAME_MAX_LENGTH, `Names are at most ${NAME_MAX_LENGTH} characters`)
  .refine((value) => !FORBIDDEN_NAME_CHARACTERS.test(value), "That name has characters that aren't allowed");

const colorKey = z.string().refine((value) => COLOR_KEYS.includes(value), "Unknown colour");

export const joinSchema = z.union([
  z.object({ op_id: uuid, display_name: displayName, color_key: colorKey }),
  z.object({ op_id: uuid, claim_player_id: uuid }),
]);

export const lifeSchema = z.object({ op_id: uuid, delta });

export const commanderDamageSchema = z.object({ op_id: uuid, source_player_id: uuid, delta });

export const statusSchema = z
  .object({
    op_id: uuid,
    conceded: z.boolean().optional(),
    eliminated_override: z.boolean().nullable().optional(),
  })
  .refine((body) => body.conceded !== undefined || body.eliminated_override !== undefined, "Nothing to change");

export const opSchema = z.object({ op_id: uuid });

export const createSessionSchema = z.object({
  starting_life: z.number().int().min(1).max(999),
  max_seats: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
});

// A wiki search template must be an http(s) URL with the {query} placeholder. The scheme
// check is what keeps a `javascript:` template from becoming a link on a guest's phone, and
// the app's own origin is refused because it would be framed with scripts enabled.
export function normalizeWikiTemplate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const template = raw.trim();
  if (template === "" || template === DEFAULT_WIKI_SEARCH_TEMPLATE) return null;
  if (template.length > WIKI_TEMPLATE_MAX_LENGTH) {
    throw new DamnationError(400, `The search URL is longer than ${WIKI_TEMPLATE_MAX_LENGTH} characters`);
  }
  if (!template.includes(WIKI_QUERY_PLACEHOLDER)) {
    throw new DamnationError(400, `The search URL needs a ${WIKI_QUERY_PLACEHOLDER} placeholder where the search text goes`);
  }
  let parsed: URL;
  try {
    parsed = new URL(template.split(WIKI_QUERY_PLACEHOLDER).join("test"));
  } catch {
    throw new DamnationError(400, "That isn't a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new DamnationError(400, "The search URL must start with https:// or http://");
  }
  if (parsed.origin === PUBLIC_ORIGIN || parsed.hostname === "192.168.0.116" || parsed.hostname === "localhost") {
    throw new DamnationError(400, "The search URL can't point at Grimoire itself");
  }
  return template;
}

export const settingsSchema = z.object({
  wiki_search_template: z.string().nullable(),
  wiki_embed: z.boolean(),
});

// Parses a JSON body against a schema, turning failures into a 400 with the first message.
export async function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new DamnationError(400, "Request body must be JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new DamnationError(400, result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}
