"use client";

import { Brush, CornerDownLeft, Eraser, MapPin, Move, PanelLeft, Search, Undo2, WandSparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { useConfirm } from "@/lib/useConfirm";
import { generateUUID } from "@/lib/uuid";
import AdoptModal from "../../../../components/AdoptModal";
import DetailsPanel from "../../../../components/DetailsPanel";
import EntityModal, { type EntityDraft } from "../../../../components/EntityModal";
import ImagePicker, { type ImageSource } from "../../../../components/ImagePicker";
import MapCanvas, { type MapTool, type MapToken } from "../../../../components/MapCanvas";
import PanelTray from "../../../../components/PanelTray";
import ResultModal from "../../../../components/ResultModal";
import SessionsPanel from "../../../../components/SessionsPanel";
import SessionBar from "../../../../components/SessionBar";
import Ticker from "../../../../components/Ticker";
import { TABLE_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { BRUSH_DEFAULT, BRUSH_MAX, BRUSH_MIN, BRUSH_STEP, PROMPT_MAX, VISION_MAX, VISION_MIN, VISION_STEP } from "../../../../lib/constants";
import { addExplored, addExploredPath, eraseExplored, isVisible } from "../../../../lib/fog";
import type {
  ChipOption,
  EntityKind,
  Knowledge,
  KnowledgeTier,
  OracleCampaign,
  OracleChip,
  OracleEntity,
  OracleEvent,
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
  const [entityModal, setEntityModal] = useState<{ entity: OracleEntity | null; kind: EntityKind; at: { x: number; y: number } | null } | null>(null);
  const [picker, setPicker] = useState<{ entityId: string | null; subject: string } | null>(null);
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

  // Entries on the active map. Places become numbered pins, numbered in name order.
  const tokens: MapToken[] = useMemo(() => {
    if (!activeMap) return [];
    const placed = entities.filter((entity) => entity.map_id === activeMap.id && entity.map_x !== null && entity.map_y !== null);
    const places = placed.filter((entity) => entity.kind === "place").sort((a, b) => a.name.localeCompare(b.name));
    return placed.map((entity) => ({
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      attitude: entity.attitude,
      x: entity.map_x as number,
      y: entity.map_y as number,
      pin: entity.kind === "place" ? places.findIndex((place) => place.id === entity.id) + 1 : undefined,
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

  function moveParty(x: number, y: number, fromX: number, fromY: number) {
    if (!activeMap) return;
    patchMap(activeMap.id, (map) => ({ ...map, party_x: x, party_y: y, explored: addExploredPath(map.explored, fromX, fromY, x, y, map.vision_radius) }));
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
  function placeAt(x: number, y: number) {
    if (!activeMap) return;
    if (placingId) {
      const entity = entities.find((entry) => entry.id === placingId);
      setPlacingId(null);
      setTool("move");
      if (entity) saveEntity(entity, { map_id: activeMap.id, map_x: Math.round(x), map_y: Math.round(y) }, "Couldn't place it");
      return;
    }
    setEntityModal({ entity: null, kind: "place", at: { x: Math.round(x), y: Math.round(y) } });
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
    const optimistic: OracleEntity = { id, ...draft, ...placement, image_id: null, knowledge: [] };
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

  // A banner picture becomes a creature, person or location beside the party.
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
      setMobileTab("details");
      setAdoptChip(null);
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
        displayLabel={displayLabel}
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
              {maps.length > 1 ? (
                <select className="input-field orc-map-select" value={activeMap?.id ?? ""} aria-label="Active map" onChange={(event) => switchMap(event.target.value)}>
                  {maps.map((map) => (
                    <option key={map.id} value={map.id}>{map.name}</option>
                  ))}
                </select>
              ) : (
                <span className="orc-map-name">{activeMap?.name ?? "No map"}</span>
              )}

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
              <label className="orc-toolbar-group orc-vision" title="How far the party sees">
                <span className="orc-label">Vision</span>
                <input
                  type="range"
                  min={VISION_MIN}
                  max={VISION_MAX}
                  step={VISION_STEP}
                  value={activeMap.vision_radius}
                  aria-label="Vision radius"
                  onChange={(event) => changeVision(Number(event.target.value))}
                />
                <span className="orc-range-value">{activeMap.vision_radius}</span>
              </label>
            )}
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
                mode="dm"
                tool={tool}
                brushRadius={brushRadius}
                selectedId={selectedId}
                onPartyDrop={moveParty}
                onBrush={brush}
                onBrushEnd={() => scheduleMapSave(activeMap.id)}
                onPlace={placeAt}
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

            {/* PLACING HINT */}
            {(placingId || tool === "place") && (
              <div className="orc-map-hint">
                <MapPin className="w-4 h-4" aria-hidden />
                <span>{placingId ? `Tap the map to place ${entities.find((entry) => entry.id === placingId)?.name ?? "it"}` : "Tap the map to add an entry there"}</span>
                <button type="button" className="orc-map-hint-cancel" onClick={() => { setPlacingId(null); setTool("move"); }} aria-label="Cancel placing" title="Cancel">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* MAP LEGEND */}
            <div className="orc-legend" aria-hidden>
              <span className="orc-legend-item" data-zone="visible">In sight</span>
              <span className="orc-legend-item" data-zone="explored">Explored</span>
              <span className="orc-legend-item" data-zone="unexplored">Unexplored</span>
            </div>
          </div>

          {/* DISPLAY PANEL TRAY */}
          <PanelTray
            campaignId={campaignId}
            displayCode={campaign.display_code}
            images={images}
            panelEntity={panelEntity}
            panelImageId={panelImage?.id ?? null}
            onShowImage={showImage}
            onClear={() => showEntity(null)}
            onAddPicture={() => setPicker({ entityId: null, subject: "" })}
          />
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
                isVisible(activeMap.party_x, activeMap.party_y, activeMap.vision_radius, selected.map_x, selected.map_y))
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
            onPicture={(entity) => setPicker({ entityId: entity.id, subject: entity.name })}
            onPlace={(entity) => {
              setPlacingId(entity.id);
              setTool("place");
              setMobileTab("map");
            }}
            onUnplace={(entity) => saveEntity(entity, { map_id: null, map_x: null, map_y: null }, "Couldn't take it off the map")}
          />
        </section>
      </div>

      {/* ASSIST AREA — the ideas banner and the ask bar */}
      <div className="orc-assist">

        {/* IDEAS BANNER */}
        <Ticker
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
      <ResultModal content={answer?.content ?? null} isLoading={!!answer && !answer.content} loadingTitle={answer?.title} onUse={chooseOption} onClose={() => setAnswer(null)} />

      {/* PICTURE-TO-ENTRY MODAL */}
      <AdoptModal chip={adoptChip} isBusy={isAdopting} onAdopt={adopt} onDismiss={(chip) => { removeChip(chip); setAdoptChip(null); }} onClose={() => setAdoptChip(null)} />

      {/* ENTRY MODAL */}
      <EntityModal isOpen={!!entityModal} entity={entityModal?.entity ?? null} defaultKind={entityModal?.kind} onSave={submitEntity} onClose={() => setEntityModal(null)} />

      {/* PICTURE PICKER */}
      <ImagePicker isOpen={!!picker} campaignId={campaignId} sources={imageSources} subject={picker?.subject ?? ""} onAdded={pictureAdded} onClose={() => setPicker(null)} />

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

          {/* HINT */}
          <p className="orc-small text-secondary">The layout stays; what you describe changes. Undo puts the previous version back. This takes about ten seconds.</p>
        </div>
      </Modal>

      {/* CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}
