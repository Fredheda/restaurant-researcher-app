export type Sentiment = "positive" | "negative";

export type TravelMode =
  | "tube"
  | "dlr"
  | "overground"
  | "elizabeth-line"
  | "bus"
  | "walking";

export type PlaceResult = {
  id: string;
  name: string;
  type: string;
  neighbourhood: string;
  /** null when Google has no price level for the place. */
  priceTier: "£" | "££" | "£££" | "££££" | null;

  /** Photo url; the card draws a placeholder gradient when absent. */
  photo?: string;
  /** Food hygiene rating 0 to 5; null = not rated; absent = hide the badge. */
  hygieneRating?: number | null;
  /** One italic line on the card saying why this place suits the owner. */
  whyThis?: string;
  /** True while the deep research for this place is still running. */
  enriching?: boolean;

  overview: {
    /** Google rating and review count; null when Google has none. */
    rating: number | null;
    reviewCount: number | null;
    address: string;
    /** "Open now", "Closed now", or "" when not known. */
    openStatus: string;
    reviewQuotes: { text: string; sentiment: Sentiment }[];
  };

  // The three below are absent until later phases fill them (deep
  // research, taste learning, routes); cards and the overlay hide them.
  menu?: {
    items: { name: string; price?: string; matchesTaste: boolean }[];
  };

  tasteFit?: {
    score: number;
    reasoning: string;
    misses: string[];
  };

  journey?: Journey;

  alreadyRated?: {
    avgRating: number;
    notes: string;
  };
};

export type Journey = {
  totalMinutes: number;
  legs: {
    mode: TravelMode;
    line: string;
    lineColor: string;
    from: string;
    to: string;
    durationMinutes: number;
  }[];
};
