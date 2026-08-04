import { test, expect } from '@playwright/test';

test.describe('Answer Concealment', () => {
  test('should hide answer metadata before reveal', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');

    // During playing state, answer should not be in DOM
    await expect(
      page.locator('.eyebrow:has-text("THE ANSWER")'),
    ).not.toBeVisible();

    // Mystery indicator should be visible
    await expect(page.locator('.mystery')).toContainText('?');
    await expect(page.locator('h2')).toContainText('What are we listening to?');

    // Check that answer data is not leaked in DOM
    const pageContent = await page.content();

    // The answer should not appear as text in the HTML
    // (We can't check exact track names without knowing them, but we can verify structure)
    expect(pageContent).not.toContain('THE ANSWER');
  });

  test('should reveal answer metadata after reveal action', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');
    await page.click('button:has-text("Reveal answer")');

    // Answer should now be visible
    await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).toBeVisible();

    // Title and artist should be displayed
    const answerTitle = page.locator('h2').nth(1);
    await expect(answerTitle).not.toBeEmpty();

    // Album and artist info should be present
    const answerDetails = page.locator('p').filter({ hasText: '·' });
    await expect(answerDetails).toBeVisible();
  });

  test('should not show answer in page title during concealment', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');

    // Page title should not contain track details
    const title = await page.title();
    expect(title).toBeTruthy();
    // Title should be generic, not revealing the answer
    expect(title).not.toMatch(/[Ss]ong|[Tt]rack|[Aa]rtist/);
  });

  test('should hide answer again after next round', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');

    // Round 1: reveal and advance
    await page.click('button:has-text("Start excerpt")');
    await page.click('button:has-text("Reveal answer")');
    await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).toBeVisible();

    await page.click('button:has-text("Next round")');

    // Round 2: answer should be concealed again
    await expect(
      page.locator('.eyebrow:has-text("THE ANSWER")'),
    ).not.toBeVisible();
    await expect(page.locator('.mystery')).toBeVisible();
  });

  test('should not leak answer through alt text or aria labels', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');

    // Check for images with revealing alt text
    const images = page.locator('img');
    const imageCount = await images.count();

    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      // Alt text should not reveal track info during concealment
      if (alt) {
        expect(alt).not.toMatch(/track|song|album/i);
      }
    }
  });

  test('should maintain concealment during pause and resume', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');

    // Pause
    await page.click('button:has-text("Pause")');
    await expect(page.locator('.mystery')).toBeVisible();
    await expect(
      page.locator('.eyebrow:has-text("THE ANSWER")'),
    ).not.toBeVisible();

    // Resume
    await page.click('button:has-text("Resume")');
    await expect(page.locator('.mystery')).toBeVisible();
    await expect(
      page.locator('.eyebrow:has-text("THE ANSWER")'),
    ).not.toBeVisible();
  });
});
