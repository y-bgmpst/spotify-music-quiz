# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: concealment.spec.ts >> Answer Concealment >> should hide answer metadata before reveal
- Location: tests/e2e/concealment.spec.ts:4:3

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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Answer Concealment', () => {
  4   |   test('should hide answer metadata before reveal', async ({ page }) => {
  5   |     await page.goto('/');
  6   |     await page.click('button:has-text("Create demo game")');
> 7   |     await page.click('button:has-text("Start excerpt")');
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  8   | 
  9   |     // During playing state, answer should not be in DOM
  10  |     await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).not.toBeVisible();
  11  | 
  12  |     // Mystery indicator should be visible
  13  |     await expect(page.locator('.mystery')).toContainText('?');
  14  |     await expect(page.locator('h2')).toContainText('What are we listening to?');
  15  | 
  16  |     // Check that answer data is not leaked in DOM
  17  |     const pageContent = await page.content();
  18  | 
  19  |     // The answer should not appear as text in the HTML
  20  |     // (We can't check exact track names without knowing them, but we can verify structure)
  21  |     expect(pageContent).not.toContain('THE ANSWER');
  22  |   });
  23  | 
  24  |   test('should reveal answer metadata after reveal action', async ({ page }) => {
  25  |     await page.goto('/');
  26  |     await page.click('button:has-text("Create demo game")');
  27  |     await page.click('button:has-text("Start excerpt")');
  28  |     await page.click('button:has-text("Reveal answer")');
  29  | 
  30  |     // Answer should now be visible
  31  |     await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).toBeVisible();
  32  | 
  33  |     // Title and artist should be displayed
  34  |     const answerTitle = page.locator('h2').nth(1);
  35  |     await expect(answerTitle).not.toBeEmpty();
  36  | 
  37  |     // Album and artist info should be present
  38  |     const answerDetails = page.locator('p').filter({ hasText: '·' });
  39  |     await expect(answerDetails).toBeVisible();
  40  |   });
  41  | 
  42  |   test('should not show answer in page title during concealment', async ({ page }) => {
  43  |     await page.goto('/');
  44  |     await page.click('button:has-text("Create demo game")');
  45  |     await page.click('button:has-text("Start excerpt")');
  46  | 
  47  |     // Page title should not contain track details
  48  |     const title = await page.title();
  49  |     expect(title).toBeTruthy();
  50  |     // Title should be generic, not revealing the answer
  51  |     expect(title).not.toMatch(/[Ss]ong|[Tt]rack|[Aa]rtist/);
  52  |   });
  53  | 
  54  |   test('should hide answer again after next round', async ({ page }) => {
  55  |     await page.goto('/');
  56  |     await page.click('button:has-text("Create demo game")');
  57  | 
  58  |     // Round 1: reveal and advance
  59  |     await page.click('button:has-text("Start excerpt")');
  60  |     await page.click('button:has-text("Reveal answer")');
  61  |     await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).toBeVisible();
  62  | 
  63  |     await page.click('button:has-text("Next round")');
  64  | 
  65  |     // Round 2: answer should be concealed again
  66  |     await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).not.toBeVisible();
  67  |     await expect(page.locator('.mystery')).toBeVisible();
  68  |   });
  69  | 
  70  |   test('should not leak answer through alt text or aria labels', async ({ page }) => {
  71  |     await page.goto('/');
  72  |     await page.click('button:has-text("Create demo game")');
  73  |     await page.click('button:has-text("Start excerpt")');
  74  | 
  75  |     // Check for images with revealing alt text
  76  |     const images = page.locator('img');
  77  |     const imageCount = await images.count();
  78  | 
  79  |     for (let i = 0; i < imageCount; i++) {
  80  |       const img = images.nth(i);
  81  |       const alt = await img.getAttribute('alt');
  82  |       // Alt text should not reveal track info during concealment
  83  |       if (alt) {
  84  |         expect(alt).not.toMatch(/track|song|album/i);
  85  |       }
  86  |     }
  87  |   });
  88  | 
  89  |   test('should maintain concealment during pause and resume', async ({ page }) => {
  90  |     await page.goto('/');
  91  |     await page.click('button:has-text("Create demo game")');
  92  |     await page.click('button:has-text("Start excerpt")');
  93  | 
  94  |     // Pause
  95  |     await page.click('button:has-text("Pause")');
  96  |     await expect(page.locator('.mystery')).toBeVisible();
  97  |     await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).not.toBeVisible();
  98  | 
  99  |     // Resume
  100 |     await page.click('button:has-text("Resume")');
  101 |     await expect(page.locator('.mystery')).toBeVisible();
  102 |     await expect(page.locator('.eyebrow:has-text("THE ANSWER")')).not.toBeVisible();
  103 |   });
  104 | });
  105 | 
```