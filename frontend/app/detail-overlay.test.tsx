import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailOverlay } from "./detail-overlay";
import { PLACES } from "./fixtures/places";

const sabor = PLACES.find((p) => p.id === "sabor-mayfair")!;

describe("DetailOverlay", () => {
  it("renders overview, menu, taste-fit (with misses), and the full journey widget", () => {
    render(<DetailOverlay place={sabor} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sabor" })).toBeInTheDocument();
    expect(screen.getByText(/Chargrilled octopus/)).toBeInTheDocument();
    expect(screen.getByText(/loud, busy dining room/i)).toBeInTheDocument();
    expect(screen.getByTestId("journey-widget-full")).toBeInTheDocument();
  });

  it("calls onClose from the close button, not from clicking the panel", async () => {
    const onClose = vi.fn();
    render(<DetailOverlay place={sabor} onClose={onClose} />);
    await userEvent.click(screen.getByRole("heading", { name: "Sabor" }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
