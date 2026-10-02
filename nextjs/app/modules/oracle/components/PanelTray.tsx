"use client";

import { ExternalLink, Image as ImageIcon, Map as MapIcon, Plus } from "lucide-react";
import type { OracleEntity, OracleImage } from "../types/oracle";
import { campaignApi } from "../lib/client";

interface PanelTrayProps {
  campaignId: string;
  displayCode: string;
  images: OracleImage[];
  panelEntity: OracleEntity | null;
  panelImageId: string | null;
  onShowImage: (image: OracleImage) => void;
  onClear: () => void;
  onAddPicture: () => void;
}

// What sits beside the map on the player display. The map always stays on the left; this row
// chooses the right-hand panel: nothing, an entry (chosen in the Details panel), or a picture.
export default function PanelTray({ campaignId, displayCode, images, panelEntity, panelImageId, onShowImage, onClear, onAddPicture }: PanelTrayProps) {
  const nothingShown = !panelEntity && !panelImageId;

  return (
    // PANEL TRAY
    <div className="orc-tray">

      {/* TRAY HEADER */}
      <div className="orc-tray-head">
        <span className="orc-label">Beside the map on the player display</span>

        {/* DISPLAY LINK */}
        <a className="orc-tray-link" href={`/oracle/${displayCode}`} target="_blank" rel="noreferrer">
          <ExternalLink className="w-3 h-3" aria-hidden /> Display {displayCode}
        </a>
      </div>

      {/* TILES */}
      <div className="orc-tray-tiles">

        {/* MAP ONLY TILE */}
        <button type="button" className="orc-tile" data-active={nothingShown ? "true" : undefined} onClick={onClear}>
          <span className="orc-tile-art"><MapIcon className="w-5 h-5" aria-hidden /></span>
          <span className="orc-tile-caption">Map only</span>
        </button>

        {/* ENTRY TILE — present while an entry is on the panel */}
        {panelEntity && (
          <div className="orc-tile" data-active="true">
            <span className="orc-tile-art">
              {panelEntity.image_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${campaignApi(campaignId)}/images/${panelEntity.image_id}`} alt="" />
              ) : (
                <ImageIcon className="w-5 h-5" aria-hidden />
              )}
            </span>
            <span className="orc-tile-caption">{panelEntity.name}</span>
          </div>
        )}

        {/* PICTURE TILES */}
        {images.map((image) => (
          <button key={image.id} type="button" className="orc-tile" data-active={panelImageId === image.id ? "true" : undefined} onClick={() => onShowImage(image)} title={image.caption}>
            <span className="orc-tile-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${campaignApi(campaignId)}/images/${image.id}`} alt="" loading="lazy" />
            </span>
            <span className="orc-tile-caption">{image.caption}</span>
          </button>
        ))}

        {/* ADD PICTURE TILE */}
        <button type="button" className="orc-tile orc-tile-add" onClick={onAddPicture}>
          <span className="orc-tile-art"><Plus className="w-5 h-5" aria-hidden /></span>
          <span className="orc-tile-caption">Get a picture</span>
        </button>
      </div>
    </div>
  );
}
