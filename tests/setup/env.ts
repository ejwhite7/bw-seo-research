/**
 * Test Environment Configuration for Dream 100 Keyword Engine
 * 
 * Sets up environment variables, polyfills, and global configurations
 * required for running tests consistently across different environments.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment-specific test configuration
const envFile = process.env.NODE_ENV === 'ci' ? '.env.ci' : '.env.test';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Override any missing critical environment variables
const testEnvDefaults = {
  NODE_ENV: 'test',
  
  // Database configuration
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  
  // API Keys (test values)
  ANTHROPIC_API_KEY: 'sk-ant-test-key-12345',
  AHREFS_API_TOKEN: 'test-ahrefs-token',
  
  // Cache configuration
  REDIS_URL: 'redis://localhost:6379/1',
  
  // Application settings
  NEXTAUTH_SECRET: 'test-secret-key-for-auth',
  NEXTAUTH_URL: 'http://localhost:3000',
  
  // Feature flags for testing
  ENABLE_PERFORMANCE_MONITORING: 'false',
  ENABLE_ERROR_TRACKING: 'false',
  ENABLE_ANALYTICS: 'false',
  
  // Rate limiting (more permissive for tests)
  RATE_LIMIT_REQUESTS: '1000',
  RATE_LIMIT_WINDOW: '60',
  
  // Testing specific
  TEST_TIMEOUT: '30000',
  TEST_RETRIES: '2',
  TEST_PARALLEL: 'true',
  
  // Mock service URLs
  MOCK_AHREFS_URL: 'http://localhost:8001',
  MOCK_ANTHROPIC_URL: 'http://localhost:8002',
  
  // File upload settings
  MAX_FILE_SIZE: '10485760', // 10MB for tests
  ALLOWED_FILE_TYPES: 'csv,xlsx,json',
  
  // Security settings (relaxed for testing)
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
  CSP_ENABLED: 'false',
  
  // Performance settings
  MAX_KEYWORDS_PER_RUN: '1000', // Reduced for faster tests
  MAX_CLUSTERS_PER_RUN: '100',
  PROCESSING_TIMEOUT: '300000', // 5 minutes
  
  // Logging configuration
  LOG_LEVEL: process.env.TEST_DEBUG ? 'debug' : 'error',
  LOG_FORMAT: 'json'
};

// Apply defaults for any missing environment variables
for (const [key, defaultValue] of Object.entries(testEnvDefaults)) {
  if (!process.env[key]) {
    process.env[key] = defaultValue;
  }
}

// Polyfills for Node.js environment
import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';

// Add missing global objects
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder;

// Add Web Crypto API for Node.js < 16
if (!global.crypto) {
  global.crypto = webcrypto as any;
}

// Add fetch polyfill if not available
if (!global.fetch) {
  const { default: fetch, Request, Response, Headers } = require('node-fetch');
  global.fetch = fetch;
  global.Request = Request;
  global.Response = Response;
  global.Headers = Headers;
}

// Add URL and URLSearchParams if not available
if (!global.URL) {
  global.URL = require('url').URL;
}
if (!global.URLSearchParams) {
  global.URLSearchParams = require('url').URLSearchParams;
}

// Performance monitoring setup for tests
if (!global.performance) {
  const { performance } = require('perf_hooks');
  global.performance = performance;
}

// Add custom test globals
global.testConfig = {
  timeout: parseInt(process.env.TEST_TIMEOUT || '30000'),
  retries: parseInt(process.env.TEST_RETRIES || '2'),
  parallel: process.env.TEST_PARALLEL === 'true',
  debug: process.env.TEST_DEBUG === 'true',
  
  // Test data limits
  maxTestKeywords: 100,
  maxTestClusters: 10,
  maxTestRuns: 5,
  
  // Mock service configuration
  mockServices: {
    ahrefs: {
      enabled: true,
      baseUrl: process.env.MOCK_AHREFS_URL,
      responseDelay: 100 // ms
    },
    anthropic: {
      enabled: true,
      baseUrl: process.env.MOCK_ANTHROPIC_URL,
      responseDelay: 200 // ms
    }
  },
  
  // Database configuration
  database: {
    cleanup: true,
    transactions: true,
    fixtures: true
  },
  
  // Cache configuration
  cache: {
    enabled: process.env.REDIS_URL !== undefined,
    ttl: 300, // 5 minutes
    prefix: 'test:'
  }
};

// Add test utilities
global.testUtils = {
  // Generate consistent test IDs
  generateId: (prefix = 'test') => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  
  // Create test timestamps
  createTimestamp: (offsetSeconds = 0) => new Date(Date.now() + (offsetSeconds * 1000)).toISOString(),
  
  // Delay utility for async testing
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Random test data generators
  randomKeyword: () => `test keyword ${Math.random().toString(36).substring(7)}`,
  randomVolume: () => Math.floor(Math.random() * 10000) + 10,
  randomDifficulty: () => Math.floor(Math.random() * 100),
  randomScore: () => Math.random(),
  
  // Cleanup utilities
  cleanup: {
    keywords: [],
    runs: [],
    clusters: [],
    files: []
  }
};

// Performance tracking for tests
global.performanceMetrics = [];

// Test lifecycle hooks
global.testStartTime = Date.now();

// Add test event listeners for cleanup
process.on('exit', () => {
  // Cleanup any remaining test resources
  if (global.testUtils?.cleanup) {
    console.log('🧹 Final test cleanup...');
  }
});

// Handle unhandled promises in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately in tests, let Jest handle it
});

// Configure console output for tests
if (!process.env.TEST_DEBUG) {
  // Reduce console noise unless debugging
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    // Only show test-related logs
    if (args[0]?.includes?.('test') || args[0]?.includes?.('Test')) {
      originalConsoleLog(...args);
    }
  };
}

// Export configuration for use in tests
export const testEnvConfig = {
  isCI: process.env.CI === 'true',
  isDebug: process.env.TEST_DEBUG === 'true',
  nodeEnv: process.env.NODE_ENV,
  timeout: parseInt(process.env.TEST_TIMEOUT || '30000'),
  
  // Service endpoints
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  redisUrl: process.env.REDIS_URL,
  
  // Feature flags
  enableMocks: true,
  enablePerformanceTracking: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
  enableCoverage: process.env.COLLECT_COVERAGE !== 'false'
};

console.log('🧪 Test environment configured');
if (process.env.TEST_DEBUG) {
  console.log('📊 Test configuration:', testEnvConfig);
}