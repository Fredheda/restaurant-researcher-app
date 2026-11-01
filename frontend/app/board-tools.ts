"use client";

import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { fetchSearch } from "./search-bar";
import type { PlaceResult } from "./types";

/**
 * The agent's two frontend tools, named as the backend system prompt names
 * them. `show_places` loads a search the agent ran (the same api call the
 * search bar's results come from) and replaces the board; `open_place`
 * opens a card's details.
 */
export function useBoardTools({
  showSearch,
  openPlace,
}: {
  showSearch: (places: PlaceResult[]) => void;
  /** Opens the place if it is on the board; returns its name, or null. */
  openPlace: (id: string) => string | null;
}) {
  useFrontendTool(
    {
      name: "show_places",
      description: "Put the results of a search_places call on the person's board.",
      parameters: z.object({
        search_id: z.string().describe("The search_id that search_places returned."),
      }),
      handler: async ({ search_id }) => {
        try {
          const result = await fetchSearch(search_id);
          showSearch(result.places);
          return `Showing ${result.places.length} places on the board.`;
        } catch {
          return "The board could not load that search. Name the top places in your answer instead.";
        }
      },
    },
    [showSearch]
  );

  useFrontendTool(
    {
      name: "open_place",
      description: "Open the details of a place that is on the board.",
      parameters: z.object({
        place_id: z.string().describe("The place id from a search result."),
      }),
      handler: async ({ place_id }) => {
        const name = openPlace(place_id);
        return name ? `Opened ${name}.` : "That place is not on the board.";
      },
    },
    [openPlace]
  );
}
