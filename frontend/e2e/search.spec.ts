import { expect, test } from "@playwright/test";
import { card, searchButton, searchError, searchInput } from "./selectors";

// The browser tests send the sign-in header (playwright.config.ts), so this
// also proves the proxy forwards the principal: the fake api answers 401
// without it, which would show as the error text instead of the cards.
test("search shows busy, then replaces the seeded cards with the api's results", async ({ page }) => {
  await page.goto("/");
  await expect(card(page, "sabor-mayfair")).toBeVisible();
  await searchInput(page).fill("slow ramen");
  await searchInput(page).press("Enter");
  await expect(searchButton(page, "Searching…")).toBeDisabled();
  await expect(card(page, "ramen-one")).toBeVisible();
  await expect(card(page, "ramen-two")).toBeVisible();
  await expect(card(page, "sabor-mayfair")).toHaveCount(0);
  await expect(searchButton(page, "Search")).toBeEnabled();
});

test("a failing api shows the error and keeps the board", async ({ page }) => {
  await page.goto("/");
  await searchInput(page).fill("fail");
  await searchInput(page).press("Enter");
  await expect(searchError(page)).toHaveText("Search is unavailable right now. Try again.");
  await expect(card(page, "sabor-mayfair")).toBeVisible();
});

test.describe("at 360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("search fits the header and the cards stack in one column", async ({ page }) => {
    await page.goto("/");
    await searchInput(page).fill("ramen");
    await searchInput(page).press("Enter");
    const one = (await card(page, "ramen-one").boundingBox())!;
    const two = (await card(page, "ramen-two").boundingBox())!;
    expect(two.y).toBeGreaterThan(one.y + one.height - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const box = (await searchInput(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  });
});
