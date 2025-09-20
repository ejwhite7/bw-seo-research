/**
 * Mock Redis Client for Dream 100 Keyword Engine Tests
 * 
 * Provides comprehensive in-memory Redis mocking for caching,
 * job queue operations, and session management during tests.
 */

import { jest } from '@jest/globals';

/**
 * In-memory storage for mock Redis operations
 */
class MockRedisStorage {
  private storage: Map<string, { value: any; expires?: number }> = new Map();
  private lists: Map<string, any[]> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private hashes: Map<string, Map<string, string>> = new Map();

  // String operations
  set(key: string, value: any, mode?: string, duration?: number): 'OK' {
    const expires = mode === 'EX' && duration ? Date.now() + (duration * 1000) : undefined;
    this.storage.set(key, { value: String(value), expires });
    return 'OK';
  }

  get(key: string): string | null {
    const item = this.storage.get(key);
    if (!item) return null;
    
    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(key);
      return null;
    }
    
    return item.value;
  }

  del(...keys: string[]): number {
    let deletedCount = 0;
    for (const key of keys) {
      if (this.storage.delete(key) || 
          this.lists.delete(key) || 
          this.sets.delete(key) || 
          this.hashes.delete(key)) {
        deletedCount++;
      }
    }
    return deletedCount;
  }

  exists(...keys: string[]): number {
    return keys.filter(key => 
      this.storage.has(key) || 
      this.lists.has(key) || 
      this.sets.has(key) || 
      this.hashes.has(key)
    ).length;
  }

  expire(key: string, seconds: number): 0 | 1 {
    const item = this.storage.get(key);
    if (!item) return 0;
    
    item.expires = Date.now() + (seconds * 1000);
    return 1;
  }

  ttl(key: string): number {
    const item = this.storage.get(key);
    if (!item || !item.expires) return -1;
    
    const remaining = Math.ceil((item.expires - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  keys(pattern: string): string[] {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const allKeys = [
      ...Array.from(this.storage.keys()),
      ...Array.from(this.lists.keys()),
      ...Array.from(this.sets.keys()),
      ...Array.from(this.hashes.keys())
    ];
    return allKeys.filter(key => regex.test(key));
  }

  // List operations
  lpush(key: string, ...values: any[]): number {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    list.unshift(...values.reverse());
    return list.length;
  }

  rpush(key: string, ...values: any[]): number {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    list.push(...values);
    return list.length;
  }

  lpop(key: string): string | null {
    const list = this.lists.get(key);
    return list?.shift() || null;
  }

  rpop(key: string): string | null {
    const list = this.lists.get(key);
    return list?.pop() || null;
  }

  llen(key: string): number {
    return this.lists.get(key)?.length || 0;
  }

  lrange(key: string, start: number, stop: number): string[] {
    const list = this.lists.get(key) || [];
    return list.slice(start, stop === -1 ? undefined : stop + 1);
  }

  // Set operations
  sadd(key: string, ...members: string[]): number {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    return added;
  }

  smembers(key: string): string[] {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  srem(key: string, ...members: string[]): number {
    const set = this.sets.get(key);
    if (!set) return 0;
    
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) {
        removed++;
      }
    }
    return removed;
  }

  // Hash operations
  hset(key: string, field: string, value: string): 0 | 1;
  hset(key: string, ...fieldValues: string[]): number;
  hset(key: string, ...args: string[]): number {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key)!;
    
    if (args.length === 2) {
      // Single field-value pair
      const [field, value] = args;
      const existed = hash.has(field);
      hash.set(field, value);
      return existed ? 0 : 1;
    } else {
      // Multiple field-value pairs
      let fieldsSet = 0;
      for (let i = 0; i < args.length; i += 2) {
        const field = args[i];
        const value = args[i + 1];
        if (!hash.has(field)) fieldsSet++;
        hash.set(field, value);
      }
      return fieldsSet;
    }
  }

  hget(key: string, field: string): string | null {
    const hash = this.hashes.get(key);
    return hash?.get(field) || null;
  }

  hgetall(key: string): Record<string, string> {
    const hash = this.hashes.get(key);
    return hash ? Object.fromEntries(hash) : {};
  }

  hdel(key: string, ...fields: string[]): number {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    
    let deleted = 0;
    for (const field of fields) {
      if (hash.delete(field)) {
        deleted++;
      }
    }
    return deleted;
  }

  // Database operations
  flushdb(): 'OK' {
    this.storage.clear();
    this.lists.clear();
    this.sets.clear();
    this.hashes.clear();
    return 'OK';
  }

  flushall(): 'OK' {
    return this.flushdb();
  }
}

