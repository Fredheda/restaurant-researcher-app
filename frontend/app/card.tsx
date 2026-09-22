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
      className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <button type="button" onClick={() => onOpen(place.id)} className="col-span-full text-left">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Overview</div>
            <div className="text-lg font-bold">{place.name}</div>
            <div className="text-sm text-gray-600">
              {place.type} · {place.neighbourhood} · {place.priceTier}
            </div>
          </div>
          <label
            className="flex items-center gap-1 text-xs text-gray-500"
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
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
            {place.overview.rating.toFixed(1)} ★
          </span>
          <span className="text-gray-500">{place.overview.reviewCount} reviews</span>
        </div>
        <div className="mt-1 text-xs text-green-700">{place.overview.openStatus}</div>
      </button>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500">Menu highlights</div>
        <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
          {topDishes.map((item) => (
            <li key={item.name}>
              {item.name}
              {item.matchesTaste && <span className="ml-1 text-xs text-green-700">✓</span>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500">Taste fit</div>
        <div className="text-2xl font-extrabold text-green-700">
          {place.tasteFit.score.toFixed(1)}
          <span className="text-sm font-normal text-gray-500">/10</span>
        </div>
      </div>

      <JourneyWidget journey={place.journey} variant="compact" />
    </div>
  );
}
