const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './'
});

// Custom Jest configuration for comprehensive test automation
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    // Handle module aliases (configured based on tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock external dependencies
    '^@anthropic-ai/sdk$': '<rootDir>/tests/__mocks__/anthropic.ts',
    '^axios$': '<rootDir>/tests/__mocks__/axios.ts',
    '^ioredis$': '<rootDir>/tests/__mocks__/redis.ts'
  },
  testEnvironment: 'jest-environment-jsdom',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx}',
    '<rootDir>/tests/unit/**/*.{test,spec}.{ts,tsx}',
    '<rootDir>/tests/integration/**/*.{test,spec}.{ts,tsx}'
  ],
  
  // Test environment setup
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/tests/e2e/',
    '<rootDir>/tests/performance/'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // TypeScript transformation
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }]
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/index.ts',
    '!src/types/**',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}'
  ],
  
  // Coverage thresholds - enforce high test coverage
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Stricter thresholds for core services
    'src/services/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'src/models/': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  
  // Coverage reporting
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov', 'json'],
  
  // Test timeouts and configuration
  testTimeout: 30000, // 30 seconds for integration tests
  maxWorkers: '50%', // Use 50% of available CPU cores
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output for debugging
  verbose: false,
  
  // Test result processor for better reporting
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  
  // Global test setup
  globalSetup: '<rootDir>/tests/setup/global.ts',
  globalTeardown: '<rootDir>/tests/setup/teardown.ts',
  
  // Error handling
  errorOnDeprecated: true,
  
  // Performance monitoring
  detectOpenHandles: true,
  forceExit: false,
  
  // Environment variables for tests
  setupFiles: ['<rootDir>/tests/setup/env.ts']
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);