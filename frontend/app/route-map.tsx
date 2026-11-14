import { LINE_H, layoutRoute, routeLabels } from "./route-layout";
import type { RouteLabel } from "./route-layout";
import type { Journey } from "./types";

const INK = "#1c1c1a";
const MUTED = "#7a7970";
const BOX = { width: 320, height: 120 };

function Text({ label, fill }: { label: RouteLabel; fill: string }) {
  return (
    <text x={label.x} y={label.y} fontSize="9" textAnchor="middle" fill={fill}>
      {label.lines.map((line, i) => (
        <tspan key={i} x={label.x} dy={i === 0 ? 0 : LINE_H}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Journey strip, origin on the left to destination on the right, drawn from the legs. */
export function RouteMap({ journey, from, to }: { journey: Journey; from: string; to: string }) {
  const legs = journey.legs;
  const { points } = layoutRoute(legs, BOX);
  const labels = routeLabels(legs, points, from, to, BOX);
  const summary = legs
    .map((leg) => `${leg.mode === "walking" ? "walk" : leg.line} ${leg.durationMinutes}`)
    .join(", ");
  const description =
    `Route from ${from} to ${to}, ${journey.totalMinutes} minutes` + (summary ? `: ${summary}` : "");

  return (
    <svg
      role="img"
      aria-label={description}
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      className="h-auto w-full max-w-full"
    >
      {legs.map((leg, i) => {
        const walking = leg.mode === "walking";
        return (
          <polyline
            key={`seg-${i}`}
            points={`${points[i].x},${points[i].y} ${points[i + 1].x},${points[i + 1].y}`}
            fill="none"
            stroke={walking ? INK : leg.lineColor}
            strokeWidth={walking ? 3 : 7}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={walking ? "4 4" : undefined}
          />
        );
      })}

      {points.map((p, i) => {
        const end = i === 0 || i === points.length - 1;
        const transit = [legs[i - 1], legs[i]].find((leg) => leg && leg.mode !== "walking");
        return end ? (
          <circle key={`stop-${i}`} cx={p.x} cy={p.y} r={6} fill={INK} />
        ) : (
          <circle
            key={`stop-${i}`}
            cx={p.x}
            cy={p.y}
            r={transit ? 5 : 3}
            fill={transit ? "#ffffff" : INK}
            stroke={transit ? transit.lineColor : INK}
            strokeWidth={transit ? 3 : 0}
          />
        );
      })}

      {labels.legs.map((label, i) => (
        <Text key={`leg-${i}`} label={label} fill={MUTED} />
      ))}

      {labels.stops.map((label) => (
        <g key={`name-${label.index}`}>
          {label.row === 1 && (
            <line
              x1={points[label.index].x}
              y1={points[label.index].y + 8}
              x2={points[label.index].x}
              y2={label.box.top - 1}
              stroke={MUTED}
              strokeWidth={0.5}
            />
          )}
          <Text label={label} fill={label.index === 0 || label.index === points.length - 1 ? INK : MUTED} />
        </g>
      ))}
    </svg>
  );
}
