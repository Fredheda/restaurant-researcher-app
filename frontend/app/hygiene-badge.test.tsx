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

  it("treats 0 as a real rating", () => {
    render(<HygieneBadge rating={0} />);
    expect(screen.getByRole("img", { name: "Food hygiene rating 0 out of 5" })).toHaveTextContent("0");
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

  it("marks every scale step and highlights the rating in the large size", () => {
    render(<HygieneBadge rating={3} size="lg" />);
    expect(screen.getAllByTestId(/^hygiene-step-/)).toHaveLength(6);
    expect(screen.getByTestId("hygiene-step-3")).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("hygiene-step-5")).toHaveAttribute("data-current", "false");
  });

  it("shows Not rated without a scale in the large size", () => {
    render(<HygieneBadge rating={null} size="lg" />);
    expect(screen.getByRole("img", { name: "Food hygiene rating: not rated" })).toHaveTextContent("Not rated");
    expect(screen.queryAllByTestId(/^hygiene-step-/)).toHaveLength(0);
  });

  it("has no scale in the small size", () => {
    render(<HygieneBadge rating={3} />);
    expect(screen.queryAllByTestId(/^hygiene-step-/)).toHaveLength(0);
  });
});
