"use client";

import { BookOpen, CalendarDays, ChevronRight, Image as ImageIcon, Map as MapIcon, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { useConfirm } from "@/lib/useConfirm";
import ImagePicker, { type ImageSource } from "../../../../components/ImagePicker";
import MapModal from "../../../../components/MapModal";
import MapPreview from "../../../../components/MapPreview";
import SessionBar from "../../../../components/SessionBar";
import { PREP_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { MEMBER_NAME_MAX, SESSION_TITLE_MAX, WORLD_MAX } from "../../../../lib/constants";
import { saveOnShortcut, useUnsavedWarning } from "../../../../lib/useUnsavedWarning";
import type { OracleCampaign, OracleImage, OracleMap, OraclePartyMember, OracleSession, TableSnapshot } from "../../../../types/oracle";

interface PrepClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
}

// PREP — the campaign's world (its notes, maps and pictures) and the list of sessions. A session
// has its own page for notes, entities and recap.
export default function PrepClient({ snapshot, imageSources }: PrepClientProps) {
  const campaignId = snapshot.campaign.id;
  const base = campaignApi(campaignId);
  const { confirm, confirmModal } = useConfirm();
  useAppHeight();
  const router = useRouter();

  // DATA
  const [campaign, setCampaign] = useState<OracleCampaign>(snapshot.campaign);
  const [sessions, setSessions] = useState<OracleSession[]>(snapshot.sessions);
  const [party, setParty] = useState<OraclePartyMember[]>(snapshot.party);
  const [maps, setMaps] = useState<OracleMap[]>(snapshot.maps);
  const [images, setImages] = useState<OracleImage[]>(snapshot.images);

  // INPUT
  const [world, setWorld] = useState(snapshot.campaign.world);
  const [sessionTitle, setSessionTitle] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberLevel, setMemberLevel] = useState(1);

  // STATE
  const [isWritingWorld, setIsWritingWorld] = useState(false);
  const [isSavingWorld, setIsSavingWorld] = useState(false);
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  // What the server last confirmed for the world notes. The box is dirty while it differs.
  const [savedWorld, setSavedWorld] = useState(snapshot.campaign.world);
  const isWorldDirty = world.trim() !== savedWorld;
  useUnsavedWarning(isWorldDirty);

  useEntityTitle(campaign.name);

  // The world notes save only on the Save button or Ctrl+S; nothing is written while typing.
  async function saveWorld(value: string): Promise<boolean> {
    const trimmed = value.trim();
    if (trimmed === savedWorld) return true;
    setIsSavingWorld(true);
    try {
      const saved = await api<OracleCampaign>(base, "PUT", { world: trimmed });
      setSavedWorld(saved.world);
      setCampaign(saved);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the world notes"));
      return false;
    } finally {
      setIsSavingWorld(false);
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

  // PARTY — the player characters by name and level
  async function addMember() {
    const name = memberName.trim();
    if (!name || isAddingMember) return;
    setIsAddingMember(true);
    try {
      const created = await api<OraclePartyMember>(`${base}/party`, "POST", { name, level: memberLevel });
      setParty((list) => [...list, created]);
      setMemberName("");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add the member"));
    } finally {
      setIsAddingMember(false);
    }
  }

  // The name is edited in place; leaving the field or Enter saves it, an empty name changes nothing.
  async function renameMember(member: OraclePartyMember, value: string) {
    const name = value.trim();
    if (!name || name === member.name) return;
    const previous = party;
    setParty((list) => list.map((entry) => (entry.id === member.id ? { ...entry, name } : entry)));
    try {
      await api(`${base}/party/${member.id}`, "PUT", { name });
    } catch (error) {
      setParty(previous);
      toast.error(errorMessage(error, "Couldn't rename the character"));
    }
  }

  async function setLevel(member: OraclePartyMember, level: number) {
    const clamped = Math.min(20, Math.max(1, level));
    if (clamped === member.level) return;
    const previous = party;
    setParty((list) => list.map((entry) => (entry.id === member.id ? { ...entry, level: clamped } : entry)));
    try {
      await api(`${base}/party/${member.id}`, "PUT", { level: clamped });
    } catch (error) {
      setParty(previous);
      toast.error(errorMessage(error, "Couldn't change the level"));
    }
  }

  async function removeMember(member: OraclePartyMember) {
    const previous = party;
    setParty((list) => list.filter((entry) => entry.id !== member.id));
    try {
      await api(`${base}/party/${member.id}`, "DELETE");
    } catch (error) {
      setParty(previous);
      toast.error(errorMessage(error, "Couldn't remove the member"));
    }
  }

  // A map added from the modal joins the list (and goes on the table when it is the first), then opens on its own page.
  function mapAdded(saved: OracleMap) {
    setMaps((list) => (list.some((entry) => entry.id === saved.id) ? list : [...list, saved]));
    setCampaign((current) => (current.active_map_id ? current : { ...current, active_map_id: saved.id }));
    router.push(`/modules/oracle/ui/campaign/${campaignId}/map/${saved.id}`);
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

  async function resetMap(map: OracleMap) {
    if (!(await confirm({ title: `Reset ${map.name}?`, message: "The fog returns everywhere the party can't see right now, and entities revealed on this map are hidden again.", confirmLabel: "Reset", danger: true }))) return;
    try {
      const saved = await api<OracleMap>(`${base}/maps/${map.id}/reset`, "POST");
      setMaps((list) => list.map((entry) => (entry.id === saved.id ? saved : entry)));
      toast.success(`${map.name} reset`);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't reset the map"));
    }
  }

  async function deleteMap(map: OracleMap) {
    if (!(await confirm({ title: `Delete ${map.name}?`, message: "The map and its explored area are removed. Entities placed on it are kept.", confirmLabel: "Delete", danger: true }))) return;
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
                    onKeyDown={saveOnShortcut(() => saveWorld(world))}
                  />

                  {/* WORLD ROW */}
                  <div className="orc-card-actions">
                    <span className="orc-small text-secondary">{isWorldDirty ? "Unsaved changes" : ""}</span>
                    <div className="orc-row-actions">
                      <Button className="btn-blue" disabled={isWritingWorld || isSavingWorld} onClick={writeWorld} title="Write world notes from the name and what is in the box">
                        <Sparkles className="w-4 h-4" /> {isWritingWorld ? "Writing…" : world.trim() ? "Rewrite" : "Generate"}
                      </Button>
                      <Button id="orc-world-save" className={isWorldDirty ? "btn-green" : "btn-off"} disabled={!isWorldDirty || isSavingWorld || isWritingWorld} onClick={() => saveWorld(world)} title="Save the world notes (Ctrl+S)">
                        <Save className="w-4 h-4" /> {isSavingWorld ? "Saving…" : isWorldDirty ? "Save" : "Saved"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PARTY AND SESSIONS COLUMN */}
            <div className="orc-stack">

              {/* PARTY CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Users className="w-5 h-5" /> Party</h2>
                </div>
                <div className="card-content orc-stack">

                  {/* ADD ROW */}
                  <div className="orc-note-row">
                    <input
                      id="orc-member-name"
                      className="input-field"
                      value={memberName}
                      maxLength={MEMBER_NAME_MAX}
                      disabled={isAddingMember}
                      placeholder={party.length === 0 ? "Player character, e.g. Brann" : "Another character"}
                      aria-label="New member name"
                      onChange={(event) => setMemberName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addMember();
                        }
                      }}
                    />
                    <input
                      type="number"
                      className="input-field orc-level-input"
                      min={1}
                      max={20}
                      value={memberLevel}
                      aria-label="New member level"
                      onChange={(event) => setMemberLevel(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                    />
                    <Button className="btn-off" disabled={isAddingMember || !memberName.trim()} onClick={addMember} title="Add member" aria-label="Add member">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {/* MEMBER ROWS — name, level stepper, remove */}
                  {party.length > 0 && (
                    <div className="orc-roster" role="table" aria-label="Party">
                  {party.map((member) => (
                    <div key={member.id} className="orc-member-row">
                      <input
                        className="orc-roster-name"
                        defaultValue={member.name}
                        key={`${member.id}:${member.name}`}
                        maxLength={MEMBER_NAME_MAX}
                        aria-label={`Name of ${member.name}`}
                        onBlur={(event) => renameMember(member, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          else if (event.key === "Escape") {
                            event.currentTarget.value = member.name;
                            event.currentTarget.blur();
                          }
                        }}
                      />
                      <span className="orc-level" role="group" aria-label={`${member.name} level`}>
                        <button type="button" className="orc-level-btn" disabled={member.level <= 1} aria-label="Level down" onClick={() => setLevel(member, member.level - 1)}>−</button>
                        <span className="orc-level-value">Lv {member.level}</span>
                        <button type="button" className="orc-level-btn" disabled={member.level >= 20} aria-label="Level up" onClick={() => setLevel(member, member.level + 1)}>+</button>
                      </span>
                      <Button className="btn-link-red" onClick={() => removeMember(member)} title="Remove" aria-label={`Remove ${member.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                    </div>
                  )}

                </div>
              </div>

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

                  {/* EMPTY PLACEHOLDER */}
                  {maps.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">No maps yet</p>

                    </div>
                  )}

                  {/* MAP ROWS */}
                  {maps.map((map) => (
                    <div key={map.id} className="orc-gen-row" data-active={campaign.active_map_id === map.id ? "true" : undefined}>
                      <MapPreview data={map.data} pictureUrl={map.background_image_id ? `${base}/images/${map.background_image_id}` : null} />
                      <div className="orc-gen-body">
                        <span className="orc-gen-value">{map.name}</span>
                      </div>
                      <div className="orc-campaign-actions">
                        {campaign.active_map_id !== map.id && <Button className="btn-off" onClick={() => makeActive(map)}>Use</Button>}
                        <Link href={`/modules/oracle/ui/campaign/${campaignId}/map/${map.id}`} className="btn btn-off" title="Edit map" aria-label={`Edit map ${map.name}`}>
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <Button className="btn-off" onClick={() => resetMap(map)} title="Reset map" aria-label={`Reset map ${map.name}`}>
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button className="btn-link-red" onClick={() => deleteMap(map)} title="Delete map" aria-label={`Delete map ${map.name}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* ADD MAP BUTTON */}
                  <Button id="orc-map-add" className="btn-off" onClick={() => setIsMapModalOpen(true)}>
                    <Plus className="w-4 h-4" /> Add map
                  </Button>
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

      {/* MAP MODAL */}
      <MapModal
        isOpen={isMapModalOpen}
        campaignId={campaignId}
        onAdded={mapAdded}
        onClose={() => setIsMapModalOpen(false)}
      />

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
