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
