import type { PlaceResult } from "./types";

const ROWS: { label: string; value: (p: PlaceResult) => string }[] = [
  { label: "Taste fit", value: (p) => `${p.tasteFit.score.toFixed(1)}/10` },
  { label: "Price", value: (p) => p.priceTier },
  { label: "Rating", value: (p) => `${p.overview.rating.toFixed(1)} ★` },
  { label: "Journey", value: (p) => `${p.journey.totalMinutes} min` },
];

export function ComparePanel({
  places,
  onClose,
}: {
  places: PlaceResult[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="compare-panel"
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">Compare {places.length} places</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted">
            ✕
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th></th>
                {places.map((p) => (
                  <th key={p.id} className="py-1 pr-2 font-display font-normal text-ink">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-hairline">
                  <td className="py-1.5 pr-2 text-muted">{row.label}</td>
                  {places.map((p) => (
                    <td key={p.id} className="py-1.5 pr-2 text-ink">
                      {row.value(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
