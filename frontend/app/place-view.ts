import type { CSSProperties } from "react";
import type { PlaceResult } from "./types";

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** An https url made safe to put inside CSS url("..."), or null for anything else. */
function safeImageUrl(photo: string | undefined): string | null {
  if (!photo) return null;
  try {
    const url = new URL(photo);
    if (url.protocol !== "https:") return null;
    return url.href.replace(/["\\()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    return null;
  }
}

/** Card photo: an https photo url when there is one, else a tinted gradient from the id. */
export function photoStyle(place: Pick<PlaceResult, "id" | "photo">): CSSProperties {
  const photo = safeImageUrl(place.photo);
  if (photo) {
    return {
      backgroundImage: `url("${photo}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  const hue = hash(place.id) % 360;
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 25% 78%), hsl(${hue} 30% 62%))`,
  };
}

/** One-line route for the card footer: first transit line, where it ends,
 * total minutes; null when the place has no journey yet. */
export function routeSummary(journey: PlaceResult["journey"]): string | null {
  if (!journey) return null;
  if (journey.legs.length === 0) return "No route";
  const transit = journey.legs.find((leg) => leg.mode !== "walking");
  if (!transit) return `Walk · ${journey.totalMinutes} min`;
  return `${transit.line} → ${transit.to} · ${journey.totalMinutes} min`;
}

/** Review count for a badge: 126, 2.1k, 10k. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

/** Star badge: "★ 4.2 · 2.1k", "★ 4.2" without a count, null without a rating. */
export function ratingBadge(
  overview: Pick<PlaceResult["overview"], "rating" | "reviewCount">
): string | null {
  if (overview.rating === null) return null;
  const stars = `★ ${overview.rating.toFixed(1)}`;
  return overview.reviewCount === null ? stars : `${stars} · ${compactCount(overview.reviewCount)}`;
}

/** Hygiene badge text: null when the rating is unknown to the data, a label otherwise. */
export function hygieneLabel(rating: number | null | undefined): string | null {
  if (rating === undefined) return null;
  if (rating === null) return "Hygiene not rated";
  return `Hygiene ${rating}`;
}
