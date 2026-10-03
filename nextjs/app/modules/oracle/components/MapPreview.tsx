import type { MapData } from "../types/oracle";

interface MapPreviewProps {
  data: MapData;
  pictureUrl: string | null;
}

// A small drawing of a map for lists: the picture where it sits, then the features, no grid or labels.
export default function MapPreview({ data, pictureUrl }: MapPreviewProps) {
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
              {feature.type === "landmark" ? (
                <ellipse cx={feature.x + feature.w / 2} cy={feature.y + feature.h / 2} rx={feature.w / 2} ry={feature.h / 2} />
              ) : (
                <rect x={feature.x} y={feature.y} width={feature.w} height={feature.h} />
              )}
            </g>
          ))
      )}
    </svg>
  );
}
