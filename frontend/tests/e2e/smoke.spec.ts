import { test, expect } from '@playwright/test';
test('renders quiz landing screen', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: /create demo game/i }),
  ).toBeVisible();
});
