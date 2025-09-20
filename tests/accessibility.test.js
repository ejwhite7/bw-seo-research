/**
 * Basic accessibility tests for the Dream 100 Keyword Engine
 * Tests keyboard navigation, ARIA attributes, and color contrast
 */

const { test, expect } = require('@playwright/test');

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Check for proper h1
    const h1 = page.locator('h1');
    await expect(h1).toHaveText(/Dream 100 Keyword Engine/);
    
    // Check for proper h2
    const h2 = page.locator('h2');
    await expect(h2).toHaveText(/Step 1: Enter Your Seed Keywords/);
  });

  test('should have accessible form labels', async ({ page }) => {
    const textarea = page.locator('#keywords');
    const label = page.locator('label[for="keywords"]');
    
    await expect(label).toBeVisible();
    await expect(textarea).toHaveAttribute('aria-describedby', 'keywords-help');
    await expect(page.locator('#keywords-help')).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Skip to main content should work
    await page.keyboard.press('Tab');
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();
    
    // Tab to textarea
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const textarea = page.locator('#keywords');
    await expect(textarea).toBeFocused();
    
    // Type in textarea
    await textarea.fill('test keyword');
    
    // Tab to button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const button = page.locator('button:has-text("Start Processing")');
    await expect(button).toBeFocused();
    
    // Activate button with keyboard
    await page.keyboard.press('Enter');
    await expect(button).toHaveText(/Processing.../);
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    // Check navigation has proper ARIA
    const nav = page.locator('nav[aria-label="Progress through keyword research workflow"]');
    await expect(nav).toBeVisible();
    
    // Check progress steps have ARIA labels
    const firstStep = page.locator('[aria-current="step"]');
    await expect(firstStep).toHaveAttribute('aria-label', /Step 1: Input/);
    
    // Check required field
    const textarea = page.locator('#keywords');
    await expect(textarea).toHaveAttribute('required');
  });

  test('should have accessible alerts', async ({ page }) => {
    // Fill textarea and proceed to step 2
    await page.locator('#keywords').fill('test keyword');
    await page.locator('button:has-text("Start Processing")').click();
    
    // Wait for step 2
    await page.waitForSelector('h2:has-text("Step 2: Dream 100 Generation")');
    
    // Check demo mode alert has proper ARIA
    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('aria-labelledby', 'demo-mode-title');
  });

  test('should have sufficient color contrast', async ({ page }) => {
    // Check main heading color contrast
    const h1 = page.locator('h1');
    const h1Color = await h1.evaluate(el => getComputedStyle(el).color);
    
    // Check button has good contrast (blue background, white text)
    const button = page.locator('button:has-text("Start Processing")');
    const buttonBg = await button.evaluate(el => getComputedStyle(el).backgroundColor);
    const buttonColor = await button.evaluate(el => getComputedStyle(el).color);
    
    // Basic checks - these should be blue background with white text
    expect(buttonBg).toContain('rgb(37, 99, 235)'); // blue-600
    expect(buttonColor).toContain('rgb(255, 255, 255)'); // white
  });

  test('should work without mouse', async ({ page }) => {
    // Test complete workflow using only keyboard
    
    // Navigate to textarea using tab
    await page.keyboard.press('Tab'); // Skip link
    await page.keyboard.press('Tab'); 
    await page.keyboard.press('Tab'); 
    await page.keyboard.press('Tab'); // Textarea
    
    // Fill textarea
    await page.keyboard.type('accessibility test keyword');
    
    // Navigate to button and activate
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Should proceed to step 2
    await page.waitForSelector('h2:has-text("Step 2: Dream 100 Generation")');
    
    // Navigate back using keyboard
    await page.keyboard.press('Tab'); // Focus back button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Should be back to step 1
    await expect(page.locator('h2')).toHaveText(/Step 1: Enter Your Seed Keywords/);
  });
});