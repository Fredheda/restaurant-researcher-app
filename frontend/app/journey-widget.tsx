import type { PlaceResult } from "./types";

type Journey = PlaceResult["journey"];

const WALK_COLOR = "#9E9E9E";
const WALK_DASH = "repeating-linear-gradient(90deg,#9E9E9E 0 4px,transparent 4px 8px)";

export function JourneyWidget({
  journey,
  variant,
}: {
  journey: Journey;
  variant: "compact" | "full";
}) {
  if (variant === "compact") {
    return (
      <div
        data-testid="journey-widget-compact"
        className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
      >
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Journey · Canary Wharf
        </div>
        <div className="mt-1 text-2xl font-bold">{journey.totalMinutes} min</div>
        <div className="mt-2 flex items-center gap-1">
          {journey.legs.map((leg, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded"
              style={{ background: leg.mode === "walking" ? WALK_DASH : leg.lineColor }}
            />
          ))}
        </div>
      </div>
    );
  }

  const stops = legsToStops(journey);

  return (
    <div
      data-testid="journey-widget-full"
      className="rounded-lg border border-gray-200 bg-white p-5 text-sm"
    >
      <div className="mb-4 flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Journey from Canary Wharf
        </div>
        <div className="text-3xl font-extrabold">{journey.totalMinutes} min</div>
      </div>
      <ol className="flex items-start justify-between gap-2">
        {stops.map((stop, i) => (
          <li key={i} className="flex flex-1 flex-col items-center text-center">
            <span
              className="mb-1 h-3 w-3 rounded-full"
              style={{
                background: stop.color,
                border: stop.dashed ? "2px dashed #999" : undefined,
              }}
            />
            <span className="font-semibold">{stop.name}</span>
            {stop.legLabel && (
              <span className="text-xs" style={{ color: stop.color }}>
                {stop.legLabel}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function legsToStops(journey: Journey) {
  const stops: { name: string; color: string; dashed: boolean; legLabel?: string }[] = [];
  journey.legs.forEach((leg, i) => {
    if (i === 0) {
      stops.push({ name: leg.from, color: "#333333", dashed: false });
    }
    stops.push({
      name: leg.to,
      color: leg.mode === "walking" ? WALK_COLOR : leg.lineColor,
      dashed: leg.mode === "walking",
      legLabel: `${leg.line} · ${leg.durationMinutes} min`,
    });
  });
  return stops;
}
