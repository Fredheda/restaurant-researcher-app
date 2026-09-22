import type { PlaceResult } from "./types";
import { Card } from "./card";

export function Board({
  places,
  selectedIds,
  onToggleSelect,
  onOpen,
  onCompare,
}: {
  places: PlaceResult[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onCompare: () => void;
}) {
  return (
    <div className="relative flex-1 overflow-y-auto bg-bg p-4">
      {places.length === 0 ? (
        <p className="text-sm text-navy-muted">
          Ask about a place in the chat to add it to the board.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {places.map((place) => (
            <Card
              key={place.id}
              place={place}
              selected={selectedIds.includes(place.id)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
      {selectedIds.length >= 2 && (
        <button
          type="button"
          onClick={onCompare}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-sm bg-navy px-5 py-2 text-sm font-semibold text-surface"
        >
          Compare {selectedIds.length} selected
        </button>
      )}
    </div>
  );
}
