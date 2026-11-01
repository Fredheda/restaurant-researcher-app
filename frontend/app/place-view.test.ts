import { describe, expect, it } from "vitest";
import { compactCount, hygieneLabel, photoStyle, routeSummary } from "./place-view";
import { PLACES } from "./fixtures/places";

const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;

describe("photoStyle", () => {
  it("is deterministic for an id and differs between ids", () => {
    expect(photoStyle({ id: "a" })).toEqual(photoStyle({ id: "a" }));
    expect(photoStyle({ id: "a" })).not.toEqual(photoStyle({ id: "b" }));
  });

  it("uses an https photo url, quoted", () => {
    const style = photoStyle({ id: "a", photo: "https://example.test/p.jpg" });
    expect(style.backgroundImage).toBe('url("https://example.test/p.jpg")');
  });

  it("ignores non-https and malformed urls and encodes characters that could break out of url()", () => {
    const gradient = photoStyle({ id: "a" });
    expect(photoStyle({ id: "a", photo: "http://example.test/p.jpg" })).toEqual(gradient);
    expect(photoStyle({ id: "a", photo: "javascript:alert(1)" })).toEqual(gradient);
    expect(photoStyle({ id: "a", photo: "not a url" })).toEqual(gradient);
    const tricky = photoStyle({ id: "a", photo: 'https://example.test/a")b;c' });
    expect(tricky.backgroundImage).toBe('url("https://example.test/a%22%29b;c")');
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

describe("compactCount", () => {
  it("keeps small counts and shortens thousands", () => {
    expect(compactCount(126)).toBe("126");
    expect(compactCount(2140)).toBe("2.1k");
    expect(compactCount(10000)).toBe("10k");
  });
});

describe("hygieneLabel", () => {
  it("labels a rating, a missing rating and an unknown one", () => {
    expect(hygieneLabel(5)).toBe("Hygiene 5");
    expect(hygieneLabel(null)).toBe("Hygiene not rated");
    expect(hygieneLabel(undefined)).toBeNull();
  });
});
