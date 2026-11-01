import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

// The agent wiring is covered by the browser tests; here the frontend tool
// handlers are captured so the page's reaction to them can be checked.
const tools = vi.hoisted(() => new Map<string, (args: Record<string, string>) => Promise<string>>());

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {},
  useFrontendTool: (tool: { name: string; handler: (args: Record<string, string>) => Promise<string> }) => {
    tools.set(tool.name, tool.handler);
  },
  useCopilotKit: () => ({ copilotkit: {} }),
  useAgent: () => ({
    agent: { messages: [], isRunning: false, subscribe: () => ({ unsubscribe() {} }) },
    isReady: true,
  }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("Page shell", () => {
  it("shows the wordmark, the start badge and the two seeded cards", () => {
    render(<Page />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Tonight")).toBeInTheDocument();
    expect(header.getByText("from Canary Wharf")).toBeInTheDocument();
    expect(screen.getByTestId("card-sabor-mayfair")).toBeInTheDocument();
    expect(screen.getByTestId("card-padella-shoreditch")).toBeInTheDocument();
  });

  it("open_place closes the compare panel so the details are on top", async () => {
    render(<Page />);
    await userEvent.click(screen.getByLabelText("Select Sabor to compare"));
    await userEvent.click(screen.getByLabelText("Select Padella to compare"));
    await userEvent.click(screen.getByRole("button", { name: /^Compare 2 selected$/ }));
    expect(screen.getByTestId("compare-panel")).toBeInTheDocument();

    let reply = "";
    await act(async () => {
      reply = await tools.get("open_place")!({ place_id: "sabor-mayfair" });
    });
    expect(reply).toBe("Opened Sabor.");
    expect(screen.queryByTestId("compare-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("detail-overlay")).toBeInTheDocument();
  });

  it("a new search closes the rating sheet and it does not come back", async () => {
    render(<Page />);
    await userEvent.click(within(screen.getByTestId("card-sabor-mayfair")).getAllByRole("button")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Rate this visit" }));
    expect(screen.getByRole("dialog", { name: /^Rate / })).toBeInTheDocument();

    const sabor = { id: "sabor-mayfair", name: "Sabor", type: "x", neighbourhood: "", priceTier: null,
      overview: { rating: null, reviewCount: null, address: "", openStatus: "", reviewQuotes: [] } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "s", query: "q", places: [sabor] })))
    );
    await act(async () => {
      await tools.get("show_places")!({ search_id: "s" });
    });
    expect(screen.queryByRole("dialog", { name: /^Rate / })).not.toBeInTheDocument();
  });
});
