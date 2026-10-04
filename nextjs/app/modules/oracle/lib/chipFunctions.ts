import { getMainConnection } from "@/lib/db";
import type { AuthUser } from "@/lib/permissions";
import { checkGenerationLimit, logGeneration } from "@/lib/generationLimit";
import type { ChipContent, EntityKind, ImageChipContent, OracleChip, OracleEntity, OracleImage } from "../types/oracle";
import { CHIP_BATCH_SIZE, CHIP_LABEL_MAX, CHIP_POOL_MAX, ENTITY_KINDS } from "./constants";
import { setDisplay } from "./campaignFunctions";
import { createEntity, updateEntity } from "./entityFunctions";
import { OracleError } from "./errors";
import { addEvent } from "./eventFunctions";
import { buildContext, coerceTextContent, generateChipBatch, outlineEntity, type EntityOutline } from "./generationFunctions";
import { findInspirationImage, importPicture } from "./imageProviders";
import { parseJson } from "./mapData";
import { findChallengeRow, statBlockFromChallenge } from "./reference";
import { getSettings, modelFor } from "./settingsFunctions";

// THE SUGGESTION BANNER
//
// The banner is a ticker over a pool of prepared items. An item that scrolls off the left edge is
// recycled to the back of the pool, so the same ideas come round again; only using an item (or a
// picture that fails to load) removes it. The pool is topped up a batch at a time, in the
// background, until it holds CHIP_POOL_MAX items, and never past that: a banner left running
// cannot spend more than the batches it takes to fill the pool. Because an item is prepared
// together with whatever a tap needs, neither the scroll nor a tap ever waits on a generation.
//
// Two kinds of item:
//   text   a question the DM is likely to have, with up to three ready answers
//   image  a reference picture found on the web, which a tap turns into a creature, person or place

const SOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// One picture for about every three text items, when pictures are switched on.
const IMAGES_PER_BATCH = 2;

type ChipRow = { id: string; label: string; content: string; is_pinned: boolean; ts_shown: Date | null };

function coerceContent(raw: unknown, label: string): ChipContent | null {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (item.type === "image") {
    if (typeof item.source_id !== "string" || !SOURCE_ID.test(item.source_id) || typeof item.thumbnail !== "string" || typeof item.image_url !== "string") return null;
    return {
      type: "image",
      source_id: item.source_id,
      thumbnail: item.thumbnail,
      image_url: item.image_url,
      credit: typeof item.credit === "string" ? item.credit : "",
      suggested_kind: ENTITY_KINDS.includes(item.suggested_kind as EntityKind) ? (item.suggested_kind as EntityKind) : "creature",
      suggested_name: typeof item.suggested_name === "string" && item.suggested_name ? item.suggested_name : label,
    };
  }
  return coerceTextContent(raw, label);
}

function toChip(row: ChipRow): OracleChip | null {
  const content = coerceContent(parseJson<unknown>(row.content, null), row.label);
  if (!content) return null;
  return {
    id: row.id.toLowerCase(),
    label: row.label,
    content,
    is_pinned: !!row.is_pinned,
    ts_shown: row.ts_shown ? new Date(row.ts_shown).toISOString() : null,
  };
}

// The pool in banner order: the item that has waited longest since it last showed comes first.
export async function listChips(campaignId: string): Promise<OracleChip[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT id, label, content, is_pinned, ts_shown
    FROM oracle_chips
    WHERE campaign_id = @campaignId
    ORDER BY ts_shown, ts_created, id
  `);
  return (result.recordset as ChipRow[]).map(toChip).filter((chip): chip is OracleChip => chip !== null);
}

// Background runs in flight, one per campaign at most. Kept on globalThis so a module reload
// cannot start a second one for the same campaign.
const globalStore = globalThis as unknown as {
  __oracleChipRuns?: Map<string, Promise<void>>;
  __oracleChipErrors?: Map<string, string>;
  __oracleChipHold?: Map<string, number>;
};
const runs: Map<string, Promise<void>> = globalStore.__oracleChipRuns ?? (globalStore.__oracleChipRuns = new Map());
const lastErrors: Map<string, string> = globalStore.__oracleChipErrors ?? (globalStore.__oracleChipErrors = new Map());
// After a batch fails, no new batch starts for that campaign until this time. Without it, a DM
// who has reached the generation limit would trigger (and be told about) a failed batch every
// time an item scrolled off.
const holdUntil: Map<string, number> = globalStore.__oracleChipHold ?? (globalStore.__oracleChipHold = new Map());
const LIMIT_HOLD_MS = 10 * 60 * 1000;
const FAILURE_HOLD_MS = 30 * 1000;

async function countChips(campaignId: string): Promise<number> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT COUNT(*) AS total FROM oracle_chips WHERE campaign_id = @campaignId
  `);
  return result.recordset[0].total ?? 0;
}

