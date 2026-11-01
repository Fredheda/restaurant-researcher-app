import { expect, test } from "@playwright/test";
import {
  card,
  cardOpenButton,
  chatInput,
  chatMessages,
  closeButton,
  compareButton,
  comparePanel,
  detailOverlay,
  isTopmost,
  lastChild,
  selectCheckbox,
} from "./selectors";

const FOGO = "fogo-de-chao-bishopsgate";

test("production server boots and hydrates with no errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/");
  await expect(card(page, "sabor-mayfair")).toBeVisible();
  await expect(card(page, "padella-shoreditch")).toBeVisible();

  // At 1280 px the board has two columns: the seeded cards sit side by side.
  const first = (await card(page, "sabor-mayfair").boundingBox())!;
  const second = (await card(page, "padella-shoreditch").boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width / 2);

  // Selecting two cards shows the compare button only if React hydrated.
  await selectCheckbox(page, "Sabor").check();
  await selectCheckbox(page, "Padella").check();
  await expect(compareButton(page)).toBeVisible();

  expect(problems).toEqual([]);
});

test("chat adds a card; detail and compare panels sit on top", async ({ page }) => {
  await page.goto("/");
  await expect(card(page, FOGO)).toHaveCount(0);
  await chatInput(page).fill("Fogo de Chão");
  await chatInput(page).press("Enter");

  // The stub plays three 600 ms steps (about 1.8 s). The timeout leaves room for
  // slow runners but fails if the delays double.
  await expect(chatMessages(page)).toContainText("Added Fogo de Chão to the board.", {
    timeout: 3000,
  });
  await expect(card(page, FOGO)).toBeVisible();

  await cardOpenButton(page, FOGO).click();
  await expect(detailOverlay(page)).toBeVisible();
  expect(await isTopmost(detailOverlay(page))).toBe(true);
  await closeButton(detailOverlay(page)).click();
  await expect(detailOverlay(page)).toBeHidden();

  await selectCheckbox(page, "Sabor").check();
  await selectCheckbox(page, "Fogo de Chão").check();
  await compareButton(page).click();
  await expect(comparePanel(page)).toBeVisible();
  await expect(comparePanel(page)).toContainText("Sabor");
  await expect(comparePanel(page)).toContainText("Fogo de Chão");
  expect(await isTopmost(comparePanel(page))).toBe(true);
  await closeButton(comparePanel(page)).click();
  await expect(comparePanel(page)).toBeHidden();
});

test("long detail content scrolls inside the overlay", async ({ page }) => {
  await page.goto("/");
  await chatInput(page).fill("Fogo de Chão");
  await chatInput(page).press("Enter");
  await expect(card(page, FOGO)).toBeVisible({ timeout: 3000 });
  await cardOpenButton(page, FOGO).click();

  const overlay = detailOverlay(page);
  await expect(overlay).toBeVisible();
  const viewportHeight = page.viewportSize()!.height;

  // The overlay stays inside the viewport and holds more than it shows.
  const box = (await overlay.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(viewportHeight);
  const { scrollHeight, clientHeight } = await overlay.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  // Scrolling reaches the end of the content, and the page behind does not scroll.
  await overlay.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const last = (await lastChild(overlay).boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(box.y + box.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
    viewportHeight
  );
});
