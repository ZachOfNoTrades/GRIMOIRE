import sharp from "sharp";
import type { FeatureType, MapData } from "../types/oracle";
import { isOval } from "./mapData";

// MAP LAYOUT RENDER — a map's shapes drawn flat and top-down, one color per type, with no text and
// no grid: the picture an image model paints over so the painting lines up with the map. Proven on
// the Flats (2026-10-03): a text prompt alone loses the layout and the camera angle; a flat diagram
// as the reference keeps both.

const GROUND = "#d9cdb4";
const LAYERS: FeatureType[] = ["water", "road", "wall", "building", "landmark"];

// Each type's color in the diagram, the color's name and what it stands for, as the prompt says it.
const LEGEND: Record<FeatureType, { fill: string; color: string; meaning: string }> = {
  water: { fill: "#9fd8c6", color: "pale green", meaning: "water: rivers, streams, pools, lakes or the sea" },
  road: { fill: "#c9b98a", color: "tan", meaning: "roads, paths and tracks" },
  wall: { fill: "#4a4a4a", color: "dark grey", meaning: "walls, cliffs and high rock, seen from above" },
  building: { fill: "#8a5a3c", color: "brown", meaning: "buildings, seen from above as roofs" },
  landmark: { fill: "#6b6b6b", color: "grey", meaning: "landmarks such as rocks, towers, trees, wells or statues" },
};

export async function renderLayoutPng(data: MapData): Promise<Buffer> {
  const shapes = [...data.features]
    .sort((a, b) => LAYERS.indexOf(a.type) - LAYERS.indexOf(b.type))
    .map((feature) => {
      const fill = LEGEND[feature.type].fill;
      return isOval(feature)
        ? `<ellipse cx="${feature.x + feature.w / 2}" cy="${feature.y + feature.h / 2}" rx="${feature.w / 2}" ry="${feature.h / 2}" fill="${fill}"/>`
        : `<rect x="${feature.x}" y="${feature.y}" width="${feature.w}" height="${feature.h}" fill="${fill}"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${data.width}" height="${data.height}" viewBox="0 0 ${data.width} ${data.height}"><rect width="${data.width}" height="${data.height}" fill="${GROUND}"/>${shapes}</svg>`;
  // Twice the map's size, so the model gets a crisp reference.
  return sharp(Buffer.from(svg)).resize({ width: data.width * 2 }).png().toBuffer();
}

// The prompt that goes with the diagram: keep every shape where it is, what each color means, the
// named places, and what the DM asked for.
export function layoutPrompt(data: MapData, request: string, world: string): string {
  const present = LAYERS.filter((type) => data.features.some((feature) => feature.type === type));
  const colors = present.map((type) => `${LEGEND[type].color} = ${LEGEND[type].meaning}`);
  colors.push("the sand-colored background = open ground that fits the place");
  const named = data.features.filter((feature) => feature.name.trim()).slice(0, 40).map((feature) => `${feature.name.trim()} (${feature.type})`);
  return [
    "Repaint this flat diagram as a finished top-down tabletop battle map (VTT style), orthographic, viewed straight down, no perspective, no horizon, no sky.",
    "Keep every colored shape exactly where it is and the same size; the picture must line up with the diagram. Do not add text, labels, a compass, a border or a grid.",
    `What the map shows: ${request.trim()}.${data.description ? ` ${data.description.slice(0, 500)}` : ""}`,
    `Meaning of the colors: ${colors.join("; ")}.`,
    named.length > 0 ? `Named places, for mood only: ${named.join("; ")}.` : "",
    world ? `Setting: ${world.slice(0, 400)}` : "",
    "Painterly, high detail.",
  ].filter(Boolean).join("\n");
}

// The supported aspect ratio closest to the map's own shape.
const RATIOS: [string, number][] = [["1:1", 1], ["4:3", 4 / 3], ["3:2", 3 / 2], ["16:9", 16 / 9], ["21:9", 21 / 9], ["3:4", 3 / 4], ["2:3", 2 / 3], ["9:16", 9 / 16]];
export function layoutAspect(data: MapData): string {
  const shape = data.width / data.height;
  return RATIOS.reduce((best, entry) => (Math.abs(Math.log(entry[1] / shape)) < Math.abs(Math.log(best[1] / shape)) ? entry : best))[0];
}
