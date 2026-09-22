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
