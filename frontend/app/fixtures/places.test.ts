import { describe, expect, it } from "vitest";
import { PLACES } from "./places";

describe("PLACES fixtures", () => {
  it("has at least 5 places with unique ids", () => {
    expect(PLACES.length).toBeGreaterThanOrEqual(5);
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the real Fogo de Chão research result", () => {
    const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate");
    expect(fogo).toBeDefined();
    expect(fogo?.journey.totalMinutes).toBe(22);
    expect(fogo?.journey.legs).toHaveLength(3);
    expect(fogo?.tasteFit.misses).toEqual([]);
  });

  it("covers the required edge shapes", () => {
    expect(PLACES.some((p) => p.overview.reviewQuotes.length === 0)).toBe(true);
    expect(PLACES.some((p) => p.journey.legs.length === 1)).toBe(true);
    expect(PLACES.some((p) => p.tasteFit.misses.length > 0)).toBe(true);
    expect(PLACES.some((p) => p.alreadyRated !== undefined)).toBe(true);
  });
});
