import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparePanel } from "./compare-panel";
import { PLACES } from "./fixtures/places";

const two = PLACES.slice(0, 2);

describe("ComparePanel", () => {
  it("renders one column per place and the taste-fit / price / rating / journey rows", () => {
    render(<ComparePanel places={two} onClose={vi.fn()} />);
    expect(screen.getByRole("columnheader", { name: two[0].name })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: two[1].name })).toBeInTheDocument();
    expect(screen.getByText("Taste fit")).toBeInTheDocument();
    expect(screen.getByText(`${two[0].tasteFit!.score.toFixed(1)}/10`)).toBeInTheDocument();
  });

  it("shows a dash for values a search result does not have yet", () => {
    const bare = {
      ...two[0],
      tasteFit: undefined,
      journey: undefined,
      priceTier: null,
      overview: { ...two[0].overview, rating: null },
    };
    render(<ComparePanel places={[bare, two[1]]} onClose={vi.fn()} />);
    expect(screen.getAllByText("–")).toHaveLength(4);
  });

  it("keeps the table inside a horizontally scrollable wrapper", () => {
    render(<ComparePanel places={two} onClose={vi.fn()} />);
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
  });
});
