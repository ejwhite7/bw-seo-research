import { CacheService, CacheOptions, CacheKeyBuilder } from './cache';
import { ApiResponse } from '../types/api';
import { AhrefsMetrics, AhrefsResponse } from '../types/ahrefs';
import { AnthropicResponse } from '../types/anthropic';

/**
 * Cache integration utilities for external API responses
 * Provides optimized caching strategies for different API types
 */

// TTL constants based on requirements
export const CACHE_TTL = {
  AHREFS_METRICS: 30 * 24 * 60 * 60 * 1000, // 30 days
  ANTHROPIC_RESPONSES: 24 * 60 * 60 * 1000,  // 24 hours
  EMBEDDINGS: 7 * 24 * 60 * 60 * 1000,       // 7 days
  SERP_DATA: 7 * 24 * 60 * 60 * 1000,        // 7 days
  CLUSTER_RESULTS: 24 * 60 * 60 * 1000,      // 24 hours
  SCORE_CALCULATIONS: 6 * 60 * 60 * 1000,    // 6 hours
  EXPORT_FILES: 1 * 60 * 60 * 1000,          // 1 hour
  PROCESSING_RESULTS: 24 * 60 * 60 * 1000,   // 24 hours
} as const;

/**
 * Ahrefs API caching integration
 */
export class AhrefsCacheService {
  constructor(private cache: CacheService) {}
  
  /**
   * Cache keyword metrics with deduplication
   */
  async cacheMetrics(
    keywords: string[],
    market: string,
    metrics: AhrefsMetrics[],
    data: Record<string, any>[]
  ): Promise<void> {
    const operations = data.map((item, index) => ({
      key: CacheKeyBuilder.ahrefs({
        keywords: [keywords[index]],
        market,
        metrics: metrics.map(m => m.toString())
      }),
      value: item,
      options: {
        ttl: CACHE_TTL.AHREFS_METRICS,
        tags: ['ahrefs', 'metrics', market],
        namespace: 'api',
        compress: true
      }
    }));
    
    await this.cache.setBatch(operations, { market });
  }
  
  /**
   * Get cached metrics for keywords
   */
  async getCachedMetrics(
    keywords: string[],
    market: string,
    metrics: AhrefsMetrics[]
  ): Promise<{ cached: Record<string, any>; missing: string[] }> {
    const operations = keywords.map(keyword => ({
      key: CacheKeyBuilder.ahrefs({
        keywords: [keyword],
        market,
        metrics: metrics.map(m => m.toString())
      }),
      options: {
        namespace: 'api'
      }
    }));
    
    const results = await this.cache.getBatch(operations, { market });
    
    const cached: Record<string, any> = {};
    const missing: string[] = [];
    
    results.forEach((result, index) => {
      if (result !== null) {
        cached[keywords[index]] = result;
      } else {
        missing.push(keywords[index]);
      }
    });
    
    return { cached, missing };
  }
  
  /**
   * Cache batch keyword metrics efficiently
   */
  async cacheBatchMetrics(
    batchResults: { keyword: string; data: any }[],
    market: string,
    metrics: AhrefsMetrics[]
  ): Promise<void> {
    const operations = batchResults.map(result => ({
      key: CacheKeyBuilder.ahrefs({
        keywords: [result.keyword],
        market,
        metrics: metrics.map(m => m.toString())
      }),
      value: result.data,
      options: {
        ttl: CACHE_TTL.AHREFS_METRICS,
        tags: ['ahrefs', 'batch-metrics', market],
        namespace: 'api',
        compress: true
      }
    }));
    
    await this.cache.setBatch(operations, { market });
  }
  
  /**
   * Cache SERP overview data
   */
  async cacheSerpData(
    keyword: string,
    market: string,
    serpData: any,
    device: string = 'desktop'
  ): Promise<void> {
    const key = CacheKeyBuilder.serp({ keyword, market, device });
    
    await this.cache.set(key, serpData, {
      ttl: CACHE_TTL.SERP_DATA,
      tags: ['ahrefs', 'serp', market],
      namespace: 'api',
      compress: true
    }, { market });
  }
  
  /**
   * Get cached SERP data
   */
  async getCachedSerpData(
    keyword: string,
    market: string,
    device: string = 'desktop'
  ): Promise<any | null> {
    const key = CacheKeyBuilder.serp({ keyword, market, device });
    
    return this.cache.get(key, {
      namespace: 'api'
    }, { market });
  }
  
