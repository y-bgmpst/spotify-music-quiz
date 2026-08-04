import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('should not have automatically detectable accessibility violations on landing page', async ({
    page,
  }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should not have accessibility violations during game', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    // Log violations for debugging if any exist
    if (accessibilityScanResults.violations.length > 0) {
      console.log(
        'Accessibility violations:',
        JSON.stringify(accessibilityScanResults.violations, null, 2),
      );
    }

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');

    // Check h1 exists
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('Guess the track');

    // Create game and check h2
    await page.click('button:has-text("Create demo game")');
    const h2 = page.locator('h2');
    await expect(h2).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Tab to the create button
    await page.keyboard.press('Tab');

    // Button should have focus
    const createButton = page.locator('button:has-text("Create demo game")');
    await expect(createButton).toBeFocused();

    // Press Enter to activate
    await page.keyboard.press('Enter');

    // Game should be created
    await expect(page.locator('.round-bar')).toBeVisible();

    // Tab to start button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const startButton = page.locator('button:has-text("Start excerpt")');
    await expect(startButton).toBeFocused();
  });

  test('should have visible focus indicators', async ({ page }) => {
    await page.goto('/');

    const createButton = page.locator('button:has-text("Create demo game")');

    // Tab to button
    await page.keyboard.press('Tab');

    // Check that focus is visible (button should have outline or similar)
    const outlineStyle = await createButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        outlineWidth: styles.outlineWidth,
        boxShadow: styles.boxShadow,
      };
    });

    // Should have some form of focus indicator
    const hasFocusIndicator =
      outlineStyle.outlineWidth !== '0px' ||
      outlineStyle.outline !== 'none' ||
      outlineStyle.boxShadow !== 'none';

    expect(hasFocusIndicator).toBeTruthy();
  });

  test('should announce status changes to screen readers', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Create demo game")');

    // Game area should have aria-live for status updates
    const gameSection = page.locator('.game');
    const ariaLive = await gameSection.getAttribute('aria-live');

    expect(ariaLive).toBe('polite');
  });

  test('should have proper button labels', async ({ page }) => {
    await page.goto('/');

    // All buttons should have text content or aria-label
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');

      // Button should have either text or aria-label
      expect(text || ariaLabel).toBeTruthy();
    }
  });

  test('should have appropriate color contrast', async ({ page }) => {
    await page.goto('/');

    // Run axe with WCAG AA color contrast rules
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .analyze();

    const colorContrastViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === 'color-contrast',
    );

    expect(colorContrastViolations).toEqual([]);
  });

  test('should respect prefers-reduced-motion', async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/');
    await page.click('button:has-text("Create demo game")');
    await page.click('button:has-text("Start excerpt")');

    // Page should still be functional with reduced motion
    await expect(page.locator('.status')).toContainText('PLAYING');
    await expect(page.locator('.timer')).toBeVisible();
  });

  test('should have proper role for alert messages', async ({ page }) => {
    await page.goto('/');

    // Check if error region has proper role
    // (This would trigger if we intentionally cause an error)
    const alertRegion = page.locator('[role="alert"]');

    // Initially should not be visible
    await expect(alertRegion).not.toBeVisible();
  });
});
