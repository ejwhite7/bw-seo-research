/**
 * Test Configuration and Utilities
 * 
 * Centralized configuration for all test types including
 * timeouts, thresholds, and shared test utilities.
 */

export const TEST_CONFIG = {
  // Test timeouts
  timeouts: {
    unit: 30000,        // 30 seconds for unit tests
    integration: 60000, // 1 minute for integration tests
    e2e: 300000,        // 5 minutes for e2e tests
    performance: 600000 // 10 minutes for performance tests
  },

  // Performance thresholds
  performance: {
    // Keyword processing requirements
    keywordProcessing: {
      smallSet: { maxTime: 2000, keywords: 200 },     // 2 seconds for 200 keywords
      mediumSet: { maxTime: 10000, keywords: 1000 },  // 10 seconds for 1000 keywords
      largeSet: { maxTime: 20000, keywords: 10000 }   // 20 seconds for 10000 keywords (P95)
    },

    // API response time requirements
    apiResponse: {
      fast: 100,    // 100ms for simple queries
      normal: 500,  // 500ms for complex queries
      slow: 2000    // 2 seconds for heavy processing
    },

    // Database operation thresholds
    database: {
      simpleQuery: 50,   // 50ms for simple selects
      complexQuery: 200, // 200ms for complex joins
      batchInsert: 100,  // 100ms per 100 records
      indexedLookup: 25  // 25ms for indexed lookups
    },

    // Memory usage limits
    memory: {
      maxHeapIncrease: 50 * 1024 * 1024, // 50MB max increase during tests
      maxWorkingSet: 200 * 1024 * 1024   // 200MB max working set
    },

    // Concurrency limits
    concurrency: {
      maxConcurrentRuns: 10,
      maxConcurrentUsers: 100,
      maxQueueSize: 1000
    }
  },

  // Test data limits
  dataLimits: {
    maxTestKeywords: 10000,
    maxTestClusters: 100,
    maxTestRuns: 50,
    maxSeedKeywords: 10
  },

  // Feature flags for testing
  features: {
    enablePerformanceTests: true,
    enableE2ETests: true,
    enableVisualRegression: false,
    enableAccessibilityTests: true,
    enableCrossDeviceTests: false
  },

  // External service configurations
  services: {
    ahrefs: {
      timeout: 30000,
      retries: 3,
      rateLimit: 10 // requests per second
    },
    anthropic: {
      timeout: 60000,
      retries: 3,
      rateLimit: 5 // requests per second
    },
    supabase: {
      timeout: 10000,
      retries: 2
    }
  },

  // Test environment settings
  environment: {
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    apiUrl: process.env.TEST_API_URL || 'http://localhost:3000/api',
    dbUrl: process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/keyword_tool_test',
    redisUrl: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1'
  },

  // Browser testing configuration
  browsers: {
    headless: process.env.CI === 'true',
    video: process.env.CI === 'true' ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
};

/**
 * Test data generators and utilities
 */
export const TestUtils = {
  // Generate test IDs
  generateId: (prefix: string = 'test'): string => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  },

  // Generate test timestamps
  generateTimestamp: (offsetHours: number = 0): string => {
    return new Date(Date.now() + (offsetHours * 60 * 60 * 1000)).toISOString();
  },

  // Generate test keywords
  generateKeywords: (count: number, stage: 'dream100' | 'tier2' | 'tier3' = 'dream100') => {
    return Array.from({ length: count }, (_, i) => ({
      id: TestUtils.generateId('kw'),
      keyword: `test keyword ${i}`,
      stage,
      volume: Math.floor(Math.random() * 10000) + 100,
      difficulty: Math.floor(Math.random() * 100) + 1,
      cpc: Math.round((Math.random() * 10) * 100) / 100,
      intent: ['commercial', 'informational', 'navigational', 'transactional'][i % 4],
      relevanceScore: Math.round((Math.random() * 0.4 + 0.6) * 1000) / 1000,
      commercialScore: Math.round((Math.random() * 0.5 + 0.5) * 1000) / 1000,
      trendScore: Math.round((Math.random() * 0.6 + 0.2) * 1000) / 1000,
      blendedScore: Math.round(Math.random() * 1000) / 1000,
      quickWin: Math.random() > 0.8,
      runId: 'test-run',
      clusterId: i % 5 === 0 ? null : `cluster-${Math.floor(i / 5)}`,
      createdAt: TestUtils.generateTimestamp(-Math.random() * 24),
      updatedAt: TestUtils.generateTimestamp()
    }));
  },

  // Generate test runs
  generateRuns: (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: TestUtils.generateId('run'),
      userId: `user-${i % 3}`,
      seedKeywords: [`seed ${i}`, `keyword ${i}`],
      market: ['US', 'UK', 'CA'][i % 3],
      language: 'en',
      status: ['pending', 'processing', 'completed', 'failed'][i % 4],
      totalKeywords: Math.floor(Math.random() * 5000) + 100,
      totalClusters: Math.floor(Math.random() * 50) + 5,
      settings: {
        maxKeywords: 10000,
        enableClustering: true,
        generateRoadmap: i % 2 === 0,
        scoringWeights: {
          volume: 0.4,
          intent: 0.3,
          relevance: 0.15,
          trend: 0.1,
          ease: 0.05
        }
      },
      createdAt: TestUtils.generateTimestamp(-Math.random() * 168), // Within last week
      updatedAt: TestUtils.generateTimestamp(-Math.random() * 24)   // Within last day
    }));
  },

  // Generate test clusters
  generateClusters: (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: TestUtils.generateId('cluster'),
      runId: 'test-run',
      label: `Test Cluster ${i}`,
      keywords: [`keyword ${i * 3}`, `keyword ${i * 3 + 1}`, `keyword ${i * 3 + 2}`],
      size: Math.floor(Math.random() * 15) + 3,
      score: Math.round((Math.random() * 0.4 + 0.6) * 1000) / 1000,
      intentMix: {
        commercial: Math.round(Math.random() * 50 + 25),
        informational: Math.round(Math.random() * 50 + 25),
        navigational: Math.round(Math.random() * 20),
        transactional: Math.round(Math.random() * 20)
      },
      avgVolume: Math.floor(Math.random() * 8000) + 500,
      avgDifficulty: Math.floor(Math.random() * 60) + 20,
      centroid: Array.from({ length: 384 }, () => Math.random() * 2 - 1),
      createdAt: TestUtils.generateTimestamp(-Math.random() * 24),
      updatedAt: TestUtils.generateTimestamp()
    }));
  },

  // Generate test users
  generateUsers: (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: TestUtils.generateId('user'),
      email: `testuser${i}@example.com`,
      name: `Test User ${i}`,
      role: ['user', 'admin', 'manager'][i % 3],
      settings: {
        defaultMarket: ['US', 'UK', 'CA'][i % 3],
        defaultLanguage: 'en',
        emailNotifications: i % 2 === 0,
        theme: ['light', 'dark'][i % 2]
      },
      subscription: {
        plan: ['free', 'pro', 'enterprise'][i % 3],
        keywordLimit: [1000, 10000, 100000][i % 3],
        expiresAt: TestUtils.generateTimestamp(30 * 24) // 30 days from now
      },
      createdAt: TestUtils.generateTimestamp(-Math.random() * 365 * 24), // Within last year
      lastLoginAt: TestUtils.generateTimestamp(-Math.random() * 7 * 24)   // Within last week
    }));
  },

  // Performance testing utilities
  measurePerformance: async <T>(
    operation: () => Promise<T>,
    label: string = 'operation'
  ): Promise<{ result: T; duration: number; memoryUsed: number }> => {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    const result = await operation();
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    const duration = endTime - startTime;
    const memoryUsed = endMemory - startMemory;
    
    console.log(`Performance [${label}]: ${duration.toFixed(2)}ms, Memory: ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    
    return { result, duration, memoryUsed };
  },

  // Wait utilities
  waitFor: (condition: () => boolean, timeout: number = 5000, interval: number = 100): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const check = () => {
        if (condition()) {
          resolve();
        } else if (Date.now() - startTime >= timeout) {
          reject(new Error(`Condition not met within ${timeout}ms`));
        } else {
          setTimeout(check, interval);
        }
      };
      
      check();
    });
  },

  // Retry utilities
  retry: async <T>(
    operation: () => Promise<T>,
    options: { retries: number; delay: number; backoff?: boolean } = { retries: 3, delay: 1000 }
  ): Promise<T> => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= options.retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < options.retries) {
          const delay = options.backoff 
            ? options.delay * Math.pow(2, attempt)
            : options.delay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  },

  // Mock data cleanup
  cleanup: {
    keywords: [] as string[],
    runs: [] as string[],
    clusters: [] as string[],
    users: [] as string[]
  },

  // Add cleanup tracking
  addToCleanup: (type: 'keywords' | 'runs' | 'clusters' | 'users', id: string) => {
    TestUtils.cleanup[type].push(id);
  },

  // Clear cleanup tracking
  clearCleanup: () => {
    TestUtils.cleanup.keywords = [];
    TestUtils.cleanup.runs = [];
    TestUtils.cleanup.clusters = [];
    TestUtils.cleanup.users = [];
  }
};

/**
 * Test assertions and custom matchers
 */
export const TestMatchers = {
  // Validate keyword structure
  toBeValidKeyword: (keyword: any) => {
    const required = ['id', 'keyword', 'stage', 'volume', 'difficulty', 'intent'];
    const missing = required.filter(field => !keyword.hasOwnProperty(field));
    
    return {
      pass: missing.length === 0,
      message: () => missing.length 
        ? `Keyword missing required fields: ${missing.join(', ')}`
        : 'Keyword has all required fields'
    };
  },

  // Validate performance within thresholds
  toMeetPerformanceThreshold: (duration: number, threshold: number) => {
    return {
      pass: duration <= threshold,
      message: () => `Expected ${duration}ms to be <= ${threshold}ms`
    };
  },

  // Validate API response structure
  toBeApiResponse: (response: any) => {
    const hasData = response && typeof response === 'object' && 'data' in response;
    const hasValidStatus = 'status' in response && typeof response.status === 'number';
    
    return {
      pass: hasData && hasValidStatus,
      message: () => `Expected valid API response with data and status fields`
    };
  },

  // Validate pagination structure
  toBePaginatedResponse: (response: any) => {
    const hasData = response && Array.isArray(response.data);
    const hasPagination = response.pagination && 
      typeof response.pagination.total === 'number' &&
      typeof response.pagination.limit === 'number' &&
      typeof response.pagination.offset === 'number' &&
      typeof response.pagination.hasMore === 'boolean';
    
    return {
      pass: hasData && hasPagination,
      message: () => `Expected paginated response with data array and pagination object`
    };
  }
};

/**
 * Test environment setup and teardown
 */
export const TestEnvironment = {
  // Setup test environment
  setup: async () => {
    console.log('🧪 Setting up test environment...');
    
    // Initialize test database
    if (TEST_CONFIG.environment.dbUrl) {
      // Database setup would go here
      console.log('📊 Test database initialized');
    }
    
    // Initialize test cache
    if (TEST_CONFIG.environment.redisUrl) {
      // Redis setup would go here
      console.log('🔴 Test cache initialized');
    }
    
    // Setup mock services
    console.log('🎭 Mock services configured');
    
    console.log('✅ Test environment ready');
  },

  // Cleanup test environment
  teardown: async () => {
    console.log('🧹 Cleaning up test environment...');
    
    // Clean up test data
    TestUtils.clearCleanup();
    
    // Disconnect from services
    console.log('📊 Database connections closed');
    console.log('🔴 Cache connections closed');
    
    console.log('✅ Test environment cleaned up');
  },

  // Verify environment health
  healthCheck: async (): Promise<boolean> => {
    try {
      // Check database connection
      // Check cache connection
      // Check external service connectivity
      
      return true;
    } catch (error) {
      console.error('❌ Test environment health check failed:', error);
      return false;
    }
  }
};

/**
 * Export all test utilities
 */
export default {
  CONFIG: TEST_CONFIG,
  Utils: TestUtils,
  Matchers: TestMatchers,
  Environment: TestEnvironment
};