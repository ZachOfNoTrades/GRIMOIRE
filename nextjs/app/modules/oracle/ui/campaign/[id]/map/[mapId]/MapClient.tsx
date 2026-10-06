"use client";

import { ArrowLeft, Image as ImageIcon, Map as MapIcon, Pencil, Plus, RotateCcw, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import { useConfirm } from "@/lib/useConfirm";
import MapPreview from "../../../../../components/MapPreview";
import ImagePicker, { type ImageSource } from "../../../../../components/ImagePicker";
import PictureAligner from "../../../../../components/PictureAligner";
import SessionBar from "../../../../../components/SessionBar";
import { MAP_HELP } from "../../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../../lib/client";
import { MAP_DESCRIPTION_MAX, NAME_MAX, SCALE_UNITS, SCALE_VALUE_MAX, type ScaleUnit } from "../../../../../lib/constants";
import { saveOnShortcut, useUnsavedWarning } from "../../../../../lib/useUnsavedWarning";
import type { OracleCampaign, OracleImage, OracleMap } from "../../../../../types/oracle";

interface MapClientProps {
  campaign: OracleCampaign;
  map: OracleMap;
  images: OracleImage[];
  imageSources: ImageSource[];
}

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
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
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
    setIsLibraryOpen(false);
    setIsEditing(false);
  }

  async function reset() {
    if (!(await confirm({ title: `Reset ${map.name}?`, message: "The fog returns everywhere the party can't see right now, and entities revealed on this map are hidden again.", confirmLabel: "Reset", danger: true }))) return;
    try {
      setMap(await api<OracleMap>(`${base}/maps/${map.id}/reset`, "POST"));
      toast.success(`${map.name} reset`);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't reset the map"));
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

  function choose(image: OracleImage) {
    setPictureId(image.id);
    setRect(null);
    setIsLibraryOpen(false);
  }

  const picture = pictureId ? images.find((image) => image.id === pictureId) ?? null : null;

  return (
    // PAGE — a locked full-height shell with one scrolling body
    <div className="page page-with-bottom-bar orc-shell">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* SESSION BAR */}
      <SessionBar campaignId={campaignId} campaignName={campaign.name} active="prep" help={MAP_HELP} />

      {/* SCROLLING BODY */}
      <div className="orc-page-body">
        <div className="page-container">

          {/* MAP HEADER */}
          <div className="orc-session-head">
            <Link href={`/modules/oracle/ui/campaign/${campaignId}?tab=prep`} className="btn btn-link" title="Back to Prep">
              <ArrowLeft className="w-4 h-4" /> Prep
            </Link>

            {/* NAME */}
            {isEditing ? (
              <input
                id="orc-map-name"
                className="input-field orc-session-title"
                value={name}
                maxLength={NAME_MAX}
                aria-label="Map name"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={saveOnShortcut(save)}
              />
            ) : (
              <h1 id="orc-map-title" className="orc-session-title orc-map-title">{map.name}</h1>
            )}

            {/* ACTIONS */}
            {isEditing ? (
              <>
                <Button className="btn-off" disabled={isSaving} onClick={cancel}>Cancel</Button>
                <Button id="orc-map-save" className={isDirty ? "btn-green" : "btn-off"} disabled={!canSave} onClick={save} title="Save the map (Ctrl+S)">
                  <Save className="w-4 h-4" /> {isSaving ? "Saving…" : isDirty ? "Save" : "Saved"}
                </Button>
              </>
            ) : (
              <>
                <Button id="orc-map-edit" className="btn-off" onClick={() => setIsEditing(true)}><Pencil className="w-4 h-4" /> Edit</Button>
                <Button className="btn-off" onClick={reset} title="Reset map" aria-label={`Reset map ${map.name}`}><RotateCcw className="w-4 h-4" /></Button>
                <Button className="btn-link-red" onClick={remove} title="Delete map" aria-label={`Delete map ${map.name}`}><Trash2 className="w-4 h-4" /></Button>
              </>
            )}
          </div>

          <div className="orc-map-page">

            {/* CANVAS CARD */}
            <div className="card orc-map-canvas">
              <div className="card-header">
                <h2 className="text-card-title"><MapIcon className="w-5 h-5" /> {isEditing ? "Picture" : "Map"}</h2>
              </div>
              <div className="card-content orc-stack">

                {/* MAP — as the players' map draws it */}
                {!isEditing && (
                  <MapPreview data={map.data} pictureUrl={map.background_image_id ? `${base}/images/${map.background_image_id}` : null} />
                )}

                {/* ALIGNER */}
                {isEditing && pictureId && (
                  <PictureAligner key={pictureId} url={`${base}/images/${pictureId}`} width={map.data.width} height={map.data.height} features={map.data.features} rect={rect} onChange={setRect} />
                )}

                {/* EMPTY PLACEHOLDER */}
                {isEditing && !pictureId && (
                  <div className="empty-state">
                    <p className="empty-state-title">No picture</p>
                  </div>
                )}
              </div>
            </div>

            {/* SIDE COLUMN */}
            <div className="orc-stack">

              {/* DETAILS CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><SlidersHorizontal className="w-5 h-5" /> Details</h2>
                </div>
                {!isEditing && (
                  <div className="card-content orc-stack">
                    {map.data.description && <p className="orc-section-text">{map.data.description}</p>}
                    <span className="orc-small text-secondary">1 tile = {map.data.scale_value} {map.data.scale_unit}</span>
                  </div>
                )}
                {isEditing && (
                  <div className="card-content orc-form">

                  {/* DESCRIPTION */}
                  <label className="orc-field">
                    <span className="orc-field-label">Description</span>
                    <textarea
                      id="orc-map-description"
                      className="input-field orc-textarea"
                      rows={5}
                      value={description}
                      maxLength={MAP_DESCRIPTION_MAX}
                      placeholder="What this map shows"
                      onChange={(event) => setDescription(event.target.value)}
                      onKeyDown={saveOnShortcut(save)}
                    />
                  </label>

                  {/* SCALE — what one tile stands for */}
                  <div className="orc-field">
                    <span className="orc-field-label">Scale</span>
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
                  </div>
                  </div>
                )}
              </div>

              {/* LIBRARY CARD — editing only */}
              {isEditing && (
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><ImageIcon className="w-5 h-5" /> Library</h2>
                </div>
                <div className="card-content orc-stack">
                  <div className="orc-row-actions">
                    <span className="orc-small text-secondary orc-grow">{picture?.caption ?? ""}</span>
                    <Button className="btn-off" onClick={() => setIsLibraryOpen((open) => !open)}><ImageIcon className="w-4 h-4" /> {pictureId ? "Change" : "Choose"}</Button>
                    {pictureId && (
                      <Button className="btn-off" onClick={() => { setPictureId(null); setRect(null); setIsLibraryOpen(false); }}><Trash2 className="w-4 h-4" /> Remove</Button>
                    )}
                  </div>

                  {/* LIBRARY — the campaign's pictures, plus a way to bring in a new one */}
                  {isLibraryOpen && (
                    <div className="orc-library" role="listbox" aria-label="Pictures in the library">
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
                    </div>
                  )}
                </div>
              </div>
              )}
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
