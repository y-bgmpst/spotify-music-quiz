import { expect, test } from '@playwright/test';

test.describe('sanity', () => {
  test('the app loads and the backend is reachable', async ({ page }) => {
    const failures: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') failures.push(message.text());
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Spotify Music Quiz' })).toBeVisible();
    await expect(page.getByText(/No Spotify account is connected/)).toBeVisible();
    expect(failures).toEqual([]);
  });
});
