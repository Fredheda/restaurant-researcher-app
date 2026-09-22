import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./chat-panel";
import { PROGRESS_LINES } from "./stub-responder";

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays back progress lines then calls onPlaceFound for a matching query", async () => {
    const onPlaceFound = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ChatPanel onPlaceFound={onPlaceFound} />);

    await user.type(screen.getByPlaceholderText(/ask about a place/i), "Dishoom{Enter}");

    for (const line of PROGRESS_LINES) {
      expect(await screen.findByText(new RegExp(line))).toBeInTheDocument();
    }
    // The component still awaits one more delay period after the last
    // progress line before calling onPlaceFound — wait for the completion
    // message (which is set right after that call) before asserting on it,
    // rather than checking immediately after the last progress line lands.
    expect(await screen.findByText(/added dishoom to the board/i)).toBeInTheDocument();
    expect(onPlaceFound).toHaveBeenCalledTimes(1);
    expect(onPlaceFound.mock.calls[0][0].id).toBe("dishoom-canary-wharf");
  });
});
