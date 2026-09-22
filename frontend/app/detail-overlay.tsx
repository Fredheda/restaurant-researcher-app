import type { PlaceResult } from "./types";
import { JourneyWidget } from "./journey-widget";

export function DetailOverlay({
  place,
  onClose,
}: {
  place: PlaceResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        data-testid="detail-overlay"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{place.name}</h2>
            <p className="text-sm text-gray-600">
              {place.type} · {place.neighbourhood} · {place.priceTier}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <section className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Overview</div>
            <div className="mt-1">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                {place.overview.rating.toFixed(1)} ★
              </span>
              <span className="ml-2 text-gray-500">{place.overview.reviewCount} reviews</span>
            </div>
            <p className="mt-2 text-gray-700">{place.overview.address}</p>
            <p className="text-green-700">{place.overview.openStatus}</p>
            {place.overview.reviewQuotes.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs italic text-gray-600">
                {place.overview.reviewQuotes.map((q) => (
                  <li key={q.text} className={q.sentiment === "negative" ? "text-red-700" : undefined}>
                    &quot;{q.text}&quot;
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Menu highlights</div>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {place.menu.items.map((item) => (
                <li key={item.name} className="flex justify-between py-1">
                  <span>
                    {item.name}
                    {item.matchesTaste && <span className="ml-1 text-xs text-green-700">✓</span>}
                  </span>
                  {item.price && <span className="text-gray-500">{item.price}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-gray-200 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Taste fit</div>
            <div className="mt-1 text-3xl font-extrabold text-green-700">
              {place.tasteFit.score.toFixed(1)}
              <span className="text-base font-normal text-gray-500">/10</span>
            </div>
            <p className="mt-2 text-sm text-gray-700">{place.tasteFit.reasoning}</p>
            {place.tasteFit.misses.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                {place.tasteFit.misses.map((m) => (
                  <li key={m}>⚠ {m}</li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-4">
          <JourneyWidget journey={place.journey} variant="full" />
        </div>
      </div>
    </div>
  );
}
