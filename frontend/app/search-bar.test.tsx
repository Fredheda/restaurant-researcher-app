import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBar, searchPlaces } from "./search-bar";
import { PLACES } from "./fixtures/places";

const ONE = [PLACES[0]];

describe("SearchBar", () => {
  it("sends the trimmed query and passes the places on", async () => {
    const searchFn = vi.fn().mockResolvedValue(ONE);
    const onResults = vi.fn();
    render(<SearchBar onResults={onResults} searchFn={searchFn} />);
    await userEvent.type(screen.getByLabelText("Search places"), "  ramen soho  {Enter}");
    expect(searchFn).toHaveBeenCalledWith("ramen soho");
    await waitFor(() => expect(onResults).toHaveBeenCalledWith(ONE));
  });

  it("sends nothing for an empty query", async () => {
    const searchFn = vi.fn();
    render(<SearchBar onResults={vi.fn()} searchFn={searchFn} />);
    await userEvent.type(screen.getByLabelText("Search places"), "   {Enter}");
    expect(searchFn).not.toHaveBeenCalled();
  });

  it("shows busy while waiting and ignores a second submit", async () => {
    let finish: (p: typeof ONE) => void = () => {};
    const searchFn = vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<SearchBar onResults={vi.fn()} searchFn={searchFn} />);
    await userEvent.type(screen.getByLabelText("Search places"), "ramen{Enter}{Enter}");
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    expect(searchFn).toHaveBeenCalledTimes(1);
    finish(ONE);
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
  });

  it("shows a fixed error and does not call onResults when the search fails", async () => {
    const onResults = vi.fn();
    const searchFn = vi.fn().mockRejectedValue(new Error("secret upstream detail"));
    render(<SearchBar onResults={onResults} searchFn={searchFn} />);
    await userEvent.type(screen.getByLabelText("Search places"), "ramen{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Search is unavailable right now. Try again.",
    );
    expect(screen.queryByText(/secret upstream detail/)).toBeNull();
    expect(onResults).not.toHaveBeenCalled();
  });
});

describe("searchPlaces", () => {
  it("posts JSON to /api/searches and returns the places", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "s1", query: "q", places: ONE }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchPlaces("ramen")).toEqual(ONE);
    expect(fetchMock).toHaveBeenCalledWith("/api/searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "ramen" }),
    });
  });

  it("throws on a non-200 answer and on a body without places", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "x" }, { status: 502 })));
    await expect(searchPlaces("ramen")).rejects.toThrow("search failed: 502");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "s1" })));
    await expect(searchPlaces("ramen")).rejects.toThrow("search failed: bad body");
  });
});
