import Redis, { RedisOptions, Cluster } from 'ioredis';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const compressAsync = promisify(gzip);
const decompressAsync = promisify(gunzip);

// Cache configuration interfaces
export interface CacheConfig {
  redis?: RedisOptions | {
    cluster?: {
      nodes: { host: string; port: number }[];
      options?: {
        redisOptions?: RedisOptions;
        enableOfflineQueue?: boolean;
        slotsRefreshTimeout?: number;
        maxRetriesPerRequest?: number;
        [key: string]: any;
      };
    };
  };
  defaultTtl: number;
  compression?: {
    enabled: boolean;
    threshold: number; // Compress values larger than this (bytes)
  };
  serialization?: {
    format: 'json' | 'msgpack';
  };
  keyPrefix?: string;
  maxKeyLength?: number;
  monitoring?: {
    enabled: boolean;
    statsInterval: number;
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  memory: {
    used: number;
    peak: number;
    keys: number;
  };
  connections: {
    active: number;
    idle: number;
  };
  operations: {
    avgLatency: number;
    throughput: number;
  };
}

export interface CacheEntry<T = any> {
  data: T;
  metadata: {
    key: string;
    ttl: number;
    createdAt: number;
    compressed: boolean;
    size: number;
    version?: string;
  };
}

export interface CacheOptions {
  ttl?: number;
  compress?: boolean;
  version?: string;
  namespace?: string;
  tags?: string[];
}

export interface BatchCacheOperation {
  key: string;
  value?: any;
  options?: CacheOptions;
}

// Cache warming configuration
export interface CacheWarmingConfig {
  patterns: {
    pattern: string;
    loader: (key: string) => Promise<any>;
    ttl?: number;
    priority?: number;
  }[];
  concurrency?: number;
  batchSize?: number;
}

/**
 * Comprehensive Redis caching system for the Dream 100 Keyword Engine
 * 
 * Features:
 * - Smart cache keys with market, language, and version support
 * - Compression for large values
 * - Connection pooling and clustering
 * - Distributed locking
 * - Cache warming strategies
 * - Comprehensive monitoring
 * - Graceful degradation
 */
export class CacheService {
  private redis: Redis | Cluster | null = null;
  private fallbackCache: Map<string, { value: any; expiry: number }> = new Map();
  private config: CacheConfig & {
    compression: Required<CacheConfig['compression']>;
    serialization: Required<CacheConfig['serialization']>;
    monitoring: Required<CacheConfig['monitoring']>;
  };
  private stats: CacheStats;
  private isHealthy = false;
  private connectionAttempts = 0;
  private maxConnectionAttempts = 5;
  private lockTimeout = 30000; // 30 seconds
  
  constructor(config: CacheConfig) {
    this.config = {
      defaultTtl: 30 * 24 * 60 * 60 * 1000, // 30 days
      compression: {
        enabled: true,
        threshold: 1024, // 1KB
        ...config.compression,
      },
      serialization: {
        format: 'json' as const,
        ...config.serialization,
      },
      keyPrefix: config.keyPrefix || 'dream100:',
      maxKeyLength: config.maxKeyLength || 250,
      monitoring: {
        enabled: true,
        statsInterval: 60000, // 1 minute
        ...config.monitoring,
      },
      redis: config.redis,
    };
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      memory: { used: 0, peak: 0, keys: 0 },
      connections: { active: 0, idle: 0 },
      operations: { avgLatency: 0, throughput: 0 },
    };
    
    this.initializeRedis();
    
    if (this.config.monitoring?.enabled) {
      this.startMonitoring();
    }
    
    // Cleanup fallback cache periodically
    setInterval(() => this.cleanupFallbackCache(), 300000); // 5 minutes
  }
  
  private async initializeRedis(): Promise<void> {
    try {
      if (this.config.redis) {
        if ('cluster' in this.config.redis && this.config.redis.cluster) {
          // Redis Cluster setup
          this.redis = new Redis.Cluster(
            this.config.redis.cluster.nodes,
            {
              redisOptions: {
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                ...this.config.redis.cluster.options?.redisOptions,
              },
              enableOfflineQueue: this.config.redis.cluster.options?.enableOfflineQueue ?? false,
              slotsRefreshTimeout: this.config.redis.cluster.options?.slotsRefreshTimeout ?? 10000,
              maxRetriesPerRequest: this.config.redis.cluster.options?.maxRetriesPerRequest ?? 3,
              ...this.config.redis.cluster.options,
            }
          );
        } else {
          // Standalone Redis setup
          this.redis = new Redis({
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            ...(this.config.redis as RedisOptions),
          });
        }
        
        await this.redis.connect();
        this.isHealthy = true;
        this.connectionAttempts = 0;
        
        // Set up event handlers
        this.redis.on('error', this.handleRedisError.bind(this));
        this.redis.on('connect', () => {
          this.isHealthy = true;
          console.log('Cache service connected to Redis');
        });
        this.redis.on('close', () => {
          this.isHealthy = false;
          console.warn('Cache service disconnected from Redis');
        });
      }
    } catch (error) {
      this.handleRedisError(error);
    }
  }
  
