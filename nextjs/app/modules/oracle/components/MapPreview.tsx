import { MAP_GRID } from "../lib/constants";
import { isOval } from "../lib/mapData";
import type { MapData } from "../types/oracle";

interface MapPreviewProps {
  data: MapData;
  pictureUrl: string | null;
  grid?: boolean; // draw the tile grid over it (the map page; lists stay plain)
}

// A small drawing of a map for lists: the picture where it sits, then the features, no grid or labels.
export default function MapPreview({ data, pictureUrl, grid = false }: MapPreviewProps) {
  const picture = data.background ?? { x: 0, y: 0, w: data.width, h: data.height };
  return (
    <svg className="orc-map-preview" viewBox={`0 0 ${data.width} ${data.height}`} role="img" aria-label="Map preview" preserveAspectRatio="xMidYMid meet" style={{ aspectRatio: `${data.width} / ${data.height}` }}>
      <defs>
        <clipPath id="orc-preview-clip"><rect x={0} y={0} width={data.width} height={data.height} /></clipPath>
      </defs>
      <rect className="orc-map-ground" x={0} y={0} width={data.width} height={data.height} />
      {pictureUrl && (
        <g clipPath="url(#orc-preview-clip)">
          <image href={pictureUrl} x={picture.x} y={picture.y} width={picture.w} height={picture.h} preserveAspectRatio="none" />
        </g>
      )}
      {["water", "road", "wall", "building", "landmark"].map((layer) =>
        data.features
          .filter((feature) => feature.type === layer)
          .map((feature) => (
            <g key={feature.id} className="orc-feature" data-type={feature.type} data-state={feature.state}>
              {isOval(feature) ? (
                <ellipse className="orc-feature-shape" cx={feature.x + feature.w / 2} cy={feature.y + feature.h / 2} rx={feature.w / 2} ry={feature.h / 2} />
              ) : (
                <rect className="orc-feature-shape" x={feature.x} y={feature.y} width={feature.w} height={feature.h} />
              )}
            </g>
          ))
      )}
      {grid && (
        <g pointerEvents="none">
          {Array.from({ length: Math.floor(data.width / MAP_GRID) + 1 }, (_, c) => <line key={`v${c}`} className="orc-preview-grid" x1={c * MAP_GRID} y1={0} x2={c * MAP_GRID} y2={data.height} />)}
          {Array.from({ length: Math.floor(data.height / MAP_GRID) + 1 }, (_, r) => <line key={`h${r}`} className="orc-preview-grid" x1={0} y1={r * MAP_GRID} x2={data.width} y2={r * MAP_GRID} />)}
        </g>
      )}
    </svg>
  );
}
