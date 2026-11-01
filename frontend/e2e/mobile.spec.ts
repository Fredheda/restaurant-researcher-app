import { expect, test } from "@playwright/test";
import {
  card,
  cardOpenButton,
  chatInput,
  closeButton,
  closeChatButton,
  compareButton,
  comparePanel,
  detailOverlay,
  openChatButton,
  rateButton,
  ratingSheet,
  routeMap,
  selectCheckbox,
} from "./selectors";

const SABOR = "sabor-mayfair";
const WIDTH = 360;
const HEIGHT = 740;

test.use({ viewport: { width: WIDTH, height: HEIGHT } });

async function pageScrollsSideways(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

test("phone layout: one column, chat sheet, overlay, route, compare and rating sheet fit", async ({
  page,
}) => {
  await page.goto("/");
  expect(await pageScrollsSideways(page)).toBe(false);

  // One column: a seeded card spans (nearly) the whole viewport width.
  const seeded = (await card(page, "sabor-mayfair").boundingBox())!;
  expect(seeded.width).toBeGreaterThan(WIDTH - 40);

  // The chat is a bottom sheet: unreachable until opened.
  await expect(chatInput(page)).toBeHidden();
  await openChatButton(page).click();
  await expect(chatInput(page)).toBeVisible();
  await expect(chatInput(page)).toBeFocused();
  await closeChatButton(page).click();
  await expect(chatInput(page)).toBeHidden();

  // Overlay and its route map fit inside the phone viewport.
  await cardOpenButton(page, SABOR).click();
  const overlay = detailOverlay(page);
  await expect(overlay).toBeVisible();
  const overlayBox = (await overlay.boundingBox())!;
  expect(overlayBox.x).toBeGreaterThanOrEqual(0);
  expect(overlayBox.x + overlayBox.width).toBeLessThanOrEqual(WIDTH);
  expect(overlayBox.height).toBeLessThanOrEqual(HEIGHT);
  await routeMap(page).scrollIntoViewIfNeeded();
  const mapBox = (await routeMap(page).boundingBox())!;
  expect(mapBox.x).toBeGreaterThanOrEqual(0);
  expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(WIDTH);

  // Rating sheet stacks into one column and fits.
  await rateButton(page).click();
  const sheet = ratingSheet(page);
  await expect(sheet).toBeVisible();
  const sheetBox = (await sheet.boundingBox())!;
  expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(WIDTH);
  expect(sheetBox.height).toBeLessThanOrEqual(HEIGHT);
  expect(await pageScrollsSideways(page)).toBe(false);
  await closeButton(sheet).click();
  await closeButton(detailOverlay(page)).click();

  // Compare panel fits too.
  await selectCheckbox(page, "Sabor").check();
  await selectCheckbox(page, "Padella").check();
  await compareButton(page).click();
  const compare = comparePanel(page);
  await expect(compare).toBeVisible();
  const compareBox = (await compare.boundingBox())!;
  expect(compareBox.x + compareBox.width).toBeLessThanOrEqual(WIDTH);
  expect(await pageScrollsSideways(page)).toBe(false);
});
