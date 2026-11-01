"use client";

import { useState } from "react";
import type { PlaceResult } from "./types";

export type SearchResult = { id: string; query: string; places: PlaceResult[] };

/** The fast path: `POST /api/searches`, no model turn. */
export async function searchPlaces(query: string): Promise<SearchResult> {
  const res = await fetch("/api/searches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return (await res.json()) as SearchResult;
}

/** A search the agent ran, read back by id (owner-only on the api). */
export async function fetchSearch(id: string): Promise<SearchResult> {
  const res = await fetch(`/api/searches/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return (await res.json()) as SearchResult;
}

export function SearchBar({
  onResults,
  searchFn = searchPlaces,
}: {
  onResults: (result: SearchResult) => void;
  searchFn?: (query: string) => Promise<SearchResult>;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onResults(await searchFn(q));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form role="search" onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="search"
          aria-label="Search places"
          placeholder="best ramen near Soho"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={300}
          className="min-w-0 flex-1 rounded-sm border border-hairline bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex-shrink-0 rounded-sm bg-ink px-3 py-1.5 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {failed && (
        <p role="alert" className="text-xs text-warn">
          Search is unavailable. Try again.
        </p>
      )}
    </form>
  );
}
