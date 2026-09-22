import type { PlaceResult } from "./types";
import { JourneyWidget } from "./journey-widget";

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
  const topDishes = place.menu.items.slice(0, 3);

  return (
    <div
      data-testid={`card-${place.id}`}
      className="grid grid-cols-1 gap-4 rounded-sm border border-hairline bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <button type="button" onClick={() => onOpen(place.id)} className="col-span-full text-left">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-xl text-navy">{place.name}</div>
            <div className="text-sm text-navy-muted">
              {place.type} · {place.neighbourhood}
            </div>
          </div>
          <label
            className="flex items-center gap-1 text-xs text-navy-muted"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(place.id)}
              aria-label={`Select ${place.name} to compare`}
            />
            Compare
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="font-display text-navy italic">{place.overview.rating.toFixed(1)}</span>
          <span className="text-navy-muted">{place.overview.reviewCount} reviews</span>
          <span className="text-navy-muted">{place.priceTier}</span>
        </div>
        <div className="mt-1 text-xs text-good">{place.overview.openStatus}</div>
      </button>

      <div>
        <ul className="mt-1 space-y-0.5 text-sm text-navy">
          {topDishes.map((item) => (
            <li key={item.name}>
              {item.name}
              {item.matchesTaste && <span className="ml-1 text-xs text-brass">✓</span>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="font-display text-2xl text-brass">
          {place.tasteFit.score.toFixed(1)}
          <span className="text-sm font-normal text-navy-muted">/10</span>
        </div>
      </div>

      <JourneyWidget journey={place.journey} variant="compact" />
    </div>
  );
}
