"use client";

import { useState } from "react";
import type { PlaceResult } from "./types";
import { Board } from "./board";
import { ChatPanel } from "./chat-panel";
import { DetailOverlay } from "./detail-overlay";
import { ComparePanel } from "./compare-panel";
import { PLACES } from "./fixtures/places";

// Seeds the board so it isn't blank on first load. Picked to show range
// (a low taste-fit score with misses, and an alreadyRated place) without
// overlapping the places the demo chat flow adds by name.
const SEED_IDS = ["sabor-mayfair", "padella-shoreditch"];

function seedPlaces(): PlaceResult[] {
  return PLACES.filter((p) => SEED_IDS.includes(p.id));
}

export default function Page() {
  const [places, setPlaces] = useState<PlaceResult[]>(seedPlaces);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  function addPlace(place: PlaceResult) {
    setPlaces((prev) => (prev.some((p) => p.id === place.id) ? prev : [...prev, place]));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]
    );
  }

  const openPlace = places.find((p) => p.id === openId) ?? null;
  const comparedPlaces = places.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="flex h-screen">
      <Board
        places={places}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onOpen={setOpenId}
        onCompare={() => setComparing(true)}
      />
      <ChatPanel onPlaceFound={addPlace} />
      {openPlace && <DetailOverlay place={openPlace} onClose={() => setOpenId(null)} />}
      {comparing && comparedPlaces.length >= 2 && (
        <ComparePanel places={comparedPlaces} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
