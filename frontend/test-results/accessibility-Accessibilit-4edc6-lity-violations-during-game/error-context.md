# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.ts >> Accessibility >> should not have accessibility violations during game
- Location: tests/e2e/accessibility.spec.ts:13:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 45

- Array []
+ Array [
+   Object {
+     "description": "Ensure every HTML document has a lang attribute",
+     "help": "<html> element must have a lang attribute",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/html-has-lang?application=playwright",
+     "id": "html-has-lang",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "messageKey": "noLang",
+             },
+             "id": "has-lang",
+             "impact": "serious",
+             "message": "The <html> element does not have a lang attribute",
+             "relatedNodes": Array [],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   The <html> element does not have a lang attribute",
+         "html": "<html>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "html",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.language",
+       "wcag2a",
+       "wcag311",
+       "TTv5",
+       "TT11.a",
+       "EN-301-549",
+       "EN-9.3.1.1",
+       "ACT",
+       "RGAAv4",
+       "RGAA-8.3.1",
+     ],
+   },
+ ]
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
  2   | import AxeBuilder from '@axe-core/playwright';
  3   | 
  4   | test.describe('Accessibility', () => {
  5   |   test('should not have automatically detectable accessibility violations on landing page', async ({ page }) => {
  6   |     await page.goto('/');
  7   | 
  8   |     const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  9   | 
  10  |     expect(accessibilityScanResults.violations).toEqual([]);
  11  |   });
  12  | 
  13  |   test('should not have accessibility violations during game', async ({ page }) => {
  14  |     await page.goto('/');
  15  |     await page.click('button:has-text("Create demo game")');
  16  | 
  17  |     const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  18  | 
  19  |     // Log violations for debugging if any exist
  20  |     if (accessibilityScanResults.violations.length > 0) {
  21  |       console.log('Accessibility violations:', JSON.stringify(accessibilityScanResults.violations, null, 2));
  22  |     }
  23  | 
> 24  |     expect(accessibilityScanResults.violations).toEqual([]);
      |                                                 ^ Error: expect(received).toEqual(expected) // deep equality
  25  |   });
  26  | 
  27  |   test('should have proper heading hierarchy', async ({ page }) => {
  28  |     await page.goto('/');
  29  | 
  30  |     // Check h1 exists
  31  |     const h1 = page.locator('h1');
  32  |     await expect(h1).toBeVisible();
  33  |     await expect(h1).toContainText('Guess the track');
  34  | 
  35  |     // Create game and check h2
  36  |     await page.click('button:has-text("Create demo game")');
  37  |     const h2 = page.locator('h2');
  38  |     await expect(h2).toBeVisible();
  39  |   });
  40  | 
  41  |   test('should support keyboard navigation', async ({ page }) => {
  42  |     await page.goto('/');
  43  | 
  44  |     // Tab to the create button
  45  |     await page.keyboard.press('Tab');
  46  | 
  47  |     // Button should have focus
  48  |     const createButton = page.locator('button:has-text("Create demo game")');
  49  |     await expect(createButton).toBeFocused();
  50  | 
  51  |     // Press Enter to activate
  52  |     await page.keyboard.press('Enter');
  53  | 
  54  |     // Game should be created
  55  |     await expect(page.locator('.round-bar')).toBeVisible();
  56  | 
  57  |     // Tab to start button
  58  |     await page.keyboard.press('Tab');
  59  |     await page.keyboard.press('Tab');
  60  |     const startButton = page.locator('button:has-text("Start excerpt")');
  61  |     await expect(startButton).toBeFocused();
  62  |   });
  63  | 
  64  |   test('should have visible focus indicators', async ({ page }) => {
  65  |     await page.goto('/');
  66  | 
  67  |     const createButton = page.locator('button:has-text("Create demo game")');
  68  | 
  69  |     // Tab to button
  70  |     await page.keyboard.press('Tab');
  71  | 
  72  |     // Check that focus is visible (button should have outline or similar)
  73  |     const outlineStyle = await createButton.evaluate((el) => {
  74  |       const styles = window.getComputedStyle(el);
  75  |       return {
  76  |         outline: styles.outline,
  77  |         outlineWidth: styles.outlineWidth,
  78  |         boxShadow: styles.boxShadow,
  79  |       };
  80  |     });
  81  | 
  82  |     // Should have some form of focus indicator
  83  |     const hasFocusIndicator =
  84  |       outlineStyle.outlineWidth !== '0px' ||
  85  |       outlineStyle.outline !== 'none' ||
  86  |       outlineStyle.boxShadow !== 'none';
  87  | 
  88  |     expect(hasFocusIndicator).toBeTruthy();
  89  |   });
  90  | 
  91  |   test('should announce status changes to screen readers', async ({ page }) => {
  92  |     await page.goto('/');
  93  |     await page.click('button:has-text("Create demo game")');
  94  | 
  95  |     // Game area should have aria-live for status updates
  96  |     const gameSection = page.locator('.game');
  97  |     const ariaLive = await gameSection.getAttribute('aria-live');
  98  | 
  99  |     expect(ariaLive).toBe('polite');
  100 |   });
  101 | 
  102 |   test('should have proper button labels', async ({ page }) => {
  103 |     await page.goto('/');
  104 | 
  105 |     // All buttons should have text content or aria-label
  106 |     const buttons = page.locator('button');
  107 |     const buttonCount = await buttons.count();
  108 | 
  109 |     for (let i = 0; i < buttonCount; i++) {
  110 |       const button = buttons.nth(i);
  111 |       const text = await button.textContent();
  112 |       const ariaLabel = await button.getAttribute('aria-label');
  113 | 
  114 |       // Button should have either text or aria-label
  115 |       expect(text || ariaLabel).toBeTruthy();
  116 |     }
  117 |   });
  118 | 
  119 |   test('should have appropriate color contrast', async ({ page }) => {
  120 |     await page.goto('/');
  121 | 
  122 |     // Run axe with WCAG AA color contrast rules
  123 |     const accessibilityScanResults = await new AxeBuilder({ page })
  124 |       .withTags(['wcag2aa'])
```