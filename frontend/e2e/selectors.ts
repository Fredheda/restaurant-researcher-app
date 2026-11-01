// Every locator lives here; specs call these helpers (ESLint rejects
// `.locator()` in spec files). Built on roles, labels and the data-testid
// attributes the app already has.
import type { Locator, Page } from "@playwright/test";

export const chatInput = (page: Page) => page.getByPlaceholder("Ask about a place…");
export const chatMessages = (page: Page) => page.getByTestId("chat-messages");
export const card = (page: Page, id: string) => page.getByTestId(`card-${id}`);
export const cardOpenButton = (page: Page, id: string) =>
  card(page, id).getByRole("button").first();
export const selectCheckbox = (page: Page, placeName: string) =>
  page.getByLabel(`Select ${placeName} to compare`);
export const compareButton = (page: Page) =>
  page.getByRole("button", { name: /^Compare \d+ selected$/ });
export const detailOverlay = (page: Page) => page.getByTestId("detail-overlay");
export const comparePanel = (page: Page) => page.getByTestId("compare-panel");
export const closeButton = (scope: Locator) => scope.getByRole("button", { name: "Close" });
export const lastChild = (scope: Locator) => scope.locator("> :last-child");

/** True when the element is the topmost thing at its own centre point. */
export function isTopmost(el: Locator): Promise<boolean> {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit !== null && node.contains(hit);
  });
}
