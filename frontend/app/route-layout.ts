import type { PlaceResult } from "./types";

type Legs = PlaceResult["journey"]["legs"];

export type Point = { x: number; y: number };

const PADDING = 24;
const MIN_SEGMENT = 40;
const MAX_SEGMENT = 120;
const PX_PER_MINUTE = 6;
const DIAGONAL = Math.SQRT1_2;

/**
 * Tube-map style layout: the path starts at the right and heads west, then
 * north-west, alternating, so every segment is horizontal or at 45 degrees.
 * Lengths follow leg durations (clamped), then the whole path is scaled
 * uniformly and centred into `box` with padding, which keeps the angles.
 */
export function layoutRoute(
  legs: Legs,
  box: { width: number; height: number }
): { points: Point[]; width: number; height: number } {
  const raw: Point[] = [{ x: 0, y: 0 }];
  legs.forEach((leg, i) => {
    const length = Math.min(MAX_SEGMENT, Math.max(MIN_SEGMENT, leg.durationMinutes * PX_PER_MINUTE));
    const dx = i % 2 === 0 ? -1 : -DIAGONAL;
    const dy = i % 2 === 0 ? 0 : -DIAGONAL;
    const last = raw[raw.length - 1];
    raw.push({ x: last.x + dx * length, y: last.y + dy * length });
  });

  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const boundsW = Math.max(...xs) - minX;
  const boundsH = Math.max(...ys) - minY;

  const availW = box.width - 2 * PADDING;
  const availH = box.height - 2 * PADDING;
  const scale = Math.min(boundsW > 0 ? availW / boundsW : Infinity, boundsH > 0 ? availH / boundsH : Infinity);
  const s = Number.isFinite(scale) ? scale : 1;

  const offsetX = (box.width - boundsW * s) / 2 - minX * s;
  const offsetY = (box.height - boundsH * s) / 2 - minY * s;
  const points = raw.map((p) => ({ x: p.x * s + offsetX, y: p.y * s + offsetY }));
  return { points, width: box.width, height: box.height };
}
