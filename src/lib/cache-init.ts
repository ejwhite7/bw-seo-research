import { CacheService, initializeCache, getCache } from './cache';
import { CacheIntegrationManager } from './cache-integrations';
import { CacheWarmingManager } from './cache-warming';
import { CacheMonitor } from './cache-monitor';
import { getCacheConfig, validateCacheConfig, CACHE_ENV } from '../config/cache';
import { AhrefsClient } from '../integrations/ahrefs';
import { AnthropicClient } from '../integrations/anthropic';

/**
 * Global cache system initialization and management
 */

interface CacheSystemConfig {
  enableWarming?: boolean;
  enableMonitoring?: boolean;
  warmingStrategies?: string[];
  monitoringInterval?: number;
  autoStart?: boolean;
}

/**
 * Complete cache system with all components
 */
export class CacheSystem {
  private cache: CacheService;
  private integrations: CacheIntegrationManager;
  private warming?: CacheWarmingManager;
  private monitor?: CacheMonitor;
  private initialized = false;
  
  constructor(
    cache: CacheService,
    integrations: CacheIntegrationManager,
    warming?: CacheWarmingManager,
    monitor?: CacheMonitor
  ) {
    this.cache = cache;
    this.integrations = integrations;
    this.warming = warming;
    this.monitor = monitor;
  }
  
  /**
   * Get cache service instance
   */
  getCache(): CacheService {
    return this.cache;
  }
  
  /**
   * Get integration manager
   */
  getIntegrations(): CacheIntegrationManager {
    return this.integrations;
  }
  
  /**
   * Get warming manager
   */
  getWarming(): CacheWarmingManager | undefined {
    return this.warming;
  }
  
  /**
   * Get monitor
   */
  getMonitor(): CacheMonitor | undefined {
    return this.monitor;
  }
  
  /**
   * Start cache warming
   */
  async startWarming(options?: {
    strategies?: string[];
    maxTime?: number;
    maxCost?: number;
  }): Promise<void> {
    if (this.warming) {
      await this.warming.warmCache(options);
    }
  }
  
  /**
   * Get system health status
   */
  async getHealth(): Promise<{
    cache: any;
    system: {
      warming: boolean;
      monitoring: boolean;
      initialized: boolean;
    };
    analytics: any;
  }> {
    const cacheHealth = await this.cache.healthCheck();
    
    let analytics = null;
    if (this.integrations) {
      analytics = await this.integrations.getCacheAnalytics();
    }
    
    return {
      cache: cacheHealth,
      system: {
        warming: !!this.warming,
        monitoring: !!this.monitor,
        initialized: this.initialized,
      },
      analytics,
    };
  }
  
  /**
   * Shutdown the cache system
   */
  async shutdown(): Promise<void> {
    if (this.monitor) {
      this.monitor.shutdown();
    }
    
    await this.cache.shutdown();
    this.initialized = false;
  }
  
  markInitialized(): void {
    this.initialized = true;
  }
}

// Global system instance
let globalCacheSystem: CacheSystem | null = null;

/**
 * Initialize the complete cache system
 */
export async function initializeCacheSystem(config: CacheSystemConfig = {}): Promise<CacheSystem> {
  if (globalCacheSystem) {
    console.warn('Cache system already initialized');
    return globalCacheSystem;
  }
  
  try {
    console.log('Initializing cache system...');
    
    // Get and validate configuration
    const cacheConfig = getCacheConfig();
    const validation = validateCacheConfig(cacheConfig);
    
    if (!validation.valid) {
      throw new Error(`Invalid cache configuration: ${validation.errors.join(', ')}`);
    }
    
    // Initialize core cache service
    const cache = initializeCache(cacheConfig);
    
    // Initialize integration manager
    const integrations = new CacheIntegrationManager(cache);
    
    // Initialize cache warming (optional)
    let warming: CacheWarmingManager | undefined;
    if (config.enableWarming !== false && CACHE_ENV.CACHE_WARMING_ENABLED) {
      console.log('Initializing cache warming...');
      
      // These would be injected from the application context
      let ahrefsClient: AhrefsClient | undefined;
      let anthropicClient: AnthropicClient | undefined;
      
      try {
        // Try to get existing client instances (would be provided by dependency injection)
        // For now, we'll pass undefined and let warming handle missing clients gracefully
      } catch (error) {
        console.warn('Could not initialize API clients for cache warming:', (error as Error).message);
      }
      
      warming = new CacheWarmingManager(
        cache,
        integrations,
        ahrefsClient,
        anthropicClient
      );
    }
    
    // Initialize monitoring (optional)
    let monitor: CacheMonitor | undefined;
    if (config.enableMonitoring !== false && CACHE_ENV.CACHE_MONITORING_ENABLED) {
      console.log('Initializing cache monitoring...');
      
      monitor = new CacheMonitor(
        cache,
        integrations,
        {
          interval: config.monitoringInterval || CACHE_ENV.CACHE_STATS_INTERVAL,
          enableAlerting: true,
        }
      );
      
      // Set up alert handlers
      monitor.onAlert((alert) => {
        console.warn(`Cache Alert [${alert.type}] ${alert.component}: ${alert.message}`);
        
        // Here you could integrate with external alerting systems:
        // - Send to Slack/Discord webhook
        // - Log to monitoring service
        // - Send email notifications
        // - Trigger PagerDuty/OpsGenie alerts
      });
    }
    
    // Create system instance
    globalCacheSystem = new CacheSystem(cache, integrations, warming, monitor);
    globalCacheSystem.markInitialized();
    
    console.log('Cache system initialized successfully');
    
    // Auto-start warming if requested
    if (config.autoStart && warming) {
      console.log('Starting initial cache warming...');
      try {
        await warming.warmCache({
          strategies: config.warmingStrategies,
          maxTime: 300, // 5 minutes max for initialization
          maxCost: 5.0, // $5 max for initialization
        });
        console.log('Initial cache warming completed');
      } catch (error) {
        console.warn('Initial cache warming failed:', (error as Error).message);
      }
    }
    
    return globalCacheSystem;
    
  } catch (error) {
    console.error('Failed to initialize cache system:', error);
    throw error;
  }
}

