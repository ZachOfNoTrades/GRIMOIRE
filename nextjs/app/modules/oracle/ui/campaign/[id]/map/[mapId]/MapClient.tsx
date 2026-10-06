"use client";

import { ArrowLeft, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { HeaderEditButton } from "@/components/ui/HeaderEditButton";
import { HeaderMenu } from "@/components/ui/HeaderMenu";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { useConfirm } from "@/lib/useConfirm";
import MapCanvas from "../../../../../components/MapCanvas";
import RangeValue from "../../../../../components/RangeValue";
import ImagePicker, { type ImageSource } from "../../../../../components/ImagePicker";
import PictureAligner from "../../../../../components/PictureAligner";
import SessionBar from "../../../../../components/SessionBar";
import { MAP_HELP } from "../../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../../lib/client";
import { MAP_DESCRIPTION_MAX, MAP_GRID, NAME_MAX, SCALE_UNITS, SCALE_VALUE_MAX, type ScaleUnit } from "../../../../../lib/constants";
import { saveOnShortcut, useUnsavedWarning } from "../../../../../lib/useUnsavedWarning";
import type { OracleCampaign, OracleImage, OracleMap } from "../../../../../types/oracle";

interface MapClientProps {
  campaign: OracleCampaign;
  map: OracleMap;
  images: OracleImage[];
  imageSources: ImageSource[];
}

const PICTURE_KEY = "orc-picture-opacity-map-page";
const OVERLAY_KEY = "orc-overlay-map-page";

// MAP — one map's page. It opens to read: the picture as the players' map shows it, and the
// description and scale beside it. Edit turns the fields on, with the picture under the grid on a
// canvas big enough to line it up. Fields save only on the Save button or Ctrl+S.
export default function MapClient({ campaign, map: initialMap, images: initialImages, imageSources }: MapClientProps) {
  const campaignId = campaign.id;
  const base = campaignApi(campaignId);
  useAppHeight();
  const router = useRouter();
  const { confirm, confirmModal } = useConfirm();

  // DATA — `map` is what the server last confirmed; a field is dirty while it differs from it.
  const [map, setMap] = useState<OracleMap>(initialMap);
  const [images, setImages] = useState<OracleImage[]>(initialImages);

  // INPUT
  const [name, setName] = useState(initialMap.name);
  const [description, setDescription] = useState(initialMap.data.description ?? "");
  const [scaleValue, setScaleValue] = useState(String(initialMap.data.scale_value));
  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>(initialMap.data.scale_unit);
  const [pictureId, setPictureId] = useState<string | null>(initialMap.background_image_id);
  const [rect, setRect] = useState(initialMap.data.background ?? null);

  // STATE
  const [pictureOpacity, setPictureOpacity] = useState(1); // this screen only, like the Table's slider
  const [overlayOpacity, setOverlayOpacity] = useState(initialMap.background_image_id ? 0.12 : 1); // how solid the features are; starts as the Table draws them

  // This page's view preferences, kept in this browser apart from the Table's.
  useEffect(() => {
    try {
      const picture = localStorage.getItem(PICTURE_KEY);
      const overlay = localStorage.getItem(OVERLAY_KEY);
      if (picture !== null && Number(picture) >= 0 && Number(picture) <= 1) setPictureOpacity(Number(picture));
      if (overlay !== null && Number(overlay) >= 0 && Number(overlay) <= 1) setOverlayOpacity(Number(overlay));
    } catch {
      /* storage can be blocked; the defaults stand */
    }
  }, []);
  function remember(key: string, value: number, set: (value: number) => void) {
    set(value);
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* storage can be blocked; the change still applies */
    }
  }
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const parsedScale = Number(scaleValue);
  const isScaleOk = Number.isFinite(parsedScale) && parsedScale > 0 && parsedScale <= SCALE_VALUE_MAX;
  const isDirty =
    name.trim() !== map.name ||
    description.trim() !== (map.data.description ?? "") ||
    (isScaleOk && (parsedScale !== map.data.scale_value || scaleUnit !== map.data.scale_unit)) ||
    pictureId !== map.background_image_id ||
    JSON.stringify(rect) !== JSON.stringify(map.data.background ?? null);
  const canSave = isDirty && name.trim().length > 0 && isScaleOk && !isSaving;
  useUnsavedWarning(isEditing && isDirty);
  useEntityTitle(`${map.name} · ${campaign.name}`);

  async function save() {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const saved = await api<OracleMap>(`${base}/maps/${map.id}`, "PUT", {
        name: name.trim(),
        description: description.trim(),
        scale_value: parsedScale,
        scale_unit: scaleUnit,
        background_image_id: pictureId,
        background: pictureId ? rect : null,
      });
      setMap(saved);
      setName(saved.name);
      setDescription(saved.data.description ?? "");
      setScaleValue(String(saved.data.scale_value));
      setScaleUnit(saved.data.scale_unit);
      setPictureId(saved.background_image_id);
      setRect(saved.data.background ?? null);
      setIsEditing(false);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the map"));
    } finally {
      setIsSaving(false);
    }
  }

  // Back to what the server has; asks first when there is something to lose.
  async function cancel() {
    if (isDirty && !(await confirm({ title: "Discard changes?", message: "Your edits to this map are lost.", confirmLabel: "Discard", danger: true }))) return;
    setName(map.name);
    setDescription(map.data.description ?? "");
    setScaleValue(String(map.data.scale_value));
    setScaleUnit(map.data.scale_unit);
    setPictureId(map.background_image_id);
    setRect(map.data.background ?? null);
    setIsEditing(false);
  }

  async function remove() {
    if (!(await confirm({ title: `Delete ${map.name}?`, message: "The map and its explored area are removed. Entities placed on it are kept.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api(`${base}/maps/${map.id}`, "DELETE");
      router.push(`/modules/oracle/ui/campaign/${campaignId}?tab=prep`);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't delete the map"));
    }
  }

  // A location's name dragged on this page. Kept apart from where the Table puts it (page_label_*),
  // written on its own, and held in `map` so the dirty check does not count it as an unsaved edit.
  async function moveFeatureLabel(featureId: string, dx: number, dy: number) {
    const previous = map;
    const data = { ...map.data, features: map.data.features.map((feature) => (feature.id === featureId ? { ...feature, page_label_dx: dx, page_label_dy: dy } : feature)) };
    setMap({ ...map, data });
    try {
      setMap(await api<OracleMap>(`${base}/maps/${map.id}`, "PUT", { data }));
    } catch (error) {
      setMap(previous);
      toast.error(errorMessage(error, "Couldn't move the label"));
    }
  }

  function choose(image: OracleImage) {
    setPictureId(image.id);
    setRect(null);
  }

  // The map as this page draws it: its own label positions in place of the Table's.
  const pageData = { ...map.data, features: map.data.features.map((feature) => ({ ...feature, label_dx: feature.page_label_dx, label_dy: feature.page_label_dy })) };
  const columns = Math.floor(map.data.width / MAP_GRID);
  const rows = Math.floor(map.data.height / MAP_GRID);

  return (
    // PAGE — a locked full-height shell with one scrolling body
    <div className="page page-with-bottom-bar orc-shell">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* SESSION BAR */}
      <SessionBar campaignId={campaignId} campaignName={campaign.name} active="prep" help={MAP_HELP} />

      {/* SCROLLING BODY */}
      <div className="orc-page-body">
        <div className="page-container orc-map-page" data-editing={isEditing ? "true" : undefined}>

          {/* BACK */}
          <Link href={`/modules/oracle/ui/campaign/${campaignId}?tab=prep`} className="orc-map-back">
            <ArrowLeft className="w-4 h-4" /> Prep
          </Link>

          {/* HEADER — the name and its actions; editing swaps each in place */}
          <div className="orc-map-head">
            {isEditing ? (
              <input
                id="orc-map-name"
                className="input-field orc-map-name-input"
                value={name}
                maxLength={NAME_MAX}
                aria-label="Map name"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={saveOnShortcut(save)}
              />
            ) : (
              <h1 id="orc-map-title" className="orc-map-title">{map.name}</h1>
            )}
            <div className="orc-map-actions">
              {isEditing ? (
                <>
                  <Button className="btn-off" disabled={isSaving} onClick={cancel}><X className="w-4 h-4" /> Cancel</Button>
                  <Button id="orc-map-save" className={isDirty ? "btn-green" : "btn-off"} disabled={!canSave} onClick={save} title="Save the map (Ctrl+S)">
                    <Save className="w-4 h-4" /> {isSaving ? "Saving…" : "Save"}
                  </Button>
                </>
              ) : (
                <>
                  <HeaderEditButton id="orc-map-edit" onClick={() => setIsEditing(true)} />
                  <HeaderMenu
                    id="orc-map-more"
                    items={[
                      { label: "Delete map", icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: remove },
                    ]}
                  />
                </>
              )}
            </div>
          </div>

          <div className="orc-map-body">
          <div className="orc-map-main">

          {/* MAP — the page's subject; the same spot in both modes */}
          <div className="orc-map-stage">
            {/* The Table's map and its controls, without the party, fog and vision: this page shows the map, not the night. */}
            {!isEditing && (
              <div className="orc-map-viewer" style={{ aspectRatio: `${map.data.width} / ${map.data.height}`, "--orc-overlay": overlayOpacity } as React.CSSProperties}>
                <MapCanvas
                  data={pageData}
                  partyX={map.party_x}
                  partyY={map.party_y}
                  visionRadius={0}
                  explored={[]}
                  tokens={[]}
                  backgroundUrl={map.background_image_id ? `${base}/images/${map.background_image_id}?w=1600` : null}
                  pictureOpacity={pictureOpacity}
                  mode="dm"
                  tool="move"
                  screen="map-page"
                  onFeatureLabelMove={moveFeatureLabel}
                  barExtras={(
                    <>
                      {map.background_image_id && (
                        <div className="orc-bar-slider orc-vision" title="How strongly the map's background shows on this screen">
                          <span className="orc-label">Background</span>
                          <input type="range" min={0} max={100} value={Math.round(pictureOpacity * 100)} aria-label="Background opacity" onChange={(event) => remember(PICTURE_KEY, Number(event.target.value) / 100, setPictureOpacity)} />
                          <RangeValue value={Math.round(pictureOpacity * 100)} min={0} max={100} suffix="%" label="Background opacity" onCommit={(value) => remember(PICTURE_KEY, value / 100, setPictureOpacity)} />
                        </div>
                      )}
                      <div className="orc-bar-slider orc-vision" title="How solid the features are, up to fully opaque">
                        <span className="orc-label">Overlay</span>
                        <input type="range" min={0} max={100} value={Math.round(overlayOpacity * 100)} aria-label="Overlay opacity" onChange={(event) => remember(OVERLAY_KEY, Number(event.target.value) / 100, setOverlayOpacity)} />
                        <RangeValue value={Math.round(overlayOpacity * 100)} min={0} max={100} suffix="%" label="Overlay opacity" onCommit={(value) => remember(OVERLAY_KEY, value / 100, setOverlayOpacity)} />
                      </div>
                    </>
                  )}
                />
              </div>
            )}
            {isEditing && pictureId && (
              <PictureAligner key={pictureId} url={`${base}/images/${pictureId}`} width={map.data.width} height={map.data.height} features={map.data.features} rect={rect} onChange={setRect} />
            )}
            {isEditing && !pictureId && (
              <div className="empty-state">
                <p className="empty-state-title">No picture</p>
              </div>
            )}
          </div>

          {/* LIBRARY STRIP — editing only: pick the picture under the map */}
          {isEditing && (
            <div className="orc-map-strip" role="listbox" aria-label="Pictures in the library">
              {images.map((image) => (
                <button key={image.id} type="button" role="option" aria-selected={image.id === pictureId} className="orc-library-item" onClick={() => choose(image)} title={image.caption}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${base}/images/${image.id}?w=160`} alt="" loading="lazy" />
                  <span>{image.caption}</span>
                </button>
              ))}
              <button type="button" className="orc-library-item orc-library-add" onClick={() => setIsPickerOpen(true)}>
                <Plus className="w-5 h-5" aria-hidden />
                <span>Search or upload</span>
              </button>
              {pictureId && (
                <button type="button" className="orc-library-item orc-library-add" onClick={() => { setPictureId(null); setRect(null); }}>
                  <Trash2 className="w-5 h-5" aria-hidden />
                  <span>Remove</span>
                </button>
              )}
            </div>
          )}


          </div>

          {/* DETAILS CARD — the map's properties; editing turns each into its field in place */}
          <div className="card orc-map-details">
            <div className="card-header">
              <h2 className="text-card-title">Details</h2>
            </div>
            <dl className="card-content orc-map-props">
              <dt>Scale</dt>
              <dd>
                {isEditing ? (
                  <div className="orc-scale-row">
                    <span className="orc-small text-secondary">1 tile =</span>
                    <input
                      id="orc-map-scale-value"
                      className="input-field orc-scale-value"
                      inputMode="decimal"
                      value={scaleValue}
                      placeholder="5"
                      aria-label="Distance one tile stands for"
                      onChange={(event) => setScaleValue(event.target.value.replace(/[^0-9.]/g, "").slice(0, 8))}
                      onKeyDown={saveOnShortcut(save)}
                    />
                    <select id="orc-map-scale-unit" className="input-field orc-scale-unit" value={scaleUnit} aria-label="Unit" onChange={(event) => setScaleUnit(event.target.value as ScaleUnit)}>
                      {SCALE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span id="orc-map-scale">1 tile = {map.data.scale_value} {map.data.scale_unit}</span>
                )}
              </dd>

              <dt>Size</dt>
              <dd>{columns} × {rows} tiles</dd>

              <dt>Description</dt>
              <dd>
                {isEditing ? (
                  <textarea
                    id="orc-map-description"
                    className="input-field orc-textarea"
                    rows={5}
                    value={description}
                    maxLength={MAP_DESCRIPTION_MAX}
                    placeholder="What this map shows"
                    aria-label="Description"
                    onChange={(event) => setDescription(event.target.value)}
                    onKeyDown={saveOnShortcut(save)}
                  />
                ) : (
                  <span className="orc-map-prop-text">{map.data.description || "None"}</span>
                )}
              </dd>
            </dl>
          </div>
          </div>
        </div>
      </div>

      {/* CONFIRM MODAL */}
      {confirmModal}

      {/* PICTURE PICKER — search, generate or upload; the result is selected for this map */}
      <ImagePicker
        isOpen={isPickerOpen}
        campaignId={campaignId}
        sources={imageSources}
        subject={name.trim() ? `${name.trim()} map` : ""}
        onAdded={(image) => {
          setImages((list) => (list.some((entry) => entry.id === image.id) ? list : [...list, image]));
          choose(image);
        }}
        onClose={() => setIsPickerOpen(false)}
      />
    </div>
  );
}
