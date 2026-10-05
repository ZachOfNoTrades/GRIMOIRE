"use client";

import { Gem, Landmark, LayoutList, PawPrint, Rows3, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { makeSearchRanker } from "@/lib/searchMatch";
import { campaignApi } from "../lib/client";
import type { EntityKind, OracleEntity } from "../types/oracle";

export type EntityView = "rows" | "pictures";

// Narrow a list to what the query matches, closest first. A hit on the name always outranks one
// buried in the details, and a near miss ("Orin" for "Orrin") still lands, below the real ones.
// `tieBreak` keeps the caller's own order among equally good matches.
export function rankEntities(entities: OracleEntity[], query: string, tieBreak?: (a: OracleEntity, b: OracleEntity) => number): OracleEntity[] {
  const needle = query.trim();
  if (!needle) return tieBreak ? [...entities].sort(tieBreak) : entities;
  const rank = makeSearchRanker(needle);
  const score = (entity: OracleEntity) => {
    const onName = rank(entity.name);
    return onName > 0 ? onName * 2 : rank(entity.details);
  };
  return entities
    .map((entity) => ({ entity, score: score(entity) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (tieBreak ? tieBreak(a.entity, b.entity) : 0))
    .map((row) => row.entity);
}

export const KIND_ICONS: Record<EntityKind, typeof User> = { creature: PawPrint, person: User, place: Landmark, item: Gem };
export const KIND_LABELS: Record<EntityKind, string> = { creature: "Creature", person: "Person", place: "Location", item: "Item" };

// HOW THE ROWS ARE DRAWN — the same pair of buttons wherever a list of entities appears.
// No title attribute: a hover tooltip never shows on a touch screen and lags on a mouse, so the
// name lives on aria-label and the pressed state says which one is on.
export function EntityViewToggle({ view, onChange, className }: { view: EntityView; onChange: (view: EntityView) => void; className?: string }) {
  return (
    <div className={`erow-view-toggle ${className ?? ""}`} role="group" aria-label="How the rows are drawn">
      <button type="button" className={`erow-view-option ${view === "rows" ? "is-active" : ""}`} aria-pressed={view === "rows"} aria-label="A line each" onClick={() => onChange("rows")}>
        <Rows3 className="w-4 h-4" aria-hidden />
      </button>
      <button type="button" className={`erow-view-option ${view === "pictures" ? "is-active" : ""}`} aria-pressed={view === "pictures"} aria-label="With pictures" onClick={() => onChange("pictures")}>
        <LayoutList className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

interface EntityRowsProps {
  entities: OracleEntity[]; // already filtered and in the order they should appear
  campaignId: string;
  view: EntityView;
  onSelect: (entity: OracleEntity) => void;
  /** The box the hover card is hung off, so it never covers the list it describes. */
  anchor?: string;
  empty?: React.ReactNode;
}

// A LIST OF ENTITIES — a line each, or a taller row with the thing's picture. Resting on one
// shows a card with its picture and what is written about it, so neither view has to carry the
// description itself.
export default function EntityRows({ entities, campaignId, view, onSelect, anchor = ".orc-details", empty }: EntityRowsProps) {
  const [preview, setPreview] = useState<{ entity: OracleEntity; top: number; right: number } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holdPreview = (entity: OracleEntity, element: HTMLElement) => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    const box = element.getBoundingClientRect();
    // Measured from the panel's own edge, not the row's: the row sits inside the panel's padding,
    // so hanging the card off it left the card overlapping the list it describes.
    const panel = element.closest(anchor)?.getBoundingClientRect();
    const right = window.innerWidth - (panel?.left ?? box.left) + 8;
    previewTimer.current = setTimeout(() => setPreview({ entity, top: Math.min(box.top, window.innerHeight - 320), right }), 500);
  };
  const dropPreview = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreview(null);
  };
  useEffect(() => dropPreview, []);
  useEffect(() => { dropPreview(); }, [view, entities]);

  if (entities.length === 0) return <>{empty ?? null}</>;

  return (
    <>
      {/* RESULT ROWS */}
      <div className="orc-details-list">
        {entities.map((entity) => {
          const Icon = KIND_ICONS[entity.kind];
          return (
            <button
              key={entity.id}
              type="button"
              className="orc-details-row"
              data-view={view}
              disabled={entity.id.startsWith("tmp-")}
              onPointerEnter={(event) => holdPreview(entity, event.currentTarget)}
              onPointerLeave={dropPreview}
              onFocus={(event) => holdPreview(entity, event.currentTarget)}
              onBlur={dropPreview}
              onClick={() => {
                dropPreview();
                onSelect(entity);
              }}
            >
              {view === "pictures" ? (
                // The picture stands in for the icon, so the type is said by a small mark in its
                // corner instead — the same icon, just quieter.
                <span className="orc-row-face">
                  {entity.image_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="orc-row-photo" src={`${campaignApi(campaignId)}/images/${entity.image_id}?w=240`} alt="" decoding="sync" />
                  ) : (
                    <span className="orc-row-photo orc-row-photo-none"><Icon className="w-5 h-5" aria-hidden /></span>
                  )}
                  <span className="orc-row-type" aria-label={KIND_LABELS[entity.kind]} role="img">
                    <Icon className="w-3.5 h-3.5" aria-hidden />
                  </span>
                </span>
              ) : (
                <Icon className="w-4 h-4 orc-attitude" data-attitude={entity.attitude} aria-label={KIND_LABELS[entity.kind]} role="img" />
              )}
              <span className="orc-details-row-name">{entity.name}</span>
            </button>
          );
        })}
      </div>

      {/* WHAT THE POINTER IS RESTING ON */}
      {preview && (
        <div className="orc-row-preview" style={{ top: preview.top, right: preview.right }} role="tooltip">
          {preview.entity.image_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="orc-row-preview-photo" src={`${campaignApi(campaignId)}/images/${preview.entity.image_id}?w=480`} alt="" />
          )}
          <p className="orc-row-preview-name">{preview.entity.name}</p>
          <p className="orc-row-preview-detail">{preview.entity.details || "Nothing written yet."}</p>
        </div>
      )}
    </>
  );
}