/**
 * Get the global cache system instance
 */
export function getCacheSystem(): CacheSystem | null {
  return globalCacheSystem;
}

/**
 * Ensure cache system is initialized
 */
export async function ensureCacheSystem(config: CacheSystemConfig = {}): Promise<CacheSystem> {
  if (!globalCacheSystem) {
    return await initializeCacheSystem(config);
  }
  return globalCacheSystem;
}

/**
 * Enhanced BaseApiClient cache integration
 * This extends the existing in-memory cache with Redis support
 */
export class EnhancedCacheApiClient {
  private cacheSystem: CacheSystem | null = null;
  
  constructor() {
    this.cacheSystem = getCacheSystem();
  }
  
  /**
   * Enhanced cache get with fallback to base client cache
   */
  async get<T>(
    key: string,
    fallback?: () => Promise<T>,
    options?: {
      ttl?: number;
      namespace?: string;
      tags?: string[];
      context?: {
        market?: string;
        language?: string;
        userId?: string;
      };
    }
  ): Promise<T | null> {
    if (!this.cacheSystem) {
      console.warn('Cache system not available, using fallback');
      return fallback ? await fallback() : null;
    }
    
    const cache = this.cacheSystem.getCache();
    const cached = await cache.get<T>(key, options, options?.context);
    
    if (cached !== null) {
      return cached;
    }
    
    // Execute fallback and cache result
    if (fallback) {
      try {
        const result = await fallback();
        if (result !== null && result !== undefined) {
          await cache.set(key, result, options, options?.context);
        }
        return result;
      } catch (error) {
        console.error('Fallback execution failed:', error);
        throw error;
      }
    }
    
    return null;
  }
  
  /**
   * Enhanced cache set
   */
  async set<T>(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      namespace?: string;
      tags?: string[];
      context?: {
        market?: string;
        language?: string;
        userId?: string;
      };
    }
  ): Promise<boolean> {
    if (!this.cacheSystem) {
      console.warn('Cache system not available');
      return false;
    }
    
    const cache = this.cacheSystem.getCache();
    return await cache.set(key, value, options, options?.context);
  }
  
  /**
   * Get cache statistics
   */
  getStats(): any {
    if (!this.cacheSystem) {
      return null;
    }
    
    return this.cacheSystem.getCache().getStats();
  }
}

/**
 * Factory functions for easy integration
 */
export class CacheFactory {
  /**
   * Create Ahrefs-optimized cache client
   */
  static createAhrefsCache(): {
    get: (keywords: string[], market: string) => Promise<any>;
    set: (keywords: string[], market: string, data: any) => Promise<void>;
    invalidate: (market: string) => Promise<number>;
  } {
    const system = getCacheSystem();
    if (!system) {
      throw new Error('Cache system not initialized');
    }
    
    const ahrefs = system.getIntegrations().ahrefs;
    
    return {
      async get(keywords: string[], market: string) {
        const { cached, missing } = await ahrefs.getCachedMetrics(
          keywords,
          market,
          ['volume', 'difficulty', 'cpc'] as any
        );
        return { cached, missing };
      },
      
      async set(keywords: string[], market: string, data: any) {
        await ahrefs.cacheMetrics(
          keywords,
          market,
          ['volume', 'difficulty', 'cpc'] as any,
          data
        );
      },
      
      async invalidate(market: string) {
        return system.getIntegrations().invalidateMarket(market);
      },
    };
  }
  
