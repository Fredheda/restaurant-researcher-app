import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JourneyWidget } from "./journey-widget";
import { PLACES } from "./fixtures/places";

const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;

describe("JourneyWidget", () => {
  it("compact variant shows total minutes", () => {
    render(<JourneyWidget journey={fogo.journey} variant="compact" />);
    expect(screen.getByTestId("journey-widget-compact")).toHaveTextContent("22 min");
  });

  it("full variant shows one stop per leg plus the start, with leg labels", () => {
    render(<JourneyWidget journey={fogo.journey} variant="full" />);
    const widget = screen.getByTestId("journey-widget-full");
    expect(widget).toHaveTextContent("22 min");
    expect(screen.getAllByRole("listitem")).toHaveLength(fogo.journey.legs.length + 1);
    expect(widget).toHaveTextContent("Elizabeth line · 7 min");
  });
});
