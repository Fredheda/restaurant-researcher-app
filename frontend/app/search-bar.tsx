"use client";

import { useState, type FormEvent } from "react";
import type { PlaceResult } from "./types";

type SearchFn =(query: string) => Promise<PlaceResult[]>;

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const response = await fetch("/api/searches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`search failed: ${response.status}`);
  const body = (await response.json()) as { places?: PlaceResult[] };
  if (!Array.isArray(body.places)) throw new Error("search failed: bad body");
  return body.places;
}

export function SearchBar({
  onResults,
  searchFn = searchPlaces,
}: {
  onResults: (places: PlaceResult[]) => void;
  searchFn?: SearchFn;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onResults(await searchFn(text));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto"
    >
      <input
        type="search"
        aria-label="Search places"
        placeholder="Search places…"
        maxLength={300}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="min-w-0 flex-1 rounded-sm border border-hairline bg-paper px-3 py-1.5 text-sm text-ink sm:w-64 sm:flex-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-sm bg-ink px-3 py-1.5 text-sm font-semibold text-paper disabled:opacity-60"
      >
        {busy ? "Searching…" : "Search"}
      </button>
      {failed && (
        <p role="alert" data-testid="search-error" className="w-full text-sm text-ink">
          Search is unavailable right now. Try again.
        </p>
      )}
    </form>
  );
}