  /**
   * Optimize cache for cost reduction
   */
  async optimizeForCost(): Promise<{
    deduplicatedKeys: number;
    compressedEntries: number;
    savedBytes: number;
  }> {
    // This would be implemented with Redis Lua scripts
    // for efficient deduplication and compression
    return {
      deduplicatedKeys: 0,
      compressedEntries: 0,
      savedBytes: 0
    };
  }
}

/**
 * Anthropic API caching integration
 */
export class AnthropicCacheService {
  constructor(private cache: CacheService) {}
  
  /**
   * Cache LLM responses with prompt hashing
   */
  async cacheResponse(
    prompt: string,
    model: string,
    response: any,
    temperature: number = 0.1
  ): Promise<void> {
    const key = CacheKeyBuilder.anthropic({ prompt, model, temperature });
    
    await this.cache.set(key, response, {
      ttl: CACHE_TTL.ANTHROPIC_RESPONSES,
      tags: ['anthropic', 'llm', model],
      namespace: 'api',
      compress: true
    });
  }
  
  /**
   * Get cached LLM response
   */
  async getCachedResponse(
    prompt: string,
    model: string,
    temperature: number = 0.1
  ): Promise<any | null> {
    const key = CacheKeyBuilder.anthropic({ prompt, model, temperature });
    
    return this.cache.get(key, {
      namespace: 'api'
    });
  }
  
  /**
   * Cache Dream 100 expansion results
   */
  async cacheDream100(
    seedKeywords: string[],
    market: string,
    expansionResult: string[]
  ): Promise<void> {
    const key = `dream100:${market}:${seedKeywords.sort().join(',')}`;
    
    await this.cache.set(key, expansionResult, {
      ttl: CACHE_TTL.PROCESSING_RESULTS,
      tags: ['dream100', 'expansion', market],
      namespace: 'processing',
      compress: true
    }, { market });
  }
  
  /**
   * Get cached Dream 100 results
   */
  async getCachedDream100(
    seedKeywords: string[],
    market: string
  ): Promise<string[] | null> {
    const key = `dream100:${market}:${seedKeywords.sort().join(',')}`;
    
    return this.cache.get(key, {
      namespace: 'processing'
    }, { market });
  }
  
  /**
   * Cache intent classification results
   */
  async cacheIntentClassification(
    keywords: string[],
    classifications: Array<{ keyword: string; intent: string; confidence: number }>
  ): Promise<void> {
    const operations = classifications.map(item => ({
      key: `intent:${item.keyword}`,
      value: { intent: item.intent, confidence: item.confidence },
      options: {
        ttl: CACHE_TTL.PROCESSING_RESULTS,
        tags: ['intent', 'classification'],
        namespace: 'processing'
      }
    }));
    
    await this.cache.setBatch(operations);
  }
  
  /**
   * Get cached intent classifications
   */
  async getCachedIntentClassifications(
    keywords: string[]
  ): Promise<{ cached: Record<string, { intent: string; confidence: number }>; missing: string[] }> {
    const operations = keywords.map(keyword => ({
      key: `intent:${keyword}`,
      options: { namespace: 'processing' }
    }));
    
    const results = await this.cache.getBatch(operations);
    
    const cached: Record<string, { intent: string; confidence: number }> = {};
    const missing: string[] = [];
    
    results.forEach((result, index) => {
      if (result !== null) {
        cached[keywords[index]] = result;
      } else {
        missing.push(keywords[index]);
      }
    });
    
    return { cached, missing };
  }
}

/**
 * Embedding cache service for semantic clustering
 */
export class EmbeddingCacheService {
  constructor(private cache: CacheService) {}
  
  /**
   * Cache computed embeddings
   */
  async cacheEmbeddings(
    texts: string[],
    model: string,
    embeddings: number[][]
  ): Promise<void> {
    const operations = texts.map((text, index) => ({
      key: CacheKeyBuilder.embedding({ text, model }),
      value: embeddings[index],
      options: {
        ttl: CACHE_TTL.EMBEDDINGS,
        tags: ['embeddings', model],
        namespace: 'ml',
        compress: true
      }
    }));
    
    await this.cache.setBatch(operations);
  }
  
