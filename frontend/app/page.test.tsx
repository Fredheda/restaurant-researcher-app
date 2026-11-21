import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";
import { PLACES } from "./fixtures/places";

describe("Page shell", () => {
  it("shows the wordmark, the start badge and the two seeded cards", () => {
    render(<Page />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Tonight")).toBeInTheDocument();
    expect(header.getByText("from Canary Wharf")).toBeInTheDocument();
    expect(screen.getByTestId("card-sabor-mayfair")).toBeInTheDocument();
    expect(screen.getByTestId("card-padella-shoreditch")).toBeInTheDocument();
  });

  it("replaces the seeded board with the search results and keeps it on an error", async () => {
    const found = { ...PLACES[2], id: "found-one", name: "Found One" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ id: "s1", query: "q", places: [found] }))
        .mockResolvedValueOnce(Response.json({ error: "x" }, { status: 502 })),
    );
    render(<Page />);
    await userEvent.type(screen.getByLabelText("Search places"), "ramen{Enter}");
    expect(await screen.findByTestId("card-found-one")).toBeInTheDocument();
    expect(screen.queryByTestId("card-sabor-mayfair")).toBeNull();
    await userEvent.type(screen.getByLabelText("Search places"), "x{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("card-found-one")).toBeInTheDocument();
  });
});
