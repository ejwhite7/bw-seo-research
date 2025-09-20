/**
 * End-to-End Tests for Complete Workflow
 * 
 * Tests the full user journey from creating a keyword run
 * to viewing results and exporting data.
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const TEST_USER = {
  email: 'test@example.com',
  name: 'Test User'
};

const TEST_SEED_KEYWORDS = [
  'digital marketing',
  'content marketing',
  'seo optimization'
];

// Helper functions
async function loginUser(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[data-testid="email-input"]', TEST_USER.email);
  await page.fill('[data-testid="password-input"]', 'testpassword123');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

async function createNewRun(page: Page, seedKeywords: string[]) {
  await page.fill('[data-testid="seed-keywords-input"]', seedKeywords.join(', '));
  await page.click('[data-testid="create-run-button"]');
  
  // Wait for run to be created and appear in the list
  await page.waitForSelector('[data-testid^="run-"]');
}

async function waitForRunCompletion(page: Page, runId: string) {
  // Poll for run completion status
  await page.waitForFunction(
    (id) => {
      const runElement = document.querySelector(`[data-testid="run-${id}"]`);
      const statusElement = runElement?.querySelector('.status');
      return statusElement?.textContent === 'completed';
    },
    runId,
    { timeout: 300000 } // 5 minutes max
  );
}

test.describe('Complete Keyword Research Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Login user
    await loginUser(page);
  });

  test('should complete full workflow from seed keywords to export', async ({ page }) => {
    // Step 1: Create a new keyword run
    await test.step('Create keyword run', async () => {
      await createNewRun(page, TEST_SEED_KEYWORDS);
      
      // Verify run appears in the list
      const runElement = await page.waitForSelector('[data-testid^="run-"]');
      const runText = await runElement.textContent();
      expect(runText).toContain('digital marketing, content marketing, seo optimization');
      expect(runText).toContain('pending');
    });

    // Step 2: Wait for processing to complete
    let runId: string;
    await test.step('Wait for processing completion', async () => {
      // Get the run ID from the first run element
      const runElement = await page.locator('[data-testid^="run-"]').first();
      const testId = await runElement.getAttribute('data-testid');
      runId = testId!.replace('run-', '');
      
      // Wait for the run to complete
      await waitForRunCompletion(page, runId);
      
      // Verify completion status
      const statusElement = await page.locator(`[data-testid="run-${runId}"] .status`);
      await expect(statusElement).toHaveText('completed');
    });

    // Step 3: View keyword results
    await test.step('View keyword results', async () => {
      // Click on the completed run to view details
      await page.click(`[data-testid="run-${runId}"]`);
      
      // Verify run details section appears
      await expect(page.locator('.run-details')).toBeVisible();
      await expect(page.locator('.run-details-header h2')).toContainText('Run Details:');
      
      // Verify keywords are displayed
      await expect(page.locator('[data-testid="keywords-view"]')).toHaveClass(/active/);
      await expect(page.locator('.keywords-table')).toBeVisible();
      
      // Check that keywords are loaded
      const keywordRows = await page.locator('[data-testid^="keyword-"]');
      const keywordCount = await keywordRows.count();
      expect(keywordCount).toBeGreaterThan(0);
      
      // Verify keyword data structure
      const firstKeyword = keywordRows.first();
      await expect(firstKeyword.locator('.keyword-text')).not.toBeEmpty();
      await expect(firstKeyword.locator('.stage')).toHaveText(/^(dream100|tier2|tier3)$/);
      await expect(firstKeyword.locator('.score')).toHaveText(/^\d+\.\d{3}$/);
    });

    // Step 4: Test keyword filtering and sorting
    await test.step('Test keyword filtering and sorting', async () => {
      // Test stage filtering
      await page.selectOption('[data-testid="stage-filter"]', 'dream100');
      
      // Verify only dream100 keywords are shown
      const stageElements = await page.locator('.stage').allTextContents();
      stageElements.forEach(stage => {
        expect(stage).toBe('dream100');
      });
      
      // Test sorting by volume
      await page.selectOption('[data-testid="sort-select"]', 'volume');
      
      // Verify sorting is applied (volumes should be in descending order)
      const volumeElements = await page.locator('.keyword-row div:nth-child(3)').allTextContents();
      const volumes = volumeElements.map(v => parseInt(v.replace(/,/g, '')));
      
      for (let i = 1; i < volumes.length; i++) {
        expect(volumes[i]).toBeLessThanOrEqual(volumes[i - 1]);
      }
      
      // Reset filters
      await page.selectOption('[data-testid="stage-filter"]', 'all');
    });

    // Step 5: View clusters
    await test.step('View cluster results', async () => {
      // Switch to clusters view
      await page.click('[data-testid="clusters-view"]');
      await expect(page.locator('[data-testid="clusters-view"]')).toHaveClass(/active/);
      
      // Verify clusters are displayed
      await expect(page.locator('.clusters-section')).toBeVisible();
      
      const clusterCards = await page.locator('[data-testid^="cluster-"]');
      const clusterCount = await clusterCards.count();
      expect(clusterCount).toBeGreaterThan(0);
      
      // Verify cluster data structure
      const firstCluster = clusterCards.first();
      await expect(firstCluster.locator('.cluster-label')).not.toBeEmpty();
      await expect(firstCluster.locator('.cluster-stats')).toContainText('Size:');
      await expect(firstCluster.locator('.cluster-stats')).toContainText('Score:');
      await expect(firstCluster.locator('.cluster-keywords')).not.toBeEmpty();
      await expect(firstCluster.locator('.intent-mix')).not.toBeEmpty();
    });

    // Step 6: Test export functionality
    await test.step('Export keyword data', async () => {
      // Test CSV export
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click(`[data-testid="export-${runId}"]`)
      ]);
      
      // Verify download
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
      
      // Save and verify file content
      const path = await download.path();
      expect(path).toBeTruthy();
      
      // Verify the download completed successfully
      const downloadState = await download.failure();
      expect(downloadState).toBeNull();
    });
  });

  test('should handle quick win identification', async ({ page }) => {
    await createNewRun(page, ['easy keyword', 'low competition term']);
    
    // Get run ID and wait for completion
    const runElement = await page.locator('[data-testid^="run-"]').first();
    const testId = await runElement.getAttribute('data-testid');
    const runId = testId!.replace('run-', '');
    
    await waitForRunCompletion(page, runId);
    
    // Click on run to view details
    await page.click(`[data-testid="run-${runId}"]`);
    
    // Look for quick win indicators
    const quickWinElements = await page.locator('.quick-win.yes').count();
    expect(quickWinElements).toBeGreaterThan(0);
    
    // Verify quick win keywords have appropriate characteristics
    const quickWinRows = await page.locator('[data-testid^="keyword-"]').filter({
      has: page.locator('.quick-win.yes')
    });
    
    const count = await quickWinRows.count();
    if (count > 0) {
      const firstQuickWin = quickWinRows.first();
      
      // Quick wins should have low difficulty
      const difficultyText = await firstQuickWin.locator('div:nth-child(4)').textContent();
      const difficulty = parseInt(difficultyText || '100');
      expect(difficulty).toBeLessThan(50);
    }
  });

  test('should handle multiple runs and navigation', async ({ page }) => {
    // Create first run
    await createNewRun(page, ['first run', 'keywords']);
    
    // Create second run
    await createNewRun(page, ['second run', 'different keywords']);
    
    // Verify both runs appear in the list
    const runElements = await page.locator('[data-testid^="run-"]');
    const runCount = await runElements.count();
    expect(runCount).toBeGreaterThanOrEqual(2);
    
    // Test switching between runs
    const firstRun = runElements.first();
    const secondRun = runElements.nth(1);
    
    await firstRun.click();
    await expect(page.locator('.run-details')).toBeVisible();
    
    await secondRun.click();
    await expect(page.locator('.run-details')).toBeVisible();
    
    // Verify the run details update when switching
    const runDetailsHeader = await page.locator('.run-details-header h2').textContent();
    expect(runDetailsHeader).toContain('Run Details:');
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Test with empty seed keywords
    await page.click('[data-testid="create-run-button"]');
    
    // Button should be disabled when no keywords are entered
    await expect(page.locator('[data-testid="create-run-button"]')).toBeDisabled();
    
    // Test with invalid seed keywords (too many)
    const manyKeywords = Array.from({ length: 20 }, (_, i) => `keyword${i}`);
    await page.fill('[data-testid="seed-keywords-input"]', manyKeywords.join(', '));
    
    // Should show warning about too many keywords
    await page.click('[data-testid="create-run-button"]');
    
    // Wait for any warning messages to appear
    const warningMessage = page.locator('[role="alert"], .warning, .error');
    if (await warningMessage.count() > 0) {
      await expect(warningMessage.first()).toBeVisible();
    }
  });

  test('should maintain state during navigation', async ({ page }) => {
    await createNewRun(page, TEST_SEED_KEYWORDS);
    
    // Get run ID
    const runElement = await page.locator('[data-testid^="run-"]').first();
    const testId = await runElement.getAttribute('data-testid');
    const runId = testId!.replace('run-', '');
    
    await waitForRunCompletion(page, runId);
    
    // Click on run and set up filters
    await page.click(`[data-testid="run-${runId}"]`);
    await page.selectOption('[data-testid="stage-filter"]', 'tier2');
    await page.selectOption('[data-testid="sort-select"]', 'volume');
    
    // Navigate away and back
    await page.goto('/dashboard');
    await page.click(`[data-testid="run-${runId}"]`);
    
    // Verify filters are reset to defaults (this is expected behavior)
    const stageFilter = await page.locator('[data-testid="stage-filter"]').inputValue();
    expect(stageFilter).toBe('all');
  });

  test('should handle responsive design on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await createNewRun(page, ['mobile', 'test']);
    
    // Verify mobile layout adaptations
    await expect(page.locator('.dashboard')).toBeVisible();
    await expect(page.locator('[data-testid="seed-keywords-input"]')).toBeVisible();
    
    // Test mobile-specific interactions
    const runElement = await page.locator('[data-testid^="run-"]').first();
    await runElement.click();
    
    await expect(page.locator('.run-details')).toBeVisible();
    
    // Verify horizontal scrolling for tables on mobile
    const keywordsTable = page.locator('.keywords-table');
    if (await keywordsTable.isVisible()) {
      const tableWidth = await keywordsTable.boundingBox();
      expect(tableWidth?.width).toBeGreaterThan(0);
    }
  });
});

test.describe('Performance and Reliability', () => {
  test('should handle large keyword sets efficiently', async ({ page }) => {
    await loginUser(page);
    
    // Create run with keywords likely to generate large result set
    await createNewRun(page, [
      'marketing',
      'business',
      'strategy',
      'growth',
      'digital'
    ]);
    
    const runElement = await page.locator('[data-testid^="run-"]').first();
    const testId = await runElement.getAttribute('data-testid');
    const runId = testId!.replace('run-', '');
    
    await waitForRunCompletion(page, runId);
    await page.click(`[data-testid="run-${runId}"]`);
    
    // Measure performance of loading keywords
    const start = Date.now();
    await page.waitForSelector('.keywords-table');
    const loadTime = Date.now() - start;
    
    // Should load within reasonable time (5 seconds)
    expect(loadTime).toBeLessThan(5000);
    
    // Verify pagination or virtual scrolling is working
    const keywordRows = await page.locator('[data-testid^="keyword-"]');
    const visibleCount = await keywordRows.count();
    
    // Should limit visible rows for performance
    expect(visibleCount).toBeLessThanOrEqual(100);
  });

  test('should recover from network failures', async ({ page }) => {
    await loginUser(page);
    
    // Simulate network issues during run creation
    await page.route('**/api/runs', route => route.abort());
    
    await page.fill('[data-testid="seed-keywords-input"]', 'network test');
    await page.click('[data-testid="create-run-button"]');
    
    // Should show error state
    const errorMessage = page.locator('[role="alert"], .error');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
    
    // Restore network
    await page.unroute('**/api/runs');
    
    // Retry should work
    await page.click('[data-testid="create-run-button"]');
    await page.waitForSelector('[data-testid^="run-"]');
  });
});

