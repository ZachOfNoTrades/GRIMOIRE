import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '@/lib/mcp/context';
import { json, text } from '@/lib/mcp/format';

import { userCanAccessModule } from '@/lib/moduleAccess';
import { createCampaign, listCampaigns, requireOwnedCampaign, setDisplay, updateCampaign } from '@/app/modules/oracle/lib/campaignFunctions';
import { ATTITUDES, ENTITY_KINDS, KNOWLEDGE_SKILLS, KNOWLEDGE_TIER_KEYS, MODULE_SLUG } from '@/app/modules/oracle/lib/constants';
import { addKnowledge, createEntity, deleteEntity, getEntity, listEntities, updateEntity } from '@/app/modules/oracle/lib/entityFunctions';
import { OracleError } from '@/app/modules/oracle/lib/errors';
import { addEvent, listEvents } from '@/app/modules/oracle/lib/eventFunctions';
import { coerceMapData } from '@/app/modules/oracle/lib/mapData';
import { createMap, getMap, listMaps, replaceMapData, updateMap } from '@/app/modules/oracle/lib/mapFunctions';
import { createSession, listSessions, updateSession } from '@/app/modules/oracle/lib/sessionFunctions';
import { statBlockSchema } from '@/app/modules/oracle/lib/validation';
import type { Attitude, EntityKind, KnowledgeTier } from '@/app/modules/oracle/types/oracle';

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Kind = z.enum(ENTITY_KINDS as [string, ...string[]]);
const AttitudeEnum = z.enum(ATTITUDES as [string, ...string[]]);

const MapFeature = z.object({
  id: z.string().describe('Short unique id, e.g. "b1". Keep ids stable when editing so labels stay meaningful.'),
  type: z.enum(['building', 'road', 'water', 'wall', 'landmark']),
  name: z.string().describe('Label for notable buildings/landmarks ("Inn", "Well"); empty string for ordinary houses, roads and water.'),
  x: z.number().describe('Left edge, map units.'),
  y: z.number().describe('Top edge, map units (y grows downward).'),
  w: z.number(),
  h: z.number(),
  shape: z.enum(['rect', 'oval']).optional().describe('How it is drawn. Omitted: a landmark is an oval, everything else a rectangle.'),
});

const MAP_HELP =
  'A map is structured data, drawn by the app: { width, height, features[] } where every feature is an axis-aligned box, drawn as a rectangle or an oval (shape). ' +
  'Default size is 1000 wide by 620 tall. Roads are long thin rectangles (20-34 across), water is a river band or pond, a wall is one large outline rectangle, ' +
  'landmarks are small (16-40 a side), buildings 50-130 a side. Buildings must not overlap each other, roads or water. ' +
  'The grid is 50 units a tile. What a tile stands for is scale_value + scale_unit (default 5 feet); a tile of hours or miles makes a town, ruin or tower one feature about a tile across, a tile of feet makes single buildings and walls.';