// A new item joins the back of the pool. The ceiling is enforced here as well as before the
// batch starts, so two batches that overlap (a module reload, two servers) cannot overfill it.
async function insertChip(campaignId: string, label: string, content: ChipContent): Promise<void> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input("campaignId", campaignId)
    .input("label", label.slice(0, CHIP_LABEL_MAX))
    .input("content", JSON.stringify(content))
    .input("max", CHIP_POOL_MAX)
    .query(`
      INSERT INTO oracle_chips (campaign_id, label, content, is_queued, ts_shown)
      SELECT @campaignId, @label, @content, 0, GETDATE()
      WHERE EXISTS (SELECT 1 FROM oracle_campaigns WHERE id = @campaignId)
        AND (SELECT COUNT(*) FROM oracle_chips WHERE campaign_id = @campaignId) < @max
    `);
}

// Start a background batch unless one is already running for this campaign. Counts against the
// app-wide generation limit like any other generation. `wanted` is already capped to the room
// left in the pool.
function startGeneration(campaignId: string, user: AuthUser, wanted: number): void {
  if (wanted <= 0 || runs.has(campaignId) || (holdUntil.get(campaignId) ?? 0) > Date.now()) return;
  const run = (async () => {
    try {
      const limit = await checkGenerationLimit(user.id, user.generationLimit);
      if (!limit.allowed) {
        throw new OracleError(429, `Generation limit reached (${limit.count}/${limit.limit}). Suggestions resume later.`);
      }
      await logGeneration(user.id, "oracle/chips");

      const pool = await getMainConnection();
      const existing = await pool.request().input("campaignId", campaignId).query(`
        SELECT label, content FROM oracle_chips WHERE campaign_id = @campaignId
      `);
      const usedSources = new Set<string>();
      for (const row of existing.recordset) {
        const content = parseJson<{ source_id?: string } | null>(row.content, null);
        if (content?.source_id) usedSources.add(content.source_id);
      }

      const [context, settings] = await Promise.all([buildContext(campaignId, user.id), getSettings(user.id)]);
      const batch = await generateChipBatch(
        context,
        wanted,
        existing.recordset.map((row) => row.label),
        settings.banner_images ? IMAGES_PER_BATCH : 0,
        settings.models.chips
      );

      // Pictures are spread through the batch rather than bunched at its end.
      const items: { label: string; content: ChipContent }[] = batch.chips.map((chip) => ({ label: chip.label, content: chip.content }));
      let slot = 1;
      for (const idea of batch.imageIdeas) {
        const found = await findInspirationImage(idea.query, usedSources);
        if (!found) continue;
        usedSources.add(found.id);
        const content: ImageChipContent = {
          type: "image",
          source_id: found.id,
          thumbnail: found.thumbnail,
          image_url: found.full,
          credit: found.credit,
          suggested_kind: idea.kind,
          suggested_name: idea.name,
        };
        items.splice(Math.min(slot, items.length), 0, { label: idea.name, content });
        slot += 3;
      }
      for (const item of items.slice(0, wanted)) await insertChip(campaignId, item.label, item.content);
      lastErrors.delete(campaignId);
    } catch (error) {
      const message = error instanceof OracleError ? error.message : "Suggestions couldn't be prepared. They will retry.";
      lastErrors.set(campaignId, message);
      holdUntil.set(campaignId, Date.now() + (error instanceof OracleError && error.status === 429 ? LIMIT_HOLD_MS : FAILURE_HOLD_MS));
      if (!(error instanceof OracleError)) console.error(`Oracle banner generation failed for campaign id: '${campaignId}'`, error);
    } finally {
      runs.delete(campaignId);
    }
  })();
  runs.set(campaignId, run);
}

export interface ChipBarState {
  chips: OracleChip[];
  generating: boolean;
  error: string | null;
}

async function barState(campaignId: string): Promise<ChipBarState> {
  const error = lastErrors.get(campaignId) ?? null;
  // An error is reported once, then cleared, so one failed batch does not nag on every poll.
  if (error && !runs.has(campaignId)) lastErrors.delete(campaignId);
  return { chips: await listChips(campaignId), generating: runs.has(campaignId), error };
}

// Make sure more items are on the way while the pool is below its ceiling. A pool at the ceiling
// starts nothing: the banner just keeps cycling what it has.
export async function fillChips(campaignId: string, user: AuthUser): Promise<ChipBarState> {
  const total = await countChips(campaignId);
  // One modest batch at a time: a batch of six is ready in about fifteen seconds, where a batch big
  // enough to fill the pool in one go would keep the DM waiting far longer for the first item.
  startGeneration(campaignId, user, Math.min(CHIP_BATCH_SIZE, CHIP_POOL_MAX - total));
  return barState(campaignId);
}

