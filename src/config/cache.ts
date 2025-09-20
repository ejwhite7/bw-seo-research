import { CacheConfig } from '../lib/cache';
import { RedisOptions } from 'ioredis';

/**
 * Cache configuration for different environments
 */

// Development configuration
const developmentConfig: CacheConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
  } as RedisOptions,
  defaultTtl: 30 * 24 * 60 * 60 * 1000, // 30 days
  compression: {
    enabled: true,
    threshold: 1024, // 1KB
  },
  serialization: {
    format: 'json',
  },
  keyPrefix: 'dream100:dev:',
  maxKeyLength: 250,
  monitoring: {
    enabled: true,
    statsInterval: 60000, // 1 minute
  },
};

// Production configuration
const productionConfig: CacheConfig = {
  redis: process.env.REDIS_CLUSTER_NODES ? {
    // Redis Cluster configuration
    cluster: {
      nodes: process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
        const [host, port] = node.split(':');
        return { host, port: parseInt(port) };
      }),
      options: {
        redisOptions: {
          password: process.env.REDIS_PASSWORD,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          keepAlive: 30000,
          connectTimeout: 10000,
          commandTimeout: 5000,
        } as RedisOptions,
        retryDelayOnClusterDown: 1000,
        retryDelayOnFailover: 1000,
        enableOfflineQueue: false,
        slotsRefreshTimeout: 10000,
        maxRetriesPerRequest: 3,
      },
    },
  } : {
    // Standalone Redis configuration
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
    // Connection pooling for production
    family: 4,
  } as RedisOptions,
  defaultTtl: 30 * 24 * 60 * 60 * 1000, // 30 days
  compression: {
    enabled: true,
    threshold: 512, // 512 bytes - more aggressive compression in production
  },
  serialization: {
    format: 'json',
  },
  keyPrefix: 'dream100:prod:',
  maxKeyLength: 250,
  monitoring: {
    enabled: true,
    statsInterval: 30000, // 30 seconds
  },
};

// Test configuration
const testConfig: CacheConfig = {
  // No Redis for tests - uses fallback cache only
  defaultTtl: 1000, // 1 second for fast tests
  compression: {
    enabled: false, // Disabled for test performance
    threshold: 1024,
  },
  serialization: {
    format: 'json',
  },
  keyPrefix: 'dream100:test:',
  maxKeyLength: 250,
  monitoring: {
    enabled: false, // Disabled for tests
    statsInterval: 60000,
  },
};

/**
 * Get cache configuration based on environment
 */
export function getCacheConfig(): CacheConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return productionConfig;
    case 'test':
      return testConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

/**
 * Validate cache configuration
 */
export function validateCacheConfig(config: CacheConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (config.defaultTtl <= 0) {
    errors.push('defaultTtl must be positive');
  }
  
  if (config.compression?.threshold && config.compression.threshold < 0) {
    errors.push('compression threshold must be non-negative');
  }
  
  if (config.maxKeyLength && config.maxKeyLength < 50) {
    errors.push('maxKeyLength should be at least 50 characters');
  }
  
  if (config.keyPrefix && config.keyPrefix.length > 50) {
    errors.push('keyPrefix should be less than 50 characters');
  }
  
  if (config.monitoring?.statsInterval && config.monitoring.statsInterval < 1000) {
    errors.push('stats interval should be at least 1 second');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Cache-specific environment variables with defaults
 */
export const CACHE_ENV = {
  // Redis connection
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379'),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0'),
  REDIS_CLUSTER_NODES: process.env.REDIS_CLUSTER_NODES,
  
  // TTL settings (in milliseconds)
  AHREFS_CACHE_TTL: parseInt(process.env.AHREFS_CACHE_TTL || '2592000000'), // 30 days
  ANTHROPIC_CACHE_TTL: parseInt(process.env.ANTHROPIC_CACHE_TTL || '86400000'), // 24 hours
  EMBEDDING_CACHE_TTL: parseInt(process.env.EMBEDDING_CACHE_TTL || '604800000'), // 7 days
  SERP_CACHE_TTL: parseInt(process.env.SERP_CACHE_TTL || '604800000'), // 7 days
  CLUSTER_CACHE_TTL: parseInt(process.env.CLUSTER_CACHE_TTL || '86400000'), // 24 hours
  SCORE_CACHE_TTL: parseInt(process.env.SCORE_CACHE_TTL || '21600000'), // 6 hours
  EXPORT_CACHE_TTL: parseInt(process.env.EXPORT_CACHE_TTL || '3600000'), // 1 hour
  
  // Compression settings
  CACHE_COMPRESSION_ENABLED: process.env.CACHE_COMPRESSION_ENABLED === 'true',
  CACHE_COMPRESSION_THRESHOLD: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD || '1024'),
  
  // Monitoring settings
  CACHE_MONITORING_ENABLED: process.env.CACHE_MONITORING_ENABLED !== 'false',
  CACHE_STATS_INTERVAL: parseInt(process.env.CACHE_STATS_INTERVAL || '60000'),
  
  // Performance settings
  CACHE_MAX_KEY_LENGTH: parseInt(process.env.CACHE_MAX_KEY_LENGTH || '250'),
  CACHE_CONNECTION_TIMEOUT: parseInt(process.env.CACHE_CONNECTION_TIMEOUT || '10000'),
  CACHE_COMMAND_TIMEOUT: parseInt(process.env.CACHE_COMMAND_TIMEOUT || '5000'),
  
  // Feature flags
  CACHE_WARMING_ENABLED: process.env.CACHE_WARMING_ENABLED === 'true',
  CACHE_DISTRIBUTED_LOCKING: process.env.CACHE_DISTRIBUTED_LOCKING !== 'false',
  CACHE_BATCH_OPERATIONS: process.env.CACHE_BATCH_OPERATIONS !== 'false',
} as const;

