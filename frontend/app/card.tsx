import type { PlaceResult } from "./types";
import { HygieneBadge } from "./hygiene-badge";
import { photoStyle, ratingBadge, routeSummary } from "./place-view";

function Shimmer({ width }: { width: string }) {
  return (
    <div
      className="h-2.5 rounded-sm"
      style={{
        width,
        background:
          "linear-gradient(90deg, rgb(128 128 128 / 15%), rgb(128 128 128 / 35%), rgb(128 128 128 / 15%))",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s infinite",
      }}
    />
  );
}

export function Card({
  place,
  selected,
  onToggleSelect,
  onOpen,
}: {
  place: PlaceResult;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const stars = ratingBadge(place.overview);
  const route = routeSummary(place.journey);

  return (
    <div
      data-testid={`card-${place.id}`}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-hairline bg-surface"
    >
      <div className="h-28 flex-shrink-0" style={photoStyle(place)} aria-hidden="true" />
      <label className="absolute top-2 right-2 flex items-center gap-1 rounded-sm bg-surface/90 px-1.5 py-0.5 text-xs text-ink">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(place.id)}
          aria-label={`Select ${place.name} to compare`}
        />
        Compare
      </label>

      <button
        type="button"
        onClick={() => onOpen(place.id)}
        className="flex flex-1 flex-col gap-1.5 p-3 text-left"
      >
        <span className="font-display text-lg leading-tight font-semibold break-words text-ink">
          {place.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs">
          {stars && (
            <span className="rounded-sm bg-star-bg px-1.5 py-0.5 font-semibold text-star-fg">
              {stars}
            </span>
          )}
          <HygieneBadge rating={place.hygieneRating} />
          {place.priceTier && <span className="text-muted">{place.priceTier}</span>}
          {place.overview.openStatus && (
            <span className="text-muted">{place.overview.openStatus}</span>
          )}
        </span>

        {place.enriching ? (
          <span className="flex flex-col gap-1.5 py-0.5">
            <Shimmer width="90%" />
            <Shimmer width="60%" />
          </span>
        ) : (
          place.whyThis && <span className="text-xs text-ink italic">{place.whyThis}</span>
        )}

        {(route || place.enriching || place.tasteFit) && (
          <span className="mt-auto flex items-baseline justify-between gap-2 pt-1 text-xs text-muted">
            <span className="min-w-0 break-words">{route}</span>
            {place.enriching ? (
              <span className="flex-shrink-0">reading menu…</span>
            ) : (
              place.tasteFit && (
                <span className="flex-shrink-0 font-bold text-forest">
                  {`Fit ${place.tasteFit.score.toFixed(1)}`}
                </span>
              )
            )}
          </span>
        )}
      </button>
    </div>
  );
}
