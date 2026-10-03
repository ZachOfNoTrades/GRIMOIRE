"use client";

import { Brush, ChevronDown, CornerDownLeft, Eraser, Eye, EyeOff, MapPin, Move, MonitorUp, PanelLeft, Search, Trash2, Undo2, WandSparkles, X, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
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
import EntityModal, { type EntityDraft } from "../../../../components/EntityModal";
import ImagePicker, { type ImageSource } from "../../../../components/ImagePicker";
import MapCanvas, { type MapTool, type MapToken } from "../../../../components/MapCanvas";
import RangeValue from "../../../../components/RangeValue";
import ResultModal from "../../../../components/ResultModal";
import SessionsPanel from "../../../../components/SessionsPanel";
import SessionBar from "../../../../components/SessionBar";
import Ticker from "../../../../components/Ticker";
import { TABLE_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { BRUSH_DEFAULT, BRUSH_MAX, BRUSH_MIN, BRUSH_STEP, MAP_GRID, PROMPT_MAX, VISION_MAX, VISION_MIN, VISION_SLIDER_MAX, VISION_STEP } from "../../../../lib/constants";
import { addExplored, addExploredPath, eraseExplored, isVisibleFrom, visionPoints } from "../../../../lib/fog";
import type {
  ChipOption,
  EntityKind,
  Knowledge,
  KnowledgeTier,
  OracleCampaign,
  OracleChip,
  OracleEntity,
  OracleEvent,
  OraclePartyMember,
  OracleImage,
  OracleMap,
  OracleSession,
  StatBlock,
  TableSnapshot,
  TextChipContent,
} from "../../../../types/oracle";

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
// selected, what the players are shown, the ideas banner and the ask bar.
export default function TableClient({ snapshot, imageSources }: TableClientProps) {
  const campaignId = snapshot.campaign.id;
  const base = campaignApi(campaignId);
  const { confirm, confirmModal } = useConfirm();
  useAppHeight();

  // DATA — seeded from the server snapshot; nothing is refetched on mount
  const [campaign, setCampaign] = useState<OracleCampaign>(snapshot.campaign);
  const [sessions, setSessions] = useState<OracleSession[]>(snapshot.sessions);
  const [maps, setMaps] = useState<OracleMap[]>(snapshot.maps);
  const [entities, setEntities] = useState<OracleEntity[]>(snapshot.entities);
  const [images, setImages] = useState<OracleImage[]>(snapshot.images);
  const [chips, setChips] = useState<OracleChip[]>(snapshot.chips);
  const [events, setEvents] = useState<OracleEvent[]>(snapshot.events);
  const [party, setParty] = useState<OraclePartyMember[]>(snapshot.party);

  // INPUT
  const [question, setQuestion] = useState("");
  const [mapInstruction, setMapInstruction] = useState("");

  // STATE
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<MapTool>("move");
  const [brushRadius, setBrushRadius] = useState(BRUSH_DEFAULT);
  const [placingId, setPlacingId] = useState<string | null>(null); // an existing entry waiting for a tap on the map
  const [mobileTab, setMobileTab] = useState<"map" | "details">("map");
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [isPartyOpen, setIsPartyOpen] = useState(false); // the party popover over the map
  const [isMapListOpen, setIsMapListOpen] = useState(false); // the map switcher in the toolbar
  const mapSwitchRef = useRef<HTMLDivElement>(null);
  const mapListStyle = usePopoverStyle(mapSwitchRef, isMapListOpen, "left");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null); // right-click menu on an entry
  const [pictureOpacity, setPictureOpacity] = useState(1); // how strongly the map's picture shows on this screen
  const [focus, setFocus] = useState<{ x: number; y: number; nonce: number } | null>(null); // a Zoom to request
  const [entityModal, setEntityModal] = useState<{ entity: OracleEntity | null; kind: EntityKind; at: { x: number; y: number } | null } | null>(null);
  const [picker, setPicker] = useState<{ entityId: string | null; subject: string; detail: string } | null>(null);
  const [openChip, setOpenChip] = useState<OracleChip | null>(null);
  const [adoptChip, setAdoptChip] = useState<OracleChip | null>(null);
  const [isAdopting, setIsAdopting] = useState(false);
  const [answer, setAnswer] = useState<{ title: string; content: TextChipContent | null } | null>(null); // the ask bar's result
  const [isMapEditOpen, setIsMapEditOpen] = useState(false);
  const [isMapBusy, setIsMapBusy] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const activeMap = maps.find((map) => map.id === campaign.active_map_id) ?? maps[0] ?? null;
  const selected = entities.find((entity) => entity.id === selectedId) ?? null;
  const panelEntity = campaign.panel_kind === "entity" ? entities.find((entity) => entity.id === campaign.panel_entity_id) ?? null : null;
  const panelImage = campaign.panel_kind === "image" ? images.find((image) => image.id === campaign.panel_image_id) ?? null : null;
  const currentSession = sessions.find((session) => session.id === campaign.current_session_id) ?? null;
  const displayLabel = `Map${panelEntity ? ` + ${panelEntity.name}` : panelImage ? ` + ${panelImage.caption}` : ""}`;
  const isOverlayOpen = !!(openChip || adoptChip || answer || entityModal || picker || isMapEditOpen || isSessionsOpen);

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
    return placed.map((entity) => ({
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      attitude: entity.attitude,
      x: entity.map_x as number,
      y: entity.map_y as number,
      pin: entity.kind === "place" ? places.findIndex((place) => place.id === entity.id) + 1 : undefined,
      revealed: entity.is_revealed,
    }));
  }, [entities, activeMap]);

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
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't reload the campaign"));
    }
  }, [base]);

  // -------------------------------------------------------------------------------------------
  // MAP — party, fog and features
  // -------------------------------------------------------------------------------------------

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
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible" || saveTimerRef.current) return;
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
    const timer = setInterval(tick, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [campaign.display_code]);

  function moveParty(x: number, y: number, fromX: number, fromY: number) {
    if (!activeMap) return;
    patchMap(activeMap.id, (map) => ({ ...map, party_x: x, party_y: y, explored: addExploredPath(map.explored, fromX, fromY, x, y, map.vision_radius) }));
  }

  // PARTY MEMBERS — standing apart from the party token, or rejoined
  // -------------------------------------------------------------------------------------------

  // Members split off onto the active map.
  const apartMembers = useMemo(
    () => (activeMap ? party.filter((member) => member.map_id === activeMap.id && member.map_x !== null && member.map_y !== null).map((member) => ({ id: member.id, name: member.name, x: member.map_x as number, y: member.map_y as number })) : []),
    [party, activeMap]
  );

  async function saveMember(member: OraclePartyMember, patch: { map_id: string | null; map_x: number | null; map_y: number | null }, failure: string) {
    const previous = party;
    setParty((list) => list.map((entry) => (entry.id === member.id ? { ...entry, ...patch } : entry)));
    try {
      const saved = await api<OraclePartyMember>(`${base}/party/${member.id}`, "PUT", patch);
      setParty((list) => list.map((entry) => (entry.id === member.id ? saved : entry)));
    } catch (error) {
      setParty(previous);
      toast.error(errorMessage(error, failure));
    }
  }

  // A member is placed a step away from the party token, then dragged where it goes.
  function splitOff(member: OraclePartyMember) {
    if (!activeMap) return;
    const index = apartMembers.length;
    const offset = MAP_GRID * (1 + index);
    saveMember(member, { map_id: activeMap.id, map_x: Math.round(Math.min(activeMap.data.width - MAP_GRID / 2, activeMap.party_x + offset)), map_y: Math.round(activeMap.party_y) }, "Couldn't split the party");
  }

  function rejoin(member: OraclePartyMember) {
    saveMember(member, { map_id: null, map_x: null, map_y: null }, "Couldn't rejoin the party");
  }

  // Dragging a member onto the party token rejoins it; anywhere else moves it and reveals the path.
  function moveMember(id: string, x: number, y: number, fromX: number, fromY: number) {
    const member = party.find((entry) => entry.id === id);
    if (!member || !activeMap) return;
    if (Math.hypot(x - activeMap.party_x, y - activeMap.party_y) <= activeMap.vision_radius * 0.15 + 12) {
      rejoin(member);
      return;
    }
    patchMap(activeMap.id, (map) => ({ ...map, explored: addExploredPath(map.explored, fromX, fromY, x, y, map.vision_radius) }));
    saveMember(member, { map_id: activeMap.id, map_x: Math.round(x), map_y: Math.round(y) }, "Couldn't move the member");
  }

  function brush(x: number, y: number) {
    if (!activeMap) return;
    setMaps((previous) =>
      previous.map((map) =>
        map.id === activeMap.id ? { ...map, explored: tool === "hide" ? eraseExplored(map.explored, x, y, brushRadius) : addExplored(map.explored, x, y, brushRadius) } : map
      )
    );
  }

  function changeBrush(value: number) {
    setBrushRadius(Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, Math.round(value))));
  }

  function changeVision(value: number) {
    if (!activeMap) return;
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

  async function editMapWithAi() {
    const instruction = mapInstruction.trim();
    if (!activeMap || !instruction || isMapBusy) return;
    setIsMapBusy(true);
    try {
      const updated = await api<OracleMap>(`${base}/maps/${activeMap.id}/edit`, "POST", { instruction });
      setMaps((previous) => previous.map((map) => (map.id === updated.id ? updated : map)));
      setIsMapEditOpen(false);
      setMapInstruction("");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't change the map"));
    } finally {
      setIsMapBusy(false);
    }
  }

  async function undoMap() {
    if (!activeMap || isMapBusy) return;
    setIsMapBusy(true);
    try {
      const updated = await api<OracleMap>(`${base}/maps/${activeMap.id}/undo`, "POST");
      setMaps((previous) => previous.map((map) => (map.id === updated.id ? updated : map)));
    } catch (error) {
      toast.error(errorMessage(error, "Nothing to undo"));
    } finally {
      setIsMapBusy(false);
    }
  }

  // A tap on the map with the Pin tool: place the entry that is waiting, or start a new one there.
  // Placed entries snap to the center of the grid cell that was tapped.
  function placeAt(rawX: number, rawY: number) {
    if (!activeMap) return;
    const snap = (value: number, limit: number) => Math.min(limit - MAP_GRID / 2, Math.max(MAP_GRID / 2, Math.floor(value / MAP_GRID) * MAP_GRID + MAP_GRID / 2));
    const x = snap(rawX, activeMap.data.width);
    const y = snap(rawY, activeMap.data.height);
    if (placingId) {
      const entity = entities.find((entry) => entry.id === placingId);
      setPlacingId(null);
      setTool("move");
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
    const optimistic: OracleEntity = { id, ...draft, ...placement, image_id: null, is_revealed: false, knowledge: [] };
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
  function toggleRevealed(entity: OracleEntity) {
    saveEntity(entity, { is_revealed: !entity.is_revealed }, "Couldn't change what the players see");
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

  // Reveal a fact: it joins what the players know, and the entry goes on the display's panel so
  // they actually see it.
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
      if (campaign.panel_entity_id !== entity.id) showEntity(entity);
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
  function chooseOption(option: ChipOption, title: string) {
    addNote(null, `${title}: ${option.text}`.slice(0, 1000));
    if (openChip) removeChip(openChip);
    setOpenChip(null);
    setAnswer(null);
  }

  // A banner picture becomes a creature, person or location. It arrives off the map and the
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

  // -------------------------------------------------------------------------------------------
  // ASK BAR
  // -------------------------------------------------------------------------------------------

  async function ask() {
    const query = question.trim();
    if (!query || answer) return;
    setAnswer({ title: query, content: null });
    try {
      const content = await api<TextChipContent>(`${base}/ask`, "POST", { query, entity_id: selected && !selected.id.startsWith("tmp-") ? selected.id : null });
      // A closed modal means the DM moved on; drop the late answer instead of popping it open.
      setAnswer((current) => (current && current.title === query ? { title: content.title, content } : current));
      setQuestion("");
    } catch (error) {
      setAnswer(null);
      toast.error(errorMessage(error, "Couldn't answer that"));
    }
  }

  // Placing ends with a press anywhere off the map (the toolbar stays live for switching tools).
  const isPlacing = placingId !== null || tool === "place";
  useEffect(() => {
    if (!isPlacing) return;
    const onPress = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".orc-map, .orc-toolbar, .orc-context")) return;
      setPlacingId(null);
      setTool("move");
    };
    window.addEventListener("pointerdown", onPress, true);
    return () => window.removeEventListener("pointerdown", onPress, true);
  }, [isPlacing]);

  // -------------------------------------------------------------------------------------------
  // KEYBOARD
  // -------------------------------------------------------------------------------------------

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("orc-ask")?.focus();
        return;
      }
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
        setPlacingId(null);
        setTool("move");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOverlayOpen]);

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

          {/* MAP TOOLBAR */}
          <div className="orc-toolbar">

            {/* MAP NAME / SWITCHER */}
            <div className="orc-toolbar-group">

              {/* MAP SWITCHER — the active map's name; opens the list of maps */}
              <div className="orc-map-switch" ref={mapSwitchRef}>
                <button type="button" id="orc-map-switch" className="orc-map-switch-button" aria-expanded={isMapListOpen} aria-haspopup="listbox" title="Change map" onClick={() => setIsMapListOpen((open) => !open)}>
                  <span className="orc-map-name">{activeMap?.name ?? "No map"}</span>
                  <ChevronDown className="w-4 h-4" aria-hidden />
                </button>
                {isMapListOpen && (
                  <>
                    <div className="orc-map-switch-backdrop" onClick={() => setIsMapListOpen(false)} />
                    <div className="orc-map-switch-list" role="listbox" aria-label="Maps" style={mapListStyle}>
                      {maps.map((map) => (
                        <button key={map.id} type="button" role="option" aria-selected={map.id === activeMap?.id} className="orc-map-switch-item" onClick={() => { setIsMapListOpen(false); if (map.id !== activeMap?.id) switchMap(map.id); }}>
                          <span>{map.name}</span>
                          {map.id === activeMap?.id && <span className="orc-small text-secondary">on the table</span>}
                        </button>
                      ))}
                      <Link className="orc-map-switch-item orc-map-switch-manage" href={`/modules/oracle/ui/campaign/${campaignId}/prep`}>Add or edit maps</Link>
                    </div>
                  </>
                )}
              </div>

              {/* UNDO */}
              <Button className="btn-off" disabled={!activeMap?.can_undo || isMapBusy} onClick={undoMap} title="Undo the last map change" aria-label="Undo the last map change">
                <Undo2 className="w-4 h-4" /> <span className="hidden xl:inline">Undo</span>
              </Button>

              {/* EDIT WITH AI */}
              <Button className="btn-off" disabled={!activeMap || isMapBusy} onClick={() => setIsMapEditOpen(true)} title="Edit the map in words" aria-label="Edit the map in words">
                <WandSparkles className="w-4 h-4" /> <span className="hidden xl:inline">Edit with AI</span>
              </Button>
            </div>

            {/* TOOLS */}
            <div className="orc-toolbar-group" role="radiogroup" aria-label="Map tool">
              {TOOLS.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    role="radio"
                    aria-checked={tool === entry.key}
                    className="orc-tool"
                    title={`${entry.label} (${entry.hotkey.toUpperCase()})`}
                    aria-label={entry.label}
                    onClick={() => {
                      setTool(entry.key);
                      setPlacingId(null);
                    }}
                  >
                    <Icon className="w-4 h-4" aria-hidden />
                    <span className="orc-tool-label">{entry.label}</span>
                  </button>
                );
              })}
            </div>

            {/* SLIDERS — kept together so they wrap as one row when the toolbar is tight */}
            <div className="orc-toolbar-group orc-sliders">

            {/* BRUSH — only while a fog tool is active */}
            {activeMap && (tool === "reveal" || tool === "hide") && (
              <label className="orc-toolbar-group orc-vision orc-brush" title="Brush size ( [ and ] to change, Shift for fine steps )">
                <span className="orc-label">Brush</span>
                <input
                  type="range"
                  min={BRUSH_MIN}
                  max={BRUSH_MAX}
                  step={BRUSH_STEP}
                  value={brushRadius}
                  aria-label="Brush size"
                  onChange={(event) => changeBrush(Number(event.target.value))}
                />
                <span className="orc-range-value">{brushRadius}</span>
              </label>
            )}

            {/* VISION */}
            {activeMap && (
              <div className="orc-toolbar-group orc-vision" title="How far the party sees">
                <span className="orc-label">Vision</span>
                <input
                  type="range"
                  min={VISION_MIN}
                  max={VISION_SLIDER_MAX}
                  step={VISION_STEP}
                  value={Math.min(VISION_SLIDER_MAX, activeMap.vision_radius)}
                  aria-label="Vision radius"
                  onChange={(event) => changeVision(Number(event.target.value))}
                />
                <RangeValue value={Math.round(activeMap.vision_radius)} min={VISION_MIN} max={VISION_MAX} label="Vision radius" onCommit={changeVision} />
              </div>
            )}

            {/* PICTURE OPACITY — only while the map has a picture */}
            {activeMap?.background_image_id && (
              <div className="orc-toolbar-group orc-vision" title="How strongly the map's picture shows on this screen">
                <span className="orc-label">Picture</span>
                <input type="range" min={0} max={100} value={Math.round(pictureOpacity * 100)} aria-label="Picture opacity" onChange={(event) => changePictureOpacity(Number(event.target.value) / 100)} />
                <RangeValue value={Math.round(pictureOpacity * 100)} min={0} max={100} suffix="%" label="Picture opacity" onCommit={(value) => changePictureOpacity(value / 100)} />
              </div>
            )}
            </div>
          </div>

          {/* MAP */}
          <div className="orc-map-frame">
            {activeMap ? (
              <MapCanvas
                data={activeMap.data}
                partyX={activeMap.party_x}
                partyY={activeMap.party_y}
                visionRadius={activeMap.vision_radius}
                explored={activeMap.explored}
                tokens={tokens}
                members={apartMembers}
                backgroundUrl={activeMap.background_image_id ? `${base}/images/${activeMap.background_image_id}` : null}
                pictureOpacity={pictureOpacity}
                mode="dm"
                tool={tool}
                brushRadius={brushRadius}
                selectedId={selectedId}
                shownId={panelEntity?.id ?? null}
                onPartyDrop={moveParty}
                onPartySelect={() => setIsPartyOpen((open) => !open)}
                focus={focus}
                onMemberDrop={moveMember}
                onBrush={brush}
                onBrushEnd={() => scheduleMapSave(activeMap.id)}
                onPlace={placeAt}
                onCancelPlace={() => { setPlacingId(null); setTool("move"); }}
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
                <p className="empty-state-body"><Link href={`/modules/oracle/ui/campaign/${campaignId}/prep`}>Make one on the Prep tab.</Link></p>
              </div>
            )}

            {/* PARTY POPOVER — who is with the token and who stands apart */}
            {isPartyOpen && activeMap && (
              <div className="orc-party-panel" role="dialog" aria-label="Party">
                <div className="orc-party-panel-head">
                  <span className="orc-label">Party</span>
                  <button type="button" className="orc-map-hint-cancel" aria-label="Close" onClick={() => setIsPartyOpen(false)}><X className="w-4 h-4" /></button>
                </div>
                {party.length === 0 && (
                  <p className="orc-small text-secondary"><Link href={`/modules/oracle/ui/campaign/${campaignId}/prep`}>Add the party on Prep</Link></p>
                )}
                {party.map((member) => {
                  const apart = member.map_id === activeMap.id && member.map_x !== null;
                  return (
                    <div key={member.id} className="orc-party-row" data-apart={apart ? "true" : undefined}>
                      <span className="orc-party-name">{member.name} <span className="orc-muted">· {member.level}</span></span>
                      <span className="orc-small text-secondary">{apart ? "Apart" : "With the party"}</span>
                      <Button className="btn-off" onClick={() => (apart ? rejoin(member) : splitOff(member))}>{apart ? "Rejoin" : "Split off"}</Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MAP LEGEND */}
            <div className="orc-legend" aria-hidden>
              <span className="orc-legend-item" data-zone="visible">In sight</span>
              <span className="orc-legend-item" data-zone="explored">Explored</span>
              <span className="orc-legend-item" data-zone="unexplored">Unexplored</span>
            </div>
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
            panelEntityId={panelEntity?.id ?? null}
            isVisibleToPlayers={
              !!(selected && activeMap && selected.map_id === activeMap.id && selected.map_x !== null && selected.map_y !== null &&
                isVisibleFrom(visionPoints(activeMap, party), activeMap.vision_radius, selected.map_x, selected.map_y))
            }
            isPlacing={!!selected && placingId === selected.id}
            onSelect={setSelectedId}
            onCreate={() => setEntityModal({ entity: null, kind: "creature", at: null })}
            onEdit={(entity) => setEntityModal({ entity, kind: entity.kind, at: null })}
            onDelete={deleteEntity}
            onShow={showEntity}
            onStats={(entity, stats: StatBlock) => saveEntity(entity, { stats }, "Couldn't save the stats")}
            onAddNote={addNote}
            onReveal={revealFact}
            onRemoveFact={removeFact}
            onPicture={(entity) => setPicker({ entityId: entity.id, subject: entity.name, detail: [entity.kind, entity.attitude, entity.details].filter(Boolean).join(". ") })}
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

      {/* ASSIST AREA — the ideas banner and the ask bar */}
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

        {/* ASK BAR */}
        <div className="orc-ask">
          <div className="input-with-icon orc-grow">
            <Search className="input-with-icon-leading w-4 h-4" aria-hidden />

            {/* ASK FIELD — not autofocused: it is always on screen and focusing it on load would
                raise the phone keyboard over the map. Ctrl+K focuses it. */}
            <input
              id="orc-ask"
              className="input-field"
              value={question}
              maxLength={PROMPT_MAX}
              placeholder={selected ? `Ask anything about ${selected.name}, or the session` : "Ask for anything: a name, loot, a rule, what someone says"}
              aria-label="Ask for anything"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                  ask();
                }
              }}
            />
          </div>

          {/* ASK BUTTON */}
          <Button className="btn-blue" disabled={!question.trim() || !!answer} onClick={ask} title="Ask (Enter)" aria-label="Ask">
            <CornerDownLeft className="w-4 h-4" /> <span className="hidden sm:inline">Ask</span>
          </Button>
        </div>
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

      {/* ANSWER MODAL */}
      <ResultModal partyLevels={party.map((member) => member.level)} content={answer?.content ?? null} isLoading={!!answer && !answer.content} loadingTitle={answer?.title} onUse={chooseOption} onClose={() => setAnswer(null)} />

      {/* PICTURE-TO-ENTRY MODAL */}
      <AdoptModal chip={adoptChip} isBusy={isAdopting} onAdopt={adopt} onDismiss={(chip) => { removeChip(chip); setAdoptChip(null); }} onClose={() => setAdoptChip(null)} />

      {/* ENTRY MODAL */}
      <EntityModal isOpen={!!entityModal} entity={entityModal?.entity ?? null} defaultKind={entityModal?.kind} onSave={submitEntity} onClose={() => setEntityModal(null)} />

      {/* PICTURE PICKER */}
      <ImagePicker isOpen={!!picker} campaignId={campaignId} sources={imageSources} subject={picker?.subject ?? ""} detail={picker?.detail ?? ""} onAdded={pictureAdded} onClose={() => setPicker(null)} />

      {/* MAP EDIT MODAL */}
      <Modal
        isOpen={isMapEditOpen}
        onClose={() => setIsMapEditOpen(false)}
        disableClose={isMapBusy}
        title="Edit the map"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button className="btn-off" disabled={isMapBusy} onClick={() => setIsMapEditOpen(false)}>Cancel</Button>
            <Button className="btn-blue" disabled={isMapBusy || !mapInstruction.trim()} onClick={editMapWithAi}>
              <WandSparkles className="w-4 h-4" /> {isMapBusy ? "Changing…" : "Change the map"}
            </Button>
          </div>
        }
      >
        <div className="orc-form">

          {/* INSTRUCTION FIELD — autofocused: the modal exists to take this one instruction. */}
          <label className="orc-field">
            <span className="orc-field-label">What should change?</span>
            <input
              id="orc-map-instruction"
              className="input-field"
              autoFocus
              value={mapInstruction}
              maxLength={PROMPT_MAX}
              disabled={isMapBusy}
              placeholder="The village was sacked last night"
              onChange={(event) => setMapInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  editMapWithAi();
                }
              }}
            />
          </label>

        </div>
      </Modal>

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
              ...(entity.kind !== "place" ? [{ label: entity.is_revealed ? "Hide from players" : "Reveal to players", icon: entity.is_revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />, onSelect: () => toggleRevealed(entity) }] : []),
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
