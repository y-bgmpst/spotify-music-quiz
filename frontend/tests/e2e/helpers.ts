import { expect, type Page } from '@playwright/test';

/** Shared steps for the real, non-mocked end-to-end flow. */
export async function createGame(page: Page, teams = 'Team A, Team B') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up the quiz' })).toBeVisible();
  await page.getByLabel('Teams (comma separated)').fill(teams);
  await page.getByLabel('Number of rounds').fill('3');
  await page.getByLabel('Excerpt length in seconds').fill('5');
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.getByRole('heading', { name: /Round 1 of 3/ })).toBeVisible();
}

export async function expectNoAnswerVisible(page: Page) {
  const body = (await page.locator('body').innerText()).toLowerCase();
  // Fake catalog answers are "Track N" by "Artist N" on "Fake Album".
  expect(body).not.toContain('fake album');
  expect(body).not.toMatch(/artist \d/);
}