  private handleRedisError(error: any): void {
    this.stats.errors++;
    this.isHealthy = false;
    this.connectionAttempts++;
    
    console.error('Cache service Redis error:', error);
    
    // Attempt reconnection with exponential backoff
    if (this.connectionAttempts < this.maxConnectionAttempts) {
      const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
      setTimeout(() => this.initializeRedis(), delay);
    }
  }
  
  private startMonitoring(): void {
    setInterval(async () => {
      await this.updateStats();
    }, this.config.monitoring?.statsInterval || 60000);
  }
  
  private async updateStats(): Promise<void> {
    if (!this.isHealthy || !this.redis) return;
    
    try {
      // Calculate hit rate
      const total = this.stats.hits + this.stats.misses;
      this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
      
      // Get Redis memory info
      const info = await this.redis.info('memory');
      const memoryLines = info.split('\n');
      
      for (const line of memoryLines) {
        if (line.startsWith('used_memory:')) {
          this.stats.memory.used = parseInt(line.split(':')[1]);
        } else if (line.startsWith('used_memory_peak:')) {
          this.stats.memory.peak = parseInt(line.split(':')[1]);
        }
      }
      
      // Get key count
      this.stats.memory.keys = await this.redis.dbsize();
      
      // Get connection info
      const clientInfo = await this.redis.info('clients');
      const clientLines = clientInfo.split('\n');
      
      for (const line of clientLines) {
        if (line.startsWith('connected_clients:')) {
          this.stats.connections.active = parseInt(line.split(':')[1]);
        }
      }
    } catch (error) {
      console.warn('Failed to update cache stats:', error);
    }
  }
  
  /**
   * Generate smart cache key with context
   */
  private generateKey(
    baseKey: string,
    options: CacheOptions = {},
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): string {
    const parts = [this.config.keyPrefix];
    
    if (options.namespace) {
      parts.push(options.namespace);
    }
    
    if (context.market) {
      parts.push(`market:${context.market}`);
    }
    
    if (context.language) {
      parts.push(`lang:${context.language}`);
    }
    
    if (context.userId) {
      parts.push(`user:${context.userId}`);
    }
    
    if (options.version) {
      parts.push(`v:${options.version}`);
    }
    
    parts.push(baseKey);
    
    const key = parts.join(':');
    
    // Ensure key doesn't exceed max length
    if (key.length > (this.config.maxKeyLength || 250)) {
      const hash = createHash('sha256').update(key).digest('hex').substring(0, 16);
      return `${this.config.keyPrefix || 'dream100:'}hash:${hash}`;
    }
    
    return key;
  }
  
  /**
   * Serialize and optionally compress data
   */
  private async serialize(data: any, compress = false): Promise<Buffer | string> {
    let serialized: string;
    
    if (this.config.serialization?.format === 'json') {
      serialized = JSON.stringify(data);
    } else {
      // Future: msgpack support
      serialized = JSON.stringify(data);
    }
    
    if (compress && this.config.compression?.enabled) {
      const buffer = Buffer.from(serialized, 'utf8');
      if (buffer.length > (this.config.compression?.threshold || 1024)) {
        return await compressAsync(buffer);
      }
    }
    
    return serialized;
  }
  
  /**
   * Deserialize and optionally decompress data
   */
  private async deserialize(data: Buffer | string, compressed = false): Promise<any> {
    let serialized: string;
    
    if (compressed && Buffer.isBuffer(data)) {
      const decompressed = await decompressAsync(data);
      serialized = decompressed.toString('utf8');
    } else {
      serialized = data.toString();
    }
    
    if (this.config.serialization?.format === 'json') {
      return JSON.parse(serialized);
    } else {
      // Future: msgpack support
      return JSON.parse(serialized);
    }
  }
  
