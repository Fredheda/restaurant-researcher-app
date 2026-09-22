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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        data-testid="compare-panel"
        className="w-full max-w-2xl rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Compare {places.length} places</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400">
            ✕
          </button>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th></th>
              {places.map((p) => (
                <th key={p.id} className="py-1 font-semibold text-gray-900">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-gray-100">
                <td className="py-1.5 text-gray-500">{row.label}</td>
                {places.map((p) => (
                  <td key={p.id} className="py-1.5">
                    {row.value(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
