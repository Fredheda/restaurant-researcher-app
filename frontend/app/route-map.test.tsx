import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteMap } from "./route-map";
import { PLACES } from "./fixtures/places";

const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;

describe("RouteMap", () => {
  it("names the route and total time for assistive tech", () => {
    render(<RouteMap journey={fogo.journey} from="Canary Wharf" to="Fogo de Chão" />);
    const svg = screen.getByRole("img", { name: /Route from Canary Wharf to Fogo de Chão/ });
    expect(svg.getAttribute("aria-label")).toContain("22 minutes");
  });

  it("draws one polyline per leg, dashed for walks, in the line colour otherwise", () => {
    const { container } = render(
      <RouteMap journey={fogo.journey} from="Canary Wharf" to="Fogo de Chão" />
    );
    const lines = container.querySelectorAll("polyline");
    expect(lines).toHaveLength(fogo.journey.legs.length);
    fogo.journey.legs.forEach((leg, i) => {
      if (leg.mode === "walking") {
        expect(lines[i].getAttribute("stroke-dasharray")).toBeTruthy();
      } else {
        expect(lines[i].getAttribute("stroke")).toBe(leg.lineColor);
        expect(lines[i].getAttribute("stroke-dasharray")).toBeNull();
      }
    });
  });

  it("labels the start and the destination", () => {
    render(<RouteMap journey={fogo.journey} from="Canary Wharf" to="Fogo de Chão" />);
    expect(screen.getByText("Canary Wharf")).toBeInTheDocument();
    expect(screen.getByText("Fogo de Chão")).toBeInTheDocument();
  });

  it("renders with no legs and with a single walking leg", () => {
    const { container, rerender } = render(
      <RouteMap journey={{ totalMinutes: 0, legs: [] }} from="A" to="B" />
    );
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
    rerender(
      <RouteMap
        journey={{
          totalMinutes: 6,
          legs: [{ mode: "walking", line: "Walk", lineColor: "#9E9E9E", from: "A", to: "B", durationMinutes: 6 }],
        }}
        from="A"
        to="B"
      />
    );
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
  });
});
