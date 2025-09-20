// Enhanced Jest setup for Dream 100 Keyword Engine test automation
// Configures testing environment with comprehensive mocking and utilities

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { jest } from '@jest/globals';

// Global polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock crypto for UUID generation in tests
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '12345678-1234-5678-9012-123456789012'),
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    })
  }
});

// Mock fetch globally for all tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers(),
    clone: () => ({ json: () => Promise.resolve({}) })
  })
);

// Mock Sentry to prevent telemetry during tests
jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((callback) => callback({
    setTag: jest.fn(),
    setContext: jest.fn(),
    setLevel: jest.fn(),
    setUser: jest.fn(),
    setFingerprint: jest.fn(),
    clear: jest.fn()
  })),
  setContext: jest.fn(),
  setTag: jest.fn(),
  setLevel: jest.fn(),
  setUser: jest.fn(),
  configureScope: jest.fn(),
  getCurrentHub: jest.fn(() => ({
    getClient: jest.fn(() => ({
      captureException: jest.fn(),
      captureMessage: jest.fn()
    }))
  }))
}));

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter: () => ({
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    pop: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn()
    }
  }),
  withRouter: (Component) => Component
}));

// Mock Next.js navigation (App Router)
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn()
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: jest.fn()
}));

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null }))
    })),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signIn: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      signUp: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }))
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(() => Promise.resolve({ data: {}, error: null })),
        download: jest.fn(() => Promise.resolve({ data: {}, error: null })),
        list: jest.fn(() => Promise.resolve({ data: [], error: null })),
        remove: jest.fn(() => Promise.resolve({ data: {}, error: null }))
      }))
    }
  }))
}));

// Mock Redis client
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
    flushall: jest.fn(),
    disconnect: jest.fn(),
    status: 'ready',
    on: jest.fn(),
    off: jest.fn()
  }));
});

// Mock BullMQ for job queue testing
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getJob: jest.fn(),
    getJobs: jest.fn(() => Promise.resolve([])),
    getJobCounts: jest.fn(() => Promise.resolve({})),
    clean: jest.fn(),
    close: jest.fn()
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn()
  })),
  Job: jest.fn()
}));

// Mock console methods to reduce noise during testing
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning:') || 
       args[0].includes('ReactDOMTestUtils') ||
       args[0].includes('act(')
      )
    ) {
      return;
    }
    originalConsoleError.call(console, ...args);
  };

  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('componentWillReceiveProps') ||
       args[0].includes('componentWillMount')
      )
    ) {
      return;
    }
    originalConsoleWarn.call(console, ...args);
  };

  // Optionally suppress console.log in tests unless debugging
  if (process.env.TEST_DEBUG !== 'true') {
    console.log = jest.fn();
  }
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

// Custom test utilities and matchers
expect.extend({
  // Custom matcher for API responses
  toBeApiResponse(received, expectedStatus = 200) {
    const pass = 
      received && 
      typeof received.status === 'number' &&
      received.status === expectedStatus &&
      received.hasOwnProperty('data');

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid API response with status ${expectedStatus}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid API response with status ${expectedStatus}`,
        pass: false,
      };
    }
  },

  // Custom matcher for keyword validation
  toBeValidKeyword(received) {
    const pass = 
      typeof received === 'string' &&
      received.length > 0 &&
      received.length <= 100 &&
      received.trim() === received &&
      !/^[\s\d\W]*$/.test(received);

    if (pass) {
      return {
        message: () => `expected "${received}" not to be a valid keyword`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected "${received}" to be a valid keyword`,
        pass: false,
      };
    }
  },

  // Custom matcher for UUID validation
  toBeUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);

    if (pass) {
      return {
        message: () => `expected "${received}" not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected "${received}" to be a valid UUID`,
        pass: false,
      };
    }
  }
});

// Global test helpers
global.testHelpers = {
  // Create mock keyword data
  createMockKeyword: (overrides = {}) => ({
    id: '12345678-1234-5678-9012-123456789012',
    keyword: 'test keyword',
    stage: 'dream100',
    volume: 1000,
    difficulty: 50,
    cpc: 2.5,
    intent: 'commercial',
    relevanceScore: 0.8,
    commercialScore: 0.7,
    blendedScore: 0.75,
    quickWin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),

  // Create mock run data
  createMockRun: (overrides = {}) => ({
    id: '12345678-1234-5678-9012-123456789012',
    userId: '12345678-1234-5678-9012-123456789012',
    seedKeywords: ['test', 'keyword'],
    market: 'US',
    status: 'pending',
    totalKeywords: 0,
    totalClusters: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),

  // Create mock cluster data
  createMockCluster: (overrides = {}) => ({
    id: '12345678-1234-5678-9012-123456789012',
    runId: '12345678-1234-5678-9012-123456789012',
    label: 'Test Cluster',
    keywords: ['test', 'keyword'],
    size: 2,
    score: 0.8,
    intentMix: { commercial: 100 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),

  // Wait for async operations
  waitFor: (condition, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (condition()) {
          resolve(true);
        } else if (Date.now() - startTime >= timeout) {
          reject(new Error('Condition not met within timeout'));
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }
};

// Configure fake timers for consistent test behavior
jest.useFakeTimers({
  advanceTimers: true,
  doNotFake: ['nextTick', 'setImmediate']
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  
  // Clean up any DOM changes
  document.body.innerHTML = '';
  
  // Reset fetch mock
  if (global.fetch) {
    global.fetch.mockClear();
  }
});

// Ensure tests complete within reasonable time
jest.setTimeout(30000);

// Set up environment variables for tests
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.AHREFS_API_TOKEN = 'test-ahrefs-key';
process.env.REDIS_URL = 'redis://localhost:6379';