  /**
   * Create Anthropic-optimized cache client
   */
  static createAnthropicCache(): {
    get: (prompt: string, model: string) => Promise<any>;
    set: (prompt: string, model: string, response: any) => Promise<void>;
    invalidate: () => Promise<number>;
  } {
    const system = getCacheSystem();
    if (!system) {
      throw new Error('Cache system not initialized');
    }
    
    const anthropic = system.getIntegrations().anthropic;
    
    return {
      async get(prompt: string, model: string) {
        return anthropic.getCachedResponse(prompt, model);
      },
      
      async set(prompt: string, model: string, response: any) {
        await anthropic.cacheResponse(prompt, model, response);
      },
      
      async invalidate() {
        return system.getIntegrations().invalidateProvider('anthropic');
      },
    };
  }
  
  /**
   * Create embedding-optimized cache client
   */
  static createEmbeddingCache(): {
    get: (texts: string[], model: string) => Promise<{ cached: Record<string, number[]>; missing: string[] }>;
    set: (texts: string[], model: string, embeddings: number[][]) => Promise<void>;
  } {
    const system = getCacheSystem();
    if (!system) {
      throw new Error('Cache system not initialized');
    }
    
    const embedding = system.getIntegrations().embedding;
    
    return {
      async get(texts: string[], model: string) {
        return embedding.getCachedEmbeddings(texts, model);
      },
      
      async set(texts: string[], model: string, embeddings: number[][]) {
        await embedding.cacheEmbeddings(texts, model, embeddings);
      },
    };
  }
}

/**
 * Utility for migrating from BaseApiClient to enhanced caching
 */
export class CacheMigrationUtils {
  /**
   * Migrate BaseApiClient cache to Redis
   */
  static async migrateBaseClientCache(
    baseClientCacheMap: Map<string, any>,
    targetNamespace: string = 'migrated'
  ): Promise<{
    migrated: number;
    failed: number;
    errors: string[];
  }> {
    const system = getCacheSystem();
    if (!system) {
      throw new Error('Cache system not initialized');
    }
    
    const cache = system.getCache();
    let migrated = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const [key, entry] of Array.from(baseClientCacheMap.entries())) {
      try {
        const ttl = entry.timestamp + entry.ttl - Date.now();
        if (ttl > 0) {
          await cache.set(key, entry.data, {
            ttl,
            namespace: targetNamespace,
            tags: ['migrated'],
          });
          migrated++;
        }
      } catch (error) {
        failed++;
        errors.push(`Failed to migrate key ${key}: ${(error as Error).message}`);
      }
    }
    
    return { migrated, failed, errors };
  }
  
  /**
   * Compare cache performance
   */
  static async compareCachePerformance(): Promise<{
    redis: { hits: number; misses: number; avgLatency: number };
    memory: { size: number; hitRate: number };
    recommendation: string;
  }> {
    const system = getCacheSystem();
    if (!system) {
      throw new Error('Cache system not initialized');
    }
    
    const stats = system.getCache().getStats();
    
    // Memory cache stats would come from BaseApiClient
    const memoryStats = {
      size: 0, // Would get from BaseApiClient
      hitRate: 0,
    };
    
    let recommendation = 'Continue using Redis cache';
    if (stats.hitRate < 0.5) {
      recommendation = 'Consider tuning TTL values or warming strategies';
    } else if (stats.operations.avgLatency > 100) {
      recommendation = 'Consider optimizing Redis configuration or network latency';
    }
    
    return {
      redis: {
        hits: stats.hits,
        misses: stats.misses,
        avgLatency: stats.operations.avgLatency,
      },
      memory: memoryStats,
      recommendation,
    };
  }
}

/**
 * Export convenience functions for common operations
 */
export const cache = {
  get: async <T>(key: string, options?: any) => {
    const system = getCacheSystem();
    return system?.getCache().get<T>(key, options) || null;
  },
  
  set: async <T>(key: string, value: T, options?: any) => {
    const system = getCacheSystem();
    return system?.getCache().set(key, value, options) || false;
  },
  
  delete: async (key: string, options?: any) => {
    const system = getCacheSystem();
    return system?.getCache().delete(key, options) || false;
  },
  
  clear: async (pattern?: string) => {
    const system = getCacheSystem();
    return system?.getCache().clear(pattern) || 0;
  },
  
  stats: () => {
    const system = getCacheSystem();
    return system?.getCache().getStats() || null;
  },
  
  health: async () => {
    const system = getCacheSystem();
    return system?.getHealth() || null;
  },
};
