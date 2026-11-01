import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailOverlay } from "./detail-overlay";
import { PLACES } from "./fixtures/places";

const sabor = PLACES.find((p) => p.id === "sabor-mayfair")!;

describe("DetailOverlay", () => {
  it("renders overview, menu, taste-fit (with misses), why-this and the route map", () => {
    render(<DetailOverlay place={sabor} onClose={vi.fn()} onRate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sabor" })).toBeInTheDocument();
    expect(screen.getByText(/Chargrilled octopus/)).toBeInTheDocument();
    expect(screen.getByText(/loud, busy dining room/i)).toBeInTheDocument();
    expect(screen.getByText(sabor.whyThis!)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Route from Canary Wharf to Sabor/ })).toBeInTheDocument();
  });

  it("shows the hygiene badge", () => {
    render(<DetailOverlay place={{ ...sabor, hygieneRating: 5 }} onClose={vi.fn()} onRate={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Food hygiene rating 5 out of 5" })).toBeInTheDocument();
  });

  it("hides the menu, taste-fit and route sections when the place has none", () => {
    const bare = {
      ...sabor,
      menu: undefined,
      tasteFit: undefined,
      journey: undefined,
      priceTier: null,
      overview: { ...sabor.overview, rating: null, reviewCount: null },
    };
    render(<DetailOverlay place={bare} onClose={vi.fn()} onRate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sabor" })).toBeInTheDocument();
    expect(screen.getByText(sabor.overview.address)).toBeInTheDocument();
    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Taste fit")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Route from/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/reviews/)).not.toBeInTheDocument();
  });

  it("calls onClose from the close button, not from clicking the panel", async () => {
    const onClose = vi.fn();
    render(<DetailOverlay place={sabor} onClose={onClose} onRate={vi.fn()} />);
    await userEvent.click(screen.getByRole("heading", { name: "Sabor" }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onRate from the Rate this visit button", async () => {
    const onRate = vi.fn();
    render(<DetailOverlay place={sabor} onClose={vi.fn()} onRate={onRate} />);
    await userEvent.click(screen.getByRole("button", { name: "Rate this visit" }));
    expect(onRate).toHaveBeenCalled();
  });
});
