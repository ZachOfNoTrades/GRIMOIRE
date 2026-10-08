"use client";

import { Brush, ChevronDown, CloudFog, Eraser, Eye, EyeOff, HeartPulse, MapPin, MonitorUp, Move, PanelLeft, Plus, RotateCcw, Search, Skull, Trash2, UserPlus, X, ZoomIn } from "lucide-react";
import TabLink from "../../../../components/TabLink";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import RouteLoading from "@/components/RouteLoading";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { usePopoverStyle } from "../../../../lib/usePopoverStyle";
import { useConfirm } from "@/lib/useConfirm";
import { generateUUID } from "@/lib/uuid";
import AdoptModal from "../../../../components/AdoptModal";
import ContextMenu from "../../../../components/ContextMenu";
import DisplayMenu from "../../../../components/DisplayMenu";
import DetailsPanel from "../../../../components/DetailsPanel";
import EntityModal, { type EntityDraft, type EntityWriteUp } from "../../../../components/EntityModal";
import ImagePicker, { type ImageSource } from "../../../../components/ImagePicker";
import MapCanvas, { type MapTool, type MapToken } from "../../../../components/MapCanvas";
import RangeValue from "../../../../components/RangeValue";
import PartyPanel from "../../../../components/PartyPanel";
import ResultModal from "../../../../components/ResultModal";
import SessionsPanel from "../../../../components/SessionsPanel";
import SessionBar from "../../../../components/SessionBar";
import { VISIBILITY_ICONS } from "../../../../components/visibility";
import { loadPictures, useWhenPictureReady } from "../../../../lib/imagePreload";
import { useIsActiveTab } from "../../../campaignTabs";
import Ticker from "../../../../components/Ticker";
import { TABLE_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { normalizeCr } from "../../../../lib/encounter";
import { findChallengeRow, statBlockFromChallenge } from "../../../../lib/reference";
import type { LibraryCreature } from "../../../../lib/creatureFunctions";
import { BRUSH_DEFAULT, BRUSH_MAX, BRUSH_MIN, BRUSH_STEP, ENTITY_VISIBILITIES, MAP_GRID, VISIBILITY_LABELS, VISION_MAX, VISION_MIN, VISION_SLIDER_MAX, VISION_STEP } from "../../../../lib/constants";
import { addExplored, addExploredPath, eraseExplored, isVisibleFrom, visionPoints } from "../../../../lib/fog";
import type { ChipOption, EntityKind, EntityVisibility, Knowledge, KnowledgeTier, OracleCampaign, OracleChip, OracleEntity, OracleEvent, OracleImage, OracleMap, OraclePartyGroup, OraclePartyMember, OracleSession, StatBlock, TableSnapshot } from "../../../../types/oracle";

interface TableClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
}

interface ChipBarState {
  chips: OracleChip[];
  generating: boolean;
  error: string | null;
}

const TOOLS: { key: MapTool; label: string; icon: typeof Move; hotkey: string }[] = [
  { key: "move", label: "Move party", icon: Move, hotkey: "v" },
  { key: "reveal", label: "Reveal", icon: Brush, hotkey: "r" },
  { key: "hide", label: "Hide", icon: Eraser, hotkey: "h" },
  { key: "place", label: "Pin", icon: MapPin, hotkey: "p" },
];

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable);
}

// THE TABLE — where the session is run: the map with its fog, the details of whatever is
// selected, what the players are shown, the ideas banner.
// The map last in use on each campaign's Table, for this browser tab's lifetime (survives moving
// between the campaign's tabs, which can restore an older server snapshot).
const lastMapChoice = new Map<string, string>();

