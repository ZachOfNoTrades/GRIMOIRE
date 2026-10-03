"use client";

import { Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { api, campaignApi, errorMessage } from "../lib/client";
import { MAP_DEFAULT_HEIGHT, MAP_DEFAULT_WIDTH, MAP_DESCRIPTION_MAX, NAME_MAX, SCALE_UNITS, SCALE_VALUE_MAX, type ScaleUnit } from "../lib/constants";
import type { OracleImage, OracleMap, PictureRect } from "../types/oracle";
import ImagePicker, { type ImageSource } from "./ImagePicker";
import PictureAligner from "./PictureAligner";

interface MapModalProps {
  isOpen: boolean;
  campaignId: string;
  map: OracleMap | null; // null: a new map
  images: OracleImage[];
  imageSources: ImageSource[];
  onImageAdded: (image: OracleImage) => void;
  onSaved: (map: OracleMap) => void;
  onClose: () => void;
}

// ADD OR EDIT A MAP — name, what it shows, what a tile stands for and the picture under it. A new
// map with a description is drawn from it; without one it starts blank.
export default function MapModal({ isOpen, campaignId, map, images, imageSources, onImageAdded, onSaved, onClose }: MapModalProps) {
  const base = campaignApi(campaignId);
  const isNew = map === null;

  // INPUT
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scaleValue, setScaleValue] = useState("");
  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>("feet");
  const [pictureId, setPictureId] = useState<string | null>(null);
  const [rect, setRect] = useState<PictureRect | null>(null);

  // STATE
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(map?.name ?? "");
    setDescription(map?.data.description ?? "");
    setScaleValue(map ? String(map.data.scale_value) : "");
    setScaleUnit(map?.data.scale_unit ?? "feet");
    setPictureId(map?.background_image_id ?? null);
    setRect(map?.data.background ?? null);
    setIsLibraryOpen(false);
    setIsPickerOpen(false);
    setIsBusy(false);
  }, [isOpen, map]);

  const width = map?.data.width ?? MAP_DEFAULT_WIDTH;
  const height = map?.data.height ?? MAP_DEFAULT_HEIGHT;
  const parsedScale = Number(scaleValue);
  const scaleOk = scaleValue.trim() === "" ? isNew : Number.isFinite(parsedScale) && parsedScale > 0 && parsedScale <= SCALE_VALUE_MAX;
  const canSave = name.trim().length > 0 && scaleOk && !isBusy;

  function choose(image: OracleImage) {
    setPictureId(image.id);
    setRect(null);
    setIsLibraryOpen(false);
  }

  async function save() {
    if (!canSave) return;
    setIsBusy(true);
    try {
      const scale = scaleValue.trim() ? { scale_value: parsedScale, scale_unit: scaleUnit } : {};
      let saved: OracleMap;
      if (map) {
        saved = await api<OracleMap>(`${base}/maps/${map.id}`, "PUT", {
          name: name.trim(),
          description: description.trim(),
          ...scale,
          background_image_id: pictureId,
          background: pictureId ? rect : null,
        });
      } else {
        saved = await api<OracleMap>(`${base}/maps`, "POST", { name: name.trim(), prompt: description.trim() || undefined, ...scale });
        if (pictureId) {
          saved = await api<OracleMap>(`${base}/maps/${saved.id}`, "PUT", { background_image_id: pictureId, background: rect });
        }
      }
      onSaved(saved);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, map ? "Couldn't save the map" : "Couldn't create the map"));
      setIsBusy(false);
    }
  }

  const picture = pictureId ? images.find((image) => image.id === pictureId) ?? null : null;
  const saveLabel = isBusy ? (isNew && description.trim() ? "Drawing the map…" : "Saving…") : isNew ? (description.trim() ? "Draw map" : "Add map") : "Save";

  return (
    <>
      <Modal
        isOpen={isOpen && !isPickerOpen}
        onClose={onClose}
        disableClose={isBusy}
        wide
        tall
        title={isNew ? "Add map" : "Edit map"}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button className="btn-off" disabled={isBusy} onClick={onClose}>Cancel</Button>
            <Button id="orc-map-save" className="btn-blue" disabled={!canSave} onClick={save}>{saveLabel}</Button>
          </div>
        }
      >
        <div className="orc-form">

          {/* NAME — autofocused: it is the first thing every map needs. */}
          <label className="orc-field">
            <span className="orc-field-label">Name</span>
            <input
              id="orc-map-name"
              className="input-field"
              autoFocus
              value={name}
              maxLength={NAME_MAX}
              disabled={isBusy}
              placeholder="Millbrook"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          {/* DESCRIPTION */}
          <label className="orc-field">
            <span className="orc-field-label">Description</span>
            <textarea
              id="orc-map-prompt"
              className="input-field orc-textarea"
              rows={4}
              value={description}
              maxLength={MAP_DESCRIPTION_MAX}
              disabled={isBusy}
              placeholder={isNew ? "Draw from a description: a small palisaded river village with an inn, a chapel and a mill. Empty starts blank." : "What this map shows"}
              onChange={(event) => setDescription(event.target.value)}
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
                disabled={isBusy}
                placeholder="5"
                aria-label="Distance one tile stands for"
                onChange={(event) => setScaleValue(event.target.value.replace(/[^0-9.]/g, "").slice(0, 8))}
              />
              <select id="orc-map-scale-unit" className="input-field orc-scale-unit" value={scaleUnit} disabled={isBusy} aria-label="Unit" onChange={(event) => setScaleUnit(event.target.value as ScaleUnit)}>
                {SCALE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
            {isNew && <span className="orc-small text-secondary">Empty reads it from the description, else 5 feet.</span>}
          </div>

          {/* PICTURE */}
          <div className="orc-field">
            <span className="orc-field-label">Picture</span>
            {pictureId && (
              <>
                <PictureAligner url={`${base}/images/${pictureId}`} width={width} height={height} features={map?.data.features ?? []} rect={rect} onChange={setRect} />
                <div className="orc-row-actions">
                  <span className="orc-small text-secondary orc-grow">{picture?.caption ?? ""}</span>
                  <Button className="btn-off" disabled={isBusy} onClick={() => setIsLibraryOpen((open) => !open)}><ImageIcon className="w-4 h-4" /> Change</Button>
                  <Button className="btn-off" disabled={isBusy} onClick={() => { setPictureId(null); setRect(null); }}><Trash2 className="w-4 h-4" /> Remove</Button>
                </div>
              </>
            )}
            {!pictureId && (
              <div className="orc-row-actions">
                <Button className="btn-off" disabled={isBusy} onClick={() => setIsLibraryOpen((open) => !open)}><ImageIcon className="w-4 h-4" /> Choose a picture</Button>
              </div>
            )}

            {/* LIBRARY — the campaign's pictures, plus a way to bring in a new one */}
            {isLibraryOpen && (
              <div className="orc-library" role="listbox" aria-label="Pictures in the library">
                {images.map((image) => (
                  <button key={image.id} type="button" role="option" aria-selected={image.id === pictureId} className="orc-library-item" onClick={() => choose(image)} title={image.caption}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${base}/images/${image.id}`} alt="" loading="lazy" />
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
      </Modal>

      {/* PICTURE PICKER — search, generate or upload; the result is selected for this map */}
      <ImagePicker
        isOpen={isOpen && isPickerOpen}
        campaignId={campaignId}
        sources={imageSources}
        subject={name.trim() ? `${name.trim()} map` : ""}
        onAdded={(image) => {
          onImageAdded(image);
          choose(image);
        }}
        onClose={() => setIsPickerOpen(false)}
      />
    </>
  );
}
