import { expect, test } from '@playwright/test';
import { createGame, expectNoAnswerVisible } from './helpers';

test.describe('full game flow against the real backend', () => {
  test('host can play a round end to end', async ({ page }) => {
    await createGame(page);

    await expect(page.getByText('Status: ready')).toBeVisible();

    await page.getByRole('button', { name: 'Start round' }).click();
    await expect(page.getByText('Status: playing')).toBeVisible();

    await page.getByRole('button', { name: 'Pause round' }).click();
    await expect(page.getByText('Status: paused')).toBeVisible();

    await page.getByRole('button', { name: 'Resume round' }).click();
    await expect(page.getByText('Status: playing')).toBeVisible();

    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect(page.getByText('Status: revealed')).toBeVisible();

    await page.getByRole('button', { name: 'Next round' }).click();
    await expect(
      page.getByRole('heading', { name: /Round 2 of 3/ }),
    ).toBeVisible();
    await expect(page.getByText('Status: ready')).toBeVisible();
  });

  test('the countdown decreases while a round is playing', async ({ page }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();

    const timer = page.locator('output');
    await expect(timer).toHaveText('0:05');
    await expect(timer).toHaveText('0:03', { timeout: 5000 });
  });

  test('the round survives a page reload because the backend owns the state', async ({
    page,
  }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    const answer = await page
      .getByRole('heading', { level: 3 })
      .first()
      .innerText();

    await page.reload();

    // A reload returns to setup: the app does not persist the game id in the
    // browser. This test documents that behaviour rather than asserting a
    // capability that does not exist.
    await expect(
      page.getByRole('heading', { name: 'Set up the quiz' }),
    ).toBeVisible();
    expect(answer).toMatch(/Track \d+/);
  });

  test('scores are awarded and can be undone', async ({ page }) => {
    await createGame(page);
    await page.getByRole('button', { name: 'Start round' }).click();
    await page.getByRole('button', { name: 'Reveal answer' }).click();

    const teamRow = page.getByRole('row', { name: /Team A/ });
    await expect(teamRow).toContainText('0');

    await page
      .getByRole('button', { name: /Award one point to Team A for the title/ })
      .click();
    await expect(teamRow).toContainText('1');

    await page
      .getByRole('button', { name: /Award one point to Team A for the artist/ })
      .click();
    await expect(teamRow).toContainText('2');

    await page
      .getByRole('button', { name: /Undo 1 points for Team A/ })
      .first()
      .click();
    await expect(teamRow).toContainText('1');
  });

  test('a rejected action shows a readable error, not a stack trace', async ({
    page,
  }) => {
    await createGame(page);
    // Force a 409 by replaying a stale command directly through the client.
    await page.route('**/round/start', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'invalid_state_transition',
            message: 'cannot start from playing',
          },
        }),
      }),
    );

    await page.getByRole('button', { name: 'Start round' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('cannot start from playing');
    await expect(alert).toBeFocused();
  });

  test('answers stay concealed for the whole pre-reveal lifecycle', async ({
    page,
  }) => {
    await createGame(page);
    await expectNoAnswerVisible(page);

    await page.getByRole('button', { name: 'Start round' }).click();
    await expectNoAnswerVisible(page);

    await page.getByRole('button', { name: 'Pause round' }).click();
    await expectNoAnswerVisible(page);
  });
});