/**
 * Mock Redis client class
 */
class MockRedis {
  private storage: MockRedisStorage;
  private connected: boolean = false;
  private shouldSimulateError: string | null = null;
  private commandHistory: Array<{ command: string; args: any[]; timestamp: number }> = [];

  constructor(options?: any) {
    this.storage = new MockRedisStorage();
    this.connected = true;
    this.setupMockMethods();
  }

  private setupMockMethods() {
    // Track command execution
    const trackCommand = (command: string, args: any[]) => {
      this.commandHistory.push({
        command,
        args,
        timestamp: Date.now()
      });

      if (this.shouldSimulateError) {
        throw new Error(`Redis error: ${this.shouldSimulateError}`);
      }
    };

    // String operations
    this.set = jest.fn().mockImplementation((key: string, value: any, ...args: any[]) => {
      trackCommand('SET', [key, value, ...args]);
      return Promise.resolve(this.storage.set(key, value, args[0], args[1]));
    });

    this.get = jest.fn().mockImplementation((key: string) => {
      trackCommand('GET', [key]);
      return Promise.resolve(this.storage.get(key));
    });

    this.del = jest.fn().mockImplementation((...keys: string[]) => {
      trackCommand('DEL', keys);
      return Promise.resolve(this.storage.del(...keys));
    });

    this.exists = jest.fn().mockImplementation((...keys: string[]) => {
      trackCommand('EXISTS', keys);
      return Promise.resolve(this.storage.exists(...keys));
    });

    this.expire = jest.fn().mockImplementation((key: string, seconds: number) => {
      trackCommand('EXPIRE', [key, seconds]);
      return Promise.resolve(this.storage.expire(key, seconds));
    });

    this.ttl = jest.fn().mockImplementation((key: string) => {
      trackCommand('TTL', [key]);
      return Promise.resolve(this.storage.ttl(key));
    });

    this.keys = jest.fn().mockImplementation((pattern: string) => {
      trackCommand('KEYS', [pattern]);
      return Promise.resolve(this.storage.keys(pattern));
    });

    // List operations
    this.lpush = jest.fn().mockImplementation((key: string, ...values: any[]) => {
      trackCommand('LPUSH', [key, ...values]);
      return Promise.resolve(this.storage.lpush(key, ...values));
    });

    this.rpush = jest.fn().mockImplementation((key: string, ...values: any[]) => {
      trackCommand('RPUSH', [key, ...values]);
      return Promise.resolve(this.storage.rpush(key, ...values));
    });

    this.lpop = jest.fn().mockImplementation((key: string) => {
      trackCommand('LPOP', [key]);
      return Promise.resolve(this.storage.lpop(key));
    });

    this.rpop = jest.fn().mockImplementation((key: string) => {
      trackCommand('RPOP', [key]);
      return Promise.resolve(this.storage.rpop(key));
    });

    this.llen = jest.fn().mockImplementation((key: string) => {
      trackCommand('LLEN', [key]);
      return Promise.resolve(this.storage.llen(key));
    });

    this.lrange = jest.fn().mockImplementation((key: string, start: number, stop: number) => {
      trackCommand('LRANGE', [key, start, stop]);
      return Promise.resolve(this.storage.lrange(key, start, stop));
    });

    // Set operations
    this.sadd = jest.fn().mockImplementation((key: string, ...members: string[]) => {
      trackCommand('SADD', [key, ...members]);
      return Promise.resolve(this.storage.sadd(key, ...members));
    });

    this.smembers = jest.fn().mockImplementation((key: string) => {
      trackCommand('SMEMBERS', [key]);
      return Promise.resolve(this.storage.smembers(key));
    });

    this.srem = jest.fn().mockImplementation((key: string, ...members: string[]) => {
      trackCommand('SREM', [key, ...members]);
      return Promise.resolve(this.storage.srem(key, ...members));
    });

    // Hash operations
    this.hset = jest.fn().mockImplementation((key: string, ...args: string[]) => {
      trackCommand('HSET', [key, ...args]);
      return Promise.resolve(this.storage.hset(key, ...args));
    });

    this.hget = jest.fn().mockImplementation((key: string, field: string) => {
      trackCommand('HGET', [key, field]);
      return Promise.resolve(this.storage.hget(key, field));
    });

    this.hgetall = jest.fn().mockImplementation((key: string) => {
      trackCommand('HGETALL', [key]);
      return Promise.resolve(this.storage.hgetall(key));
    });

    this.hdel = jest.fn().mockImplementation((key: string, ...fields: string[]) => {
      trackCommand('HDEL', [key, ...fields]);
      return Promise.resolve(this.storage.hdel(key, ...fields));
    });

    // Database operations
    this.flushdb = jest.fn().mockImplementation(() => {
      trackCommand('FLUSHDB', []);
      return Promise.resolve(this.storage.flushdb());
    });

    this.flushall = jest.fn().mockImplementation(() => {
      trackCommand('FLUSHALL', []);
      return Promise.resolve(this.storage.flushall());
    });

    // Connection operations
    this.ping = jest.fn().mockImplementation(() => {
      if (!this.connected) {
        throw new Error('Redis connection not available');
      }
      return Promise.resolve('PONG');
    });

    this.quit = jest.fn().mockImplementation(() => {
      this.connected = false;
      return Promise.resolve('OK');
    });

    this.disconnect = jest.fn().mockImplementation(() => {
      this.connected = false;
      return Promise.resolve();
    });

    this.on = jest.fn().mockImplementation(() => this);
    this.off = jest.fn().mockImplementation(() => this);
  }

