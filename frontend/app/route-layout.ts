import type { Journey } from "./types";

type Legs = Journey["legs"];
type Size = { width: number; height: number };

export type Point = { x: number; y: number };

/** Text box in SVG units, estimated from character count. */
export type TextBox = { left: number; top: number; right: number; bottom: number };

export type RouteLabel = {
  lines: string[];
  /** Horizontal centre (text-anchor middle) and baseline of the first line. */
  x: number;
  y: number;
  box: TextBox;
};

export type StopLabel = RouteLabel & {
  /** Index of the stop point this label names. */
  index: number;
  /** Row below the line: 0 near it, 1 further down (joined by a leader). */
  row: 0 | 1;
};

const PAD_X = 28;
const MIN_SEGMENT = 40;
const MAX_SEGMENT = 120;
const PX_PER_MINUTE = 6;

/** Average glyph width at the map's 9 px label size, slightly generous. */
export const CHAR_W = 5.5;
export const LINE_H = 11;
const ASCENT = 9;
const DESCENT = 3;
const MARGIN = 2;
const WRAP_AT = 14;
const STOP_ROW_OFFSET = [20, 46] as const;

/**
 * Straight journey strip, origin on the left, destination on the right.
 * Segment lengths follow leg durations (clamped), then stretch to fill the
 * box between the side paddings.
 */
export function layoutRoute(legs: Legs, box: Size): { points: Point[]; width: number; height: number } {
  if (legs.length === 0) {
    return { points: [{ x: box.width / 2, y: box.height / 2 }], width: box.width, height: box.height };
  }
  const y = Math.round(box.height * 0.4);
  const lengths = legs.map((l) => Math.min(MAX_SEGMENT, Math.max(MIN_SEGMENT, l.durationMinutes * PX_PER_MINUTE)));
  const scale = (box.width - 2 * PAD_X) / lengths.reduce((a, b) => a + b, 0);
  const points: Point[] = [{ x: PAD_X, y }];
  for (const length of lengths) {
    points.push({ x: points[points.length - 1].x + length * scale, y });
  }
  return { points, width: box.width, height: box.height };
}

/** "Canary Wharf (One Canada Square)" and "... Elizabeth line platform" become "Canary Wharf". */
export function shortName(name: string): string {
  const short = name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+(Elizabeth line\s+)?(platform|station)$/i, "")
    .trim();
  return short || name.trim();
}

function shortLine(line: string): string {
  return line.replace(/^London\s+/i, "").replace(/\s+line$/i, "");
}

/** At most two lines of about WRAP_AT characters; the rest is cut with an ellipsis. */
function wrap(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (!current || next.length <= WRAP_AT) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines;
  const rest = lines.slice(1).join(" ");
  return [lines[0], rest.length > WRAP_AT ? `${rest.slice(0, WRAP_AT - 1)}…` : rest];
}

function label(lines: string[], cx: number, baseline: number, boxWidth: number): RouteLabel {
  const width = Math.max(...lines.map((l) => l.length)) * CHAR_W;
  const x = Math.min(boxWidth - width / 2 - MARGIN, Math.max(width / 2 + MARGIN, cx));
  return {
    lines,
    x,
    y: baseline,
    box: {
      left: x - width / 2,
      right: x + width / 2,
      top: baseline - ASCENT,
      bottom: baseline + (lines.length - 1) * LINE_H + DESCENT,
    },
  };
}

/**
 * Where the text goes. Leg labels (minutes, line) sit above their segment and
 * are cut back to what fits it. Stop names sit below, alternating between two
 * rows so neighbours never share one; a stop named like the one before it
 * (a walk to the platform of the same station) gets no label.
 */
export function routeLabels(
  legs: Legs,
  points: Point[],
  from: string,
  to: string,
  box: Size
): { legs: RouteLabel[]; stops: StopLabel[] } {
  const legLabels = legs.map((leg, i) => {
    const a = points[i];
    const b = points[i + 1];
    const room = b.x - a.x - 2 * MARGIN;
    const minutes = `${leg.durationMinutes} min`;
    const first = minutes.length * CHAR_W <= room ? minutes : String(leg.durationMinutes);
    const name = shortLine(leg.line);
    const lines = name.length * CHAR_W <= room ? [first, name] : [first];
    return label(lines, (a.x + b.x) / 2, a.y - (lines.length === 2 ? 2 : 1) * 10, box.width);
  });

  const names = [from, ...legs.map((leg, i) => (i === legs.length - 1 ? to : shortName(leg.to)))];
  const stops: StopLabel[] = [];
  names.forEach((name, i) => {
    if (i > 0 && name.toLowerCase() === names[i - 1].toLowerCase()) return;
    const row = (i % 2) as 0 | 1;
    const p = points[i];
    stops.push({ ...label(wrap(name), p.x, p.y + STOP_ROW_OFFSET[row], box.width), index: i, row });
  });
  return { legs: legLabels, stops };
}
