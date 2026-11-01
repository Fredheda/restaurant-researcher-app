import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Card } from "./card";
import { PLACES } from "./fixtures/places";

const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;

describe("Card", () => {
  it("renders name, taste-fit score, and a check on matching menu items", () => {
    render(<Card place={fogo} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("Fogo de Chão")).toBeInTheDocument();
    expect(screen.getByText(/7\.5/)).toBeInTheDocument();
  });

  it("shows the rating badge, hygiene badge, why-this line and the route footer", () => {
    render(<Card place={fogo} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("★ 4.2 · 126")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Food hygiene rating 5 out of 5" })).toBeInTheDocument();
    expect(screen.getByText(/First rodizio on your list/)).toBeInTheDocument();
    expect(screen.getByText("Elizabeth line → Liverpool Street · 22 min")).toBeInTheDocument();
    expect(screen.getByText("Fit 7.5")).toBeInTheDocument();
  });

  it("says when the hygiene rating is missing and hides the badge when unknown", () => {
    const { rerender } = render(
      <Card place={{ ...fogo, hygieneRating: null }} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />
    );
    expect(screen.getByRole("img", { name: "Food hygiene rating: not rated" })).toBeInTheDocument();
    rerender(
      <Card place={{ ...fogo, hygieneRating: undefined }} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />
    );
    expect(screen.queryByRole("img", { name: /hygiene/i })).not.toBeInTheDocument();
  });

  it("renders a search result with no fit, route, menu, rating or price", () => {
    const bare = {
      ...fogo,
      priceTier: null,
      whyThis: undefined,
      tasteFit: undefined,
      journey: undefined,
      menu: undefined,
      overview: { ...fogo.overview, rating: null, reviewCount: null },
    };
    render(<Card place={bare} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("Fogo de Chão")).toBeInTheDocument();
    expect(screen.queryByText(/^Fit /)).not.toBeInTheDocument();
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByText("££££")).not.toBeInTheDocument();
  });

  it("shows the rating without a count when the count is unknown", () => {
    const place = { ...fogo, overview: { ...fogo.overview, reviewCount: null } };
    render(<Card place={place} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("★ 4.2")).toBeInTheDocument();
  });

  it("draws shimmer lines instead of the why-line and fit while enriching", () => {
    render(
      <Card place={{ ...fogo, enriching: true }} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />
    );
    expect(screen.getByText("reading menu…")).toBeInTheDocument();
    expect(screen.queryByText(/First rodizio/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Fit /)).not.toBeInTheDocument();
  });

  it("renders a complete card with no why-line", () => {
    render(
      <Card place={{ ...fogo, whyThis: undefined }} selected={false} onToggleSelect={vi.fn()} onOpen={vi.fn()} />
    );
    expect(screen.getByText("Fit 7.5")).toBeInTheDocument();
  });

  it("calls onOpen when the title area is clicked", async () => {
    const onOpen = vi.fn();
    render(<Card place={fogo} selected={false} onToggleSelect={vi.fn()} onOpen={onOpen} />);
    await userEvent.click(screen.getByText("Fogo de Chão"));
    expect(onOpen).toHaveBeenCalledWith("fogo-de-chao-bishopsgate");
  });

  it("calls onToggleSelect (not onOpen) when the checkbox is clicked", async () => {
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <Card place={fogo} selected={false} onToggleSelect={onToggleSelect} onOpen={onOpen} />
    );
    await userEvent.click(screen.getByLabelText("Select Fogo de Chão to compare"));
    expect(onToggleSelect).toHaveBeenCalledWith("fogo-de-chao-bishopsgate");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
