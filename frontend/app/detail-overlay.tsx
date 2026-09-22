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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={onClose}>
      <div
        data-testid="detail-overlay"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl text-navy">{place.name}</h2>
            <p className="text-sm text-navy-muted">
              {place.type} · {place.neighbourhood} · {place.priceTier}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-navy-muted">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <section className="rounded-sm border border-hairline p-4">
            <div className="text-xs text-navy-muted">Overview</div>
            <div className="mt-1">
              <span className="font-display italic text-navy">{place.overview.rating.toFixed(1)}</span>
              <span className="ml-2 text-navy-muted">{place.overview.reviewCount} reviews</span>
            </div>
            <p className="mt-2 text-navy">{place.overview.address}</p>
            <p className="text-good">{place.overview.openStatus}</p>
            {place.overview.reviewQuotes.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-hairline pt-2 text-xs italic text-navy-muted">
                {place.overview.reviewQuotes.map((q) => (
                  <li key={q.text} className={q.sentiment === "negative" ? "text-warn" : undefined}>
                    &quot;{q.text}&quot;
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-sm border border-hairline p-4">
            <div className="text-xs text-navy-muted">Menu</div>
            <ul className="mt-2 divide-y divide-hairline text-sm">
              {place.menu.items.map((item) => (
                <li key={item.name} className="flex justify-between py-1">
                  <span>
                    {item.name}
                    {item.matchesTaste && <span className="ml-1 text-xs text-brass">✓</span>}
                  </span>
                  {item.price && <span className="text-navy-muted">{item.price}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-sm border border-hairline p-4">
            <div className="text-xs text-navy-muted">Taste fit</div>
            <div className="mt-1 font-display text-3xl text-brass">
              {place.tasteFit.score.toFixed(1)}
              <span className="text-base font-normal text-navy-muted">/10</span>
            </div>
            <p className="mt-2 text-sm text-navy">{place.tasteFit.reasoning}</p>
            {place.tasteFit.misses.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-warn">
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