/**
 * Dynamic cache configuration based on usage patterns
 */
export class AdaptiveCacheConfig {
  private static instance: AdaptiveCacheConfig;
  private currentConfig: CacheConfig;
  private usageMetrics: {
    hitRate: number;
    avgResponseTime: number;
    errorRate: number;
    memoryUsage: number;
  } = {
    hitRate: 0,
    avgResponseTime: 0,
    errorRate: 0,
    memoryUsage: 0,
  };
  
  private constructor() {
    this.currentConfig = getCacheConfig();
  }
  
  static getInstance(): AdaptiveCacheConfig {
    if (!AdaptiveCacheConfig.instance) {
      AdaptiveCacheConfig.instance = new AdaptiveCacheConfig();
    }
    return AdaptiveCacheConfig.instance;
  }
  
  updateMetrics(metrics: Partial<typeof this.usageMetrics>): void {
    this.usageMetrics = { ...this.usageMetrics, ...metrics };
    this.adaptConfiguration();
  }
  
  private adaptConfiguration(): void {
    const { hitRate, avgResponseTime, errorRate, memoryUsage } = this.usageMetrics;
    
    // Adjust TTL based on hit rate
    if (hitRate > 0.9) {
      // Very high hit rate - can increase TTL to save API calls
      this.currentConfig.defaultTtl = Math.min(
        this.currentConfig.defaultTtl * 1.2,
        7 * 24 * 60 * 60 * 1000 // Max 7 days
      );
    } else if (hitRate < 0.5) {
      // Low hit rate - decrease TTL to keep data fresh
      this.currentConfig.defaultTtl = Math.max(
        this.currentConfig.defaultTtl * 0.8,
        60 * 60 * 1000 // Min 1 hour
      );
    }
    
    // Adjust compression based on memory usage
    if (memoryUsage > 0.8) {
      // High memory usage - enable more aggressive compression
      this.currentConfig.compression = {
        enabled: true,
        threshold: 256, // Compress smaller items
      };
    } else if (memoryUsage < 0.3) {
      // Low memory usage - can be less aggressive
      this.currentConfig.compression = {
        enabled: true,
        threshold: 2048, // Only compress larger items
      };
    }
    
    // Adjust monitoring frequency based on error rate
    if (errorRate > 0.1) {
      // High error rate - increase monitoring frequency
      this.currentConfig.monitoring!.statsInterval = 15000; // 15 seconds
    } else if (errorRate < 0.01) {
      // Low error rate - can decrease monitoring frequency
      this.currentConfig.monitoring!.statsInterval = 120000; // 2 minutes
    }
  }
  
  getCurrentConfig(): CacheConfig {
    return { ...this.currentConfig };
  }
  
  resetToDefaults(): void {
    this.currentConfig = getCacheConfig();
  }
}

/**
 * Cache health check configuration
 */
export const CACHE_HEALTH_THRESHOLDS = {
  hitRate: {
    good: 0.8,
    warning: 0.5,
    critical: 0.2,
  },
  errorRate: {
    good: 0.01,
    warning: 0.05,
    critical: 0.1,
  },
  responseTime: {
    good: 50, // ms
    warning: 200,
    critical: 1000,
  },
  memoryUsage: {
    good: 0.6,
    warning: 0.8,
    critical: 0.95,
  },
  connectionHealth: {
    good: 0.95,
    warning: 0.8,
    critical: 0.5,
  },
} as const;
