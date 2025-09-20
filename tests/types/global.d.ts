/**
 * Global Type Definitions for Tests
 */

import '@testing-library/jest-dom';

// Jest globals
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeApiResponse(expectedStatus?: number): R;
      toBeValidKeyword(): R;
      toBeUUID(): R;
    }
  }

  // Test helper utilities
  var testHelpers: {
    createMockKeyword: (overrides?: any) => any;
    createMockRun: (overrides?: any) => any;
    createMockCluster: (overrides?: any) => any;
    waitFor: (condition: () => boolean, timeout?: number) => Promise<boolean>;
  };

  // Node.js globals
  var TextEncoder: any;
  var TextDecoder: any;
  var crypto: any;
  var fetch: jest.MockedFunction<typeof fetch>;
}

// Module augmentation for Jest
declare module '@jest/globals' {
  interface Matchers<R> {
    toBeApiResponse(expectedStatus?: number): R;
    toBeValidKeyword(): R;
    toBeUUID(): R;
  }
}

// Playwright test types
declare module '@playwright/test' {
  interface Matchers<R, T> {
    toMatch(expected: RegExp): R;
  }
}

export {};