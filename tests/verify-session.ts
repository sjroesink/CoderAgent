import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:4555";
const SCREENSHOT_DIR = "tests/screenshots/session";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Step 1: Go to New Session page
  // Use networkidle-like approach: navigate and wait for interactive textarea
  await page.goto(`${BASE}/sessions/new`, { timeout: 120000, waitUntil: 'load' });
  await page.waitForSelector('textarea', { timeout: 60000 });
  // Wait for React hydration to complete
  await page.waitForTimeout(2000);
  console.log("1. New Session page loaded");

  // Step 2: Fill in the form
  // Use click + type to ensure React controlled inputs accept the values
  const textarea = page.locator('textarea');
  await textarea.click();
  await textarea.fill("List the files in the project root and describe what the project is about in 2 sentences.");

  const repoInput = page.locator('input[placeholder="/path/to/your/repo"]');
  await repoInput.click();
  await repoInput.fill("D:\\Projects\\party-queue");

  // Select Claude backend
  await page.selectOption('select', 'claude');

  // Check auto-approve and skip PR
  await page.check('#autoApprove');
  await page.check('#noPr');

  // Wait for channels to load from API, then select the first Telegram channel
  const additionalSection = page.locator('text=Additional Channels');
  await additionalSection.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
    console.log("   Warning: 'Additional Channels' section not visible");
  });
  if (await additionalSection.isVisible()) {
    const firstChannelCheckbox = additionalSection.locator('..').locator('.checkbox-group input[type="checkbox"]').first();
    await firstChannelCheckbox.check();
    console.log("   Telegram channel selected");
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-form-filled.png`, fullPage: true });
  console.log("2. Form filled");

  // Verify form values before submitting
  const taskValue = await textarea.inputValue();
  const repoValue = await repoInput.inputValue();
  console.log(`   Task length: ${taskValue.length}, Repo: ${repoValue}`);

  // Step 3: Submit
  await page.click('button:has-text("Create Session")');
  console.log("3. Create Session clicked...");

  // Wait for navigation to session detail
  // The client-side router.push happens after the POST completes
  await page.waitForURL(/\/sessions\/[a-f0-9-]+/, { timeout: 120000 });
  const sessionUrl = page.url();
  const sessionId = sessionUrl.split('/sessions/')[1];
  console.log(`4. Session created: ${sessionId}`);

  // Wait for session detail to load
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-session-detail.png`, fullPage: true });
  // Try various selectors for session detail
  const headerEl = await page.waitForSelector('.session-header, h1:has-text("Session Detail"), .card', { timeout: 30000 }).catch(() => null);
  console.log(`5. Session detail loaded (header found: ${!!headerEl})`);

  // Wait for agent initialization messages
  await page.waitForSelector('text=Agent initialized and ready', { timeout: 60000 }).catch(() => {
    console.log("   Warning: 'Agent initialized' message not seen within 60s");
  });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-agent-initialized.png`, fullPage: true });
  console.log("6. Agent initialization phase done");

  // Check what channels are displayed
  const channelChips = await page.locator('.channel-chip').allTextContents();
  console.log(`   Channels shown: ${channelChips.join(', ')}`);

  // Wait for agent to respond to the task (this can take a while)
  console.log("7. Waiting for agent task response (up to 120s)...");
  const agentResponse = await page.waitForSelector('.message-agent', { timeout: 120000 }).catch(() => null);

  if (agentResponse) {
    console.log("8. Agent responded!");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-agent-response.png`, fullPage: true });
  } else {
    console.log("8. No agent response within 120s");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-no-response.png`, fullPage: true });

    // Check status via API
    const res = await page.request.get(`${BASE}/api/sessions/${sessionId}`);
    const session = await res.json();
    console.log(`   Session status: ${session.status}`);
  }

  // Step 5: Send a message
  const inputField = page.locator('input[placeholder="Type a message..."]');
  if (await inputField.isVisible()) {
    await inputField.fill("What is the main technology used in this project?");
    await page.click('button.send-action-main');
    console.log("9. User message sent");

    // Wait for it to appear
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-message-sent.png`, fullPage: true });

    // Wait for agent reply
    console.log("10. Waiting for agent reply (up to 90s)...");
    const messageCount = await page.locator('.message').count();
    await page.waitForFunction(
      (count) => document.querySelectorAll('.message').length > count,
      messageCount,
      { timeout: 90000 }
    ).catch(() => null);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-final-state.png`, fullPage: true });
    console.log("11. Final state captured");
  } else {
    console.log("9. Session not active - no input field");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-inactive.png`, fullPage: true });
  }

  await browser.close();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
