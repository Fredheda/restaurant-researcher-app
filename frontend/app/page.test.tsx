import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Page from "./page";

describe("Page shell", () => {
  it("shows the wordmark, the start badge and the two seeded cards", () => {
    render(<Page />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Tonight")).toBeInTheDocument();
    expect(header.getByText("from Canary Wharf")).toBeInTheDocument();
    expect(screen.getByTestId("card-sabor-mayfair")).toBeInTheDocument();
    expect(screen.getByTestId("card-padella-shoreditch")).toBeInTheDocument();
  });
});
