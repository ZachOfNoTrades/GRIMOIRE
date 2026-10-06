"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { api, campaignApi, errorMessage } from "../lib/client";
import { MAP_DESCRIPTION_MAX, NAME_MAX, SCALE_UNITS, SCALE_VALUE_MAX, type ScaleUnit } from "../lib/constants";
import type { OracleMap } from "../types/oracle";

interface MapModalProps {
  isOpen: boolean;
  campaignId: string;
  onAdded: (map: OracleMap) => void;
  onClose: () => void;
}

// ADD A MAP — name, what it shows and what a tile stands for. With a description the map is drawn
// from it; without one it starts blank. The picture under it is set on the map's own page.
export default function MapModal({ isOpen, campaignId, onAdded, onClose }: MapModalProps) {
  const base = campaignApi(campaignId);

  // INPUT
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scaleValue, setScaleValue] = useState("");
  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>("feet");

  // STATE
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setScaleValue("");
    setScaleUnit("feet");
    setIsBusy(false);
  }, [isOpen]);

  const parsedScale = Number(scaleValue);
  const scaleOk = scaleValue.trim() === "" || (Number.isFinite(parsedScale) && parsedScale > 0 && parsedScale <= SCALE_VALUE_MAX);
  const canSave = name.trim().length > 0 && scaleOk && !isBusy;

  async function save() {
    if (!canSave) return;
    setIsBusy(true);
    try {
      const scale = scaleValue.trim() ? { scale_value: parsedScale, scale_unit: scaleUnit } : {};
      const saved = await api<OracleMap>(`${base}/maps`, "POST", { name: name.trim(), prompt: description.trim() || undefined, ...scale });
      onAdded(saved);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't create the map"));
      setIsBusy(false);
    }
  }

  const saveLabel = isBusy ? (description.trim() ? "Drawing the map…" : "Adding…") : description.trim() ? "Draw map" : "Add map";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      disableClose={isBusy}
      title="Add map"
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
            placeholder="Draw from a description: a small palisaded river village with an inn, a chapel and a mill. Empty starts blank."
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
          <span className="orc-small text-secondary">Empty reads it from the description, else 5 feet.</span>
        </div>
      </div>
    </Modal>
  );
}
