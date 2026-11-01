"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceResult } from "./types";
import { Board } from "./board";
import { ChatPanel } from "./chat-panel";
import { DetailOverlay } from "./detail-overlay";
import { ComparePanel } from "./compare-panel";
import { RatingSheet } from "./rating-sheet";
import { SearchBar } from "./search-bar";
import { useBoardTools } from "./board-tools";
import { PLACES } from "./fixtures/places";
import { visitDraftFor } from "./fixtures/visit-drafts";

// Seeds the board so it isn't blank on first load: two fully researched
// examples (a low taste-fit score with misses, and an alreadyRated place).
// The first search replaces them.
const SEED_IDS = ["sabor-mayfair", "padella-shoreditch"];

function seedPlaces(): PlaceResult[] {
  return PLACES.filter((p) => SEED_IDS.includes(p.id));
}

export default function Page() {
  const [places, setPlaces] = useState<PlaceResult[]>(seedPlaces);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  // The rating sheet is a demo until visits are stored (phase 3): Save closes it.
  const [rating, setRating] = useState<{ placeId: string; today: string } | null>(null);

  /** A search replaces the board; selection and panels refer to old cards. */
  function showSearch(found: PlaceResult[]) {
    setPlaces(found);
    setSelectedIds([]);
    setOpenId(null);
    setComparing(false);
  }

  // Tool handlers can run with the closure of an earlier render; the ref
  // always holds the board as it is now.
  const placesRef = useRef(places);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useBoardTools({
    showSearch,
    openPlace: (id) => {
      const found = placesRef.current.find((p) => p.id === id);
      if (found) setOpenId(id);
      return found?.name ?? null;
    },
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]
    );
  }

  const openPlace = places.find((p) => p.id === openId) ?? null;
  const ratingPlace = places.find((p) => p.id === rating?.placeId) ?? null;
  const comparedPlaces = places.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <span className="font-display text-xl font-semibold text-ink">Tonight</span>
        <span className="rounded-sm bg-ink px-2 py-0.5 text-xs font-semibold text-paper">
          from Canary Wharf
        </span>
        <div className="flex w-full min-w-0 sm:w-auto sm:flex-1">
          <SearchBar onResults={(result) => showSearch(result.places)} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Board
          places={places}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpen={setOpenId}
          onCompare={() => setComparing(true)}
        />
        <ChatPanel />
      </div>
      {openPlace && (
        <DetailOverlay
          place={openPlace}
          onClose={() => setOpenId(null)}
          onRate={() =>
            setRating({ placeId: openPlace.id, today: new Date().toISOString().slice(0, 10) })
          }
        />
      )}
      {ratingPlace && rating && (
        <RatingSheet
          placeName={ratingPlace.name}
          initial={visitDraftFor(ratingPlace, rating.today)}
          onSave={() => setRating(null)}
          onClose={() => setRating(null)}
        />
      )}
      {comparing && comparedPlaces.length >= 2 && (
        <ComparePanel places={comparedPlaces} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
