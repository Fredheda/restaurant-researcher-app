import { PLACES } from "./fixtures/places";
import type { PlaceResult } from "./types";

export const PROGRESS_LINES = [
  "Looking up address & hours…",
  "Checking your Notion ratings…",
  "Getting TfL journey…",
];

const DEFAULT_STEP_DELAY_MS = 600;

function normalize(s: string) {
  // NFD + strip combining marks folds accented characters (e.g. "ã" -> "a")
  // before the alphanumeric filter runs — without this, "Chão" collapses to
  // "ch o" (the tilde-a isn't in [a-z0-9] and gets replaced with a space of
  // its own), which then fails to match an accent-free query like "chao".
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findPlaceByQuery(query: string): PlaceResult | null {
  const q = normalize(query);
  if (!q) return null;
  return (
    PLACES.find((p) => {
      const name = normalize(p.name);
      return name.includes(q) || q.includes(name);
    }) ?? null
  );
}

export async function runStubResearch(
  query: string,
  onProgress: (line: string) => void,
  delayMs: number = DEFAULT_STEP_DELAY_MS
): Promise<PlaceResult | null> {
  for (const line of PROGRESS_LINES) {
    onProgress(line);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return findPlaceByQuery(query);
}
