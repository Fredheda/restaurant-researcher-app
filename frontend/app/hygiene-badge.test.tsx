import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HygieneBadge } from "./hygiene-badge";

describe("HygieneBadge", () => {
  it("shows the numeral and the caption, like the FHRS sticker", () => {
    render(<HygieneBadge rating={4} />);
    const badge = screen.getByRole("img", { name: "Food hygiene rating 4 out of 5" });
    expect(badge).toHaveTextContent("4");
    expect(badge).toHaveTextContent("Food hygiene rating");
  });

  it("shows a not-rated state when the FSA has no match", () => {
    render(<HygieneBadge rating={null} />);
    expect(
      screen.getByRole("img", { name: "Food hygiene rating: not rated" })
    ).toHaveTextContent("Not rated");
  });

  it("renders nothing when the rating is unknown", () => {
    const { container } = render(<HygieneBadge rating={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks every scale step and highlights the rating", () => {
    render(<HygieneBadge rating={3} size="lg" />);
    const steps = screen.getAllByTestId(/^hygiene-step-/);
    expect(steps).toHaveLength(6);
    expect(screen.getByTestId("hygiene-step-3")).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("hygiene-step-5")).toHaveAttribute("data-current", "false");
  });
});
