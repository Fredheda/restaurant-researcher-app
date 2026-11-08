import { describe, expect, it } from "vitest";
import { layoutRoute, routeLabels, shortName } from "./route-layout";
import type { RouteLabel } from "./route-layout";
import { PLACES } from "./fixtures/places";
import type { Journey } from "./types";

type Legs = Journey["legs"];

const HEIGHT = 120;
const WIDTHS = [320, 640];

function leg(durationMinutes: number, to = "B"): Legs[number] {
  return { mode: "tube", line: "Jubilee line", lineColor: "#A0A5A9", from: "A", to, durationMinutes };
}

function intersects(a: RouteLabel["box"], b: RouteLabel["box"]): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

describe("layoutRoute", () => {
  it("reads left to right on one line, origin first, for every fixture journey", () => {
    for (const place of PLACES) {
      for (const width of WIDTHS) {
        const { points } = layoutRoute(place.journey.legs, { width, height: HEIGHT });
        expect(points).toHaveLength(place.journey.legs.length + 1);
        expect(points[0].x).toBeLessThan(points[points.length - 1].x);
        points.forEach((p, i) => {
          expect(p.y).toBe(points[0].y);
          if (i > 0) expect(p.x).toBeGreaterThan(points[i - 1].x);
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(width);
        });
      }
    }
  });

  it("handles a long five-leg route and very short and very long legs", () => {
    const legs = [leg(2), leg(30), leg(1), leg(60), leg(8)];
    const { points } = layoutRoute(legs, { width: 320, height: HEIGHT });
    expect(points).toHaveLength(6);
    expect(points[0].x).toBeLessThan(points[5].x);
  });

  it("returns a single centred point for no legs and does not throw", () => {
    const { points } = layoutRoute([], { width: 320, height: HEIGHT });
    expect(points).toEqual([{ x: 160, y: HEIGHT / 2 }]);
  });
});

describe("shortName", () => {
  it("drops parentheticals, platform and station suffixes", () => {
    expect(shortName("Canary Wharf (One Canada Square)")).toBe("Canary Wharf");
    expect(shortName("Canary Wharf Elizabeth line platform")).toBe("Canary Wharf");
    expect(shortName("Liverpool Street station")).toBe("Liverpool Street");
  });

  it("keeps names that need no shortening", () => {
    expect(shortName("Dishoom, Wood Wharf")).toBe("Dishoom, Wood Wharf");
    expect(shortName("Bank")).toBe("Bank");
  });
});

describe("routeLabels", () => {
  it("has no overlapping labels for any fixture journey at phone and desktop widths", () => {
    for (const place of PLACES) {
      for (const width of WIDTHS) {
        const box = { width, height: HEIGHT };
        const { points } = layoutRoute(place.journey.legs, box);
        const labels = routeLabels(place.journey.legs, points, "Canary Wharf", place.name, box);
        const all = [...labels.legs, ...labels.stops];
        expect(all.length).toBeGreaterThan(0);
        for (let i = 0; i < all.length; i++) {
          const b = all[i].box;
          expect(b.left).toBeGreaterThanOrEqual(0);
          expect(b.right).toBeLessThanOrEqual(width);
          expect(b.top).toBeGreaterThanOrEqual(0);
          expect(b.bottom).toBeLessThanOrEqual(HEIGHT);
          for (let j = i + 1; j < all.length; j++) {
            expect(
              intersects(b, all[j].box),
              `${place.name} @${width}: "${all[i].lines.join(" ")}" vs "${all[j].lines.join(" ")}"`
            ).toBe(false);
          }
        }
      }
    }
  });

  it("labels every leg with its minutes and every distinct stop once", () => {
    const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;
    const box = { width: 320, height: HEIGHT };
    const { points } = layoutRoute(fogo.journey.legs, box);
    const labels = routeLabels(fogo.journey.legs, points, "Canary Wharf", fogo.name, box);
    expect(labels.legs).toHaveLength(fogo.journey.legs.length);
    fogo.journey.legs.forEach((l, i) => {
      expect(labels.legs[i].lines[0]).toContain(String(l.durationMinutes));
    });
    const stopText = labels.stops.map((s) => s.lines.join(" "));
    expect(stopText.filter((t) => t === "Canary Wharf")).toHaveLength(1);
    expect(stopText[0]).toBe("Canary Wharf");
    expect(stopText[stopText.length - 1]).toBe("Fogo de Chão");
    expect(stopText.join(" ")).not.toMatch(/platform/i);
  });

  it("wraps a long destination name onto two lines", () => {
    const box = { width: 320, height: HEIGHT };
    const legs = [leg(5, "X")];
    const { points } = layoutRoute(legs, box);
    const labels = routeLabels(legs, points, "Origin", "The Extraordinarily Long Restaurant Name", box);
    const last = labels.stops[labels.stops.length - 1];
    expect(last.lines.length).toBeGreaterThan(1);
    expect(last.lines.length).toBeLessThanOrEqual(2);
  });
});
