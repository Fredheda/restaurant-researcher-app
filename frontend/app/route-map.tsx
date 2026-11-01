import { layoutRoute } from "./route-layout";
import type { PlaceResult } from "./types";

type Journey = PlaceResult["journey"];

const INK = "#1c1c1a";
const MUTED = "#7a7970";
const BOX = { width: 320, height: 160 };

function clampX(x: number): number {
  return Math.min(BOX.width - 40, Math.max(40, x));
}

/** Schematic route (tube-map style), drawn from the journey legs. */
export function RouteMap({ journey, from, to }: { journey: Journey; from: string; to: string }) {
  const { points } = layoutRoute(journey.legs, BOX);
  const legs = journey.legs;
  const summary = legs
    .map((leg) => `${leg.mode === "walking" ? "walk" : leg.line} ${leg.durationMinutes}`)
    .join(", ");
  const label =
    `Route from ${from} to ${to}, ${journey.totalMinutes} minutes` + (summary ? `: ${summary}` : "");

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      className="h-auto w-full max-w-full"
    >
      {legs.map((leg, i) => {
        const a = points[i];
        const b = points[i + 1];
        const walking = leg.mode === "walking";
        return (
          <polyline
            key={`seg-${i}`}
            points={`${a.x},${a.y} ${b.x},${b.y}`}
            fill="none"
            stroke={walking ? INK : leg.lineColor}
            strokeWidth={walking ? 3 : 7}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={walking ? "4 4" : undefined}
          />
        );
      })}

      {legs.map((leg, i) => {
        const a = points[i];
        const b = points[i + 1];
        return (
          <text
            key={`leg-${i}`}
            x={clampX((a.x + b.x) / 2)}
            y={(a.y + b.y) / 2 - 10}
            fontSize="9"
            textAnchor="middle"
            fill={MUTED}
          >
            {leg.mode === "walking" ? `walk ${leg.durationMinutes}` : `${leg.line} · ${leg.durationMinutes} min`}
          </text>
        );
      })}

      {points.map((p, i) => {
        const isStart = i === 0;
        const isEnd = i === points.length - 1 && points.length > 1;
        if (isStart || isEnd) return null;
        const prev = legs[i - 1];
        const next = legs[i];
        const transit = [prev, next].find((leg) => leg.mode !== "walking");
        return (
          <g key={`stop-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={transit ? 5 : 3}
              fill={transit ? "#ffffff" : INK}
              stroke={transit ? transit.lineColor : INK}
              strokeWidth={transit ? 3 : 0}
            />
            <text x={clampX(p.x)} y={p.y + 16} fontSize="9" textAnchor="middle" fill={MUTED}>
              {prev.to}
            </text>
          </g>
        );
      })}

      <g>
        <circle cx={points[0].x} cy={points[0].y} r={6} fill={INK} />
        <text x={clampX(points[0].x)} y={points[0].y + 20} fontSize="10" textAnchor="middle" fill={INK}>
          {from}
        </text>
      </g>
      {points.length > 1 && (
        <g>
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={6} fill={INK} />
          <text
            x={clampX(points[points.length - 1].x)}
            y={points[points.length - 1].y - 12}
            fontSize="10"
            textAnchor="middle"
            fill={INK}
          >
            {to}
          </text>
        </g>
      )}
    </svg>
  );
}
