import type { DisplayLocation, DisplayPanel, DisplaySnapshot, DisplayToken, TableSnapshot } from "../types/oracle";
import { getMainConnection } from "@/lib/db";
import { getCampaign } from "./campaignFunctions";
import { listChips } from "./chipFunctions";
import { listEntities } from "./entityFunctions";
import { OracleError } from "./errors";
import { listEvents } from "./eventFunctions";
import { isExplored, isVisibleFrom, visionPoints } from "./fog";
import { listImages } from "./imageFunctions";
import { listMaps } from "./mapFunctions";
import { listPartyGroups, listPartyMembers } from "./partyFunctions";
import { listSessions } from "./sessionFunctions";
import { getSettings } from "./settingsFunctions";

// Everything the DM's pages read, in one round of queries.
export async function getTableSnapshot(campaignId: string, userId: string): Promise<TableSnapshot> {
  const [campaign, sessions, party, partyGroups, maps, entities, images, chips, events, settings] = await Promise.all([
    getCampaign(campaignId),
    listSessions(campaignId),
    listPartyMembers(campaignId),
    listPartyGroups(campaignId),
    listMaps(campaignId),
    listEntities(campaignId),
    listImages(campaignId),
    listChips(campaignId),
    listEvents(campaignId),
    getSettings(userId),
  ]);
  return { campaign, sessions, party, party_groups: partyGroups, maps, entities, images, chips, events, settings };
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
  const [campaign, maps, entities, images, party, partyGroups] = await Promise.all([
    getCampaign(campaignId),
    listMaps(campaignId),
    listEntities(campaignId),
    listImages(campaignId),
    listPartyMembers(campaignId),
    listPartyGroups(campaignId),
  ]);

  if (campaign.display_blank) {
    return { version: campaign.version, blank: true, map: null, panel: null };
  }

  const map = maps.find((entry) => entry.id === campaign.active_map_id) ?? null;
  const tokens: DisplayToken[] = [];
  const locations: DisplayLocation[] = [];
  const apart = map ? partyGroups.filter((group) => group.map_id === map.id && group.map_x !== null && group.map_y !== null) : [];
  if (map) {
    const points = visionPoints(map, partyGroups, party);
    for (const entity of entities) {
      if (entity.kind === "place" || entity.map_id !== map.id || entity.map_x === null || entity.map_y === null) continue;
      if (!entity.is_revealed && !isVisibleFrom(points, map.vision_radius, entity.map_x, entity.map_y)) continue;
      tokens.push({
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        attitude: entity.attitude,
        details: entity.details,
        revealed: entity.is_revealed,
        image_id: entity.image_id && images.some((image) => image.id === entity.image_id) ? entity.image_id : null,
        knowledge: entity.knowledge.map((fact) => fact.fact),
        x: entity.map_x,
        y: entity.map_y,
      });
    }
    // Seen buildings and landmarks whose place entry (named like the feature, else pinned inside it)
    // the players may read. Unseen ground never leaks one.
    const places = entities.filter((entity) => entity.kind === "place");
    for (const feature of map.data.features) {
      if ((feature.type !== "building" && feature.type !== "landmark") || feature.w <= 0) continue;
      const cx = feature.x + feature.w / 2;
      const cy = feature.y + feature.h / 2;
      if (!isExplored(map.explored, cx, cy) && !isVisibleFrom(points, map.vision_radius, cx, cy)) continue;
      const place =
        (feature.name ? places.find((entry) => entry.name.trim().toLowerCase() === feature.name.trim().toLowerCase()) : undefined) ??
        places.find((entry) => entry.map_id === map.id && entry.map_x !== null && entry.map_y !== null && entry.map_x >= feature.x && entry.map_x <= feature.x + feature.w && entry.map_y >= feature.y && entry.map_y <= feature.y + feature.h);
      if (!place) continue;
      locations.push({
        feature_id: feature.id,
        name: place.name,
        details: place.details,
        image_id: place.image_id && images.some((image) => image.id === place.image_id) ? place.image_id : null,
        knowledge: place.knowledge.map((fact) => fact.fact),
      });
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
          locations,
          groups: apart.map((group) => ({ id: group.id, name: group.name, x: group.map_x as number, y: group.map_y as number })),
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
  for (const token of snapshot.map?.tokens ?? []) if (token.image_id) allowed.add(token.image_id);
  for (const location of snapshot.map?.locations ?? []) if (location.image_id) allowed.add(location.image_id);
  return allowed;
}
