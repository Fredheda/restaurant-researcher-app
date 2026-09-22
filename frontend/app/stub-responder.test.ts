import { describe, expect, it, vi } from "vitest";
import { findPlaceByQuery, PROGRESS_LINES, runStubResearch } from "./stub-responder";

describe("stub-responder", () => {
  it("findPlaceByQuery matches case-insensitively on a substring of the name", () => {
    expect(findPlaceByQuery("fogo de chao")?.id).toBe("fogo-de-chao-bishopsgate");
    expect(findPlaceByQuery("some place that does not exist")).toBeNull();
  });

  it("runStubResearch reports every progress line in order, then resolves to the match", async () => {
    const seen: string[] = [];
    const result = await runStubResearch("Dishoom", (line) => seen.push(line), 0);
    expect(seen).toEqual(PROGRESS_LINES);
    expect(result?.id).toBe("dishoom-canary-wharf");
  });

  it("runStubResearch resolves to null for an unmatched query", async () => {
    const result = await runStubResearch("Nonexistent Place XYZ", vi.fn(), 0);
    expect(result).toBeNull();
  });
});
