"use client";

import { BookOpen, FileText, Image as ImageIcon, Map as MapIcon, Plus, ScrollText, Sparkles, Trash2, Users } from "lucide-react";
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
import { DRAFT_MAX, NAME_MAX, PROMPT_MAX, WORLD_MAX } from "../../../../lib/constants";
import type { BuiltSession, OracleCampaign, OracleEntity, OracleImage, OracleMap, OracleScene, TableSnapshot } from "../../../../types/oracle";

interface PrepClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
}

const KIND_LABELS = { creature: "Creature", person: "Person", place: "Location" } as const;

// PREP — before the session: rough notes become scenes and a cast, the world gets its tone,
// maps are drawn from a description, and pictures are collected.
export default function PrepClient({ snapshot, imageSources }: PrepClientProps) {
  const campaignId = snapshot.campaign.id;
  const base = campaignApi(campaignId);
  const { confirm, confirmModal } = useConfirm();
  useAppHeight();

  // DATA
  const [campaign, setCampaign] = useState<OracleCampaign>(snapshot.campaign);
  const [scenes, setScenes] = useState<OracleScene[]>(snapshot.scenes);
  const [entities, setEntities] = useState<OracleEntity[]>(snapshot.entities);
  const [maps, setMaps] = useState<OracleMap[]>(snapshot.maps);
  const [images, setImages] = useState<OracleImage[]>(snapshot.images);
  const [proposal, setProposal] = useState<BuiltSession | null>(null);

  // INPUT
  const [draft, setDraft] = useState(snapshot.campaign.draft);
  const [world, setWorld] = useState(snapshot.campaign.world);
  const [mapName, setMapName] = useState("");
  const [mapPrompt, setMapPrompt] = useState("");

  // STATE
  const [isBuilding, setIsBuilding] = useState(false);
  const [isWritingWorld, setIsWritingWorld] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isCreatingMap, setIsCreatingMap] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // What the server last confirmed for the two text areas, so a blur with no change saves nothing.
  const savedRef = useRef({ draft: snapshot.campaign.draft, world: snapshot.campaign.world });

  useEntityTitle(campaign.name);

  // The text areas save when focus leaves them: there is nothing to review, and a Save button
  // would be one more thing to forget before building.
  async function saveText(field: "draft" | "world", value: string): Promise<boolean> {
    const trimmed = value.trim();
    if (trimmed === savedRef.current[field]) return true;
    try {
      const saved = await api<OracleCampaign>(base, "PUT", { [field]: trimmed });
      savedRef.current = { ...savedRef.current, [field]: saved[field] };
      setCampaign(saved);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, field === "draft" ? "Couldn't save the notes" : "Couldn't save the world notes"));
      return false;
    }
  }

  async function build() {
    if (isBuilding) return;
    setIsBuilding(true);
    try {
      // Build reads the saved notes, so make sure what is on screen is what is saved.
      if (!(await saveText("draft", draft)) || !(await saveText("world", world))) return;
      setProposal(await api<BuiltSession>(`${base}/build`, "POST"));
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't build the session"));
    } finally {
      setIsBuilding(false);
    }
  }

  // Generate world notes from the name, whatever is in the box (a few words or a draft to
  // improve) and the session notes. The result lands in the box and saves like typed text.
  async function writeWorld() {
    if (isWritingWorld) return;
    setIsWritingWorld(true);
    try {
      if (!(await saveText("draft", draft))) return;
      const result = await api<{ world: string }>(`${base}/world/generate`, "POST", { seed: world });
      setWorld(result.world);
      await saveText("world", result.world);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't write the world notes"));
    } finally {
      setIsWritingWorld(false);
    }
  }

  async function applyProposal() {
    if (!proposal || isApplying) return;
    setIsApplying(true);
    try {
      const fresh = await api<TableSnapshot>(`${base}/build/apply`, "POST", proposal);
      setScenes(fresh.scenes);
      setEntities(fresh.entities);
      setProposal(null);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add those to the campaign"));
    } finally {
      setIsApplying(false);
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

            {/* NOTES COLUMN */}
            <div className="orc-stack">

              {/* ROUGH DRAFT CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><FileText className="w-5 h-5" /> Rough notes</h2>
                </div>
                <div className="card-content orc-form">

                  {/* DRAFT FIELD — not autofocused: the page has several starting points (notes,
                      world, maps, pictures) and this one is long text the DM pastes, not types. */}
                  <textarea
                    id="orc-draft"
                    className="input-field orc-textarea"
                    rows={12}
                    value={draft}
                    maxLength={DRAFT_MAX}
                    placeholder="Paste your session notes in any shape."
                    aria-label="Rough session notes"
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={(event) => saveText("draft", event.target.value)}
                  />

                  {/* BUILD ROW */}
                  <div className="orc-card-actions">
                    <span className="orc-small text-secondary">Saved when you leave the box.</span>
                    <Button className="btn-blue" disabled={isBuilding || draft.trim().length < 20} onClick={build}>
                      <Sparkles className="w-4 h-4" /> {isBuilding ? "Building…" : "Build session"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* WORLD CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><BookOpen className="w-5 h-5" /> World</h2>
                </div>
                <div className="card-content orc-form">

                  {/* WORLD FIELD */}
                  <textarea
                    id="orc-world"
                    className="input-field orc-textarea"
                    rows={5}
                    value={world}
                    maxLength={WORLD_MAX}
                    placeholder="Tone and setting in a few sentences: grim frontier, low magic, a failing crown…"
                    aria-label="World notes"
                    onChange={(event) => setWorld(event.target.value)}
                    onBlur={(event) => saveText("world", event.target.value)}
                  />

                  {/* WORLD ROW */}
                  <div className="orc-card-actions">
                    <span className="orc-small text-secondary">Every idea, fact and map is written to fit this.</span>
                    <Button className="btn-blue" disabled={isWritingWorld} onClick={writeWorld} title="Write world notes from the name, what is in the box and the session notes">
                      <Sparkles className="w-4 h-4" /> {isWritingWorld ? "Writing…" : world.trim() ? "Rewrite" : "Generate"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* SESSION COLUMN */}
            <div className="orc-stack">

              {/* PROPOSAL CARD — shown after Build session, until it is added or discarded */}
              {proposal && (
                <div className="card">
                  <div className="card-header">
                    <h2 className="text-card-title"><Sparkles className="w-5 h-5" /> Proposed session</h2>
                  </div>
                  <div className="card-content orc-stack">

                    {/* PROPOSED SCENES */}
                    <span className="orc-label">Scenes</span>
                    {proposal.scenes.length === 0 && <p className="orc-section-text orc-muted">No scenes proposed.</p>}
                    {proposal.scenes.map((scene, index) => (
                      <div key={`${scene.title}-${index}`} className="orc-proposal">
                        <span className="orc-proposal-title">{index + 1}. {scene.title}</span>
                        <span className="orc-section-text">{scene.summary}</span>
                      </div>
                    ))}

                    {/* PROPOSED CAST */}
                    <span className="orc-label">Cast</span>
                    {proposal.entities.length === 0 && <p className="orc-section-text orc-muted">No cast proposed.</p>}
                    {proposal.entities.map((entity, index) => (
                      <div key={`${entity.name}-${index}`} className="orc-proposal">
                        <span className="orc-proposal-title">{entity.name} <span className="orc-muted">· {KIND_LABELS[entity.kind]}{entity.cr ? ` · CR ${entity.cr}` : ""}</span></span>
                        <span className="orc-section-text">{entity.details}</span>
                        {entity.dm_notes && <span className="orc-section-text orc-muted">DM only: {entity.dm_notes}</span>}
                      </div>
                    ))}

                    {/* PROPOSAL ACTIONS */}
                    <div className="orc-card-actions">
                      <Button className="btn-off" disabled={isApplying} onClick={() => setProposal(null)}>Discard</Button>
                      <Button className="btn-green" disabled={isApplying} onClick={applyProposal}>
                        <Plus className="w-4 h-4" /> {isApplying ? "Adding…" : "Add to campaign"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* SCENES CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><ScrollText className="w-5 h-5" /> Scenes</h2>
                </div>
                <div className="card-content orc-stack">

                  {/* EMPTY PLACEHOLDER */}
                  {scenes.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">No scenes yet</p>
                      <p className="empty-state-body">Build them from your notes, or add them from the Table tab.</p>
                    </div>
                  )}

                  {/* SCENE ROWS */}
                  {scenes.map((scene, index) => (
                    <div key={scene.id} className="orc-proposal">
                      <span className="orc-proposal-title">{index + 1}. {scene.title}</span>
                      {scene.summary && <span className="orc-section-text">{scene.summary}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* CAST CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Users className="w-5 h-5" /> Cast</h2>
                </div>
                <div className="card-content orc-stack">

                  {/* EMPTY PLACEHOLDER */}
                  {entities.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">No cast yet</p>
                      <p className="empty-state-body">Build it from your notes, or add entries from the Table tab.</p>
                    </div>
                  )}

                  {/* CAST ROWS */}
                  {entities.map((entity) => (
                    <div key={entity.id} className="orc-proposal">
                      <span className="orc-proposal-title">{entity.name} <span className="orc-muted">· {KIND_LABELS[entity.kind]}</span></span>
                      {entity.details && <span className="orc-section-text">{entity.details}</span>}
                    </div>
                  ))}
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