  /**
   * Get cached embeddings
   */
  async getCachedEmbeddings(
    texts: string[],
    model: string
  ): Promise<{ cached: Record<string, number[]>; missing: string[] }> {
    const operations = texts.map(text => ({
      key: CacheKeyBuilder.embedding({ text, model }),
      options: { namespace: 'ml' }
    }));
    
    const results = await this.cache.getBatch(operations);
    
    const cached: Record<string, number[]> = {};
    const missing: string[] = [];
    
    results.forEach((result, index) => {
      if (result !== null) {
        cached[texts[index]] = result;
      } else {
        missing.push(texts[index]);
      }
    });
    
    return { cached, missing };
  }
}

/**
 * Clustering cache service
 */
export class ClusteringCacheService {
  constructor(private cache: CacheService) {}
  
  /**
   * Cache clustering results
   */
  async cacheClusterResults(
    keywords: string[],
    algorithm: string,
    threshold: number,
    clusters: any[]
  ): Promise<void> {
    const key = CacheKeyBuilder.cluster({ keywords, algorithm, threshold });
    
    await this.cache.set(key, clusters, {
      ttl: CACHE_TTL.CLUSTER_RESULTS,
      tags: ['clustering', algorithm],
      namespace: 'processing',
      compress: true
    });
  }
  
  /**
   * Get cached clustering results
   */
  async getCachedClusterResults(
    keywords: string[],
    algorithm: string,
    threshold: number
  ): Promise<any[] | null> {
    const key = CacheKeyBuilder.cluster({ keywords, algorithm, threshold });
    
    return this.cache.get(key, {
      namespace: 'processing'
    });
  }
}

/**
 * Scoring cache service
 */
export class ScoringCacheService {
  constructor(private cache: CacheService) {}
  
  /**
   * Cache score calculations
   */
  async cacheScores(
    keywords: string[],
    weights: Record<string, number>,
    stage: string,
    scores: Array<{ keyword: string; score: number; components: Record<string, number> }>
  ): Promise<void> {
    const operations = scores.map(item => ({
      key: CacheKeyBuilder.score({
        keywords: [item.keyword],
        weights,
        stage
      }),
      value: { score: item.score, components: item.components },
      options: {
        ttl: CACHE_TTL.SCORE_CALCULATIONS,
        tags: ['scoring', stage],
        namespace: 'processing'
      }
    }));
    
    await this.cache.setBatch(operations);
  }
  
  /**
   * Get cached scores
   */
  async getCachedScores(
    keywords: string[],
    weights: Record<string, number>,
    stage: string
  ): Promise<{ cached: Record<string, { score: number; components: Record<string, number> }>; missing: string[] }> {
    const operations = keywords.map(keyword => ({
      key: CacheKeyBuilder.score({
        keywords: [keyword],
        weights,
        stage
      }),
      options: { namespace: 'processing' }
    }));
    
    const results = await this.cache.getBatch(operations);
    
    const cached: Record<string, { score: number; components: Record<string, number> }> = {};
    const missing: string[] = [];
    
    results.forEach((result, index) => {
      if (result !== null) {
        cached[keywords[index]] = result;
      } else {
        missing.push(keywords[index]);
      }
    });
    
    return { cached, missing };
  }
}

/**
 * Export cache service
 */
export class ExportCacheService {
  constructor(private cache: CacheService) {}
  
  /**
   * Cache generated CSV exports
   */
  async cacheExport(
    exportId: string,
    data: Buffer | string,
    metadata: {
      filename: string;
      size: number;
      checksum: string;
      generatedAt: number;
    }
  ): Promise<void> {
    await this.cache.set(`export:${exportId}`, {
      data,
      metadata
    }, {
      ttl: CACHE_TTL.EXPORT_FILES,
      tags: ['export', 'csv'],
      namespace: 'files',
      compress: true
    });
  }
  
  /**
   * Get cached export
   */
  async getCachedExport(
    exportId: string
  ): Promise<{ data: Buffer | string; metadata: any } | null> {
    return this.cache.get(`export:${exportId}`, {
      namespace: 'files'
    });
  }
}

/**
 * Complete cache integration manager
 */
export class CacheIntegrationManager {
  public ahrefs: AhrefsCacheService;
  public anthropic: AnthropicCacheService;
  public embedding: EmbeddingCacheService;
  public clustering: ClusteringCacheService;
  public scoring: ScoringCacheService;
  public export: ExportCacheService;
  
