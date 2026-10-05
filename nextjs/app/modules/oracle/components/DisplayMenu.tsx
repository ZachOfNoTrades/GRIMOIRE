"use client";

import { ExternalLink, Image as ImageIcon, Map as MapIcon, Monitor, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OracleEntity, OracleImage } from "../types/oracle";
import { usePopoverStyle } from "../lib/usePopoverStyle";
import { campaignApi } from "../lib/client";

interface DisplayMenuProps {
  campaignId: string;
  displayCode: string;
  label: string; // what the players see right now
  isBlank: boolean;
  images: OracleImage[];
  panelEntity: OracleEntity | null;
  panelImageId: string | null;
  onShowImage: (image: OracleImage) => void;
  onClear: () => void;
  onAddPicture: () => void;
}

// THE PLAYER DISPLAY — a status badge in the bar that opens what sits beside the map: nothing, an
// entry (chosen in the Details panel) or a picture from the library, plus the link to open the
// display on the shared screen.
export default function DisplayMenu({ campaignId, displayCode, label, isBlank, images, panelEntity, panelImageId, onShowImage, onClear, onAddPicture }: DisplayMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popStyle = usePopoverStyle(rootRef, isOpen, "right");
  const nothingShown = !panelEntity && !panelImageId;

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="orc-display-menu">

      {/* BADGE */}
      <button type="button" className={`badge ${isBlank ? "badge-gray" : "badge-green"} orc-bar-display orc-display-toggle`} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} title="What the players see">
        <Monitor className="w-3 h-3" aria-hidden /> <span className="orc-bar-display-text">{isBlank ? "Display blank" : label}</span>
      </button>

      {/* POPOVER */}
      {isOpen && (
        <div className="orc-display-pop" role="dialog" aria-label="Player display" style={popStyle}>
          <a className="orc-tray-link" href={`/oracle/${displayCode}`} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3 h-3" aria-hidden /> Open display {displayCode}
          </a>
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
                    <img src={`${campaignApi(campaignId)}/images/${panelEntity.image_id}?w=480`} alt="" />
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
                  <img src={`${campaignApi(campaignId)}/images/${image.id}?w=160`} alt="" loading="lazy" />
                </span>
                <span className="orc-tile-caption">{image.caption}</span>
              </button>
            ))}

            {/* ADD PICTURE TILE */}
            <button type="button" className="orc-tile orc-tile-add" onClick={() => { setIsOpen(false); onAddPicture(); }}>
              <span className="orc-tile-art"><Plus className="w-5 h-5" aria-hidden /></span>
              <span className="orc-tile-caption">Get a picture</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
