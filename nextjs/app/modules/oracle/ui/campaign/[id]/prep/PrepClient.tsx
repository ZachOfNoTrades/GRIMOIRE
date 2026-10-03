"use client";

import { BookOpen, CalendarDays, ChevronRight, Image as ImageIcon, Map as MapIcon, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { useConfirm } from "@/lib/useConfirm";
import ImagePicker, { type ImageSource } from "../../../../components/ImagePicker";
import SessionBar from "../../../../components/SessionBar";
import { PREP_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { NAME_MAX, PROMPT_MAX, SESSION_TITLE_MAX, WORLD_MAX } from "../../../../lib/constants";
import type { OracleCampaign, OracleImage, OracleMap, OracleSession, TableSnapshot } from "../../../../types/oracle";

interface PrepClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
}

// PREP — the campaign's world (its notes, maps and pictures) and the list of sessions. A session
// has its own page for notes, cast and recap.
export default function PrepClient({ snapshot, imageSources }: PrepClientProps) {
  const campaignId = snapshot.campaign.id;
  const base = campaignApi(campaignId);
  const { confirm, confirmModal } = useConfirm();
  useAppHeight();

  // DATA
  const [campaign, setCampaign] = useState<OracleCampaign>(snapshot.campaign);
  const [sessions, setSessions] = useState<OracleSession[]>(snapshot.sessions);
  const [maps, setMaps] = useState<OracleMap[]>(snapshot.maps);
  const [images, setImages] = useState<OracleImage[]>(snapshot.images);

  // INPUT
  const [world, setWorld] = useState(snapshot.campaign.world);
  const [sessionTitle, setSessionTitle] = useState("");
  const [mapName, setMapName] = useState("");
  const [mapPrompt, setMapPrompt] = useState("");

  // STATE
  const [isWritingWorld, setIsWritingWorld] = useState(false);
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [isCreatingMap, setIsCreatingMap] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // What the server last confirmed for the world notes, so a blur with no change saves nothing.
  const savedRef = useRef(snapshot.campaign.world);

  useEntityTitle(campaign.name);

  // The world notes save when focus leaves the box: there is nothing to review, and a Save
  // button would be one more thing to forget.
  async function saveWorld(value: string): Promise<boolean> {
    const trimmed = value.trim();
    if (trimmed === savedRef.current) return true;
    try {
      const saved = await api<OracleCampaign>(base, "PUT", { world: trimmed });
      savedRef.current = saved.world;
      setCampaign(saved);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the world notes"));
      return false;
    }
  }

  // Generate world notes from the name and whatever is in the box (a few words, or a draft to
  // improve). The result lands in the box and saves like typed text.
  async function writeWorld() {
    if (isWritingWorld) return;
    setIsWritingWorld(true);
    try {
      const result = await api<{ world: string }>(`${base}/world/generate`, "POST", { seed: world });
      setWorld(result.world);
      await saveWorld(result.world);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't write the world notes"));
    } finally {
      setIsWritingWorld(false);
    }
  }

  async function addSession() {
    const title = sessionTitle.trim();
    if (!title || isAddingSession) return;
    setIsAddingSession(true);
    try {
      const created = await api<OracleSession>(`${base}/sessions`, "POST", { title });
      setSessions((list) => [...list, created]);
      setSessionTitle("");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add the session"));
    } finally {
      setIsAddingSession(false);
    }
  }

  async function deleteSession(session: OracleSession) {
    if (!(await confirm({ title: `Delete "${session.title}"?`, message: "Its notes and recap are removed. Log entries keep its name.", confirmLabel: "Delete", danger: true }))) return;
    const previous = sessions;
    setSessions((list) => list.filter((entry) => entry.id !== session.id));
    try {
      await api(`${base}/sessions/${session.id}`, "DELETE");
      if (campaign.current_session_id === session.id) setCampaign({ ...campaign, current_session_id: null });
    } catch (error) {
      setSessions(previous);
      toast.error(errorMessage(error, "Couldn't delete the session"));
    }
  }

  async function createMap() {
    const name = mapName.trim();
    if (!name || isCreatingMap) return;
    setIsCreatingMap(true);
    try {
      const created = await api<OracleMap>(`${base}/maps`, "POST", { name, prompt: mapPrompt.trim() || undefined });
      setMaps((list) => [...list, created]);
      setMapName("");
      setMapPrompt("");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't create the map"));
    } finally {
      setIsCreatingMap(false);
    }
  }

  async function makeActive(map: OracleMap) {
    const previous = campaign;
    setCampaign({ ...campaign, active_map_id: map.id });
    try {
      setCampaign(await api<OracleCampaign>(base, "PUT", { active_map_id: map.id }));
    } catch (error) {
      setCampaign(previous);
      toast.error(errorMessage(error, "Couldn't switch maps"));
    }
  }

  async function deleteMap(map: OracleMap) {
    if (!(await confirm({ title: `Delete ${map.name}?`, message: "The map and its explored area are removed. Entries placed on it stay in the cast.", confirmLabel: "Delete", danger: true }))) return;
    const previousMaps = maps;
    setMaps((list) => list.filter((entry) => entry.id !== map.id));
    try {
      await api(`${base}/maps/${map.id}`, "DELETE");
      if (campaign.active_map_id === map.id) setCampaign(await api<TableSnapshot>(base).then((fresh) => fresh.campaign));
    } catch (error) {
      setMaps(previousMaps);
      toast.error(errorMessage(error, "Couldn't delete the map"));
    }
  }

  async function deleteImage(image: OracleImage) {
    if (!(await confirm({ title: `Delete ${image.caption}?`, message: "The picture is removed from the library and from anything that uses it.", confirmLabel: "Delete", danger: true }))) return;
    const previous = images;
    setImages((list) => list.filter((entry) => entry.id !== image.id));
    try {
      await api(`${base}/images/${image.id}`, "DELETE");
    } catch (error) {
      setImages(previous);
      toast.error(errorMessage(error, "Couldn't delete the picture"));
    }
  }

  return (
    // PAGE — a locked full-height shell with one scrolling body
    <div className="page page-with-bottom-bar orc-shell">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* SESSION BAR */}
      <SessionBar campaignId={campaignId} campaignName={campaign.name} active="prep" help={PREP_HELP} />

      {/* SCROLLING BODY */}
      <div className="orc-page-body">
        <div className="page-container">
          <div className="orc-columns" data-columns="3">

            {/* WORLD COLUMN */}
            <div className="orc-stack">

              {/* WORLD CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><BookOpen className="w-5 h-5" /> World</h2>
                </div>
                <div className="card-content orc-form">

                  {/* WORLD FIELD — not autofocused: the page has several starting points. */}
                  <textarea
                    id="orc-world"
                    className="input-field orc-textarea"
                    rows={12}
                    value={world}
                    maxLength={WORLD_MAX}
                    placeholder="Tone and setting in a few sentences: grim frontier, low magic, a failing crown…"
                    aria-label="World notes"
                    onChange={(event) => setWorld(event.target.value)}
                    onBlur={(event) => saveWorld(event.target.value)}
                  />

                  {/* WORLD ROW */}
                  <div className="orc-card-actions">
                    <span className="orc-small text-secondary">Every idea, fact and map is written to fit this. Saved when you leave the box.</span>
                    <Button className="btn-blue" disabled={isWritingWorld} onClick={writeWorld} title="Write world notes from the name and what is in the box">
                      <Sparkles className="w-4 h-4" /> {isWritingWorld ? "Writing…" : world.trim() ? "Rewrite" : "Generate"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* SESSIONS COLUMN */}
            <div className="orc-stack">

              {/* SESSIONS CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><CalendarDays className="w-5 h-5" /> Sessions</h2>
                </div>
                <div className="card-content orc-stack">

                  {/* EMPTY PLACEHOLDER */}
                  {sessions.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">No sessions yet</p>
                      <p className="empty-state-body">Name the first one below.</p>
                    </div>
                  )}

                  {/* SESSION ROWS — each opens the session's page */}
                  {sessions.map((session, index) => (
                    <div key={session.id} className="orc-gen-row" data-live={campaign.current_session_id === session.id ? "true" : undefined} data-done={session.is_done ? "true" : undefined}>
                      <Link href={`/modules/oracle/ui/campaign/${campaignId}/session/${session.id}`} className="orc-gen-body orc-session-link">
                        <span className="orc-gen-value">
                          {index + 1}. {session.title}
                          {campaign.current_session_id === session.id && <span className="badge badge-green">Live</span>}
                          {session.is_done && <span className="badge">Done</span>}
                        </span>
                        <span className="orc-small text-secondary">
                          {session.session_date ?? "No date"}{session.notes.trim() ? " · notes" : ""}{session.recap.trim() ? " · recap" : ""}
                        </span>
                      </Link>
                      <div className="orc-campaign-actions">
                        <Link href={`/modules/oracle/ui/campaign/${campaignId}/session/${session.id}`} className="btn btn-off" title="Open the session" aria-label={`Open session ${session.title}`}>
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                        <Button className="btn-link-red" onClick={() => deleteSession(session)} title="Delete session" aria-label={`Delete session ${session.title}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* ADD ROW */}
                  <div className="orc-note-row">
                    <input
                      id="orc-session-title"
                      className="input-field"
                      value={sessionTitle}
                      maxLength={SESSION_TITLE_MAX}
                      disabled={isAddingSession}
                      placeholder="New session, e.g. Session 3: the mill"
                      aria-label="New session title"
                      onChange={(event) => setSessionTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSession();
                        }
                      }}
                    />
                    <Button className="btn-off" disabled={isAddingSession || !sessionTitle.trim()} onClick={addSession} title="Add session" aria-label="Add session">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* MAPS AND PICTURES COLUMN */}
            <div className="orc-stack">

              {/* MAPS CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><MapIcon className="w-5 h-5" /> Maps</h2>
                </div>
                <div className="card-content orc-stack">

                  {/* MAP ROWS */}
                  {maps.map((map) => (
                    <div key={map.id} className="orc-gen-row">
                      <div className="orc-gen-body">
                        <span className="orc-gen-value">{map.name}</span>
                        <span className="orc-small text-secondary">{map.data.features.length} features{campaign.active_map_id === map.id ? " · on the table" : ""}</span>
                      </div>
                      <div className="orc-campaign-actions">
                        {campaign.active_map_id !== map.id && <Button className="btn-off" onClick={() => makeActive(map)}>Use</Button>}
                        <Button className="btn-link-red" disabled={maps.length <= 1} onClick={() => deleteMap(map)} title="Delete map" aria-label={`Delete map ${map.name}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* NEW MAP FORM */}
                  <div className="orc-form">
                    <span className="orc-label">New map</span>

                    {/* MAP NAME FIELD — not autofocused: one of several forms on the page. */}
                    <input
                      id="orc-map-name"
                      className="input-field"
                      value={mapName}
                      maxLength={NAME_MAX}
                      disabled={isCreatingMap}
                      placeholder="Name, e.g. Millbrook"
                      aria-label="New map name"
                      onChange={(event) => setMapName(event.target.value)}
                    />

                    {/* MAP DESCRIPTION FIELD */}
                    <textarea
                      id="orc-map-prompt"
                      className="input-field orc-textarea"
                      rows={3}
                      value={mapPrompt}
                      maxLength={PROMPT_MAX}
                      disabled={isCreatingMap}
                      placeholder="Describe it to have it drawn: a small palisaded river village with an inn, a chapel and a mill. Leave empty for a blank map."
                      aria-label="New map description"
                      onChange={(event) => setMapPrompt(event.target.value)}
                    />

                    {/* CREATE MAP BUTTON */}
                    <Button className="btn-blue" disabled={isCreatingMap || !mapName.trim()} onClick={createMap}>
                      <Plus className="w-4 h-4" /> {isCreatingMap ? (mapPrompt.trim() ? "Drawing the map…" : "Creating…") : mapPrompt.trim() ? "Draw map" : "Blank map"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* PICTURES CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><ImageIcon className="w-5 h-5" /> Pictures</h2>
                </div>
                <div className="card-content orc-stack">

                  {/* EMPTY PLACEHOLDER */}
                  {images.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">No pictures yet</p>
                      <p className="empty-state-body">Search the web or upload one to show the players.</p>
                    </div>
                  )}

                  {/* PICTURE GRID */}
                  {images.length > 0 && (
                    <div className="orc-image-grid">
                      {images.map((image) => (
                        <div key={image.id} className="orc-image-card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`${base}/images/${image.id}`} alt={image.caption} loading="lazy" />
                          <div className="orc-image-caption">
                            <span>{image.caption}</span>
                            <Button className="btn-link-red" onClick={() => deleteImage(image)} title="Delete picture" aria-label={`Delete picture ${image.caption}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* GET A PICTURE BUTTON */}
                  <Button className="btn-off" onClick={() => setIsPickerOpen(true)}>
                    <Plus className="w-4 h-4" /> Get a picture
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PICTURE PICKER */}
      <ImagePicker
        isOpen={isPickerOpen}
        campaignId={campaignId}
        sources={imageSources}
        subject=""
        onAdded={(image) => setImages((list) => (list.some((entry) => entry.id === image.id) ? list : [...list, image]))}
        onClose={() => setIsPickerOpen(false)}
      />

      {/* CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}
