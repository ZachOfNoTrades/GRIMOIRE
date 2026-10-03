import type { DisplayPanel, DisplaySnapshot, DisplayToken, TableSnapshot } from "../types/oracle";
import { getMainConnection } from "@/lib/db";
import { getCampaign } from "./campaignFunctions";
import { listChips } from "./chipFunctions";
import { listEntities } from "./entityFunctions";
import { OracleError } from "./errors";
import { listEvents } from "./eventFunctions";
import { isVisibleFrom, visionPoints } from "./fog";
import { listImages } from "./imageFunctions";
import { listMaps } from "./mapFunctions";
import { listPartyMembers } from "./partyFunctions";
import { listSessions } from "./sessionFunctions";
import { getSettings } from "./settingsFunctions";

// Everything the DM's pages read, in one round of queries.
export async function getTableSnapshot(campaignId: string, userId: string): Promise<TableSnapshot> {
  const [campaign, sessions, party, maps, entities, images, chips, events, settings] = await Promise.all([
    getCampaign(campaignId),
    listSessions(campaignId),
    listPartyMembers(campaignId),
    listMaps(campaignId),
    listEntities(campaignId),
    listImages(campaignId),
    listChips(campaignId),
    listEvents(campaignId),
    getSettings(userId),
  ]);
  return { campaign, sessions, party, maps, entities, images, chips, events, settings };
}

// The campaign a display code opens. Codes are public; the id never leaves the server.
export async function findCampaignIdByCode(code: string): Promise<string> {
  const pool = await getMainConnection();
  const result = await pool.request().input("code", code).query(`
    SELECT id FROM oracle_campaigns WHERE display_code = @code
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "No display with that code");
  }
  return String(result.recordset[0].id).toLowerCase();
}

// Just the version number, for the display's cheap "did anything change" poll.
export async function getDisplayVersion(code: string): Promise<number> {
  const pool = await getMainConnection();
  const result = await pool.request().input("code", code).query(`
    SELECT version FROM oracle_campaigns WHERE display_code = @code
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "No display with that code");
  }
  return result.recordset[0].version;
}

// THE PLAYER VIEW. Built from the same rows as the DM's snapshot, with everything the players
// must not see left out HERE, on the server — the display never receives it:
//   - DM notes, stat blocks and the session list are never included
//   - creatures and people appear only while inside the party's current vision
//   - places are never drawn as tokens (the map already shows the building)
//   - the panel carries only the entry's public details and the facts already revealed
export async function getDisplaySnapshot(campaignId: string): Promise<DisplaySnapshot> {
  const [campaign, maps, entities, images, party] = await Promise.all([
    getCampaign(campaignId),
    listMaps(campaignId),
    listEntities(campaignId),
    listImages(campaignId),
    listPartyMembers(campaignId),
  ]);

  if (campaign.display_blank) {
    return { version: campaign.version, blank: true, map: null, panel: null };
  }

  const map = maps.find((entry) => entry.id === campaign.active_map_id) ?? null;
  const tokens: DisplayToken[] = [];
  const apart = map ? party.filter((member) => member.map_id === map.id && member.map_x !== null && member.map_y !== null) : [];
  if (map) {
    const points = visionPoints(map, party);
    for (const entity of entities) {
      if (entity.kind === "place" || entity.map_id !== map.id || entity.map_x === null || entity.map_y === null) continue;
      if (!isVisibleFrom(points, map.vision_radius, entity.map_x, entity.map_y)) continue;
      tokens.push({ id: entity.id, name: entity.name, attitude: entity.attitude, x: entity.map_x, y: entity.map_y });
    }
  }

  let panel: DisplayPanel | null = null;
  if (campaign.panel_kind === "entity") {
    const entity = entities.find((entry) => entry.id === campaign.panel_entity_id);
    if (entity) {
      panel = {
        kind: "entity",
        name: entity.name,
        entity_kind: entity.kind,
        attitude: entity.attitude,
        details: entity.details,
        image_id: entity.image_id && images.some((image) => image.id === entity.image_id) ? entity.image_id : null,
        knowledge: entity.knowledge.map((fact) => fact.fact),
      };
    }
  } else if (campaign.panel_kind === "image") {
    const image = images.find((entry) => entry.id === campaign.panel_image_id);
    if (image) panel = { kind: "image", image_id: image.id, caption: image.caption };
  }

  return {
    version: campaign.version,
    blank: false,
    map: map
      ? {
          name: map.name,
          data: map.data,
          party_x: map.party_x,
          party_y: map.party_y,
          vision_radius: map.vision_radius,
          explored: map.explored,
          tokens,
          members: apart.map((member) => ({ id: member.id, name: member.name, x: member.map_x as number, y: member.map_y as number })),
          background_image_id: map.background_image_id && images.some((image) => image.id === map.background_image_id) ? map.background_image_id : null,
        }
      : null,
    panel,
  };
}

// The one image the display may fetch right now: the panel's picture, or the portrait of the
// entry on the panel. Anything else in the library stays unreachable from the public route.
// The pictures the display may fetch right now: the panel's picture and the active map's background.
export async function getDisplayImageIds(campaignId: string): Promise<Set<string>> {
  const snapshot = await getDisplaySnapshot(campaignId);
  const allowed = new Set<string>();
  if (snapshot.panel?.image_id) allowed.add(snapshot.panel.image_id);
  if (snapshot.map?.background_image_id) allowed.add(snapshot.map.background_image_id);
  return allowed;
}
