import { test, expect, chromium } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4184';

test('manual smoke: full user journey through the production build', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    console.log(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('[pageerror]', err.message);
    consoleErrors.push(err.message);
  });
  await page.goto(baseURL);
  await page.waitForSelector('text=Somnium Studio', { timeout: 10000 });

  // Wait for the demo project to load and derive baseline; derive is async.
  await page.waitForFunction(
    () => document.body.innerText.includes('Verrin Demo'),
    null,
    { timeout: 60000 }
  );

  // 1. Demo loaded automatically
  await expect(page.locator('text=Verrin Demo')).toBeVisible({ timeout: 10000 });

  // 2. Default landing tab is Timeline after load
  await expect(page.locator('h2:has-text("Timeline")')).toBeVisible();

  // 3. Timeline tab is already active; confirm target event
  await expect(page.locator('text=The Blight Begins')).toBeVisible();

  // 4. Select event, creating rewind-point intent
  await page.click('text=The Blight Begins');

  // 5. Go to What If?
  await page.click('text=What if The Blight Begins changed?');
  await expect(page.locator('h2:has-text("What If?")')).toBeVisible();

  // 6. Confirm target is ev/blight-begins and derive
  await expect(page.locator('select[data-kind]')).toHaveValue('negateEvent');

  // 7. Confirm & Derive
  await page.click('text=Confirm & Derive');

  // 8. Diff tab should appear with changes
  await page.waitForSelector('h2:has-text("WorldDiff")', { timeout: 30000 });

  // 9. Click “Why?” on a changed node from the Diff, then switch to Why? tab
  await page.click('.diff-row button:has-text("Why?")');
  await expect(page.locator('h2:has-text("Why?")')).toBeVisible();

  // 10. Switch to World tab
  await page.click('text=World');
  await expect(page.locator('h2:has-text("World")')).toBeVisible();

  expect(consoleErrors).toHaveLength(0);

  await browser.close();
});
