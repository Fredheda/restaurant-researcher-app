import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingSheet } from "./rating-sheet";
import { visitDraftFor } from "./fixtures/visit-drafts";
import { PLACES } from "./fixtures/places";

const fogo = PLACES.find((p) => p.id === "fogo-de-chao-bishopsgate")!;
const dishoom = PLACES.find((p) => p.id === "dishoom-canary-wharf")!;

function setup(place = fogo) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <RatingSheet
      placeName={place.name}
      initial={visitDraftFor(place, "2026-11-01")}
      onSave={onSave}
      onClose={onClose}
    />
  );
  return { onSave, onClose };
}

describe("visitDraftFor", () => {
  it("prefills the Fogo draft from a receipt and leaves other places empty", () => {
    const fogoDraft = visitDraftFor(fogo, "2026-11-01");
    expect(fogoDraft.receiptName).toBe("fogo-receipt.jpg");
    expect(fogoDraft.dishes.length).toBe(3);
    expect(fogoDraft.cocktails.length).toBe(1);
    const empty = visitDraftFor(dishoom, "2026-11-01");
    expect(empty).toMatchObject({ dishes: [], cocktails: [], restaurant: null, visitedOn: "2026-11-01" });
  });
});

describe("RatingSheet", () => {
  it("shows the prefilled lines, the place scores and the receipt name", () => {
    setup();
    expect(screen.getByText(/Picanha/)).toBeInTheDocument();
    expect(screen.getByText(/Caipirinha/)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Vibe" })).toBeInTheDocument();
    expect(screen.getByText(/fogo-receipt\.jpg/)).toBeInTheDocument();
  });

  it("saves the changed vibe score", async () => {
    const { onSave } = setup();
    const vibe = screen.getByRole("radiogroup", { name: "Vibe" });
    await userEvent.click(within(vibe).getByRole("radio", { name: "Score 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Save visit" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].vibe).toBe(4);
  });

  it("adds a dish line; scoring it with no name blocks Save", async () => {
    setup(dishoom);
    await userEvent.click(screen.getByRole("button", { name: "Add a dish" }));
    const name = screen.getByLabelText("New dish name");
    expect(name).toHaveValue("");
    const line = name.closest("[data-line]") as HTMLElement;
    await userEvent.click(within(line).getByRole("radio", { name: "Score 8" }));
    expect(screen.getByRole("button", { name: "Save visit" })).toBeDisabled();
    await userEvent.type(name, "Black daal");
    expect(screen.getByRole("button", { name: "Save visit" })).toBeEnabled();
  });

  it("calls onClose from Close", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
