import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright Configuration for Dream 100 Keyword Engine E2E Testing
 * 
 * Comprehensive end-to-end testing setup with cross-browser support,
 * parallel execution, visual regression testing, and CI/CD integration.
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Timeout configuration */
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000, // 10 seconds for expect assertions
    toHaveScreenshot: {
      threshold: 0.2, // Allow 20% visual difference
      animations: 'disabled'
    }
  },

  /* Test execution settings */
  fullyParallel: true, // Run tests in parallel
  forbidOnly: !!process.env.CI, // Fail CI if test.only is left in
  retries: process.env.CI ? 2 : 0, // Retry failed tests in CI
  workers: process.env.CI ? 2 : undefined, // Limit workers in CI
  
  /* Reporting configuration */
  reporter: [
    ['html', { 
      outputFolder: 'test-results/playwright-report',
      open: 'never' // Don't auto-open in CI
    }],
    ['junit', { 
      outputFile: 'test-results/e2e-results.xml' 
    }],
    ['json', { 
      outputFile: 'test-results/e2e-results.json' 
    }],
    // Add line reporter for CI logs
    process.env.CI ? ['line'] : ['list']
  ],

  /* Global test configuration */
  use: {
    /* Base URL for all tests */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    
    /* Screenshot and video settings */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    
    /* Browser behavior */
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    /* Locale and timezone */
    locale: 'en-US',
    timezoneId: 'America/New_York',
    
    /* Viewport size */
    viewport: { width: 1280, height: 720 },
    
    /* Ignore HTTPS errors in development */
    ignoreHTTPSErrors: true,
    
    /* Context options for API testing */
    extraHTTPHeaders: {
      'User-Agent': 'Dream100-E2E-Tests'
    }
  },

  /* Configure different browsers and devices */
  projects: [
    /* Desktop browsers */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.e2e\.ts/
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /.*\.e2e\.ts/
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /.*\.e2e\.ts/
    },

    /* Mobile testing */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: /.*\.mobile\.e2e\.ts/
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
      testMatch: /.*\.mobile\.e2e\.ts/
    },

    /* Tablet testing */
    {
      name: 'tablet',
      use: { ...devices['iPad Pro'] },
      testMatch: /.*\.tablet\.e2e\.ts/
    },

    /* API testing project */
    {
      name: 'api',
      testMatch: /.*\.api\.e2e\.ts/,
      use: {
        // No browser needed for API tests
      }
    },

    /* Visual regression testing */
    {
      name: 'visual-regression',
      use: { 
        ...devices['Desktop Chrome'],
        // Use consistent browser settings for visual tests
        viewport: { width: 1280, height: 720 }
      },
      testMatch: /.*\.visual\.e2e\.ts/
    },

    /* Performance testing */
    {
      name: 'performance',
      use: { 
        ...devices['Desktop Chrome'],
        // Disable screenshots/video for performance tests
        screenshot: 'off',
        video: 'off'
      },
      testMatch: /.*\.perf\.e2e\.ts/
    }
  ],

  /* Test output directories */
  outputDir: 'test-results/playwright-artifacts',
  
  /* Global setup and teardown */
  globalSetup: require.resolve('./tests/e2e/setup/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/setup/global-teardown.ts'),
  
  /* Development server setup */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes to start server
    env: {
      NODE_ENV: 'test',
      PORT: '3000'
    }
  },

  /* Test metadata */
  metadata: {
    testSuite: 'Dream 100 Keyword Engine E2E Tests',
    environment: process.env.NODE_ENV || 'development',
    baseUrl: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    buildId: process.env.GITHUB_RUN_ID || 'local',
    timestamp: new Date().toISOString()
  },

  /* Custom test options for our app */
  testOptions: {
    // Maximum time for the entire test run
    globalTimeout: 60 * 60 * 1000, // 60 minutes
    
    // Test data cleanup
    preserveOutput: 'failures-only',
    
    // Custom test annotations
    annotations: [
      { type: 'suite', description: 'Dream 100 E2E Test Suite' }
    ]
  }
});

/* Environment-specific configurations */
if (process.env.NODE_ENV === 'production') {
  // Production testing overrides
  module.exports.use.baseURL = process.env.PRODUCTION_URL;
  module.exports.use.ignoreHTTPSErrors = false;
  module.exports.retries = 3;
}

if (process.env.NODE_ENV === 'staging') {
  // Staging testing overrides  
  module.exports.use.baseURL = process.env.STAGING_URL;
  module.exports.retries = 2;
}

/* CI-specific optimizations */
if (process.env.CI) {
  // Optimize for CI environment
  module.exports.workers = 2; // Limit parallel workers
  module.exports.use.trace = 'on-first-retry'; // Only trace on retry
  module.exports.use.video = 'on-first-retry'; // Only record video on retry
}