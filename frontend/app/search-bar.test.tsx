import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar, searchPlaces } from "./search-bar";
import type { SearchResult } from "./search-bar";

const RESULT: SearchResult = { id: "s1", query: "ramen", places: [] };

describe("SearchBar", () => {
  it("searches the typed query and hands the result over", async () => {
    const searchFn = vi.fn().mockResolvedValue(RESULT);
    const onResults = vi.fn();
    render(<SearchBar onResults={onResults} searchFn={searchFn} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search places" }), " ramen {Enter}");
    expect(searchFn).toHaveBeenCalledWith("ramen");
    await waitFor(() => expect(onResults).toHaveBeenCalledWith(RESULT));
  });

  it("does not search an empty query", async () => {
    const searchFn = vi.fn();
    render(<SearchBar onResults={vi.fn()} searchFn={searchFn} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search places" }), "   {Enter}");
    expect(searchFn).not.toHaveBeenCalled();
  });

  it("shows a busy state while searching", async () => {
    let finish!: (r: SearchResult) => void;
    const searchFn = vi.fn(() => new Promise<SearchResult>((r) => (finish = r)));
    render(<SearchBar onResults={vi.fn()} searchFn={searchFn} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search places" }), "ramen{Enter}");
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    finish(RESULT);
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
  });

  it("shows an error and keeps the board when the search fails", async () => {
    const onResults = vi.fn();
    const searchFn = vi.fn().mockRejectedValue(new Error("502"));
    render(<SearchBar onResults={onResults} searchFn={searchFn} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search places" }), "ramen{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Search is unavailable. Try again.");
    expect(onResults).not.toHaveBeenCalled();
  });
});

describe("searchPlaces", () => {
  it("posts the query and returns the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(RESULT)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchPlaces("ramen")).toEqual(RESULT);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/searches");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ query: "ramen" });
    vi.unstubAllGlobals();
  });

  it("throws on a non-2xx answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 502 })));
    await expect(searchPlaces("ramen")).rejects.toThrow("search failed: 502");
    vi.unstubAllGlobals();
  });
});
