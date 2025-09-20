/**
 * Comprehensive Test Helper Utilities
 * 
 * Provides type-safe mock data generation, API helpers, and test utilities
 * for consistent testing across all test suites.
 */

import { jest } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';

// Common test data types
export interface TestKeyword {
  id: string;
  keyword: string;
  stage: 'dream100' | 'tier2' | 'tier3';
  volume: number;
  difficulty: number;
  cpc: number;
  intent: 'commercial' | 'informational' | 'navigational' | 'transactional';
  relevanceScore: number;
  commercialScore?: number;
  trendScore?: number;
  blendedScore: number;
  quickWin: boolean;
  runId: string;
  clusterId?: string;
  parentKeyword?: string;
  expansionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestRun {
  id: string;
  userId: string;
  seedKeywords: string[];
  market: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalKeywords: number;
  totalClusters: number;
  settings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface TestCluster {
  id: string;
  runId: string;
  label: string;
  keywords: string[];
  size: number;
  score: number;
  intentMix: Record<string, number>;
  avgVolume?: number;
  avgDifficulty?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestUser {
  id: string;
  email: string;
  settings: Record<string, any>;
  apiKeys: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// Mock API response structure
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Mock data generators
export const createMockKeyword = (overrides: Partial<TestKeyword> = {}): TestKeyword => ({
  id: generateId(),
  keyword: 'test keyword',
  stage: 'dream100',
  volume: Math.floor(Math.random() * 10000) + 100,
  difficulty: Math.floor(Math.random() * 100) + 1,
  cpc: Math.random() * 10 + 0.5,
  intent: 'commercial',
  relevanceScore: Math.random() * 0.5 + 0.5,
  commercialScore: Math.random() * 0.5 + 0.5,
  trendScore: Math.random() * 0.5 + 0.5,
  blendedScore: Math.random() * 0.5 + 0.5,
  quickWin: Math.random() > 0.8,
  runId: generateId(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

export const createMockRun = (overrides: Partial<TestRun> = {}): TestRun => ({
  id: generateId(),
  userId: generateId(),
  seedKeywords: ['digital marketing', 'seo'],
  market: 'US',
  status: 'completed',
  totalKeywords: Math.floor(Math.random() * 5000) + 100,
  totalClusters: Math.floor(Math.random() * 50) + 5,
  settings: {
    maxKeywords: 10000,
    enableClustering: true,
    generateRoadmap: true
  },
  createdAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

export const createMockCluster = (overrides: Partial<TestCluster> = {}): TestCluster => ({
  id: generateId(),
  runId: generateId(),
  label: `Test Cluster ${Math.floor(Math.random() * 100)}`,
  keywords: ['keyword1', 'keyword2', 'keyword3'],
  size: Math.floor(Math.random() * 20) + 3,
  score: Math.random() * 0.5 + 0.5,
  intentMix: {
    commercial: Math.floor(Math.random() * 50) + 25,
    informational: Math.floor(Math.random() * 50) + 25,
    navigational: Math.floor(Math.random() * 25),
    transactional: Math.floor(Math.random() * 25)
  },
  avgVolume: Math.floor(Math.random() * 5000) + 500,
  avgDifficulty: Math.floor(Math.random() * 60) + 20,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

export const createMockUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  id: generateId(),
  email: `test${Math.floor(Math.random() * 1000)}@example.com`,
  settings: {
    notifications: { email: true, inApp: true },
    timezone: 'UTC',
    theme: 'light'
  },
  apiKeys: {
    ahrefs: 'test-ahrefs-key',
    anthropic: 'test-anthropic-key'
  },
  createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

// Mock API response generators
export const createApiResponse = <T>(data: T, success = true): ApiResponse<T> => ({
  success,
  data: success ? data : undefined,
  error: success ? undefined : 'Test error message'
});

export const createPaginatedResponse = <T>(
  items: T[], 
  total: number, 
  limit: number, 
  offset: number
): ApiResponse<T[]> => ({
  success: true,
  data: items,
  pagination: {
    total,
    limit,
    offset,
    hasMore: offset + limit < total
  }
});

// Utility functions
export const generateId = (): string => {
  return `${Math.random().toString(36).substring(7)}-${Date.now()}`;
};

export const generateUUID = (): string => {
  return '12345678-1234-5678-9012-123456789012';
};

export const waitFor = async (
  condition: () => boolean, 
  timeout = 5000
): Promise<boolean> => {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
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
};

export const createMockDate = (daysAgo = 0): string => {
  return new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000)).toISOString();
};

// Mock function creators with proper typing
export const createMockFunction = <T extends (...args: any[]) => any>(
  implementation?: T
): MockedFunction<T> => {
  const mockFn = jest.fn(implementation) as unknown as MockedFunction<T>;
  return mockFn;
};

export const createMockPromise = <T>(
  resolveValue?: T, 
  rejectValue?: any, 
  delay = 0
): Promise<T> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (rejectValue) {
        reject(rejectValue);
      } else {
        resolve(resolveValue as T);
      }
    }, delay);
  });
};

// Test environment helpers
export const isCI = (): boolean => {
  return process.env.CI === 'true';
};

export const isDebugMode = (): boolean => {
  return process.env.TEST_DEBUG === 'true';
};

export const skipInCI = (reason?: string): void => {
  if (isCI()) {
    throw new Error(`Test skipped in CI: ${reason || 'Not suitable for CI environment'}`);
  }
};

// Mock data collections
export const createMockKeywordSet = (count: number): TestKeyword[] => {
  return Array.from({ length: count }, (_, i) => 
    createMockKeyword({
      keyword: `test keyword ${i + 1}`,
      stage: ['dream100', 'tier2', 'tier3'][i % 3] as any,
      volume: Math.floor(Math.random() * 5000) + 100 * (4 - (i % 3))
    })
  );
};

export const createMockRunSet = (count: number): TestRun[] => {
  return Array.from({ length: count }, (_, i) => 
    createMockRun({
      status: ['pending', 'processing', 'completed', 'failed'][i % 4] as any,
      seedKeywords: [`seed${i}`, `keyword${i}`]
    })
  );
};

export const createMockClusterSet = (count: number): TestCluster[] => {
  return Array.from({ length: count }, (_, i) => 
    createMockCluster({
      label: `Cluster ${i + 1}`,
      size: Math.floor(Math.random() * 15) + 5
    })
  );
};

// Export all utilities
export const testHelpers = {
  createMockKeyword,
  createMockRun,
  createMockCluster,
  createMockUser,
  createApiResponse,
  createPaginatedResponse,
  generateId,
  generateUUID,
  waitFor,
  createMockDate,
  createMockFunction,
  createMockPromise,
  isCI,
  isDebugMode,
  skipInCI,
  createMockKeywordSet,
  createMockRunSet,
  createMockClusterSet
};