export default function TableClient({ snapshot, imageSources }: TableClientProps) {
  const campaignId = snapshot.campaign.id;
  const base = campaignApi(campaignId);
  const { confirm, confirmModal } = useConfirm();
  useAppHeight();

  // DATA — seeded from the server snapshot. The browser's Back button can hand back the snapshot
  // from when the Table was first opened, so the map last chosen here wins over it at once, and
  // the version check below runs on mount to bring the rest up to date.
  const [campaign, setCampaign] = useState<OracleCampaign>(() => {
    const chosen = lastMapChoice.get(snapshot.campaign.id);
    return chosen && chosen !== snapshot.campaign.active_map_id && snapshot.maps.some((map) => map.id === chosen) ? { ...snapshot.campaign, active_map_id: chosen } : snapshot.campaign;
  });
  const [sessions, setSessions] = useState<OracleSession[]>(snapshot.sessions);
  const [maps, setMaps] = useState<OracleMap[]>(snapshot.maps);
  const [entities, setEntities] = useState<OracleEntity[]>(snapshot.entities);
  const [images, setImages] = useState<OracleImage[]>(snapshot.images);
  const [chips, setChips] = useState<OracleChip[]>(snapshot.chips);
  const [events, setEvents] = useState<OracleEvent[]>(snapshot.events);
  const [party, setParty] = useState<OraclePartyMember[]>(snapshot.party);
  const [partyGroups, setPartyGroups] = useState<OraclePartyGroup[]>(snapshot.party_groups);

  // INPUT

  // STATE
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<MapTool>("move");
  const [brushRadius, setBrushRadius] = useState(BRUSH_DEFAULT);
  const [placingId, setPlacingId] = useState<string | null>(null); // an existing entry waiting for a tap on the map
  // More than one creature can be waiting at once: an encounter chosen on the banner queues all
  // of its creatures, and each tap on the map places the next one.
  const [placingQueue, setPlacingQueue] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false); // an encounter from the banner is being created
  const [mobileTab, setMobileTab] = useState<"map" | "details">("map");
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [isPartyOpen, setIsPartyOpen] = useState(false); // the party popover over the map
  const [isMapListOpen, setIsMapListOpen] = useState(false); // the map switcher in the toolbar
  const mapSwitchRef = useRef<HTMLDivElement>(null);
  const mapListStyle = usePopoverStyle(mapSwitchRef, isMapListOpen, "left");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null); // right-click menu on an entry
  const [groundMenu, setGroundMenu] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null); // right-click menu on bare ground
  const [pictureOpacity, setPictureOpacity] = useState(1); // how strongly the map's picture shows on this screen
  const [focus, setFocus] = useState<{ x: number; y: number; nonce: number } | null>(null); // a Zoom to request
  const [entityModal, setEntityModal] = useState<{ entity: OracleEntity | null; kind: EntityKind; at: { x: number; y: number } | null } | null>(null);
  const [picker, setPicker] = useState<{ entityId: string | null; subject: string; detail: string; kind?: EntityKind } | null>(null);
  const [openChip, setOpenChip] = useState<OracleChip | null>(null);
  const [adoptChip, setAdoptChip] = useState<OracleChip | null>(null);
  const [isAdopting, setIsAdopting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const chosenMap = maps.find((map) => map.id === campaign.active_map_id) ?? maps.find((map) => !map.data.disabled) ?? maps[0] ?? null;
  // The map is not drawn until its background is in the browser's cache: the features are SVG and
  // paint at once, so without this a map change shows the new layout over the old picture.
  const mapBackground = useCallback((map: OracleMap) => (map.background_image_id ? `${base}/images/${map.background_image_id}?w=1600` : null), [base]);
  const activeMap = useWhenPictureReady(chosenMap, mapBackground);
  // FIRST PAINT — the map's picture is first-paint data. The server's HTML asks the browser for it
  // at once, and the Table shows the page loading state until it has arrived (or the wait gives up),
  // so it never paints "No map" and then fills in. A later map switch keeps the old map on screen.
  const chosenPicture = chosenMap ? mapBackground(chosenMap) : null;
  if (chosenPicture) preload(chosenPicture, { as: "image", fetchPriority: "high" });
  const hasPaintedMapRef = useRef(false);
  if (activeMap) hasPaintedMapRef.current = true;
  const isFirstPictureLoading = !!chosenMap && !activeMap && !hasPaintedMapRef.current;
  const selected = entities.find((entity) => entity.id === selectedId) ?? null;
  const panelEntity = campaign.panel_kind === "entity" ? entities.find((entity) => entity.id === campaign.panel_entity_id) ?? null : null;
  const panelImage = campaign.panel_kind === "image" ? images.find((image) => image.id === campaign.panel_image_id) ?? null : null;
  const currentSession = sessions.find((session) => session.id === campaign.current_session_id) ?? null;
  const displayLabel = `Map${panelEntity ? ` + ${panelEntity.name}` : panelImage ? ` + ${panelImage.caption}` : ""}`;
  const isOverlayOpen = !!(openChip || adoptChip || entityModal || picker || isSessionsOpen);

  useEntityTitle(campaign.name);

  // The picture's opacity is a preference of this screen, kept between visits.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("orc-picture-opacity-dm"));
      if (localStorage.getItem("orc-picture-opacity-dm") !== null && Number.isFinite(saved)) setPictureOpacity(Math.min(1, Math.max(0, saved)));
    } catch {
      /* storage can be blocked; the default stands */
    }
  }, []);
  function changePictureOpacity(value: number) {
    setPictureOpacity(value);
    try {
      localStorage.setItem("orc-picture-opacity-dm", String(value));
    } catch {
      /* storage can be blocked; the change still applies */
    }
  }

  // Entries on the active map. Places become numbered pins, numbered in name order.
  const tokens: MapToken[] = useMemo(() => {
    if (!activeMap) return [];
    const placed = entities.filter((entity) => entity.map_id === activeMap.id && entity.map_x !== null && entity.map_y !== null);
    const places = placed.filter((entity) => entity.kind === "place").sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    // Where the party can see from, measured once for the whole list rather than per entity.
    const withParty = entities.filter((entity) => entity.in_party).map((entry) => ({ group_id: entry.party_group_id }));
    const sight = visionPoints(activeMap, partyGroups, [...party, ...withParty]);
    return placed.map((entity) => ({
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      attitude: entity.attitude,
      x: entity.map_x as number,
      y: entity.map_y as number,
      pin: entity.kind === "place" ? places.findIndex((place) => place.id === entity.id) + 1 : undefined,
      revealed: entity.visibility === "revealed",
      visibility: entity.visibility,
      // Only asked of one shown in range: hidden is never seen and revealed always is.
      inSight: entity.visibility === "sight" && isVisibleFrom(sight, activeMap.vision_radius, entity.map_x as number, entity.map_y as number),
      down: entity.is_down,
    }));
  }, [entities, activeMap, partyGroups, party]);

  // Start the active map's exploration over. "fog" closes the map back up and leaves what the
  // players have been shown; "all" also takes back the entries revealed on it.
  async function resetActiveMap(scope: "fog" | "all" = "all") {
    if (!activeMap) return;
    const asking = scope === "fog"
      ? { title: `Reset the fog on ${activeMap.name}?`, message: "The fog returns everywhere the party can't see right now. Entities you have revealed stay on the players' map." }
      : { title: `Reset ${activeMap.name}?`, message: "The fog returns everywhere the party can't see right now, and entities revealed on this map are hidden again." };
    if (!(await confirm({ ...asking, confirmLabel: "Reset", danger: true }))) return;
    try {
      await api(`${base}/maps/${activeMap.id}/reset${scope === "fog" ? "?scope=fog" : ""}`, "POST");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't reset the map"));
    }
  }

  // Everything standing on this map is a click away from being shown to the players, so its
  // picture is fetched quietly as soon as the map is up rather than when it is first opened.
  // Entries on other maps are left until they are asked for.
  useEffect(() => {
    if (!activeMap) return;
    loadPictures(entities.filter((entry) => entry.image_id && (entry.map_id === activeMap.id || entry.in_party)).map((entry) => `${base}/images/${entry.image_id}?w=480`));
  }, [entities, activeMap, base]);

  // Reload everything from the server. Used after a failed write, when local state can no longer
  // be trusted to match the database.
  const refresh = useCallback(async () => {
    try {
      const fresh = await api<TableSnapshot>(base);
      setCampaign(fresh.campaign);
      setSessions(fresh.sessions);
      setMaps(fresh.maps);
      setEntities(fresh.entities);
      setImages(fresh.images);
      setEvents(fresh.events);
      setParty(fresh.party);
      setPartyGroups(fresh.party_groups);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't reload the campaign"));
    }
  }, [base]);

  // -------------------------------------------------------------------------------------------
  // MAP — party, fog and features

  // Map edits are painted at once and saved a moment later, latest state wins: dragging the
  // token or brushing fog produces many small changes that should be one write.
  const mapsRef = useRef(maps);
  mapsRef.current = maps;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleMapSave = useCallback(
    (mapId: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const map = mapsRef.current.find((entry) => entry.id === mapId);
        if (!map) return;
        try {
          await api(`${base}/maps/${mapId}`, "PUT", { party_x: map.party_x, party_y: map.party_y, vision_radius: map.vision_radius, explored: map.explored });
        } catch (error) {
          toast.error(errorMessage(error, "Couldn't save the map"));
          refresh();
        }
      }, 300);
    },
    [base, refresh]
  );

  function patchMap(mapId: string, change: (map: OracleMap) => OracleMap) {
    setMaps((previous) => previous.map((map) => (map.id === mapId ? change(map) : map)));
    scheduleMapSave(mapId);
  }

  // FOLLOW CHANGES MADE ELSEWHERE — the map can change from Prep, the API or another tab. The
  // display's cheap version check (public, one number) is polled while the tab is visible; when
  // the version moves and nothing is mid-save here, the whole snapshot is reloaded.
  const knownVersionRef = useRef(snapshot.campaign.version);
  // The four tabs share a page, so this one stays mounted while another is on screen. It picks
  // the campaign back up when it is shown again rather than polling behind the DM's back.
  const isActiveTab = useIsActiveTab();
  const isActiveRef = useRef(isActiveTab);
  isActiveRef.current = isActiveTab;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || !isActiveRef.current || document.visibilityState !== "visible" || saveTimerRef.current) return;
      try {
        const response = await fetch(`/api/oracle/${campaign.display_code}/state?v=${knownVersionRef.current}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { version?: number; unchanged?: boolean };
        if (typeof data.version !== "number" || data.version === knownVersionRef.current) return;
        knownVersionRef.current = data.version;
        await refreshRef.current();
      } catch {
        /* a missed poll is nothing; the next one catches up */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    if (isActiveTab) void tick();
    const timer = setInterval(tick, 4000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [campaign.display_code, isActiveTab]);

  // Remember the map in use, for when the Table is shown again from the browser's history.
  useEffect(() => {
    if (campaign.active_map_id) lastMapChoice.set(campaign.id, campaign.active_map_id);
  }, [campaign.id, campaign.active_map_id]);

  function moveParty(x: number, y: number, fromX: number, fromY: number) {
    if (!activeMap) return;
    patchMap(activeMap.id, (map) => ({ ...map, party_x: x, party_y: y, explored: addExploredPath(map.explored, fromX, fromY, x, y, map.vision_radius) }));
  }


  // The place entry a building or landmark stands for: the one named like it, else one pinned inside it.
  function placeForFeature(feature: { name: string; x: number; y: number; w: number; h: number }): OracleEntity | undefined {
    if (!activeMap) return undefined;
    const places = entities.filter((entity) => entity.kind === "place");
    const named = feature.name ? places.find((place) => place.name.trim().toLowerCase() === feature.name.trim().toLowerCase()) : undefined;
    const pinned = places.find((place) => place.map_id === activeMap.id && place.map_x !== null && place.map_y !== null && place.map_x >= feature.x && place.map_x <= feature.x + feature.w && place.map_y >= feature.y && place.map_y <= feature.y + feature.h);
    return named ?? pinned;
  }

  // Features that open a location when tapped (shown with a pointer).
  const linkedFeatures = useMemo(
    () => (activeMap ? activeMap.data.features.filter((feature) => (feature.type === "building" || feature.type === "landmark") && placeForFeature(feature)).map((feature) => feature.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMap, entities]
  );

  // A tap inside a building or landmark opens the location it stands for.
  // A location's name on the map opens it, and dragging the name moves it to where it reads best.
  // The place it is put is kept with the feature, so the label stays there rather than being
  // shuffled about by the label layout whenever something else on the map moves.
  function openFeature(featureId: string) {
    if (!activeMap) return;
    const feature = activeMap.data.features.find((entry) => entry.id === featureId);
    const found = feature ? placeForFeature(feature) : undefined;
    if (!found) return;
    setSelectedId(found.id);
    setMobileTab("details");
  }

  async function moveFeatureLabel(featureId: string, dx: number, dy: number) {
    if (!activeMap) return;
    const data = { ...activeMap.data, features: activeMap.data.features.map((feature) => (feature.id === featureId ? { ...feature, label_dx: dx, label_dy: dy } : feature)) };
    setMaps((list) => list.map((map) => (map.id === activeMap.id ? { ...map, data } : map)));
    try {
      // Written on its own rather than through the map's own save, which only carries the party,
      // the fog and the vision: this is a change to the map's features.
      await api(`${base}/maps/${activeMap.id}`, "PUT", { data });
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't move the label"));
      await refresh();
    }
  }

  function openLocationAt(x: number, y: number) {
    if (!activeMap) return;
    const inside = activeMap.data.features
      .filter((feature) => (feature.type === "building" || feature.type === "landmark") && x >= feature.x && x <= feature.x + feature.w && y >= feature.y && y <= feature.y + feature.h)
      .sort((a, b) => a.w * a.h - b.w * b.h);
    for (const feature of inside) {
      const found = placeForFeature(feature);
      if (found) {
        setSelectedId(found.id);
        setMobileTab("details");
        return;
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // PARTY GROUPS — a named token on the map that some of the party stands with
  // -------------------------------------------------------------------------------------------

  // Groups standing on the active map, drawn as their own tokens.
  const companions = useMemo(() => entities.filter((entity) => entity.in_party), [entities]);
  const apartGroups = useMemo(
    () => (activeMap ? partyGroups.filter((group) => group.map_id === activeMap.id && group.map_x !== null && group.map_y !== null).map((group) => ({ id: group.id, name: group.name, x: group.map_x as number, y: group.map_y as number })) : []),
    [partyGroups, activeMap]
  );

  // A new group appears two cells from the party token; characters are then dragged into it.
  async function createGroup() {
    if (!activeMap) return;
    const cell = snapCell(Math.min(activeMap.data.width, activeMap.party_x + MAP_GRID * 2), activeMap.party_y);
    try {
      const created = await api<OraclePartyGroup>(`${base}/party/groups`, "POST", { name: `Group ${partyGroups.length + 2}`, map_id: activeMap.id, map_x: cell.x, map_y: cell.y });
      setPartyGroups((list) => [...list, created]);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't make the group"));
    }
  }

  async function renameGroup(group: OraclePartyGroup, name: string) {
    const previous = partyGroups;
    setPartyGroups((list) => list.map((entry) => (entry.id === group.id ? { ...entry, name } : entry)));
    try {
      await api(`${base}/party/groups/${group.id}`, "PUT", { name });
    } catch (error) {
      setPartyGroups(previous);
      toast.error(errorMessage(error, "Couldn't rename the group"));
    }
  }

  // Disbanding sends the group's characters back to the party.
  async function disbandGroup(group: OraclePartyGroup) {
    const previousGroups = partyGroups;
    const previousParty = party;
    setPartyGroups((list) => list.filter((entry) => entry.id !== group.id));
    setParty((list) => list.map((member) => (member.group_id === group.id ? { ...member, group_id: null } : member)));
    const previousEntities = entities;
    setEntities((list) => list.map((entry) => (entry.party_group_id === group.id ? { ...entry, party_group_id: null } : entry)));
    try {
      await api(`${base}/party/groups/${group.id}`, "DELETE");
    } catch (error) {
      setPartyGroups(previousGroups);
      setParty(previousParty);
      setEntities(previousEntities);
      toast.error(errorMessage(error, "Couldn't disband the group"));
    }
  }

  async function moveMemberTo(member: OraclePartyMember, groupId: string | null) {
    const previous = party;
    setParty((list) => list.map((entry) => (entry.id === member.id ? { ...entry, group_id: groupId } : entry)));
    try {
      await api(`${base}/party/${member.id}`, "PUT", { group_id: groupId });
    } catch (error) {
      setParty(previous);
      toast.error(errorMessage(error, "Couldn't move the character"));
    }
  }

  // Dragging a group onto the party token disbands it; anywhere else moves it and reveals the path.
  async function moveGroup(id: string, x: number, y: number, fromX: number, fromY: number) {
    const group = partyGroups.find((entry) => entry.id === id);
    if (!group || !activeMap) return;
    if (Math.hypot(x - activeMap.party_x, y - activeMap.party_y) <= MAP_GRID / 2) {
      disbandGroup(group);
      return;
    }
    if (party.some((member) => member.group_id === group.id)) patchMap(activeMap.id, (map) => ({ ...map, explored: addExploredPath(map.explored, fromX, fromY, x, y, map.vision_radius) }));
    const previous = partyGroups;
    setPartyGroups((list) => list.map((entry) => (entry.id === id ? { ...entry, map_id: activeMap.id, map_x: Math.round(x), map_y: Math.round(y) } : entry)));
    try {
      await api(`${base}/party/groups/${id}`, "PUT", { map_id: activeMap.id, map_x: Math.round(x), map_y: Math.round(y) });
    } catch (error) {
      setPartyGroups(previous);
      toast.error(errorMessage(error, "Couldn't move the group"));
    }
  }

  function brush(x: number, y: number) {
    if (!activeMap) return;
    setMaps((previous) =>
      previous.map((map) =>
        map.id === activeMap.id ? { ...map, explored: tool === "hide" ? eraseExplored(map.explored, x, y, brushRadius) : addExplored(map.explored, x, y, brushRadius) } : map
      )
    );
  }

  // Dragging the vision slider only moves this: the DM sees the radius change under the pointer,
  // while the map is written (and so the players' screen redrawn) once on release. Saving on
  // every step redrew the players' fog continuously as the DM hunted for a value.
  const [visionDraft, setVisionDraft] = useState<number | null>(null);
  const visionShown = visionDraft ?? activeMap?.vision_radius ?? 0;
  const commitVision = () => { if (visionDraft !== null) changeVision(visionDraft); };

  function changeBrush(value: number) {
    setBrushRadius(Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, Math.round(value))));
  }

  function changeVision(value: number) {
    if (!activeMap) return;
    setVisionDraft(null);
    patchMap(activeMap.id, (map) => ({ ...map, vision_radius: Math.min(VISION_MAX, Math.max(VISION_MIN, value)) }));
  }

  async function switchMap(mapId: string) {
    const previous = campaign;
    setCampaign({ ...campaign, active_map_id: mapId });
    try {
      setCampaign(await api<OracleCampaign>(base, "PUT", { active_map_id: mapId }));
    } catch (error) {
      setCampaign(previous);
      toast.error(errorMessage(error, "Couldn't switch maps"));
    }
  }

  function snapCell(rawX: number, rawY: number) {
    if (!activeMap) return { x: rawX, y: rawY };
    const snap = (value: number, limit: number) => Math.min(limit - MAP_GRID / 2, Math.max(MAP_GRID / 2, Math.floor(value / MAP_GRID) * MAP_GRID + MAP_GRID / 2));
    return { x: snap(rawX, activeMap.data.width), y: snap(rawY, activeMap.data.height) };
  }

  // Hand the Pin tool to the next creature waiting to be placed, or put it away when none is.
  function advancePlacing() {
    const [next, ...rest] = placingQueue;
    setPlacingQueue(rest);
    setPlacingId(next ?? null);
    setTool(next ? "place" : "move");
    if (next) setSelectedId(next);
  }

  function stopPlacing() {
    setPlacingQueue([]);
    setPlacingId(null);
    setTool("move");
  }

  // One brush-sized circle revealed or hidden at a point, from the right-click menu.
  // A tap on the map with the Pin tool: place the entry that is waiting, or start a new one there.
  // Placed entries snap to the center of the grid cell that was tapped.
  function placeAt(rawX: number, rawY: number) {
    if (!activeMap) return;
    const snap = (value: number, limit: number) => Math.min(limit - MAP_GRID / 2, Math.max(MAP_GRID / 2, Math.floor(value / MAP_GRID) * MAP_GRID + MAP_GRID / 2));
    const x = snap(rawX, activeMap.data.width);
    const y = snap(rawY, activeMap.data.height);
    if (placingId) {
      const entity = entities.find((entry) => entry.id === placingId);
      advancePlacing();
      if (entity) saveEntity(entity, { map_id: activeMap.id, map_x: x, map_y: y }, "Couldn't place it");
      return;
    }
    setEntityModal({ entity: null, kind: "place", at: { x, y } });
  }

  // -------------------------------------------------------------------------------------------
  // ENTRIES — creatures, people and locations
  // -------------------------------------------------------------------------------------------

  // OPTIMISTIC UPDATE — paint the change, send it, swap in the server row or roll back.
  async function saveEntity(entity: OracleEntity, patch: Partial<OracleEntity>, failure: string) {
    const previous = entities;
    setEntities((list) => list.map((entry) => (entry.id === entity.id ? { ...entry, ...patch } : entry)));
    try {
      const saved = await api<OracleEntity>(`${base}/entities/${entity.id}`, "PUT", patch);
      setEntities((list) => list.map((entry) => (entry.id === saved.id ? saved : entry)));
    } catch (error) {
      setEntities(previous);
      toast.error(errorMessage(error, failure));
    }
  }

  // OPTIMISTIC CREATE — the page picks the id, so the row painted now is the real one and a
  // repeated request for the same id cannot create a second entry.
  async function createEntity(draft: EntityDraft, at: { x: number; y: number } | null) {
    const id = generateUUID().toLowerCase();
    const placement = at && activeMap ? { map_id: activeMap.id, map_x: at.x, map_y: at.y } : { map_id: null, map_x: null, map_y: null };
    const optimistic: OracleEntity = { id, ...draft, ...placement, image_id: null, visibility: "hidden", is_down: false, in_party: false, party_group_id: null, source: draft.source, knowledge: [] };
    setEntities((list) => [...list, optimistic]);
    setSelectedId(id);
    setEntityModal(null);
    setTool("move");
    try {
      const created = await api<OracleEntity>(`${base}/entities`, "POST", { id, ...draft, ...placement });
      setEntities((list) => list.map((entry) => (entry.id === id ? created : entry)));
    } catch (error) {
      setEntities((list) => list.filter((entry) => entry.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      toast.error(errorMessage(error, "Couldn't add it"));
    }
  }

  function submitEntity(draft: EntityDraft) {
    const target = entityModal;
    if (!target) return;
    if (target.entity) {
      setEntityModal(null);
      saveEntity(target.entity, draft, "Couldn't save the changes");
    } else {
      createEntity(draft, target.at);
    }
  }

  async function deleteEntity(entity: OracleEntity) {
    if (!(await confirm({ title: `Delete ${entity.name}?`, message: "Its notes, its history and everything the players learned about it are removed.", confirmLabel: "Delete", danger: true }))) return;
    const previousEntities = entities;
    const previousCampaign = campaign;
    setEntities((list) => list.filter((entry) => entry.id !== entity.id));
    if (selectedId === entity.id) setSelectedId(null);
    if (campaign.panel_entity_id === entity.id) setCampaign({ ...campaign, panel_kind: null, panel_entity_id: null });
    try {
      await api(`${base}/entities/${entity.id}`, "DELETE");
    } catch (error) {
      setEntities(previousEntities);
      setCampaign(previousCampaign);
      toast.error(errorMessage(error, "Couldn't delete it"));
    }
  }

  // Put an entry on the players' map by hand even though the party cannot see it, or take it off again.
  // COMPANIONS — a creature, person or item traveling with the party instead of standing on a map.
  function joinParty(entity: OracleEntity) {
    saveEntity(entity, { in_party: true, party_group_id: null, map_id: null, map_x: null, map_y: null }, "Couldn't add it to the party");
  }

  // Leaving puts it back on the active map one cell from where its group (or the party) stands.
  function leaveParty(entity: OracleEntity) {
    if (!activeMap) {
      saveEntity(entity, { in_party: false, party_group_id: null }, "Couldn't take it out of the party");
      return;
    }
    const group = partyGroups.find((entry) => entry.id === entity.party_group_id && entry.map_id === activeMap.id && entry.map_x !== null && entry.map_y !== null);
    const from = group ? { x: group.map_x as number, y: group.map_y as number } : { x: activeMap.party_x, y: activeMap.party_y };
    const cell = snapCell(Math.min(activeMap.data.width - MAP_GRID / 2, from.x + MAP_GRID), from.y);
    saveEntity(entity, { in_party: false, party_group_id: null, map_id: activeMap.id, map_x: cell.x, map_y: cell.y }, "Couldn't take it out of the party");
  }

  function moveCompanionTo(entity: OracleEntity, groupId: string | null) {
    saveEntity(entity, { party_group_id: groupId }, "Couldn't move it");
  }

  function toggleDown(entity: OracleEntity) {
    saveEntity(entity, { is_down: !entity.is_down }, entity.is_down ? "Couldn't bring it back" : "Couldn't mark it down");
  }

  function setVisibility(entity: OracleEntity, visibility: EntityVisibility) {
    saveEntity(entity, { visibility }, "Couldn't change what the players see");
  }

  async function addNote(entity: OracleEntity | null, body: string) {
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    const optimistic: OracleEvent = { id: tempId, entity_id: entity?.id ?? null, session_title: currentSession?.title ?? null, body, ts_created: new Date().toISOString() };
    setEvents((list) => [optimistic, ...list]);
    try {
      const saved = await api<OracleEvent>(`${base}/events`, "POST", { body, entity_id: entity?.id ?? null });
      setEvents((list) => list.map((event) => (event.id === tempId ? saved : event)));
    } catch (error) {
      setEvents((list) => list.filter((event) => event.id !== tempId));
      toast.error(errorMessage(error, "Couldn't log that"));
    }
  }

  // Reveal a fact: it joins what the players know. It does not put the entry on the player screen;
  // the players see the fact whenever the DM shows the entry or they tap it on their map.
  async function revealFact(entity: OracleEntity, fact: string, skill: string | null, tier: KnowledgeTier | null) {
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    const optimistic: Knowledge = { id: tempId, entity_id: entity.id, fact, skill, tier, ts_created: new Date().toISOString() };
    setEntities((list) => list.map((entry) => (entry.id === entity.id ? { ...entry, knowledge: [...entry.knowledge, optimistic] } : entry)));
    try {
      const saved = await api<Knowledge>(`${base}/entities/${entity.id}/knowledge`, "POST", { fact, skill, tier });
      setEntities((list) =>
        list.map((entry) =>
          entry.id === entity.id
            ? { ...entry, knowledge: entry.knowledge.some((item) => item.id === saved.id) ? entry.knowledge.filter((item) => item.id !== tempId) : entry.knowledge.map((item) => (item.id === tempId ? saved : item)) }
            : entry
        )
      );
    } catch (error) {
      setEntities((list) => list.map((entry) => (entry.id === entity.id ? { ...entry, knowledge: entry.knowledge.filter((item) => item.id !== tempId) } : entry)));
      toast.error(errorMessage(error, "Couldn't reveal that"));
    }
  }

  async function removeFact(entity: OracleEntity, fact: Knowledge) {
    const previous = entities;
    setEntities((list) => list.map((entry) => (entry.id === entity.id ? { ...entry, knowledge: entry.knowledge.filter((item) => item.id !== fact.id) } : entry)));
    try {
      await api(`${base}/entities/${entity.id}/knowledge/${fact.id}`, "DELETE");
    } catch (error) {
      setEntities(previous);
      toast.error(errorMessage(error, "Couldn't take that back"));
    }
  }

  // -------------------------------------------------------------------------------------------
  // PLAYER DISPLAY
  // -------------------------------------------------------------------------------------------

  async function setDisplay(change: { panel_kind?: "entity" | "image" | null; panel_id?: string | null; blank?: boolean }, optimistic: Partial<OracleCampaign>) {
    const previous = campaign;
    setCampaign({ ...campaign, ...optimistic });
    try {
      setCampaign(await api<OracleCampaign>(`${base}/display`, "PUT", change));
    } catch (error) {
      setCampaign(previous);
      toast.error(errorMessage(error, "Couldn't change the display"));
    }
  }

  function showEntity(entity: OracleEntity | null) {
    if (entity) setDisplay({ panel_kind: "entity", panel_id: entity.id }, { panel_kind: "entity", panel_entity_id: entity.id, panel_image_id: null });
    else setDisplay({ panel_kind: null }, { panel_kind: null, panel_entity_id: null, panel_image_id: null });
  }

  function showImage(image: OracleImage) {
    setDisplay({ panel_kind: "image", panel_id: image.id }, { panel_kind: "image", panel_image_id: image.id, panel_entity_id: null });
  }

  function toggleBlank() {
    setDisplay({ blank: !campaign.display_blank }, { display_blank: !campaign.display_blank });
  }

  function pictureAdded(image: OracleImage) {
    setImages((list) => (list.some((entry) => entry.id === image.id) ? list : [...list, image]));
    const entity = picker?.entityId ? entities.find((entry) => entry.id === picker.entityId) : null;
    if (entity) saveEntity(entity, { image_id: image.id }, "Couldn't attach the picture");
  }

  // -------------------------------------------------------------------------------------------
  // SESSIONS
  // -------------------------------------------------------------------------------------------

  async function goLive(session: OracleSession) {
    const previous = campaign;
    setCampaign({ ...campaign, current_session_id: session.id });
    setIsSessionsOpen(false);
    try {
      setCampaign(await api<OracleCampaign>(base, "PUT", { current_session_id: session.id }));
      fillBanner();
    } catch (error) {
      setCampaign(previous);
      toast.error(errorMessage(error, "Couldn't switch sessions"));
      fillBanner();
    }
  }

  async function toggleSessionDone(session: OracleSession) {
    const previous = sessions;
    setSessions((list) => list.map((entry) => (entry.id === session.id ? { ...entry, is_done: !session.is_done } : entry)));
    try {
      await api(`${base}/sessions/${session.id}`, "PUT", { is_done: !session.is_done });
    } catch (error) {
      setSessions(previous);
      toast.error(errorMessage(error, "Couldn't update the session"));
    }
  }

  async function addSession(title: string) {
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    setSessions((list) => [...list, { id: tempId, title, session_date: null, notes: "", recap: "", is_done: false, ts_created: new Date().toISOString() }]);
    try {
      const saved = await api<OracleSession>(`${base}/sessions`, "POST", { title });
      setSessions((list) => list.map((session) => (session.id === tempId ? saved : session)));
    } catch (error) {
      setSessions((list) => list.filter((session) => session.id !== tempId));
      toast.error(errorMessage(error, "Couldn't add the session"));
    }
  }

  async function deleteSession(session: OracleSession) {
    if (!(await confirm({ title: `Delete "${session.title}"?`, message: "Its notes and recap are removed. Log entries keep its name.", confirmLabel: "Delete", danger: true }))) return;
    const previousSessions = sessions;
    const previousCampaign = campaign;
    setSessions((list) => list.filter((entry) => entry.id !== session.id));
    if (campaign.current_session_id === session.id) setCampaign({ ...campaign, current_session_id: null });
    try {
      await api(`${base}/sessions/${session.id}`, "DELETE");
    } catch (error) {
      setSessions(previousSessions);
      setCampaign(previousCampaign);
      toast.error(errorMessage(error, "Couldn't delete the session"));
    }
  }

  // -------------------------------------------------------------------------------------------
  // IDEAS BANNER
  // -------------------------------------------------------------------------------------------

  // Merge the server's banner into what is on screen without reordering it: items still present
  // stay where they are, items the server no longer has leave, new ones join at the end.
  const mergeBanner = useCallback((state: ChipBarState) => {
    setChips((current) => {
      const incoming = new Map(state.chips.map((chip) => [chip.id, chip]));
      const kept = current.filter((chip) => incoming.has(chip.id)).map((chip) => incoming.get(chip.id) as OracleChip);
      const keptIds = new Set(kept.map((chip) => chip.id));
      return [...kept, ...state.chips.filter((chip) => !keptIds.has(chip.id))];
    });
    setIsPreparing(state.generating);
    if (state.error) toast.error(state.error);
  }, []);

  const fillBanner = useCallback(async () => {
    try {
      mergeBanner(await api<ChipBarState>(`${base}/chips`, "POST", { action: "fill" }));
    } catch {
      // The banner is a convenience; a failed top-up is retried by the next poll.
    }
  }, [base, mergeBanner]);

  // Top the banner up on arrival, and keep checking while a batch is being prepared (that is the
  // only way new items reach the page).
  const isPaused = campaign.chips_paused;
  useEffect(() => {
    if (isPaused) return;
    fillBanner();
  }, [fillBanner, isPaused]);
  useEffect(() => {
    if (!isPreparing || isPaused) return;
    const timer = setInterval(fillBanner, 4000);
    return () => clearInterval(timer);
  }, [isPreparing, isPaused, fillBanner]);

  // An item scrolled off the left edge: it goes to the back of the banner and comes round again.
  const recycleChip = useCallback(
    async (chipId: string) => {
      setChips((list) => {
        const chip = list.find((entry) => entry.id === chipId);
        return chip ? [...list.filter((entry) => entry.id !== chipId), chip] : list;
      });
      try {
        mergeBanner(await api<ChipBarState>(`${base}/chips`, "POST", { action: "recycle", chip_id: chipId }));
      } catch {
        // Best effort: the item has already moved on screen, and the next poll reconciles order.
      }
    },
    [base, mergeBanner]
  );

  async function removeChip(chip: OracleChip) {
    setChips((list) => list.filter((entry) => entry.id !== chip.id));
    try {
      await api(`${base}/chips/${chip.id}`, "DELETE");
    } catch {
      // Already gone from the screen; the server copy will scroll away on its own.
    }
    fillBanner();
  }

  async function pinChip(chip: OracleChip, isPinned: boolean) {
    const previous = chips;
    setChips((list) => list.map((entry) => (entry.id === chip.id ? { ...entry, is_pinned: isPinned } : entry)));
    setOpenChip((current) => (current?.id === chip.id ? { ...current, is_pinned: isPinned } : current));
    try {
      await api(`${base}/chips/${chip.id}`, "PUT", { is_pinned: isPinned });
    } catch (error) {
      setChips(previous);
      toast.error(errorMessage(error, "Couldn't pin that"));
    }
  }

  async function togglePause() {
    const previous = campaign;
    setCampaign({ ...campaign, chips_paused: !campaign.chips_paused });
    try {
      await api(base, "PUT", { chips_paused: !campaign.chips_paused });
    } catch (error) {
      setCampaign(previous);
      toast.error(errorMessage(error, "Couldn't change the banner"));
    }
  }

  // Choosing an answer writes it to the log, so what was improvised is on record.
  // A banner answer goes in the log. When the answer brings creatures with it, they also become
  // real entities and the Table goes straight into placing them, so choosing an encounter sets up
  // the fight rather than only recording that it happened.
  async function chooseOption(option: ChipOption, title: string) {
    addNote(null, `${title}: ${option.text}`.slice(0, 1000));
    const chip = openChip;
    setOpenChip(null);
    const lines = option.encounter ?? [];
    if (lines.length > 0) await buildEncounter(lines);
    if (chip) removeChip(chip);
  }

  // The library's own stat block for a creature the library knows, otherwise one built from the
  // challenge-rating table — the same fallback the encounter builder uses.
  async function encounterStats(line: { name: string; cr: string }): Promise<Pick<EntityDraft, "stats" | "source" | "details">> {
    try {
      const found = await api<{ creatures: LibraryCreature[] }>(`/modules/oracle/api/creatures?q=${encodeURIComponent(line.name)}`);
      const wanted = line.name.trim().toLowerCase();
      const match = found.creatures.find((creature) => creature.name.toLowerCase() === wanted);
      if (match?.stats) return { stats: match.stats, source: match.official_source ?? null, details: match.details ?? "" };
    } catch {
      // The library is a convenience here; the challenge-rating table always works.
    }
    const row = findChallengeRow(normalizeCr(line.cr) ?? line.cr);
    return { stats: row ? statBlockFromChallenge(row) : null, source: "Challenge rating table", details: "" };
  }

  // Create one hostile creature per head, off the map, then queue them all for placing.
  async function buildEncounter(lines: NonNullable<ChipOption["encounter"]>) {
    if (isBuilding) return;
    setIsBuilding(true);
    const made: OracleEntity[] = [];
    try {
      for (const line of lines) {
        const block = await encounterStats(line);
        const count = Math.min(30, Math.max(1, Math.round(line.count)));
        for (let index = 0; index < count; index += 1) {
          const id = generateUUID().toLowerCase();
          made.push(
            await api<OracleEntity>(`${base}/entities`, "POST", {
              id,
              kind: "creature",
              name: count > 1 ? `${line.name} ${index + 1}` : line.name,
              attitude: "hostile",
              dm_notes: "",
              ...block,
              map_id: null,
              map_x: null,
              map_y: null,
            })
          );
        }
      }
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add the creatures"));
    } finally {
      setIsBuilding(false);
    }
    if (made.length === 0) return;
    setEntities((list) => [...list, ...made.filter((entity) => !list.some((entry) => entry.id === entity.id))]);
    setSelectedId(made[0].id);
    api<OracleEvent[]>(`${base}/events`).then(setEvents).catch(() => undefined);
    if (!activeMap) {
      setMobileTab("details");
      return;
    }
    setPlacingId(made[0].id);
    setPlacingQueue(made.slice(1).map((entity) => entity.id));
    setTool("place");
    setMobileTab("map");
  }

  // A banner picture becomes a creature, person, location or item. It arrives off the map and the
  // Table goes straight into placing it, so the next tap on the map puts it where it belongs.
  async function adopt(chip: OracleChip, kind: EntityKind, name: string, show: boolean) {
    if (isAdopting) return;
    setIsAdopting(true);
    try {
      const result = await api<{ entity: OracleEntity; image: OracleImage }>(`${base}/chips/${chip.id}/adopt`, "POST", { kind, name, show });
      setChips((list) => list.filter((entry) => entry.id !== chip.id));
      setImages((list) => (list.some((image) => image.id === result.image.id) ? list : [...list, result.image]));
      setEntities((list) => (list.some((entity) => entity.id === result.entity.id) ? list : [...list, result.entity]));
      if (show) setCampaign((current) => ({ ...current, panel_kind: "entity", panel_entity_id: result.entity.id, panel_image_id: null }));
      setSelectedId(result.entity.id);
      setAdoptChip(null);
      if (activeMap) {
        setPlacingId(result.entity.id);
        setTool("place");
        setMobileTab("map");
      } else {
        setMobileTab("details");
      }
      // The log gained a line on the server; pick it up without disturbing anything else.
      api<OracleEvent[]>(`${base}/events`).then(setEvents).catch(() => undefined);
      fillBanner();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add it"));
      // A failed adopt may have used the item up; resync the banner.
      fillBanner();
    } finally {
      setIsAdopting(false);
    }
  }

  // Placing ends with a press anywhere off the map (the toolbar stays live for its own controls).
  const isPlacing = placingId !== null || tool === "place";
  useEffect(() => {
    if (!isPlacing) return;
    const onPress = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".orc-map, .orc-toolbar, .orc-context")) return;
      stopPlacing();
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [isPlacing]);

  // -------------------------------------------------------------------------------------------
  // KEYBOARD
  // -------------------------------------------------------------------------------------------

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey || isOverlayOpen) return;
      const key = event.key.toLowerCase();
      const hit = TOOLS.find((entry) => entry.hotkey === key);
      if (hit) {
        setTool(hit.key);
        setPlacingId(null);
      } else if (key === "[" || key === "]") {
        // Brush size: [ and ] step by 10, with Shift by 2.
        setBrushRadius((current) => Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, current + (key === "]" ? 1 : -1) * (event.shiftKey ? 2 : 10))));
      } else if (key === "s") {
        setIsSessionsOpen(true);
      } else if (key === "/") {
        event.preventDefault();
        setMobileTab("details");
        document.getElementById("orc-details-search")?.focus();
      } else if (key === "escape") {
        stopPlacing();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOverlayOpen]);

  // The sliders live in the map's action bar.
  const barExtras = activeMap ? (
    <>
      {(tool === "reveal" || tool === "hide") && (
        <label className="orc-bar-slider orc-brush" title="Brush size ( [ and ] to change, Shift for fine steps )">
          <span className="orc-label">Brush</span>
          <input type="range" min={BRUSH_MIN} max={BRUSH_MAX} step={BRUSH_STEP} value={brushRadius} aria-label="Brush size" onChange={(event) => changeBrush(Number(event.target.value))} />
          <RangeValue value={brushRadius} min={BRUSH_MIN} max={BRUSH_MAX} label="Brush size" onCommit={changeBrush} />
        </label>
      )}
      <div className="orc-bar-slider orc-vision" title="How far the party sees">
        <span className="orc-label">Vision</span>
        <input
          type="range"
          min={VISION_MIN}
          max={VISION_SLIDER_MAX}
          step={VISION_STEP}
          value={Math.min(VISION_SLIDER_MAX, visionShown)}
          aria-label="Vision radius"
          onChange={(event) => setVisionDraft(Number(event.target.value))}
          onPointerUp={commitVision}
          onKeyUp={commitVision}
          onBlur={commitVision}
        />
        <RangeValue value={Math.round(visionShown)} min={VISION_MIN} max={VISION_MAX} label="Vision radius" onCommit={changeVision} />
      </div>
      {activeMap.background_image_id && (
        <div className="orc-bar-slider orc-vision" title="How strongly the map's background shows on this screen">
          <span className="orc-label">Background</span>
          <input type="range" min={0} max={100} value={Math.round(pictureOpacity * 100)} aria-label="Background opacity" onChange={(event) => changePictureOpacity(Number(event.target.value) / 100)} />
          <RangeValue value={Math.round(pictureOpacity * 100)} min={0} max={100} suffix="%" label="Background opacity" onCommit={(value) => changePictureOpacity(value / 100)} />
        </div>
      )}
    </>
  ) : null;

  if (isFirstPictureLoading) return <RouteLoading />;

  return (
    // PAGE — a locked full-height shell: only the panes inside scroll
    <div className="page page-with-bottom-bar orc-shell">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* SESSION BAR */}
      <SessionBar
        campaignId={campaignId}
        campaignName={campaign.name}
        active="table"
        help={TABLE_HELP}
        sessionLabel={currentSession ? currentSession.title : "No live session"}
        onOpenSessions={() => setIsSessionsOpen(true)}
        displayControl={
          <DisplayMenu
            campaignId={campaignId}
            displayCode={campaign.display_code}
            label={displayLabel}
            isBlank={campaign.display_blank}
            images={images}
            panelEntity={panelEntity}
            panelImageId={panelImage?.id ?? null}
            onShowImage={showImage}
            onClear={() => showEntity(null)}
            onAddPicture={() => setPicker({ entityId: null, subject: "", detail: "" })}
          />
        }
        isBlank={campaign.display_blank}
        onToggleBlank={toggleBlank}
      />

      {/* MAIN AREA */}
      <div className="orc-main" data-mobile-tab={mobileTab}>

        {/* MAP COLUMN */}
        <section className="orc-map-column" aria-label="Map">

          {/* MAP */}
          <div className="orc-map-frame">

            {/* MAP SWITCHER — on the map's top left rather than a strip above it, so the map has
                the whole column to grow into. */}
            <div className="orc-map-switch orc-map-switch-float" ref={mapSwitchRef}>
              <button type="button" id="orc-map-switch" className="orc-map-switch-button" aria-expanded={isMapListOpen} aria-haspopup="listbox" title="Change map" onClick={() => setIsMapListOpen((open) => !open)}>
                <span className="orc-map-name">{activeMap?.name ?? "No map"}</span>
                <ChevronDown className="w-4 h-4" aria-hidden />
              </button>
              {isMapListOpen && (
                <>
                  <div className="orc-map-switch-backdrop" onClick={() => setIsMapListOpen(false)} />
                  <div className="orc-map-switch-list" role="listbox" aria-label="Maps" style={mapListStyle}>
                    {/* A disabled map is left out, unless it is the one on the table now. */}
                    {maps.filter((map) => !map.data.disabled || map.id === activeMap?.id).map((map) => (
                      <button key={map.id} type="button" role="option" aria-selected={map.id === activeMap?.id} className="orc-map-switch-item" onClick={() => { setIsMapListOpen(false); if (map.id !== activeMap?.id) switchMap(map.id); }}>
                        <span>{map.name}</span>
                        {map.id === activeMap?.id && <span className="orc-map-switch-check" aria-hidden />}
                      </button>
                    ))}
                    <TabLink campaignId={campaignId} tab="prep" className="orc-map-switch-item orc-map-switch-manage">Add or edit maps</TabLink>
                  </div>
                </>
              )}
            </div>

            {/* STOP PAINTING — the brush cursor already says which tool is in hand, so this is
                only the way out of it. Top right, where the DM's map has nothing: its own
                controls sit along the bottom. */}
            {(tool === "reveal" || tool === "hide") && (
              <button
                type="button"
                className="orc-paint-stop"
                onClick={() => setTool("move")}
                title={`Stop ${tool === "reveal" ? "revealing" : "hiding"} (Esc or right-click)`}
                aria-label={`Stop ${tool === "reveal" ? "revealing" : "hiding"}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* WAITING TO BE PLACED — which creature the next tap puts down, and how many follow.
                An encounter chosen on the banner queues all of its creatures at once. */}
            {placingId && (
              <div className="orc-place-waiting">
                <span className="orc-place-waiting-name">{entities.find((entry) => entry.id === placingId)?.name ?? "Placing"}</span>
                {placingQueue.length > 0 && <span className="orc-place-waiting-rest">+{placingQueue.length}</span>}
                <button type="button" onClick={stopPlacing} title="Stop placing (Esc or right-click)" aria-label="Stop placing">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}



            {activeMap ? (
              <MapCanvas
                data={activeMap.data}
                partyX={activeMap.party_x}
                partyY={activeMap.party_y}
                visionRadius={visionShown}
                explored={activeMap.explored}
                tokens={tokens}
                members={apartGroups}
                companions={companions.map((entity) => ({ id: entity.id, name: entity.name, kind: entity.kind, imageUrl: entity.image_id ? `${base}/images/${entity.image_id}?w=160` : null, groupId: entity.party_group_id }))}
                backgroundUrl={activeMap.background_image_id ? `${base}/images/${activeMap.background_image_id}?w=1600` : null}
                pictureOpacity={pictureOpacity}
                barExtras={barExtras}
                mode="dm"
                tool={tool}
                brushRadius={brushRadius}
                selectedId={selectedId}
                shownId={panelEntity?.id ?? null}
                onPartyDrop={moveParty}
                onPartySelect={() => setIsPartyOpen((open) => !open)}
                onGroundClick={openLocationAt}
                focus={focus}
                onMemberDrop={moveGroup}
                onBrush={brush}
                onBrushEnd={() => scheduleMapSave(activeMap.id)}
                onPlace={placeAt}
                onCancelTool={stopPlacing}
                onGroundContext={(x, y, clientX, clientY) => setGroundMenu({ x, y, clientX, clientY })}
                linkedFeatures={linkedFeatures}
                onFeatureSelect={openFeature}
                onFeatureLabelMove={moveFeatureLabel}
                onTokenContext={(id, x, y) => setMenu({ id, x, y })}
                onTokenSelect={(id) => {
                  setSelectedId(id);
                  setMobileTab("details");
                }}
                onTokenDrop={(id, x, y) => {
                  const entity = entities.find((entry) => entry.id === id);
                  if (entity && !entity.id.startsWith("tmp-")) saveEntity(entity, { map_x: Math.round(x), map_y: Math.round(y) }, "Couldn't move it");
                }}
              />
            ) : (

              /* NO MAP PLACEHOLDER */
              <div className="empty-state">
                <p className="empty-state-title">No map</p>
                <p className="empty-state-body"><TabLink campaignId={campaignId} tab="prep" className="orc-inline-link">Make one on the Prep tab.</TabLink></p>
              </div>
            )}

            {/* PARTY POPOVER — who is with the token and who stands apart */}
            {isPartyOpen && activeMap && (
              <PartyPanel campaignId={campaignId} party={party} groups={partyGroups} onCreateGroup={createGroup} onRenameGroup={renameGroup} onDisbandGroup={disbandGroup} onMoveMember={moveMemberTo} companions={companions} onMoveCompanion={moveCompanionTo} onSelectCompanion={(entity) => { setSelectedId(entity.id); setMobileTab("details"); }} onClose={() => setIsPartyOpen(false)} />
            )}

          </div>
        </section>

        {/* DETAILS COLUMN */}
        <section className="orc-details-column" aria-label="Details">
          <DetailsPanel
            campaignId={campaignId}
            entities={entities}
            events={events}
            selected={selected}
            activeMapId={activeMap?.id ?? null}
            partyX={activeMap?.party_x ?? null}
            partyY={activeMap?.party_y ?? null}
            panelEntityId={panelEntity?.id ?? null}
            isVisibleToPlayers={
              !!(selected && activeMap && selected.map_id === activeMap.id && selected.map_x !== null && selected.map_y !== null &&
                isVisibleFrom(visionPoints(activeMap, partyGroups, [...party, ...companions.map((entry) => ({ group_id: entry.party_group_id }))]), activeMap.vision_radius, selected.map_x, selected.map_y))
            }
            isPlacing={!!selected && placingId === selected.id}
            onSelect={setSelectedId}
            onCreate={() => setEntityModal({ entity: null, kind: "creature", at: null })}
            onEdit={(entity) => setEntityModal({ entity, kind: entity.kind, at: null })}
            onDelete={deleteEntity}
            onShow={showEntity}
            onSetVisibility={setVisibility}
            onToggleDown={toggleDown}
            onJoinParty={joinParty}
            onLeaveParty={leaveParty}
            partyGroups={partyGroups}
            onStats={(entity, stats: StatBlock) => saveEntity(entity, { stats }, "Couldn't save the stats")}
            onAddNote={addNote}
            onReveal={revealFact}
            onRemoveFact={removeFact}
            onPicture={(entity) => setPicker({ entityId: entity.id, subject: entity.name, detail: [entity.kind, entity.attitude, entity.details].filter(Boolean).join(". "), kind: entity.kind })}
            onPlace={(entity) => {
              setPlacingId(entity.id);
              setTool("place");
              setMobileTab("map");
            }}
            onUnplace={(entity) => saveEntity(entity, { map_id: null, map_x: null, map_y: null }, "Couldn't take it off the map")}
            onZoomTo={(entity) => {
              if (entity.map_x === null || entity.map_y === null) return;
              setFocus({ x: entity.map_x, y: entity.map_y, nonce: Date.now() });
              setMobileTab("map");
            }}
          />
        </section>
      </div>

      {/* ASSIST AREA — the ideas banner */}
      <div className="orc-assist">

        {/* IDEAS BANNER */}
        <Ticker
          partyLevels={party.map((member) => member.level)}
          chips={chips}
          secondsPerChip={snapshot.settings.chip_seconds}
          isPaused={isPaused || isOverlayOpen}
          isPreparing={isPreparing}
          onTogglePause={togglePause}
          onOpen={(chip) => (chip.content.type === "image" ? setAdoptChip(chip) : setOpenChip(chip))}
          onPin={pinChip}
          onRecycle={recycleChip}
          onDiscard={(chipId) => {
            const chip = chips.find((entry) => entry.id === chipId);
            if (chip) removeChip(chip);
          }}
        />
      </div>

      {/* MOBILE TABS — below 1024px the map and the details share the screen one at a time */}
      <nav className="orc-mobile-tabs" aria-label="Table sections">
        <button type="button" className="orc-mobile-tab" data-active={mobileTab === "map" ? "true" : undefined} onClick={() => setMobileTab("map")}>
          <Move className="w-5 h-5" aria-hidden />
          <span>Map</span>
        </button>
        <button type="button" className="orc-mobile-tab" data-active={mobileTab === "details" ? "true" : undefined} onClick={() => setMobileTab("details")}>
          <Search className="w-5 h-5" aria-hidden />
          <span>Details</span>
        </button>
        <button type="button" className="orc-mobile-tab" onClick={() => setIsSessionsOpen(true)}>
          <PanelLeft className="w-5 h-5" aria-hidden />
          <span>Sessions</span>
        </button>
      </nav>

      {/* SESSIONS DRAWER */}
      {isSessionsOpen && (
        <div className="orc-drawer-backdrop" onClick={() => setIsSessionsOpen(false)}>
          <aside className="orc-drawer" aria-label="Sessions" onClick={(event) => event.stopPropagation()}>

            {/* DRAWER HEADER */}
            <div className="orc-drawer-head">
              <h2 className="text-card-title">Sessions</h2>
              <Button className="btn-link" onClick={() => setIsSessionsOpen(false)} aria-label="Close the session list" title="Close">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* DRAWER BODY */}
            <div className="orc-drawer-body">
              <SessionsPanel campaignId={campaignId} sessions={sessions} currentSessionId={campaign.current_session_id} onGoLive={goLive} onToggleDone={toggleSessionDone} onAdd={addSession} onDelete={deleteSession} />
            </div>
          </aside>
        </div>
      )}

      {/* IDEA MODAL */}
      <ResultModal
        partyLevels={party.map((member) => member.level)}
        content={openChip && openChip.content.type === "text" ? openChip.content : null}
        pinState={openChip ? openChip.is_pinned : null}
        onPin={(isPinned) => openChip && pinChip(openChip, isPinned)}
        onDismiss={() => {
          if (openChip) removeChip(openChip);
          setOpenChip(null);
        }}
        onUse={chooseOption}
        onClose={() => setOpenChip(null)}
      />

      {/* PICTURE-TO-ENTRY MODAL */}
      <AdoptModal chip={adoptChip} isBusy={isAdopting} onAdopt={adopt} onDismiss={(chip) => { removeChip(chip); setAdoptChip(null); }} onClose={() => setAdoptChip(null)} />

      {/* ENTRY MODAL */}
      <EntityModal isOpen={!!entityModal} entity={entityModal?.entity ?? null} defaultKind={entityModal?.kind} onSave={submitEntity} onClose={() => setEntityModal(null)} onWrite={(request) => api<EntityWriteUp>(`${base}/entities/draft`, "POST", request)} />

      {/* PICTURE PICKER */}
      <ImagePicker isOpen={!!picker} campaignId={campaignId} sources={imageSources} subject={picker?.subject ?? ""} detail={picker?.detail ?? ""} kind={picker?.kind ?? null} onAdded={pictureAdded} onClose={() => setPicker(null)} />

      {/* GROUND MENU — right-click on bare ground */}
      {groundMenu && activeMap && (
        <ContextMenu
          x={groundMenu.clientX}
          y={groundMenu.clientY}
          onClose={() => setGroundMenu(null)}
          items={[
            { label: "Move party here", icon: <Move className="w-4 h-4" />, onSelect: () => { const cell = snapCell(groundMenu.x, groundMenu.y); moveParty(cell.x, cell.y, activeMap.party_x, activeMap.party_y); } },
            { label: "Paint reveal", icon: <Brush className="w-4 h-4" />, onSelect: () => setTool("reveal") },
            { label: "Paint hide", icon: <Eraser className="w-4 h-4" />, onSelect: () => setTool("hide") },
            // One way in: the dialog's own Type picker chooses between a creature, a person, a
            // location and an item, so two menu entries for it were two names for one thing.
            { label: "New entity here", icon: <Plus className="w-4 h-4" />, onSelect: () => { const cell = snapCell(groundMenu.x, groundMenu.y); setEntityModal({ entity: null, kind: "creature", at: cell }); } },
            { label: "Reset fog of war", icon: <CloudFog className="w-4 h-4" />, danger: true, onSelect: () => { void resetActiveMap("fog"); } },
            { label: "Reset map", icon: <RotateCcw className="w-4 h-4" />, danger: true, onSelect: () => { void resetActiveMap(); } },
          ]}
        />
      )}

      {/* ENTRY MENU — right-click on the map */}
      {menu && (() => {
        const entity = entities.find((entry) => entry.id === menu.id);
        if (!entity) return null;
        const placedHere = entity.map_id === activeMap?.id && entity.map_x !== null && entity.map_y !== null;
        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            items={[
              ...(entity.kind !== "place"
                ? [{
                    label: "Players see",
                    choices: ENTITY_VISIBILITIES.map((level) => ({ key: level, label: VISIBILITY_LABELS[level], icon: VISIBILITY_ICONS[level] })),
                    chosen: entity.visibility,
                    onChoose: (level: string) => setVisibility(entity, level as EntityVisibility),
                  }]
                : []),
              ...(entity.kind !== "place" ? [{ label: "Add to party", icon: <UserPlus className="w-4 h-4" />, onSelect: () => joinParty(entity) }] : []),
              ...(entity.kind === "creature" || entity.kind === "person" ? [{ label: entity.is_down ? "Bring back" : "Mark down", icon: entity.is_down ? <HeartPulse className="w-4 h-4" /> : <Skull className="w-4 h-4" />, onSelect: () => toggleDown(entity) }] : []),
              { label: panelEntity?.id === entity.id ? "Stop showing details" : "Show details to players", icon: <MonitorUp className="w-4 h-4" />, onSelect: () => showEntity(panelEntity?.id === entity.id ? null : entity) },
              ...(placedHere ? [{ label: "Zoom to", icon: <ZoomIn className="w-4 h-4" />, onSelect: () => setFocus({ x: entity.map_x as number, y: entity.map_y as number, nonce: Date.now() }) }] : []),
              { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => deleteEntity(entity) },
            ]}
          />
        );
      })()}

      {/* CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}
