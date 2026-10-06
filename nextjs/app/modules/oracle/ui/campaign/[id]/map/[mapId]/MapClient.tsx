"use client";

import { ArrowLeft, Eye, EyeOff, Plus, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import SegmentedToggle from "@/components/ui/SegmentedToggle";
import { HeaderEditButton } from "@/components/ui/HeaderEditButton";
import { HeaderMenu } from "@/components/ui/HeaderMenu";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { useConfirm } from "@/lib/useConfirm";
import MapCanvas from "../../../../../components/MapCanvas";
import RangeValue from "../../../../../components/RangeValue";
import ImagePicker, { type ImageSource } from "../../../../../components/ImagePicker";
import FeatureEditor from "../../../../../components/FeatureEditor";
import HistoryPanel from "../../../../../components/HistoryPanel";
import PictureAligner from "../../../../../components/PictureAligner";
import SessionBar from "../../../../../components/SessionBar";
import { MAP_HELP } from "../../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../../lib/client";
import { GRID_COLUMNS_MAX, GRID_COLUMNS_MIN, GRID_ROWS_MAX, GRID_ROWS_MIN, MAP_DESCRIPTION_MAX, MAP_GRID, NAME_MAX, SCALE_UNITS, SCALE_VALUE_MAX, type ScaleUnit } from "../../../../../lib/constants";
import { useEditHistory } from "../../../../../lib/useEditHistory";
import { saveOnShortcut, useUnsavedWarning } from "../../../../../lib/useUnsavedWarning";
import type { MapFeature, OracleCampaign, OracleImage, OracleMap, PictureRect } from "../../../../../types/oracle";

interface MapClientProps {
  campaign: OracleCampaign;
  map: OracleMap;
  images: OracleImage[];
  imageSources: ImageSource[];
}

interface Draft {
  name: string;
  description: string;
  scaleValue: string;
  scaleUnit: ScaleUnit;
  pictureId: string | null;
  rect: PictureRect | null;
  features: MapFeature[];
  columnsDraft: string;
  rowsDraft: string;
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
  const [features, setFeatures] = useState<MapFeature[]>(initialMap.data.features);
  const [columnsDraft, setColumnsDraft] = useState(String(Math.round(initialMap.data.width / MAP_GRID)));
  const [rowsDraft, setRowsDraft] = useState(String(Math.round(initialMap.data.height / MAP_GRID)));
  const [editView, setEditView] = useState<"picture" | "shapes">("picture");

  // EDIT HISTORY — the editable fields as one snapshot per step, for undo, redo and the History list.
  const draft: Draft = { name, description, scaleValue, scaleUnit, pictureId, rect, features, columnsDraft, rowsDraft };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const applyDraft = useCallback((next: Draft) => {
    setName(next.name);
    setDescription(next.description);
    setScaleValue(next.scaleValue);
    setScaleUnit(next.scaleUnit);
    setPictureId(next.pictureId);
    setRect(next.rect);
    setFeatures(next.features);
    setColumnsDraft(next.columnsDraft);
    setRowsDraft(next.rowsDraft);
  }, []);
  const history = useEditHistory<Draft>(applyDraft);
  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) step through the history while editing. Inside a text field the
  // browser's own undo for that field wins.
  useEffect(() => {
    if (!isEditing) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        history.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // One edit: applied at once and recorded as a named step.
  function change(label: string, patch: Partial<Draft>, mergeKey = "") {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    applyDraft(next);
    history.record(label, next, mergeKey);
  }

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
  // GRID SIZE — columns × rows of the fixed-size tile; the map grows or shrinks to fit.
  const parsedColumns = Number(columnsDraft);
  const parsedRows = Number(rowsDraft);
  const isSizeOk = Number.isInteger(parsedColumns) && Number.isInteger(parsedRows) && parsedColumns >= GRID_COLUMNS_MIN && parsedColumns <= GRID_COLUMNS_MAX && parsedRows >= GRID_ROWS_MIN && parsedRows <= GRID_ROWS_MAX;
  // A count left as it was keeps the map's exact size (an older map need not be whole tiles).
  const draftWidth = isSizeOk && parsedColumns !== Math.round(map.data.width / MAP_GRID) ? parsedColumns * MAP_GRID : map.data.width;
  const draftHeight = isSizeOk && parsedRows !== Math.round(map.data.height / MAP_GRID) ? parsedRows * MAP_GRID : map.data.height;
  const isSizeDirty = draftWidth !== map.data.width || draftHeight !== map.data.height;
  const isShapesDirty = JSON.stringify(features) !== JSON.stringify(map.data.features);
  const isDirty =
    name.trim() !== map.name ||
    description.trim() !== (map.data.description ?? "") ||
    (isScaleOk && (parsedScale !== map.data.scale_value || scaleUnit !== map.data.scale_unit)) ||
    pictureId !== map.background_image_id ||
    JSON.stringify(rect) !== JSON.stringify(map.data.background ?? null) ||
    isShapesDirty ||
    isSizeDirty;
  const canSave = isDirty && name.trim().length > 0 && isScaleOk && isSizeOk && !isSaving;
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
        // Shapes and the grid size live in the map's data and go up as the whole of it.
        ...(isShapesDirty || isSizeDirty
          ? { data: { ...map.data, width: draftWidth, height: draftHeight, features, description: description.trim(), scale_value: parsedScale, scale_unit: scaleUnit, background: pictureId ? rect : null } }
          : {}),
      });
      setMap(saved);
      setName(saved.name);
      setDescription(saved.data.description ?? "");
      setScaleValue(String(saved.data.scale_value));
      setScaleUnit(saved.data.scale_unit);
      setPictureId(saved.background_image_id);
      setRect(saved.data.background ?? null);
      setFeatures(saved.data.features);
      setColumnsDraft(String(Math.round(saved.data.width / MAP_GRID)));
      setRowsDraft(String(Math.round(saved.data.height / MAP_GRID)));
      history.end();
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
    setFeatures(map.data.features);
    setColumnsDraft(String(Math.round(map.data.width / MAP_GRID)));
    setRowsDraft(String(Math.round(map.data.height / MAP_GRID)));
    history.end();
    setIsEditing(false);
  }

  // Disabled maps stay here and in Prep but leave the Table's map list. Painted at once, then saved.
  async function setDisabled(disabled: boolean) {
    const previous = map;
    setMap({ ...map, data: { ...map.data, disabled } });
    try {
      setMap(await api<OracleMap>(`${base}/maps/${map.id}`, "PUT", { disabled }));
      toast.success(disabled ? "Map disabled" : "Map enabled");
    } catch (error) {
      setMap(previous);
      toast.error(errorMessage(error, disabled ? "Couldn't disable the map" : "Couldn't enable the map"));
    }
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
    change("Chose picture", { pictureId: image.id, rect: null });
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
                onChange={(event) => change("Renamed map", { name: event.target.value }, "name")}
                onKeyDown={saveOnShortcut(save)}
              />
            ) : (
              <h1 id="orc-map-title" className="orc-map-title">{map.name}{map.data.disabled && <span className="badge orc-map-badge">Disabled</span>}</h1>
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
                  <HeaderEditButton id="orc-map-edit" onClick={() => { history.begin(draftRef.current); setIsEditing(true); }} />
                  <HeaderMenu
                    id="orc-map-more"
                    items={[
                      map.data.disabled
                        ? { label: "Enable map", icon: <Eye className="w-4 h-4" />, onSelect: () => setDisabled(false) }
                        : { label: "Disable map", icon: <EyeOff className="w-4 h-4" />, onSelect: () => setDisabled(true) },
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
            {/* EDIT VIEW — line up the picture, or draw the shapes over it */}
            {isEditing && (
              <SegmentedToggle
                options={[{ value: "picture", label: "Picture" }, { value: "shapes", label: "Shapes" }]}
                value={editView}
                onChange={setEditView}
                ariaLabel="What to edit"
                className="orc-map-edit-view"
              />
            )}
            {isEditing && editView === "shapes" && (
              <FeatureEditor width={draftWidth} height={draftHeight} features={features} pictureUrl={pictureId ? `${base}/images/${pictureId}?w=1600` : null} pictureRect={rect} onChange={(next, label, target) => change(label, { features: next }, target)} />
            )}
            {isEditing && editView === "picture" && pictureId && (
              <PictureAligner key={pictureId} url={`${base}/images/${pictureId}`} width={draftWidth} height={draftHeight} features={features} rect={rect} onChange={(next) => change("Aligned picture", { rect: next }, "picture")} />
            )}
            {isEditing && editView === "picture" && !pictureId && (
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
                <button type="button" className="orc-library-item orc-library-add" onClick={() => change("Removed picture", { pictureId: null, rect: null })}>
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
                      onChange={(event) => change("Changed scale", { scaleValue: event.target.value.replace(/[^0-9.]/g, "").slice(0, 8) }, "scale")}
                      onKeyDown={saveOnShortcut(save)}
                    />
                    <select id="orc-map-scale-unit" className="input-field orc-scale-unit" value={scaleUnit} aria-label="Unit" onChange={(event) => change("Changed unit", { scaleUnit: event.target.value as ScaleUnit })}>
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
              <dd>
                {isEditing ? (
                  <div className="orc-scale-row">
                    <input id="orc-map-columns" className="input-field orc-scale-value" inputMode="numeric" value={columnsDraft} aria-label="Columns" onChange={(event) => change("Resized grid", { columnsDraft: event.target.value.replace(/[^0-9]/g, "").slice(0, 2) }, "columns")} onKeyDown={saveOnShortcut(save)} />
                    <span className="orc-small text-secondary">×</span>
                    <input id="orc-map-rows" className="input-field orc-scale-value" inputMode="numeric" value={rowsDraft} aria-label="Rows" onChange={(event) => change("Resized grid", { rowsDraft: event.target.value.replace(/[^0-9]/g, "").slice(0, 2) }, "rows")} onKeyDown={saveOnShortcut(save)} />
                    <span className="orc-small text-secondary">tiles</span>
                    {!isSizeOk && <span className="orc-small orc-map-size-error">{GRID_COLUMNS_MIN}–{GRID_COLUMNS_MAX} × {GRID_ROWS_MIN}–{GRID_ROWS_MAX}</span>}
                  </div>
                ) : (
                  <>{columns} × {rows} tiles</>
                )}
              </dd>

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
                    onChange={(event) => change("Edited description", { description: event.target.value }, "description")}
                    onKeyDown={saveOnShortcut(save)}
                  />
                ) : (
                  <span className="orc-map-prop-text">{map.data.description || "None"}</span>
                )}
              </dd>
            </dl>
          </div>

          {/* HISTORY — editing only: every change as a step to jump back or forward to */}
          {isEditing && (
            <HistoryPanel entries={history.entries} index={history.index} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onJump={history.jumpTo} />
          )}
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
        // The map as it stands in the editor, unsaved shapes included: a drawing is painted over it.
        layout={{ ...map.data, width: draftWidth, height: draftHeight, features, description: description.trim() }}
        onAdded={(image) => {
          setImages((list) => (list.some((entry) => entry.id === image.id) ? list : [...list, image]));
          choose(image);
        }}
        onClose={() => setIsPickerOpen(false)}
      />
    </div>
  );
}
