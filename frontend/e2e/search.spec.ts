import { expect, test } from "@playwright/test";
import { card, searchBox, searchError } from "./selectors";

// The search bar goes through the web app's /api proxy to the fake api app,
// which refuses requests without the principal header: cards on the board
// prove the proxy, the header forwarding and the board update together.

for (const width of [1280, 360]) {
  test(`search bar replaces the board with the API's places at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await expect(card(page, "sabor-mayfair")).toBeVisible();

    await searchBox(page).fill("best ramen near Soho");
    await searchBox(page).press("Enter");

    await expect(card(page, "koya-soho")).toBeVisible();
    await expect(card(page, "kanada-ya")).toBeVisible();
    await expect(card(page, "sabor-mayfair")).toHaveCount(0);
    await expect(card(page, "koya-soho")).toContainText("★ 4.6 · 3.1k");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    ).toBe(false);
  });
}

test("a failed search shows the error and keeps the board", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("fail please");
  await searchBox(page).press("Enter");
  await expect(searchError(page)).toHaveText("Search is unavailable. Try again.");
  await expect(card(page, "sabor-mayfair")).toBeVisible();
});
