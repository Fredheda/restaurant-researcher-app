import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board } from "./board";
import { PLACES } from "./fixtures/places";

const two = PLACES.slice(0, 2);

describe("Board", () => {
  it("shows an empty-state message with no places", () => {
    render(
      <Board places={[]} selectedIds={[]} onToggleSelect={vi.fn()} onOpen={vi.fn()} onCompare={vi.fn()} />
    );
    expect(screen.getByText(/ask about a place/i)).toBeInTheDocument();
  });

  it("renders one card per place and no compare button with < 2 selected", () => {
    render(
      <Board places={two} selectedIds={[two[0].id]} onToggleSelect={vi.fn()} onOpen={vi.fn()} onCompare={vi.fn()} />
    );
    expect(screen.getByTestId(`card-${two[0].id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`card-${two[1].id}`)).toBeInTheDocument();
    expect(screen.queryByText(/compare 2 selected/i)).not.toBeInTheDocument();
  });

  it("lays cards out in one column, two from the lg breakpoint", () => {
    render(
      <Board places={two} selectedIds={[]} onToggleSelect={vi.fn()} onOpen={vi.fn()} onCompare={vi.fn()} />
    );
    const grid = screen.getByTestId(`card-${two[0].id}`).parentElement!;
    expect(grid).toHaveClass("grid-cols-1", "lg:grid-cols-2");
  });

  it("shows a compare button with >= 2 selected and calls onCompare", async () => {
    const onCompare = vi.fn();
    render(
      <Board
        places={two}
        selectedIds={two.map((p) => p.id)}
        onToggleSelect={vi.fn()}
        onOpen={vi.fn()}
        onCompare={onCompare}
      />
    );
    const button = screen.getByText(/compare 2 selected/i);
    await userEvent.click(button);
    expect(onCompare).toHaveBeenCalled();
  });
});
