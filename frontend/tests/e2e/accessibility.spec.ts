import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createGame } from './helpers';

/**
 * Accessibility is asserted with axe on every meaningful screen, plus explicit
 * keyboard-operability checks that axe cannot make.
 */
async function scan(page: Page) {
  // AxeBuilder bundles its own Playwright types; cast keeps the versions aligned.
  return new AxeBuilder({ page: page as never })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

test.describe('accessibility', () => {
  test('the setup screen has no axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Set up the quiz' })).toBeVisible();

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });

  test('the playing screen has no axe violations', async ({ page }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();
    await expect(page.getByText('Status: playing')).toBeVisible();

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });

  test('the revealed screen with scoring has no axe violations', async ({ page }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await page.getByRole('button', { name: /Award one point to Team A for the title/ }).click();

    const results = await scan(page);

    expect(results.violations).toEqual([]);
  });

  test('the whole game can be played with the keyboard alone', async ({ page }) => {
    await page.goto('/');

    // Reach and fill the form using only keyboard interaction.
    await page.getByLabel('Teams (comma separated)').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Team A, Team B');

    const startQuiz = page.getByRole('button', { name: 'Start quiz' });
    await startQuiz.focus();
    await expect(startQuiz).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: /Round 1 of/ })).toBeVisible();

    for (const name of ['Start round', 'Reveal answer', 'Next round']) {
      const button = page.getByRole('button', { name });
      await button.focus();
      await expect(button).toBeFocused();
      await page.keyboard.press('Enter');
    }

    await expect(page.getByRole('heading', { name: /Round 2 of/ })).toBeVisible();
  });

  test('focused controls show a visible focus indicator', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Start quiz' });
    await button.focus();

    const outlineWidth = await button.evaluate(
      element => window.getComputedStyle(element).outlineWidth,
    );

    expect(parseFloat(outlineWidth)).toBeGreaterThanOrEqual(2);
  });

  test('interactive targets meet the 44px minimum', async ({ page }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();
    await page.getByRole('button', { name: 'Reveal answer' }).click();

    for (const button of await page.getByRole('button').all()) {
      const box = await button.boundingBox();
      if (!box) continue;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('the page exposes one h1 and a main landmark', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('errors are announced through a live region', async ({ page }) => {
    await page.route('**/api/v1/games', route => route.abort('failed'));
    await page.goto('/');

    await page.getByRole('button', { name: 'Start quiz' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Cannot reach the quiz server');
  });
});
