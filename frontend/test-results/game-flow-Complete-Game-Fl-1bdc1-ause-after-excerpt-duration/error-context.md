# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-flow.spec.ts >> Complete Game Flow >> should auto-pause after excerpt duration
- Location: tests/e2e/game-flow.spec.ts:84:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('button:has-text("Start excerpt")')

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - paragraph [ref=e5]: PRIVATE PLAYLIST GAME
    - heading "Guess the track." [level=1] [ref=e6]
    - paragraph [ref=e7]: A clean, host-controlled quiz for your room.
  - alert [ref=e8]: "TypeError: Failed to fetch"
  - generic [ref=e9]:
    - heading "Ready when you are." [level=2] [ref=e10]
    - paragraph [ref=e11]: Use the fake catalog to rehearse the complete game without Spotify credentials.
    - button "Create demo game" [ref=e12] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Complete Game Flow', () => {
  4  |   test('should complete a full game from creation to finish', async ({ page }) => {
  5  |     await page.goto('/');
  6  | 
  7  |     // Initial state
  8  |     await expect(page.locator('h1')).toContainText('Guess the track');
  9  | 
  10 |     // Create game
  11 |     await page.click('button:has-text("Create demo game")');
  12 |     await expect(page.locator('.round-bar')).toContainText('ROUND 1');
  13 |     await expect(page.locator('.status')).toContainText('READY');
  14 | 
  15 |     // Round 1: Start
  16 |     await page.click('button:has-text("Start excerpt")');
  17 |     await expect(page.locator('.status')).toContainText('PLAYING');
  18 |     await expect(page.locator('.timer')).toBeVisible();
  19 | 
  20 |     // Pause
  21 |     await page.click('button:has-text("Pause")');
  22 |     await expect(page.locator('.status')).toContainText('PAUSED');
  23 | 
  24 |     // Resume
  25 |     await page.click('button:has-text("Resume")');
  26 |     await expect(page.locator('.status')).toContainText('PLAYING');
  27 | 
  28 |     // Reveal
  29 |     await page.click('button:has-text("Reveal answer")');
  30 |     await expect(page.locator('.status')).toContainText('REVEALED');
  31 |     await expect(page.locator('.eyebrow')).toContainText('THE ANSWER');
  32 | 
  33 |     // Verify answer is displayed
  34 |     const answerTitle = page.locator('h2').nth(1);
  35 |     await expect(answerTitle).not.toBeEmpty();
  36 | 
  37 |     // Next round
  38 |     await page.click('button:has-text("Next round")');
  39 |     await expect(page.locator('.round-bar')).toContainText('ROUND 2');
  40 |     await expect(page.locator('.status')).toContainText('READY');
  41 | 
  42 |     // Round 2: Quick flow
  43 |     await page.click('button:has-text("Start excerpt")');
  44 |     await page.click('button:has-text("Reveal answer")');
  45 |     await page.click('button:has-text("Next round")');
  46 | 
  47 |     // Round 3: Final round
  48 |     await expect(page.locator('.round-bar')).toContainText('ROUND 3');
  49 |     await page.click('button:has-text("Start excerpt")');
  50 |     await page.click('button:has-text("Reveal answer")');
  51 |     await page.click('button:has-text("Next round")');
  52 | 
  53 |     // Game finished
  54 |     await expect(page.locator('.status')).toContainText('FINISHED');
  55 |     await expect(page.locator('h2')).toContainText('Game complete');
  56 |   });
  57 | 
  58 |   test('should show team scores throughout game', async ({ page }) => {
  59 |     await page.goto('/');
  60 |     await page.click('button:has-text("Create demo game")');
  61 | 
  62 |     // Verify teams are displayed
  63 |     await expect(page.locator('.scores')).toBeVisible();
  64 |     await expect(page.locator('.score').nth(0)).toContainText('Team A');
  65 |     await expect(page.locator('.score').nth(1)).toContainText('Team B');
  66 | 
  67 |     // Initial scores are 0
  68 |     await expect(page.locator('.score').nth(0)).toContainText('0');
  69 |     await expect(page.locator('.score').nth(1)).toContainText('0');
  70 |   });
  71 | 
  72 |   test('should prevent starting a round from wrong state', async ({ page }) => {
  73 |     await page.goto('/');
  74 |     await page.click('button:has-text("Create demo game")');
  75 |     await page.click('button:has-text("Start excerpt")');
  76 | 
  77 |     // Cannot start again while playing
  78 |     await expect(page.locator('button:has-text("Start excerpt")')).not.toBeVisible();
  79 | 
  80 |     // Can only pause
  81 |     await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  82 |   });
  83 | 
  84 |   test('should auto-pause after excerpt duration', async ({ page }) => {
  85 |     await page.goto('/');
  86 |     await page.click('button:has-text("Create demo game")');
> 87 |     await page.click('button:has-text("Start excerpt")');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  88 | 
  89 |     // Wait for timer countdown (10 seconds)
  90 |     await expect(page.locator('.timer')).toContainText('10s');
  91 | 
  92 |     // Wait for countdown to reach near zero
  93 |     await page.waitForTimeout(10500);
  94 | 
  95 |     // Timer should show 0
  96 |     await expect(page.locator('.timer')).toContainText('0s');
  97 |   });
  98 | });
  99 | 
```