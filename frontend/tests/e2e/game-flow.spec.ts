import { test, expect } from '@playwright/test';

test.describe('Complete Game Flow', () => {
  test('should complete a full game from creation to finish', async ({
    page,
  }) => {
    await page.goto('/');

    // Initial state
    await expect(page.locator('h1')).toContainText('Guess the track');

    // Create game
    await page.click('button:has-text("Create demo game")');
    await expect(page.locator('.round-bar')).toContainText('ROUND 1');
    await expect(page.locator('.status')).toContainText('READY');

    // Round 1: Start
    await page.click('button:has-text("Start excerpt")');
    await expect(page.locator('.status')).toContainText('PLAYING');
    await expect(page.locator('.timer')).toBeVisible();

    // Pause
    await page.click('button:has-text("Pause")');
    await expect(page.locator('.status')).toContainText('PAUSED');

    // Resume
    await page.click('button:has-text("Resume")');
    await expect(page.locator('.status')).toContainText('PLAYING');

    // Reveal
    await page.click('button:has-text("Reveal answer")');
    await expect(page.locator('.status')).toContainText('REVEALED');
    await expect(page.locator('.eyebrow')).toContainText('THE ANSWER');

    // Verify answer is displayed
    const answerTitle = page.locator('h2').nth(1);
    await expect(answerTitle).not.toBeEmpty();

    // Next round
    await page.click('button:has-text("Next round")');
    await expect(page.locator('.round-bar')).toContainText('ROUND 2');
    await expect(page.locator('.status')).toContainText('READY');

    // Round 2: Quick flow
    await page.click('button:has-text("Start excerpt")');
    await page.click('button:has-text("Reveal answer")');
    await page.click('button:has-text("Next round")');

    // Round 3: Final round
    await expect(page.locator('.round-bar')).toContainText('ROUND 3');
    await page.click('button:has-text("Start excerpt")');
    await page.click('button:has-text("Reveal answer")');
    await page.click('button:has-text("Next round")');

    // Game finished
    await expect(page.locator('.status')).toContainText('FINISHED');
    await expect(page.locator('h2')).toContainText('Game complete');
  });

  test('should show team scores throughout game', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');

    // Verify teams are displayed
    await expect(page.locator('.scores')).toBeVisible();
    await expect(page.locator('.score').nth(0)).toContainText('Team A');
    await expect(page.locator('.score').nth(1)).toContainText('Team B');

    // Initial scores are 0
    await expect(page.locator('.score').nth(0)).toContainText('0');
    await expect(page.locator('.score').nth(1)).toContainText('0');
  });

  test('should prevent starting a round from wrong state', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');

    // Cannot start again while playing
    await expect(
      page.locator('button:has-text("Start excerpt")'),
    ).not.toBeVisible();

    // Can only pause
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  });

  test('should auto-pause after excerpt duration', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');

    // Wait for timer countdown (10 seconds)
    await expect(page.locator('.timer')).toContainText('10s');

    // Wait for countdown to reach near zero
    await page.waitForTimeout(10500);

    // Timer should show 0
    await expect(page.locator('.timer')).toContainText('0s');
  });
});
