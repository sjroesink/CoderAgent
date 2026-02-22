import { test, expect } from "@playwright/test";

const TEST_CHANNEL_NAME = "PW Test Bot";

test.describe("Channel management", () => {
  // Clean up any leftover test channels via API before each test
  test.beforeEach(async ({ request }) => {
    const res = await request.get("/api/channels");
    const channels = await res.json();
    for (const ch of channels) {
      if (ch.name === TEST_CHANNEL_NAME) {
        await request.delete(`/api/channels/${ch.id}`);
      }
    }
  });

  test("create and delete a Telegram channel via UI", async ({ page }) => {
    // Navigate to the channels page
    await page.goto("/channels");
    await expect(page.locator("h1")).toHaveText("Global Channels");

    // Our test channel should not exist yet
    await expect(page.locator(`td:has-text("${TEST_CHANNEL_NAME}")`)).not.toBeVisible();

    // Click "Add Channel"
    await page.click("button:has-text('Add Channel')");
    await expect(page.locator("h2")).toHaveText("Add Channel");

    // Telegram is the default channel type
    await expect(page.locator("select")).toHaveValue("Telegram");

    // Fill in the channel name
    await page.fill('input[placeholder="My Telegram Bot"]', TEST_CHANNEL_NAME);

    // Fill in Bot Token and Chat ID (password fields by default)
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill("123456:ABC-DEF");
    await passwordInputs.nth(1).fill("987654321");

    // Click Create
    await page.click("button:has-text('Create')");

    // Verify the channel row appears in the table
    const testBotRow = page.locator("tr", { hasText: TEST_CHANNEL_NAME });
    await expect(testBotRow).toBeVisible();
    await expect(testBotRow.locator(".badge-enabled")).toHaveText("Enabled");
    await expect(testBotRow.locator("text=Telegram")).toBeVisible();

    // Delete the channel
    await testBotRow.locator("button:has-text('Delete')").click();

    // Verify the channel is gone
    await expect(testBotRow).not.toBeVisible();
  });
});