  constructor(private cache: CacheService) {
    this.ahrefs = new AhrefsCacheService(cache);
    this.anthropic = new AnthropicCacheService(cache);
    this.embedding = new EmbeddingCacheService(cache);
    this.clustering = new ClusteringCacheService(cache);
    this.scoring = new ScoringCacheService(cache);
    this.export = new ExportCacheService(cache);
  }
  
  /**
   * Invalidate all caches for a specific market
   */
  async invalidateMarket(market: string): Promise<number> {
    return this.cache.invalidateByTags([market]);
  }
  
  /**
   * Invalidate caches by API provider
   */
  async invalidateProvider(provider: 'ahrefs' | 'anthropic'): Promise<number> {
    return this.cache.invalidateByTags([provider]);
  }
  
  /**
   * Invalidate caches by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    return this.cache.invalidateByTags(tags);
  }
  
  /**
   * Invalidate all processing caches
   */
  async invalidateProcessing(): Promise<number> {
    return this.cache.invalidateByTags([
      'dream100',
      'clustering',
      'scoring',
      'intent'
    ]);
  }
  
  /**
   * Get comprehensive cache statistics
   */
  async getCacheAnalytics(): Promise<{
    overall: any;
    byProvider: Record<string, any>;
    byType: Record<string, any>;
    recommendations: string[];
  }> {
    const stats = this.cache.getStats();
    const health = await this.cache.healthCheck();
    
    const recommendations: string[] = [];
    
    if (stats.hitRate < 0.7) {
      recommendations.push('Consider increasing TTL values for better hit rates');
    }
    
    if (stats.errors > stats.hits * 0.1) {
      recommendations.push('High error rate detected - check Redis connectivity');
    }
    
    if (health.stats.memory.used > 1024 * 1024 * 1024) { // 1GB
      recommendations.push('High memory usage - consider enabling compression or reducing TTLs');
    }
    
    return {
      overall: stats,
      byProvider: {
        ahrefs: { /* provider-specific stats */ },
        anthropic: { /* provider-specific stats */ }
      },
      byType: {
        metrics: { /* type-specific stats */ },
        embeddings: { /* type-specific stats */ },
        processing: { /* type-specific stats */ }
      },
      recommendations
    };
  }
  
  /**
   * Warm cache with common queries
   */
  async warmCommonCaches(): Promise<void> {
    // This would implement cache warming for frequently accessed data
    console.log('Warming cache with common queries...');
    
    // Example: Pre-cache common keywords for popular markets
    const commonKeywords = ['seo', 'marketing', 'advertising', 'business'];
    const popularMarkets = ['US', 'GB', 'CA', 'AU'];
    
    for (const market of popularMarkets) {
      // Pre-warm with placeholder data or trigger actual API calls
      // Implementation would depend on specific warming strategy
    }
  }
}

/**
 * Utility functions for cache optimization
 */
export class CacheOptimizer {
  static calculateOptimalTTL(
    accessPattern: { timestamp: number; hit: boolean }[],
    costPerRequest: number
  ): number {
    // Algorithm to calculate optimal TTL based on access patterns and costs
    // This is a simplified version - real implementation would be more sophisticated
    
    const recentAccesses = accessPattern.filter(
      p => p.timestamp > Date.now() - 24 * 60 * 60 * 1000
    );
    
    const hitRate = recentAccesses.filter(p => p.hit).length / recentAccesses.length;
    
    // Higher hit rates warrant longer TTLs
    if (hitRate > 0.8) {
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    } else if (hitRate > 0.6) {
      return 24 * 60 * 60 * 1000; // 24 hours
    } else {
      return 6 * 60 * 60 * 1000; // 6 hours
    }
  }
  
  static shouldCompress(dataSize: number, compressionRatio: number = 0.3): boolean {
    // Compress if data is larger than 1KB and compression saves significant space
    return dataSize > 1024 && compressionRatio < 0.7;
  }
  
  static generateCacheReport(
    stats: any
  ): {
    efficiency: number;
    costSavings: number;
    recommendations: string[];
  } {
    const efficiency = stats.hitRate;
    const costSavings = stats.hits * 0.001; // Estimated cost per API call
    
    const recommendations: string[] = [];
    
    if (efficiency < 0.5) {
      recommendations.push('Low cache efficiency - review TTL settings');
    }
    
    if (stats.memory.used > stats.memory.peak * 0.8) {
      recommendations.push('High memory usage - consider cache cleanup');
    }
    
    return {
      efficiency,
      costSavings,
      recommendations
    };
  }
}
