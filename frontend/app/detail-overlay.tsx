import type { PlaceResult } from "./types";
import { RouteMap } from "./route-map";

export function DetailOverlay({
  place,
  onClose,
  onRate,
}: {
  place: PlaceResult;
  onClose: () => void;
  onRate: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="detail-overlay"
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-lg bg-surface p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold break-words text-ink">{place.name}</h2>
            <p className="text-sm text-muted">
              {place.type} · {place.neighbourhood} · {place.priceTier}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <section className="min-w-0 rounded-lg border border-hairline p-4">
            <div className="text-xs text-muted">Overview</div>
            <div className="mt-1">
              <span className="font-display text-ink italic">{place.overview.rating.toFixed(1)}</span>
              <span className="ml-2 text-muted">{place.overview.reviewCount} reviews</span>
            </div>
            <p className="mt-2 text-ink">{place.overview.address}</p>
            <p className="text-good">{place.overview.openStatus}</p>
            {place.overview.reviewQuotes.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-hairline pt-2 text-xs text-muted italic">
                {place.overview.reviewQuotes.map((q) => (
                  <li key={q.text} className={q.sentiment === "negative" ? "text-warn" : undefined}>
                    &quot;{q.text}&quot;
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0 rounded-lg border border-hairline p-4">
            <div className="text-xs text-muted">Menu</div>
            <ul className="mt-2 divide-y divide-hairline text-sm">
              {place.menu.items.map((item) => (
                <li key={item.name} className="flex justify-between gap-2 py-1">
                  <span className="min-w-0 break-words">
                    {item.name}
                    {item.matchesTaste && <span className="ml-1 text-xs text-forest">✓</span>}
                  </span>
                  {item.price && <span className="flex-shrink-0 text-muted">{item.price}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="min-w-0 rounded-lg border border-hairline p-4">
            <div className="text-xs text-muted">Taste fit</div>
            <div className="mt-1 font-display text-3xl text-forest">
              {place.tasteFit.score.toFixed(1)}
              <span className="text-base font-normal text-muted">/10</span>
            </div>
            {place.whyThis && <p className="mt-1 text-sm text-ink italic">{place.whyThis}</p>}
            <p className="mt-2 text-sm text-ink">{place.tasteFit.reasoning}</p>
            {place.tasteFit.misses.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-warn">
                {place.tasteFit.misses.map((m) => (
                  <li key={m}>⚠ {m}</li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-4 rounded-lg border border-hairline p-3">
          <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
            <span>Route from Canary Wharf</span>
            <span className="font-display text-xl text-ink">{place.journey.totalMinutes} min</span>
          </div>
          <RouteMap journey={place.journey} from="Canary Wharf" to={place.name} />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onRate}
            className="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-paper"
          >
            Rate this visit
          </button>
        </div>
      </div>
    </div>
  );
}
