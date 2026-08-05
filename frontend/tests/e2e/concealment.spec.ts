import { expect, test } from '@playwright/test';
import { createGame } from './helpers';

/**
 * The answer must never reach the browser before reveal — not in the DOM and
 * not in the network payload. Hiding it with CSS would still leak it.
 */
test.describe('answer concealment', () => {
  test('no pre-reveal API response contains answer fields', async ({ page }) => {
    const payloads: unknown[] = [];
    page.on('response', async response => {
      if (!response.url().includes('/api/v1/games')) return;
      if (!response.headers()['content-type']?.includes('application/json')) return;
      try {
        payloads.push(await response.json());
      } catch {
        /* non-JSON responses are irrelevant here */
      }
    });

    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();
    await expect(page.getByText('Status: playing')).toBeVisible();
    await page.getByRole('button', { name: 'Pause round' }).click();
    await expect(page.getByText('Status: paused')).toBeVisible();

    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(payload).not.toHaveProperty('answer');
    }
  });

  test('the answer appears only after reveal and is hidden again on next round', async ({
    page,
  }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();

    await expect(page.getByText('Fake Album')).toHaveCount(0);

    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect(page.getByText('Fake Album')).toBeVisible();

    await page.getByRole('button', { name: 'Next round' }).click();
    await expect(page.getByText('Fake Album')).toHaveCount(0);
    await expect(page.getByText('The track is hidden until you reveal it.')).toBeVisible();
  });

  test('the concealed stage exposes no hidden answer text to assistive tech', async ({ page }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();

    const html = await page.content();
    expect(html).not.toMatch(/Track \d+<\/h3>/);
    expect(html).not.toContain('Fake Album');
  });
});
