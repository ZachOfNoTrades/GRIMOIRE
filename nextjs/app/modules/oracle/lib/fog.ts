// Shared by server and client code — keep this file free of Node-only imports.
import type { ExploredCircle } from "../types/oracle";
import { MAX_EXPLORED } from "./constants";

// FOG OF WAR — three states, the standard model:
//   unexplored  nothing is shown (black on the player display)
//   explored    seen before, out of sight now: terrain and buildings only, dimmed, no creatures
//   visible     inside the party's vision radius: everything
// The explored area is the union of circles the party has stood in (plus any the DM brushed in).

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// Whether a point is inside the party's current vision.
export function isVisible(partyX: number, partyY: number, visionRadius: number, x: number, y: number): boolean {
  return distance(partyX, partyY, x, y) <= visionRadius;
}

export interface VisionPoint {
  x: number;
  y: number;
}

// Whether a point is in sight of the party token or of any member standing apart from it.
export function isVisibleFrom(points: VisionPoint[], visionRadius: number, x: number, y: number): boolean {
  return points.some((point) => distance(point.x, point.y, x, y) <= visionRadius);
}

// The party token plus every member split off onto this map.
export function visionPoints(map: { id: string; party_x: number; party_y: number }, members: { map_id: string | null; map_x: number | null; map_y: number | null }[]): VisionPoint[] {
  const points: VisionPoint[] = [{ x: map.party_x, y: map.party_y }];
  for (const member of members) {
    if (member.map_id === map.id && member.map_x !== null && member.map_y !== null) points.push({ x: member.map_x, y: member.map_y });
  }
  return points;
}

export function isExplored(explored: ExploredCircle[], x: number, y: number): boolean {
  return explored.some((circle) => distance(circle.x, circle.y, x, y) <= circle.r);
}

// Add a seen circle. One that sits almost on top of an existing circle of at least its size adds
// nothing visible, so it is skipped; that keeps the list short while a token is dragged around.
export function addExplored(explored: ExploredCircle[], x: number, y: number, r: number): ExploredCircle[] {
  const redundant = explored.some((circle) => circle.r >= r && distance(circle.x, circle.y, x, y) <= r * 0.3);
  if (redundant || explored.length >= MAX_EXPLORED) return explored;
  return [...explored, { x: Math.round(x), y: Math.round(y), r: Math.round(r) }];
}

// Reveal the straight path between two points, so a long drag leaves no unexplored gaps.
export function addExploredPath(
  explored: ExploredCircle[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  r: number
): ExploredCircle[] {
  const steps = Math.max(1, Math.ceil(distance(fromX, fromY, toX, toY) / (r * 0.5)));
  let next = explored;
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    next = addExplored(next, fromX + (toX - fromX) * ratio, fromY + (toY - fromY) * ratio, r);
  }
  return next;
}

// Hide again: drop every seen circle whose center the brush covers. A small brush therefore lifts
// only the small circles it is over; a wide reveal needs a brush at least as wide to clear it.
export function eraseExplored(explored: ExploredCircle[], x: number, y: number, brush: number): ExploredCircle[] {
  return explored.filter((circle) => distance(circle.x, circle.y, x, y) > brush);
}
