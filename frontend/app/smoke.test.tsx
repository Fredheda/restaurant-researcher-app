import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

describe("test pipeline smoke test", () => {
  it("renders a component with Testing Library", () => {
    render(<div>hello</div>);
    expect(screen.getByText("goodbye")).toBeInTheDocument();
  });
});
