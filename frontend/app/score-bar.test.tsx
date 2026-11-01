import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreBar } from "./score-bar";

describe("ScoreBar", () => {
  it("shows ten scores in a radiogroup named by its label", () => {
    render(<ScoreBar label="Vibe" value={null} onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup", { name: "Vibe" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
  });

  it("selects a score and clears it when the selected score is clicked again", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ScoreBar label="Vibe" value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Score 7" }));
    expect(onChange).toHaveBeenLastCalledWith(7);

    rerender(<ScoreBar label="Vibe" value={7} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Score 7" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Score 7" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
