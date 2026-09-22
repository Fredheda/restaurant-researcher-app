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
