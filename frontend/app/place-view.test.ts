import { describe, expect, it } from "vitest";
import { hygieneLabel, photoStyle, routeSummary } from "./place-view";
import { PLACES } from "./fixtures/places";

const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;

describe("photoStyle", () => {
  it("is deterministic for an id and differs between ids", () => {
    expect(photoStyle({ id: "a" })).toEqual(photoStyle({ id: "a" }));
    expect(photoStyle({ id: "a" })).not.toEqual(photoStyle({ id: "b" }));
  });

  it("uses the photo url when there is one", () => {
    const style = photoStyle({ id: "a", photo: "https://example.test/p.jpg" });
    expect(String(style.backgroundImage)).toContain("https://example.test/p.jpg");
  });
});

describe("routeSummary", () => {
  it("names the first transit line, its destination and the total", () => {
    expect(routeSummary(fogo.journey)).toBe("Elizabeth line → Liverpool Street · 22 min");
  });

  it("handles an all-walking route and no route", () => {
    const walk = { mode: "walking" as const, line: "Walk", lineColor: "#999999", from: "A", to: "B", durationMinutes: 5 };
    expect(routeSummary({ totalMinutes: 5, legs: [walk] })).toBe("Walk · 5 min");
    expect(routeSummary({ totalMinutes: 5, legs: [] })).toBe("No route");
  });
});

describe("hygieneLabel", () => {
  it("labels a rating, a missing rating and an unknown one", () => {
    expect(hygieneLabel(5)).toBe("Hygiene 5");
    expect(hygieneLabel(null)).toBe("Hygiene not rated");
    expect(hygieneLabel(undefined)).toBeNull();
  });
});