  // Test utilities
  setSimulateError(errorType: string | null) {
    this.shouldSimulateError = errorType;
  }

  getCommandHistory() {
    return this.commandHistory.slice();
  }

  clearCommandHistory() {
    this.commandHistory = [];
  }

  resetMock() {
    this.shouldSimulateError = null;
    this.commandHistory = [];
    this.connected = true;
    this.storage.flushall();
    jest.clearAllMocks();
    this.setupMockMethods();
  }

  // Connection status
  get status() {
    return this.connected ? 'ready' : 'end';
  }

  // Mock methods (will be overridden by setupMockMethods)
  set = jest.fn();
  get = jest.fn();
  del = jest.fn();
  exists = jest.fn();
  expire = jest.fn();
  ttl = jest.fn();
  keys = jest.fn();
  lpush = jest.fn();
  rpush = jest.fn();
  lpop = jest.fn();
  rpop = jest.fn();
  llen = jest.fn();
  lrange = jest.fn();
  sadd = jest.fn();
  smembers = jest.fn();
  srem = jest.fn();
  hset = jest.fn();
  hget = jest.fn();
  hgetall = jest.fn();
  hdel = jest.fn();
  flushdb = jest.fn();
  flushall = jest.fn();
  ping = jest.fn();
  quit = jest.fn();
  disconnect = jest.fn();
  on = jest.fn();
  off = jest.fn();
}

// Create mock instance
const mockRedisInstance = new MockRedis();

// Mock for ES modules
export default MockRedis;

// Mock for CommonJS
module.exports = MockRedis;
module.exports.default = MockRedis;

// Test helper functions
export const redisHelpers = {
  /**
   * Create a mock Redis instance for testing
   */
  createMockInstance: (options = {}) => {
    return new MockRedis(options);
  },

  /**
   * Generate test cache data
   */
  generateCacheData: (keyPrefix: string, count = 10) => {
    const data: Record<string, any> = {};
    for (let i = 0; i < count; i++) {
      data[`${keyPrefix}:${i}`] = {
        id: i,
        data: `test data ${i}`,
        timestamp: Date.now()
      };
    }
    return data;
  },

  /**
   * Populate cache with test data
   */
  populateCache: async (redis: MockRedis, data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data)) {
      await redis.set(key, JSON.stringify(value));
    }
  },

  /**
   * Get the current mock instance
   */
  getInstance: () => mockRedisInstance,

  /**
   * Reset all mocks to default state
   */
  reset: () => {
    mockRedisInstance.resetMock();
  }
};