import type { PlaceResult } from "./types";

type Journey = PlaceResult["journey"];
type Leg = Journey["legs"][number];

const WALK_COLOR = "#9AA3B2";
const NAVY = "#1B2430";

function badgeLetter(leg: Leg) {
  return leg.line.trim().charAt(0).toUpperCase();
}

function PinIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z"
        fill={color}
      />
    </svg>
  );
}

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
        className="rounded-sm border border-hairline bg-surface p-3 text-sm"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-navy-muted">from Canary Wharf</span>
          <span className="font-display text-xl text-navy">{journey.totalMinutes} min</span>
        </div>
        <div className="mt-3 flex items-center">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-navy" />
          {journey.legs.map((leg, i) => {
            const isLast = i === journey.legs.length - 1;
            return (
              <span key={i} className="flex flex-1 items-center">
                <span
                  className="h-0.5 flex-1"
                  style={{
                    background:
                      leg.mode === "walking"
                        ? `repeating-linear-gradient(90deg, ${WALK_COLOR} 0 3px, transparent 3px 6px)`
                        : leg.lineColor,
                  }}
                />
                {isLast ? (
                  <PinIcon size={14} color={NAVY} />
                ) : leg.mode === "walking" ? (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-navy" />
                ) : (
                  <span
                    className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-semibold text-white"
                    style={{ background: leg.lineColor }}
                  >
                    {badgeLetter(leg)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="journey-widget-full"
      className="rounded-sm border border-hairline bg-surface p-6 text-sm"
    >
      <div className="mb-6 flex items-baseline justify-between">
        <span className="text-xs text-navy-muted">Journey from Canary Wharf</span>
        <div className="text-right">
          <span className="font-display text-3xl text-navy">{journey.totalMinutes}</span>{" "}
          <span className="ml-1 text-xs text-navy-muted">min</span>
          <div className="ml-auto mt-0.5 h-0.5 w-10 bg-brass" />
        </div>
      </div>

      <div className="relative">
        <div
          className="absolute top-[11px] right-3.5 left-3.5 h-0.5"
          style={{ background: trackGradient(journey.legs) }}
        />
        <ol className="relative flex items-start justify-between gap-2">
          <li className="flex w-28 flex-col items-center text-center">
            <span className="h-2.5 w-2.5 rounded-full bg-navy" />
            <span className="mt-2 text-sm font-semibold text-navy">
              {journey.legs[0].from}
            </span>
            <span className="text-xs text-navy-muted">start</span>
          </li>
          {journey.legs.map((leg, i) => {
            const isLast = i === journey.legs.length - 1;
            return (
              <li key={i} className="flex w-28 flex-col items-center text-center">
                {isLast ? (
                  <PinIcon size={20} color={NAVY} />
                ) : leg.mode === "walking" ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-navy" />
                ) : (
                  <span
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: leg.lineColor }}
                  >
                    {badgeLetter(leg)}
                  </span>
                )}
                <span className="mt-1.5 text-sm font-semibold text-navy">{leg.to}</span>
                <span
                  className="text-xs"
                  style={{ color: leg.mode === "walking" ? "#5B6472" : leg.lineColor }}
                >
                  {leg.mode === "walking" ? "walk" : leg.line} · {leg.durationMinutes} min
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function trackGradient(legs: Leg[]) {
  const n = legs.length;
  const stops: string[] = [];
  legs.forEach((leg, i) => {
    const color = leg.mode === "walking" ? "#C7CCD3" : leg.lineColor;
    const start = (i / n) * 100;
    const end = ((i + 1) / n) * 100;
    stops.push(`${color} ${start}%`, `${color} ${end}%`);
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
