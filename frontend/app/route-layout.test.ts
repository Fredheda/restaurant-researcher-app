import { describe, expect, it } from "vitest";
import { layoutRoute } from "./route-layout";
import { PLACES } from "./fixtures/places";
import type { PlaceResult } from "./types";

type Legs = PlaceResult["journey"]["legs"];

const BOX = { width: 320, height: 160 };
const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;

function leg(durationMinutes: number): Legs[number] {
  return { mode: "tube", line: "Jubilee", lineColor: "#A0A5A9", from: "A", to: "B", durationMinutes };
}

function assertSchematic(legs: Legs) {
  const { points } = layoutRoute(legs, BOX);
  expect(points).toHaveLength(legs.length + 1);
  for (let i = 0; i < legs.length; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    expect(dx).toBeLessThanOrEqual(0.01);
    const horizontal = Math.abs(dy) < 0.01;
    const diagonal = Math.abs(Math.abs(dy) - Math.abs(dx)) < 0.01;
    expect(horizontal || diagonal).toBe(true);
  }
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(24 - 0.01);
    expect(p.x).toBeLessThanOrEqual(BOX.width - 24 + 0.01);
    expect(p.y).toBeGreaterThanOrEqual(24 - 0.01);
    expect(p.y).toBeLessThanOrEqual(BOX.height - 24 + 0.01);
  }
}

describe("layoutRoute", () => {
  it("draws the Fogo route with only horizontal and 45 degree segments inside the box", () => {
    assertSchematic(fogo.journey.legs);
  });

  it("handles a long five-leg route and very short and very long legs", () => {
    assertSchematic([leg(2), leg(30), leg(1), leg(60), leg(8)]);
  });

  it("returns a single centred point for no legs and does not throw", () => {
    const { points } = layoutRoute([], BOX);
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({ x: BOX.width / 2, y: BOX.height / 2 });
  });
});