  /**
   * Get cached value with fallback to local cache
   */
  async get<T = any>(
    key: string,
    options: CacheOptions = {},
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): Promise<T | null> {
    const startTime = Date.now();
    const cacheKey = this.generateKey(key, options, context);
    
    try {
      if (this.isHealthy && this.redis) {
        const result = await this.redis.get(cacheKey);
        
        if (result !== null) {
          this.stats.hits++;
          
          // Check if compressed (simple heuristic: starts with magic bytes)
          const compressed = Buffer.isBuffer(result) || 
            (typeof result === 'string' && result.startsWith('\u001f\u008b'));
          
          const data = await this.deserialize(result, compressed);
          
          this.updateLatency(Date.now() - startTime);
          return data;
        }
      } else {
        // Fallback to local cache
        const cached = this.fallbackCache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
          this.stats.hits++;
          return cached.value;
        }
      }
      
      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache get error:', (error as Error).message);
      
      // Try fallback cache
      const cached = this.fallbackCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return cached.value;
      }
      
      return null;
    }
  }
  
  /**
   * Set cached value with optional compression
   */
  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {},
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): Promise<boolean> {
    const startTime = Date.now();
    const cacheKey = this.generateKey(key, options, context);
    const ttl = options.ttl || this.config.defaultTtl;
    
    try {
      // Determine if we should compress
      const shouldCompress = options.compress !== false && 
        (this.config.compression?.enabled || false);
      
      const serialized = await this.serialize(value, shouldCompress);
      const isCompressed = Buffer.isBuffer(serialized);
      
      if (this.isHealthy && this.redis) {
        const ttlSeconds = Math.ceil(ttl / 1000);
        await this.redis.setex(cacheKey, ttlSeconds, serialized);
        
        // Store tags for invalidation if provided
        if (options.tags && options.tags.length > 0) {
          const pipeline = this.redis.pipeline();
          for (const tag of options.tags) {
            const tagKey = `${this.config.keyPrefix || 'dream100:'}tag:${tag}`;
            pipeline.sadd(tagKey, cacheKey);
            pipeline.expire(tagKey, ttlSeconds);
          }
          await pipeline.exec();
        }
      } else {
        // Fallback to local cache
        this.fallbackCache.set(cacheKey, {
          value,
          expiry: Date.now() + ttl,
        });
      }
      
      this.stats.sets++;
      this.updateLatency(Date.now() - startTime);
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache set error:', (error as Error).message);
      
      // Try fallback cache
      this.fallbackCache.set(cacheKey, {
        value,
        expiry: Date.now() + ttl,
      });
      
      return false;
    }
  }
  
  /**
   * Delete cached value
   */
  async delete(
    key: string,
    options: CacheOptions = {},
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): Promise<boolean> {
    const cacheKey = this.generateKey(key, options, context);
    
    try {
      if (this.isHealthy && this.redis) {
        await this.redis.del(cacheKey);
      }
      
      this.fallbackCache.delete(cacheKey);
      this.stats.deletes++;
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache delete error:', (error as Error).message);
      
      // Still try to delete from fallback
      this.fallbackCache.delete(cacheKey);
      return false;
    }
  }
  
  /**
   * Batch operations for efficiency
   */
  async getBatch<T = any>(
    operations: BatchCacheOperation[],
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): Promise<(T | null)[]> {
    if (this.isHealthy && this.redis) {
      const pipeline = this.redis.pipeline();
      const keys = operations.map(op => 
        this.generateKey(op.key, op.options, context)
      );
      
      keys.forEach(key => pipeline.get(key));
      
      try {
        const results = await pipeline.exec();
        return Promise.all(
          results?.map(async (result, index) => {
            if (result && result[1] !== null) {
              this.stats.hits++;
              return await this.deserialize(result[1] as Buffer | string);
            }
            this.stats.misses++;
            return null;
          }) || []
        );
      } catch (error) {
        console.error('Batch get error:', (error as Error).message);
      }
    }
    
    // Fallback to individual gets
    return Promise.all(
      operations.map(op => this.get<T>(op.key, op.options, context))
    );
  }
  
  /**
   * Batch set operations
   */
  async setBatch(
    operations: (BatchCacheOperation & { value: any })[],
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): Promise<boolean[]> {
    if (this.isHealthy && this.redis) {
      const pipeline = this.redis.pipeline();
      
      try {
        for (const op of operations) {
          const key = this.generateKey(op.key, op.options, context);
          const ttl = op.options?.ttl || this.config.defaultTtl;
          const serialized = await this.serialize(
            op.value,
            op.options?.compress !== false
          );
          
          pipeline.setex(key, Math.ceil(ttl / 1000), serialized);
        }
        
        const results = await pipeline.exec();
        this.stats.sets += operations.length;
        
        return results?.map(result => result[1] === 'OK') || [];
      } catch (error) {
        console.error('Batch set error:', (error as Error).message);
      }
    }
    
    // Fallback to individual sets
    return Promise.all(
      operations.map(op => this.set(op.key, op.value, op.options, context))
    );
  }
  
  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    if (!this.isHealthy || !this.redis) return 0;
    
    try {
      let deletedCount = 0;
      
      for (const tag of tags) {
        const tagKey = `${this.config.keyPrefix}tag:${tag}`;
        const keys = await this.redis.smembers(tagKey);
        
        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
        
        await this.redis.del(tagKey);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Tag invalidation error:', (error as Error).message);
      return 0;
    }
  }
  
  /**
   * Distributed locking for preventing race conditions
   */
  async acquireLock(
    lockKey: string,
    timeout: number = this.lockTimeout,
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): Promise<string | null> {
    if (!this.isHealthy || !this.redis) return null;
    
    const key = this.generateKey(`lock:${lockKey}`, {}, context);
    const value = `${Date.now()}-${Math.random()}`;
    
    try {
      const result = await this.redis.set(
        key,
        value,
        'PX',
        timeout,
        'NX'
      );
      
      return result === 'OK' ? value : null;
    } catch (error) {
      console.error('Lock acquisition error:', (error as Error).message);
      return null;
    }
  }
  
  /**
   * Release distributed lock
   */
  async releaseLock(
    lockKey: string,
    lockValue: string,
    context: {
      market?: string;
      language?: string;
      userId?: string;
    } = {}
  ): Promise<boolean> {
    if (!this.isHealthy || !this.redis) return false;
    
    const key = this.generateKey(`lock:${lockKey}`, {}, context);
    
    // Lua script for atomic lock release
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      const result = await this.redis.eval(script, 1, key, lockValue);
      return result === 1;
    } catch (error) {
      console.error('Lock release error:', (error as Error).message);
      return false;
    }
  }
  
  /**
   * Cache warming utilities
   */
  async warmCache(config: CacheWarmingConfig): Promise<void> {
    if (!this.isHealthy || !this.redis) {
      console.warn('Cannot warm cache: Redis not available');
      return;
    }
    
    const { patterns, concurrency = 5, batchSize = 100 } = config;
    
    for (const pattern of patterns) {
      try {
        // Find keys matching pattern
        const keys = await this.redis.keys(pattern.pattern);
        
        // Process in batches
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          
          await Promise.all(
            batch.slice(0, concurrency).map(async (key) => {
              try {
                const data = await pattern.loader(key);
                if (data !== null) {
                  await this.set(key, data, { ttl: pattern.ttl });
                }
              } catch (error) {
                console.warn(`Failed to warm cache for key ${key}:`, (error as Error).message);
              }
            })
          );
        }
      } catch (error) {
        console.error(`Failed to warm cache for pattern ${pattern.pattern}:`, (error as Error).message);
      }
    }
  }
  
  /**
   * Clear all cache entries
   */
  async clear(pattern?: string): Promise<number> {
    let deletedCount = 0;
    
    try {
      if (this.isHealthy && this.redis) {
        if (pattern) {
          const keys = await this.redis.keys(
            this.generateKey(pattern)
          );
          if (keys.length > 0) {
            deletedCount = await this.redis.del(...keys);
          }
        } else {
          await this.redis.flushdb();
          deletedCount = this.stats.memory.keys;
        }
      }
    } catch (error) {
      console.error('Cache clear error:', (error as Error).message);
    }
    
    // Clear fallback cache
    if (pattern) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const keysToDelete: string[] = [];
      this.fallbackCache.forEach((_, key) => {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => {
        this.fallbackCache.delete(key);
        deletedCount++;
      });
    } else {
      this.fallbackCache.clear();
    }
    
    return deletedCount;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    redis: boolean;
    fallback: boolean;
    stats: CacheStats;
    issues: string[];
  }> {
    const issues: string[] = [];
    let redisHealthy = false;
    
    try {
      if (this.redis) {
        await this.redis.ping();
        redisHealthy = true;
      } else {
        issues.push('Redis client not initialized');
      }
    } catch (error) {
      issues.push(`Redis connection error: ${(error as Error).message}`);
    }
    
    // Check error rates
    const total = this.stats.hits + this.stats.misses;
    if (total > 100 && this.stats.hitRate < 0.5) {
      issues.push(`Low hit rate: ${(this.stats.hitRate * 100).toFixed(1)}%`);
    }
    
    const errorRate = total > 0 ? this.stats.errors / total : 0;
    if (errorRate > 0.1) {
      issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }
    
    return {
      healthy: redisHealthy || this.fallbackCache.size > 0,
      redis: redisHealthy,
      fallback: this.fallbackCache.size > 0,
      stats: this.getStats(),
      issues,
    };
  }
  
  private updateLatency(latency: number): void {
    // Exponential moving average
    const alpha = 0.1;
    this.stats.operations.avgLatency = 
      this.stats.operations.avgLatency * (1 - alpha) + latency * alpha;
  }
  
  private cleanupFallbackCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    this.fallbackCache.forEach((entry, key) => {
      if (entry.expiry < now) {
        expiredKeys.push(key);
      }
    });
    expiredKeys.forEach(key => this.fallbackCache.delete(key));
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.fallbackCache.clear();
  }
}

