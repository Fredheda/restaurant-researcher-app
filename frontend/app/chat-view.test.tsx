import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatView, SUGGESTIONS } from "./chat-view";
import type { ChatItem } from "./chat-model";

function view(over: Partial<Parameters<typeof ChatView>[0]> = {}) {
  const props = {
    items: [] as ChatItem[],
    running: false,
    activeTool: null,
    error: null,
    onSend: vi.fn(),
    ...over,
  };
  render(<ChatView {...props} />);
  return props;
}

describe("ChatView", () => {
  it("shows the empty state with three suggestions; a chip sends its prompt", async () => {
    const { onSend } = view();
    expect(screen.getByText("What can I do?")).toBeInTheDocument();
    const chips = screen.getAllByRole("button", { name: /^Ask: / });
    expect(chips).toHaveLength(3);
    await userEvent.click(chips[0]);
    expect(onSend).toHaveBeenCalledWith(SUGGESTIONS[0]);
  });

  it("hides the empty state once there are messages", () => {
    view({ items: [{ id: "u1", kind: "user", text: "hi" }] });
    expect(screen.queryByText("What can I do?")).not.toBeInTheDocument();
  });

  it("shows user lines as prompts and answers with their tool lines", () => {
    view({
      items: [
        { id: "u1", kind: "user", text: "best ramen" },
        { id: "a1", kind: "assistant", text: "Three places.", tools: ["search_places · 3 venues"] },
      ],
    });
    const log = screen.getByTestId("chat-messages");
    expect(within(log).getByText("best ramen").closest("[data-kind]")).toHaveAttribute(
      "data-kind",
      "user"
    );
    const answer = within(log).getByText("Three places.").closest("[data-kind]")!;
    expect(answer).toHaveAttribute("data-kind", "assistant");
    expect(within(answer as HTMLElement).getByText("search_places · 3 venues")).toBeInTheDocument();
  });

  it("shows a pulsing tool line while a run is in progress", () => {
    view({ items: [{ id: "u1", kind: "user", text: "x" }], running: true, activeTool: "search_places · working" });
    expect(screen.getByRole("status")).toHaveTextContent("search_places · working");
    expect(screen.getByRole("status").className).toContain("animate-pulse");
  });

  it("shows thinking when running with no tool in flight", () => {
    view({ items: [{ id: "u1", kind: "user", text: "x" }], running: true });
    expect(screen.getByRole("status")).toHaveTextContent("thinking");
  });

  it("shows a run error as a normal message", () => {
    view({ items: [{ id: "u1", kind: "user", text: "x" }], error: "The assistant hit an error. Try again." });
    expect(screen.getByTestId("chat-messages")).toHaveTextContent("The assistant hit an error. Try again.");
  });

  it("disables send for an empty or blank input", async () => {
    const { onSend } = view();
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Ask about a place…"), "   ");
    expect(send).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends on click and on Enter, trimmed, and clears the input", async () => {
    const { onSend } = view();
    const input = screen.getByPlaceholderText("Ask about a place…");
    await userEvent.type(input, " ramen ");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenLastCalledWith("ramen");
    expect(input).toHaveValue("");
    await userEvent.type(input, "negroni{Enter}");
    expect(onSend).toHaveBeenLastCalledWith("negroni");
    expect(input).toHaveValue("");
  });

  it("holds input and chips until the agent is connected", () => {
    view({ ready: false });
    expect(screen.getByPlaceholderText("Ask about a place…")).toBeDisabled();
    for (const chip of screen.getAllByRole("button", { name: /^Ask: / })) {
      expect(chip).toBeDisabled();
    }
    expect(screen.getByText("● connecting")).toBeInTheDocument();
  });

  it("does not send while a run is in progress", async () => {
    const { onSend } = view({ running: true });
    await userEvent.type(screen.getByPlaceholderText("Ask about a place…"), "x{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
