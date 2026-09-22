import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "./page";

describe("Page (integration)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the board with two fixture cards before any chat interaction", () => {
    render(<Page />);
    expect(screen.getByTestId("card-sabor-mayfair")).toBeInTheDocument();
    expect(screen.getByTestId("card-padella-shoreditch")).toBeInTheDocument();
    // Chat-added places in the other test below aren't seeded, so that
    // test still proves chat adds a genuinely new card.
    expect(screen.queryByTestId("card-fogo-de-chao-bishopsgate")).not.toBeInTheDocument();
  });

  it("chat adds a card, clicking it opens the overlay, and comparing two shows both", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Page />);

    // These findByTestId calls each span all 3 stub-responder steps
    // (~600ms each, ~1800ms total) in one wait, unlike chat-panel.test.tsx's
    // per-line loop where each individual wait is much shorter — so they
    // need an explicit timeout above Testing Library's 1000ms default, or
    // they intermittently time out with the card never appearing.
    const input = screen.getByPlaceholderText(/ask about a place/i);
    await user.type(input, "Fogo de Chao{Enter}");
    expect(
      await screen.findByTestId("card-fogo-de-chao-bishopsgate", {}, { timeout: 3000 })
    ).toBeInTheDocument();

    await user.type(input, "Dishoom{Enter}");
    expect(
      await screen.findByTestId("card-dishoom-canary-wharf", {}, { timeout: 3000 })
    ).toBeInTheDocument();

    // Open the overlay for one card.
    await user.click(screen.getByText("Fogo de Chão"));
    expect(await screen.findByTestId("detail-overlay")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close"));

    // Select both and compare.
    await user.click(screen.getByLabelText("Select Fogo de Chão to compare"));
    await user.click(screen.getByLabelText("Select Dishoom to compare"));
    await user.click(screen.getByText(/compare 2 selected/i));

    const panel = await screen.findByTestId("compare-panel");
    expect(within(panel).getByText("Fogo de Chão")).toBeInTheDocument();
    expect(within(panel).getByText("Dishoom")).toBeInTheDocument();
  });
});