// Singleton instance for global use
let cacheInstance: CacheService | null = null;

/**
 * Initialize global cache service
 */
export function initializeCache(config: CacheConfig): CacheService {
  if (cacheInstance) {
    console.warn('Cache service already initialized');
    return cacheInstance;
  }
  
  cacheInstance = new CacheService(config);
  return cacheInstance;
}

/**
 * Get global cache service instance
 */
export function getCache(): CacheService | null {
  if (!cacheInstance) {
    console.warn('Cache service not initialized. Call initializeCache() first.');
  }
  return cacheInstance;
}

/**
 * Cache decorators and utilities for easy integration
 */
export function cached(
  ttl?: number,
  options?: Omit<CacheOptions, 'ttl'>
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cache = getCache();
      if (!cache) {
        return method.apply(this, args);
      }
      
      const key = `${target.constructor.name}:${propertyName}:${createHash('md5')
        .update(JSON.stringify(args))
        .digest('hex')}`;
      
      const cached = await cache.get(key, { ttl, ...options });
      if (cached !== null) {
        return cached;
      }
      
      const result = await method.apply(this, args);
      
      if (result !== null && result !== undefined) {
        await cache.set(key, result, { ttl, ...options });
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Helper for creating cache keys for specific use cases
 */
export class CacheKeyBuilder {
  static ahrefs(params: {
    keywords: string[];
    market: string;
    metrics: string[];
  }): string {
    const keywordHash = createHash('md5')
      .update(params.keywords.sort().join(','))
      .digest('hex')
      .substring(0, 16);
    
    return `ahrefs:${params.market}:${params.metrics.sort().join(',')}:${keywordHash}`;
  }
  
  static anthropic(params: {
    prompt: string;
    model: string;
    temperature?: number;
  }): string {
    const promptHash = createHash('md5')
      .update(params.prompt)
      .digest('hex')
      .substring(0, 16);
    
    return `anthropic:${params.model}:${params.temperature || 0}:${promptHash}`;
  }
  
  static embedding(params: {
    text: string;
    model: string;
  }): string {
    const textHash = createHash('md5')
      .update(params.text)
      .digest('hex')
      .substring(0, 16);
    
    return `embedding:${params.model}:${textHash}`;
  }
  
  static serp(params: {
    keyword: string;
    market: string;
    device?: string;
  }): string {
    return `serp:${params.market}:${params.device || 'desktop'}:${createHash('md5')
      .update(params.keyword)
      .digest('hex')
      .substring(0, 16)}`;
  }
  
  static cluster(params: {
    keywords: string[];
    algorithm: string;
    threshold: number;
  }): string {
    const keywordHash = createHash('md5')
      .update(params.keywords.sort().join(','))
      .digest('hex')
      .substring(0, 16);
    
    return `cluster:${params.algorithm}:${params.threshold}:${keywordHash}`;
  }
  
  static score(params: {
    keywords: string[];
    weights: Record<string, number>;
    stage: string;
  }): string {
    const keywordHash = createHash('md5')
      .update(params.keywords.sort().join(','))
      .digest('hex')
      .substring(0, 16);
    
    const weightHash = createHash('md5')
      .update(JSON.stringify(params.weights))
      .digest('hex')
      .substring(0, 8);
    
    return `score:${params.stage}:${weightHash}:${keywordHash}`;
  }
}
