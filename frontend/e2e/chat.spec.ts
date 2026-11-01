import { expect, test } from "@playwright/test";
import {
  card,
  chatAnswer,
  chatHandle,
  chatInput,
  chatPrompt,
  chatSheet,
  detailOverlay,
  openChatButton,
  sendButton,
} from "./selectors";

// The real CopilotKit client and runtime talk to the fake AG-UI agent
// (e2e/fake-agent/server.mjs); show_places then reads the search from the
// fake api through the web app's proxy.
const AGENT = `http://127.0.0.1:${process.env.E2E_AGENT_PORT ?? "3919"}`;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await request.post(`${AGENT}/__reset`);
});

/** Type and send once the panel accepts input (connected, no run going). */
async function say(page: import("@playwright/test").Page, text: string) {
  await chatInput(page).fill(text);
  await expect(sendButton(page)).toBeEnabled();
  await chatInput(page).press("Enter");
}

test("a chat search fills the board through the agent and show_places", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await say(page, "best ramen near Soho");

  await expect(card(page, "koya-soho")).toBeVisible();
  await expect(card(page, "kanada-ya")).toBeVisible();
  await expect(card(page, "sabor-mayfair")).toHaveCount(0);
  const answer = chatAnswer(page, "Koya Soho rates highest");
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("search_places · 2 venues");
  await expect(chatPrompt(page, "best ramen near Soho")).toBeVisible();

  // The runtime forwarded the principal header and nothing secret.
  const seen = (await (await request.get(`${AGENT}/__seen`)).json()) as {
    principalId: string | null;
    forwardedSecrets: string[];
  }[];
  expect(seen.length).toBeGreaterThan(0);
  for (const run of seen) {
    expect(run.principalId).toBe("e2e-user");
    expect(run.forwardedSecrets).toEqual([]);
  }
});

test("open_place opens a card's details", async ({ page }) => {
  await page.goto("/");
  await say(page, "ramen");
  await expect(card(page, "koya-soho")).toBeVisible();
  await expect(chatAnswer(page, "Koya Soho rates highest")).toBeVisible();
  await say(page, "open koya");
  await expect(detailOverlay(page)).toBeVisible();
  await expect(detailOverlay(page)).toContainText("Koya Soho");
});

test("an agent error shows a normal message", async ({ page }) => {
  await page.goto("/");
  await say(page, "break it");
  await expect(chatAnswer(page, "The assistant hit an error. Try again.")).toBeVisible();
  // The panel still works afterwards.
  await say(page, "hello");
  await expect(chatAnswer(page, "I only answer scripted prompts.")).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the bottom sheet has the ink header and handle, and sends", async ({ page }) => {
    await page.goto("/");
    await openChatButton(page).click();
    await expect(chatHandle(page)).toBeVisible();
    await expect(chatSheet(page)).toContainText("Tonight");
    const sheet = (await chatSheet(page).boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(0);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(360);
    const send = (await sendButton(page).boundingBox())!;
    expect(send.x + send.width).toBeLessThanOrEqual(360);

    await chatInput(page).fill("hello");
    await sendButton(page).click();
    await expect(chatPrompt(page, "hello")).toBeVisible();
    await expect(chatAnswer(page, "I only answer scripted prompts.")).toBeVisible();
  });
});
