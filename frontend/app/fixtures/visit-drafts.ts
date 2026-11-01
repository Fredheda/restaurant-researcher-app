import type { PlaceResult } from "../types";
import type { VisitDraft } from "../rating-sheet";

/** Visit draft for the rating sheet: a receipt-style one for Fogo, empty for the rest. */
export function visitDraftFor(place: PlaceResult, today: string): VisitDraft {
  if (place.id === "fogo-de-chao-bishopsgate") {
    return {
      visitedOn: today,
      dishes: [
        { id: "d1", name: "Picanha & fillet churrasco", score: 9 },
        { id: "d2", name: "Roasted bone marrow, chimichurri", score: 8 },
        { id: "d3", name: "Lobster mac and cheese", score: null },
      ],
      cocktails: [{ id: "c1", name: "Caipirinha", price: "£14.50", score: 8 }],
      restaurant: 8,
      vibe: 7,
      staff: 8,
      service: 7,
      note: "",
      receiptName: "fogo-receipt.jpg",
    };
  }
  return {
    visitedOn: today,
    dishes: [],
    cocktails: [],
    restaurant: null,
    vibe: null,
    staff: null,
    service: null,
    note: "",
  };
}