// An item scrolled off the banner: send it to the back of the pool so it comes round again.
// A pinned item is never moved this way, and recycling one that is already gone is not an error.
export async function recycleChip(campaignId: string, chipId: string, user: AuthUser): Promise<ChipBarState> {
  const pool = await getMainConnection();
  await pool.request().input("chipId", chipId).input("campaignId", campaignId).query(`
    UPDATE oracle_chips SET ts_shown = GETDATE() WHERE id = @chipId AND campaign_id = @campaignId AND is_pinned = 0
  `);
  return fillChips(campaignId, user);
}

export async function setChipPinned(campaignId: string, chipId: string, isPinned: boolean): Promise<void> {
  const pool = await getMainConnection();
  const result = await pool.request().input("chipId", chipId).input("campaignId", campaignId).input("isPinned", isPinned ? 1 : 0).query(`
    UPDATE oracle_chips SET is_pinned = @isPinned WHERE id = @chipId AND campaign_id = @campaignId
  `);
  if (result.rowsAffected[0] === 0) {
    throw new OracleError(404, "Suggestion not found");
  }
}

// A used item leaves the banner. Deleting one that is already gone is not an error: a second
// tap on an item that was just used must not show a failure.
export async function removeChip(campaignId: string, chipId: string): Promise<void> {
  const pool = await getMainConnection();
  await pool.request().input("chipId", chipId).input("campaignId", campaignId).query(`
    DELETE FROM oracle_chips WHERE id = @chipId AND campaign_id = @campaignId
  `);
}

// Throw away everything prepared for an older situation. Not used on a session change:
// refilling a whole pool per session is exactly the kind of spend the ceiling exists to
// prevent, and the generator folds the live session into every later batch anyway.
export async function clearChips(campaignId: string): Promise<void> {
  const pool = await getMainConnection();
  await pool.request().input("campaignId", campaignId).query(`
    DELETE FROM oracle_chips WHERE campaign_id = @campaignId AND is_pinned = 0
  `);
}

// ---------------------------------------------------------------------------------------------
// ADOPT — turn a banner picture into part of the campaign
// ---------------------------------------------------------------------------------------------

export interface AdoptResult {
  entity: OracleEntity;
  image: OracleImage;
}

// The whole "this picture is now a creature / person / place" flow, started by one tap:
//   1. the picture is saved into the campaign's library
//   2. a short write-up is generated so it fits the live session (skipped, not fatal, on failure)
//   3. the entry is created with that picture, and placed on the active map beside the party —
//      a creature or person a short step away, a place right where the party stands
//   4. the item leaves the banner and the session log notes what appeared
// Claiming the chip row first (DELETE … OUTPUT) is what makes a double-tap create only one entry.
export async function adoptImageChip(
  campaignId: string,
  chipId: string,
  kind: EntityKind,
  name: string,
  showOnDisplay: boolean,
  user: AuthUser
): Promise<AdoptResult> {
  const pool = await getMainConnection();
  const claimed = await pool.request().input("chipId", chipId).input("campaignId", campaignId).query(`
    DELETE FROM oracle_chips OUTPUT DELETED.label, DELETED.content WHERE id = @chipId AND campaign_id = @campaignId
  `);
  if (claimed.recordset.length === 0) {
    throw new OracleError(409, "That picture was already used");
  }
  const content = coerceContent(parseJson<unknown>(claimed.recordset[0].content, null), claimed.recordset[0].label);
  if (!content || content.type !== "image") {
    throw new OracleError(400, "That suggestion is not a picture");
  }

  const image = await importPicture(campaignId, content.image_url, name);

  let outline: EntityOutline = { name, details: "", dm_notes: "", attitude: "neutral", cr: null, source: null };
  try {
    const limit = await checkGenerationLimit(user.id, user.generationLimit);
    if (limit.allowed) {
      await logGeneration(user.id, "oracle/outline");
      outline = await outlineEntity(await buildContext(campaignId, user.id), kind, name, await modelFor(user.id, "outline"));
    }
  } catch (error) {
    console.warn(`Oracle outline failed for '${name}', adding it without a write-up:`, error instanceof Error ? error.message : error);
  }

  // The entry is created off the map; the Table then asks the DM where it goes (Place on map).
  const row = kind === "creature" ? findChallengeRow(outline.cr ?? "1/4") : null;
  const created = await createEntity(campaignId, {
    kind,
    name,
    details: outline.details,
    attitude: outline.attitude,
    dm_notes: outline.dm_notes,
    source: outline.source,
    stats: row ? statBlockFromChallenge(row) : null,
    map_id: null,
    map_x: null,
    map_y: null,
  });
  const entity = await updateEntity(campaignId, created.id, { image_id: image.id });
  await addEvent(campaignId, `${name} entered the session (added from a banner picture).`, entity.id);
  if (showOnDisplay) await setDisplay(campaignId, { panel_kind: "entity", panel_id: entity.id });
  return { entity, image };
}
