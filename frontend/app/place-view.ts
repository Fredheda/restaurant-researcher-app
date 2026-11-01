import type { CSSProperties } from "react";
import type { PlaceResult } from "./types";

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Card photo: the photo url when there is one, else a tinted gradient from the id. */
export function photoStyle(place: Pick<PlaceResult, "id" | "photo">): CSSProperties {
  if (place.photo) {
    return {
      backgroundImage: `url(${place.photo})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  const hue = hash(place.id) % 360;
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 25% 78%), hsl(${hue} 30% 62%))`,
  };
}

/** One-line route for the card footer: first transit line, where it ends, total minutes. */
export function routeSummary(journey: PlaceResult["journey"]): string {
  if (journey.legs.length === 0) return "No route";
  const transit = journey.legs.find((leg) => leg.mode !== "walking");
  if (!transit) return `Walk · ${journey.totalMinutes} min`;
  return `${transit.line} → ${transit.to} · ${journey.totalMinutes} min`;
}

/** Hygiene badge text: null when the rating is unknown to the data, a label otherwise. */
export function hygieneLabel(rating: number | null | undefined): string | null {
  if (rating === undefined) return null;
  if (rating === null) return "Hygiene not rated";
  return `Hygiene ${rating}`;
}