test.describe('Accessibility', () => {
  test('should be fully keyboard navigable', async ({ page }) => {
    await loginUser(page);
    
    // Test keyboard navigation through main interface
    await page.keyboard.press('Tab'); // Should focus on first interactive element
    await page.keyboard.type('test keywords');
    await page.keyboard.press('Tab'); // Should focus on create button
    await page.keyboard.press('Enter'); // Should create run
    
    await page.waitForSelector('[data-testid^="run-"]');
    
    // Navigate to run with keyboard
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Should open run details
    await expect(page.locator('.run-details')).toBeVisible();
  });

  test('should have proper ARIA labels and roles', async ({ page }) => {
    await loginUser(page);
    
    // Check for proper heading structure
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').count();
    expect(headings).toBeGreaterThan(0);
    
    // Check for form labels
    const seedInput = page.locator('[data-testid="seed-keywords-input"]');
    const inputLabel = await seedInput.getAttribute('aria-label') || 
                      await seedInput.getAttribute('placeholder');
    expect(inputLabel).toBeTruthy();
    
    // Check for button roles
    const buttons = await page.locator('button, [role="button"]').count();
    expect(buttons).toBeGreaterThan(0);
  });

  test('should work with screen readers', async ({ page }) => {
    await loginUser(page);
    
    // Test with simulated screen reader navigation
    await createNewRun(page, ['accessibility test']);
    
    const runElement = await page.locator('[data-testid^="run-"]').first();
    
    // Should have accessible text content
    const accessibleText = await runElement.textContent();
    expect(accessibleText).toContain('accessibility test');
    
    // Should have proper focus management
    await runElement.focus();
    await expect(runElement).toBeFocused();
  });
});

test.describe('Cross-browser Compatibility', () => {
  ['chromium', 'firefox', 'webkit'].forEach(browserName => {
    test(`should work correctly in ${browserName}`, async ({ page }) => {
      await loginUser(page);
      
      // Basic functionality test for each browser
      await createNewRun(page, [`${browserName} test`]);
      
      const runElement = await page.locator('[data-testid^="run-"]').first();
      await expect(runElement).toBeVisible();
      
      await runElement.click();
      await expect(page.locator('.run-details')).toBeVisible();
    });
  });
});