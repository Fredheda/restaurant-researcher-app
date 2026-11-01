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
  priceTier: "£" | "££" | "£££" | "££££";

  /** Photo url; the card draws a placeholder gradient when absent. */
  photo?: string;
  /** Food hygiene rating 0 to 5; null = not rated; absent = hide the badge. */
  hygieneRating?: number | null;
  /** One italic line on the card saying why this place suits the owner. */
  whyThis?: string;
  /** True while the deep research for this place is still running. */
  enriching?: boolean;

  overview: {
    rating: number;
    reviewCount: number;
    address: string;
    openStatus: string;
    reviewQuotes: { text: string; sentiment: Sentiment }[];
  };

  menu: {
    items: { name: string; price?: string; matchesTaste: boolean }[];
  };

  tasteFit: {
    score: number;
    reasoning: string;
    misses: string[];
  };

  journey: {
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

  alreadyRated?: {
    avgRating: number;
    notes: string;
  };
};