export function registerOracleTools(server: McpServer, ctx: McpContext) {
  const userId = ctx.user.id;

  // Every tool checks module access and campaign ownership, exactly as the HTTP routes do.
  async function owned(campaignId: string): Promise<string> {
    if (!(await userCanAccessModule(userId, MODULE_SLUG, ctx.user.globalAdmin))) {
      throw new OracleError(403, "You don't have access to Oracle");
    }
    const campaign = await requireOwnedCampaign(userId, campaignId.toLowerCase());
    return campaign.id;
  }

  server.registerTool(
    'oracle_list_campaigns',
    {
      description: "The DM's tabletop campaigns (Oracle module). Start here to get a campaign id for the other oracle_ tools.",
      inputSchema: {},
    },
    async () => {
      if (!(await userCanAccessModule(userId, MODULE_SLUG, ctx.user.globalAdmin))) throw new OracleError(403, "You don't have access to Oracle");
      return json(await listCampaigns(userId));
    },
  );

  server.registerTool(
    'oracle_create_campaign',
    {
      description: 'Create a new campaign. It starts empty; add maps with oracle_create_map or on the Prep tab.',
      inputSchema: { name: z.string().min(1).max(120) },
    },
    async ({ name }) => {
      if (!(await userCanAccessModule(userId, MODULE_SLUG, ctx.user.globalAdmin))) throw new OracleError(403, "You don't have access to Oracle");
      return json(await createCampaign(userId, name.trim()));
    },
  );

  server.registerTool(
    'oracle_get_campaign',
    {
      description:
        'A campaign in full: world notes (tone and setting — read these before generating anything), the sessions (each with its rough notes and recap; the campaign current_session_id is the live one), maps (without feature lists; use oracle_get_map), ' +
        'the entities (creatures, people, places and items with DM notes and what the players already know) and the recent session log.',
      inputSchema: { campaign_id: Uuid },
    },
    async ({ campaign_id }) => {
      const id = await owned(campaign_id);
      const [campaign, sessions, maps, entities, events] = await Promise.all([
        requireOwnedCampaign(userId, id),
        listSessions(id),
        listMaps(id),
        listEntities(id),
        listEvents(id),
      ]);
      return json({
        campaign,
        sessions,
        maps: maps.map((map) => ({ id: map.id, name: map.name, feature_count: map.data.features.length, party_x: map.party_x, party_y: map.party_y })),
        entities,
        recent_events: events.slice(0, 30),
      });
    },
  );

  server.registerTool(
    'oracle_update_world',
    {
      description: 'Replace the campaign world notes — the tone, setting and themes every in-app generation is given. Keep it under roughly 300 words.',
      inputSchema: { campaign_id: Uuid, world: z.string().max(6000) },
    },
    async ({ campaign_id, world }) => {
      const id = await owned(campaign_id);
      await updateCampaign(userId, id, { world: world.trim() });
      return text('World notes updated.');
    },
  );

  server.registerTool(
    'oracle_add_session',
    {
      description: 'Add a session (one night at the table) with its rough notes. Use oracle_set_live_session to make it the one the Table runs.',
      inputSchema: {
        campaign_id: Uuid,
        title: z.string().min(1).max(160),
        session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        notes: z.string().max(20000).default(''),
      },
    },
    async ({ campaign_id, title, session_date, notes }) => {
      const id = await owned(campaign_id);
      const created = await createSession(id, title.trim(), session_date);
      return json(notes.trim() ? await updateSession(id, created.id, { notes: notes.trim() }) : created);
    },
  );

  server.registerTool(
    'oracle_update_session',
    {
      description: 'Change a session: title, date, rough notes, recap (what happened), or mark it done.',
      inputSchema: {
        campaign_id: Uuid,
        session_id: Uuid,
        title: z.string().min(1).max(160).optional(),
        session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        notes: z.string().max(20000).optional(),
        recap: z.string().max(4000).optional(),
        is_done: z.boolean().optional(),
      },
    },
    async ({ campaign_id, session_id, ...patch }) => json(await updateSession(await owned(campaign_id), session_id.toLowerCase(), patch)),
  );

  server.registerTool(
    'oracle_set_live_session',
    {
      description: 'Make a session the live one: every generation at the Table is written against its notes and recap.',
      inputSchema: { campaign_id: Uuid, session_id: Uuid },
    },
    async ({ campaign_id, session_id }) => {
      const id = await owned(campaign_id);
      await updateCampaign(userId, id, { current_session_id: session_id.toLowerCase() });
      return text('Session is live.');
    },
  );

  server.registerTool(
    'oracle_get_map',
    {
      description: `One map with its full feature list, party position and explored area. ${MAP_HELP}`,
      inputSchema: { campaign_id: Uuid, map_id: Uuid },
    },
    async ({ campaign_id, map_id }) => json(await getMap(await owned(campaign_id), map_id.toLowerCase())),
  );

  server.registerTool(
    'oracle_create_map',
    {
      description:
        `Create a map from features you design (e.g. "build a small village appropriate for the world atmosphere" — read the world notes first). ${MAP_HELP} ` +
        'Set make_active=true to switch the table and the player display to it.',
      inputSchema: {
        campaign_id: Uuid,
        name: z.string().min(1).max(120),
        width: z.number().int().min(400).max(2400).default(1000),
        height: z.number().int().min(300).max(1600).default(620),
        features: z.array(MapFeature).max(120),
        scale_value: z.number().positive().max(100000).default(5).describe('How much one 50-unit tile stands for, in scale_unit. Default 5.'),
        scale_unit: z.enum(['feet', 'yards', 'meters', 'miles', 'kilometers', 'hours', 'days']).default('feet').describe('Unit of scale_value. Default feet; "hours" for a map where a tile is hours of travel.'),
        description: z.string().max(600).optional().describe('What the map shows, in a sentence.'),
        make_active: z.boolean().default(false),
      },
    },
    async ({ campaign_id, name, width, height, features, scale_value, scale_unit, description, make_active }) => {
      const id = await owned(campaign_id);
      const map = await createMap(id, name.trim(), coerceMapData({ width, height, scale_value, scale_unit, description, features }));
      if (make_active) await updateCampaign(userId, id, { active_map_id: map.id });
      return json(map);
    },
  );

  server.registerTool(
    'oracle_set_map_features',
    {
      description:
        'Replace a map\'s whole feature list (e.g. "add a market square and a well": fetch the map, add or change features, ' +
        'and send every feature back). Keep ids, positions and sizes of anything you are not changing. ' + MAP_HELP,
      inputSchema: { campaign_id: Uuid, map_id: Uuid, features: z.array(MapFeature).max(120) },
    },
    async ({ campaign_id, map_id, features }) => {
      const id = await owned(campaign_id);
      const current = await getMap(id, map_id.toLowerCase());
      return json(await replaceMapData(id, current.id, coerceMapData({ ...current.data, features })));
    },
  );

  server.registerTool(
    'oracle_move_party',
    {
      description: 'Move the party token on a map. The players see the area within the vision radius around it; this does not add to the explored area (the DM does that by dragging the token in the app).',
      inputSchema: { campaign_id: Uuid, map_id: Uuid, x: z.number(), y: z.number() },
    },
    async ({ campaign_id, map_id, x, y }) => json(await updateMap(await owned(campaign_id), map_id.toLowerCase(), { party_x: x, party_y: y })),
  );

  server.registerTool(
    'oracle_create_entity',
    {
      description:
        'Add a creature, person, place or item to the campaign entities. "details" is what the players may be shown; "dm_notes" is never shown to players. ' +
        'Give creatures a stat block. To put it on a map pass map_id with map_x/map_y; a placed entry starts hidden from the players, and oracle_update_entity sets how much they see of it.',
      inputSchema: {
        campaign_id: Uuid,
        kind: Kind,
        name: z.string().min(1).max(120),
        details: z.string().max(1000).default(''),
        attitude: AttitudeEnum.default('neutral'),
        dm_notes: z.string().max(4000).default(''),
        stats: statBlockSchema.nullable().optional(),
        map_id: Uuid.nullable().optional(),
        map_x: z.number().nullable().optional(),
        map_y: z.number().nullable().optional(),
      },
    },
    async (args) => {
      const id = await owned(args.campaign_id);
      return json(
        await createEntity(id, {
          kind: args.kind as EntityKind,
          name: args.name.trim(),
          details: args.details.trim(),
          attitude: args.attitude as Attitude,
          dm_notes: args.dm_notes.trim(),
          stats: args.stats ?? null,
          map_id: args.map_id ? args.map_id.toLowerCase() : null,
          map_x: args.map_x ?? null,
          map_y: args.map_y ?? null,
        }),
      );
    },
  );

  server.registerTool(
    'oracle_update_entity',
    {
      description: 'Change a entities entry. Only the fields you pass are changed. Pass map_id=null to take it off the map.',
      inputSchema: {
        campaign_id: Uuid,
        entity_id: Uuid,
        name: z.string().min(1).max(120).optional(),
        details: z.string().max(1000).optional(),
        attitude: AttitudeEnum.optional(),
        dm_notes: z.string().max(4000).optional(),
        stats: statBlockSchema.nullable().optional(),
        map_id: Uuid.nullable().optional(),
        map_x: z.number().nullable().optional(),
        map_y: z.number().nullable().optional(),
        visibility: z.enum(['hidden', 'sight', 'revealed']).optional().describe("how much the players' screen shows: hidden = never; sight = once the party can see where it stands; revealed = always. A placed entry starts hidden."),
        is_down: z.boolean().optional().describe('true: dead or out of the fight; it stays on the map, greyed out'),
        in_party: z.boolean().optional().describe('true: travels with the party (takes it off the map); false or placing it on a map: leaves the party'),
        party_group_id: Uuid.nullable().optional().describe('the party group it travels with; null = with the party token'),
      },
    },
    async ({ campaign_id, entity_id, ...patch }) => {
      const id = await owned(campaign_id);
      return json(
        await updateEntity(id, entity_id.toLowerCase(), {
          ...patch,
          attitude: patch.attitude as Attitude | undefined,
          map_id: patch.map_id === undefined ? undefined : patch.map_id ? patch.map_id.toLowerCase() : null,
          party_group_id: patch.party_group_id === undefined ? undefined : patch.party_group_id ? patch.party_group_id.toLowerCase() : null,
        }),
      );
    },
  );

  server.registerTool(
    'oracle_delete_entity',
    {
      description: 'Remove a entities entry and everything the players learned about it. Cannot be undone.',
      inputSchema: { campaign_id: Uuid, entity_id: Uuid },
    },
    async ({ campaign_id, entity_id }) => {
      await deleteEntity(await owned(campaign_id), entity_id.toLowerCase());
      return text('Entry deleted.');
    },
  );

  server.registerTool(
    'oracle_reveal_knowledge',
    {
      description:
        'Reveal a fact about a entities entry to the players: it is added to what they know and appears on the player display whenever that entry is on the panel. ' +
        'Write it as a plain statement with no game statistics. Optionally record the check that earned it.',
      inputSchema: {
        campaign_id: Uuid,
        entity_id: Uuid,
        fact: z.string().min(1).max(600),
        skill: z.enum(KNOWLEDGE_SKILLS as [string, ...string[]]).nullable().optional(),
        tier: z.enum(KNOWLEDGE_TIER_KEYS as [string, ...string[]]).nullable().optional(),
      },
    },
    async ({ campaign_id, entity_id, fact, skill, tier }) => {
      const id = await owned(campaign_id);
      await getEntity(id, entity_id.toLowerCase());
      return json(await addKnowledge(id, entity_id.toLowerCase(), fact.trim(), skill ?? null, (tier ?? null) as KnowledgeTier | null));
    },
  );

  server.registerTool(
    'oracle_add_log',
    {
      description: 'Add a note to the session log, optionally attached to a entities entry so it shows in that entry\'s history.',
      inputSchema: { campaign_id: Uuid, body: z.string().min(1).max(1000), entity_id: Uuid.nullable().optional() },
    },
    async ({ campaign_id, body, entity_id }) => json(await addEvent(await owned(campaign_id), body.trim(), entity_id ? entity_id.toLowerCase() : null)),
  );

  server.registerTool(
    'oracle_set_display',
    {
      description:
        'Control the player display (the shared screen: map on the left, a reference panel on the right). Put a entities entry or a library image on the panel, clear the panel, or blank the whole display.',
      inputSchema: {
        campaign_id: Uuid,
        panel_kind: z.enum(['entity', 'image']).nullable().optional().describe('What the panel shows; null clears it.'),
        panel_id: Uuid.nullable().optional().describe('The entity or image id for panel_kind.'),
        blank: z.boolean().optional().describe('true hides everything from the players; false shows it again.'),
      },
    },
    async ({ campaign_id, panel_kind, panel_id, blank }) => {
      const id = await owned(campaign_id);
      if (panel_kind === undefined && blank === undefined) throw new OracleError(400, 'Nothing to change');
      const campaign = await setDisplay(id, { panel_kind, panel_id: panel_id ? panel_id.toLowerCase() : null, blank });
      return json({ panel_kind: campaign.panel_kind, panel_entity_id: campaign.panel_entity_id, panel_image_id: campaign.panel_image_id, blank: campaign.display_blank });
    },
  );
}
