import { chromium } from "@playwright/test";

const BASE = "http://localhost:4555";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE}/channels`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "tests/screenshots/01-channels-page.png", fullPage: true });
  console.log("1. Channels page loaded");

  // Create a channel
  await page.click("button:has-text('Add Channel')");
  await page.fill('input[placeholder="My Telegram Bot"]', "Verify Bot");
  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.nth(0).fill("token-123");
  await pwInputs.nth(1).fill("chat-456");
  await page.screenshot({ path: "tests/screenshots/02-form-filled.png", fullPage: true });
  console.log("2. Form filled");

  await page.click("button:has-text('Create')");
  await page.waitForSelector("td:has-text('Verify Bot')");
  await page.screenshot({ path: "tests/screenshots/03-channel-created.png", fullPage: true });
  console.log("3. Channel created");

  // Delete it
  const row = page.locator("tr", { hasText: "Verify Bot" });
  await row.locator("button:has-text('Delete')").click();
  await page.waitForSelector("td:has-text('Verify Bot')", { state: "hidden" });
  await page.screenshot({ path: "tests/screenshots/04-channel-deleted.png", fullPage: true });
  console.log("4. Channel deleted");

  await browser.close();
  console.log("Done - screenshots saved to tests/screenshots/");
}

main().catch((e) => { console.error(e); process.exit(1); });
