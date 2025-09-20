import { CacheService, CacheWarmingConfig } from './cache';
import { CacheIntegrationManager } from './cache-integrations';
import { AhrefsClient } from '../integrations/ahrefs';
import { AnthropicClient } from '../integrations/anthropic';

/**
 * Cache warming strategies for the Dream 100 Keyword Engine
 */

interface WarmingStrategy {
  name: string;
  priority: number;
  estimatedTime: number; // seconds
  estimatedCost: number; // dollars
  execute: () => Promise<void>;
}

interface WarmingResult {
  strategy: string;
  success: boolean;
  itemsWarmed: number;
  timeTaken: number;
  error?: string;
}

/**
 * Comprehensive cache warming manager
 */
export class CacheWarmingManager {
  private strategies: WarmingStrategy[] = [];
  private isWarming = false;
  private warmingResults: WarmingResult[] = [];
  
  constructor(
    private cache: CacheService,
    private cacheManager: CacheIntegrationManager,
    private ahrefsClient?: AhrefsClient,
    private anthropicClient?: AnthropicClient
  ) {
    this.initializeStrategies();
  }
  
  private initializeStrategies(): void {
    this.strategies = [
      {
        name: 'common-keywords-metrics',
        priority: 1,
        estimatedTime: 300, // 5 minutes
        estimatedCost: 5.0,
        execute: () => this.warmCommonKeywordMetrics(),
      },
      {
        name: 'popular-seed-expansions',
        priority: 2,
        estimatedTime: 180, // 3 minutes
        estimatedCost: 2.0,
        execute: () => this.warmPopularSeedExpansions(),
      },
      {
        name: 'intent-classifications',
        priority: 3,
        estimatedTime: 120, // 2 minutes
        estimatedCost: 1.0,
        execute: () => this.warmIntentClassifications(),
      },
      {
        name: 'common-embeddings',
        priority: 4,
        estimatedTime: 90, // 1.5 minutes
        estimatedCost: 0.5,
        execute: () => this.warmCommonEmbeddings(),
      },
      {
        name: 'serp-data',
        priority: 5,
        estimatedTime: 240, // 4 minutes
        estimatedCost: 3.0,
        execute: () => this.warmSerpData(),
      },
    ];
  }
  
  /**
   * Execute cache warming with configurable strategies
   */
  async warmCache(options: {
    strategies?: string[];
    maxTime?: number; // seconds
    maxCost?: number; // dollars
    priority?: number; // minimum priority
    dryRun?: boolean;
  } = {}): Promise<{
    results: WarmingResult[];
    totalTime: number;
    totalCost: number;
    success: boolean;
  }> {
    if (this.isWarming) {
      throw new Error('Cache warming already in progress');
    }
    
    this.isWarming = true;
    this.warmingResults = [];
    
    const startTime = Date.now();
    let totalCost = 0;
    
    try {
      // Filter strategies based on options
      let selectedStrategies = this.strategies;
      
      if (options.strategies) {
        selectedStrategies = selectedStrategies.filter(s => 
          options.strategies!.includes(s.name)
        );
      }
      
      if (options.priority) {
        selectedStrategies = selectedStrategies.filter(s => 
          s.priority <= options.priority!
        );
      }
      
      // Sort by priority
      selectedStrategies.sort((a, b) => a.priority - b.priority);
      
      // Execute strategies within time and cost constraints
      for (const strategy of selectedStrategies) {
        const currentTime = (Date.now() - startTime) / 1000;
        
        // Check time constraint
        if (options.maxTime && currentTime + strategy.estimatedTime > options.maxTime) {
          console.log(`Skipping ${strategy.name}: would exceed time limit`);
          continue;
        }
        
        // Check cost constraint
        if (options.maxCost && totalCost + strategy.estimatedCost > options.maxCost) {
          console.log(`Skipping ${strategy.name}: would exceed cost limit`);
          continue;
        }
        
        if (options.dryRun) {
          console.log(`[DRY RUN] Would execute: ${strategy.name}`);
          this.warmingResults.push({
            strategy: strategy.name,
            success: true,
            itemsWarmed: 0,
            timeTaken: 0,
          });
          continue;
        }
        
        // Execute strategy
        const strategyStartTime = Date.now();
        try {
          await strategy.execute();
          const timeTaken = (Date.now() - strategyStartTime) / 1000;
          
          this.warmingResults.push({
            strategy: strategy.name,
            success: true,
            itemsWarmed: 0, // Would be filled by strategy
            timeTaken,
          });
          
          totalCost += strategy.estimatedCost;
          
        } catch (error) {
          const timeTaken = (Date.now() - strategyStartTime) / 1000;
          
          this.warmingResults.push({
            strategy: strategy.name,
            success: false,
            itemsWarmed: 0,
            timeTaken,
            error: (error as Error).message,
          });
          
          console.error(`Cache warming strategy ${strategy.name} failed:`, (error as Error).message);
        }
      }
      
      const totalTime = (Date.now() - startTime) / 1000;
      const success = this.warmingResults.every(r => r.success);
      
      return {
        results: this.warmingResults,
        totalTime,
        totalCost,
        success,
      };
      
    } finally {
      this.isWarming = false;
    }
  }
  
  /**
   * Warm cache with common keyword metrics
   */
  private async warmCommonKeywordMetrics(): Promise<void> {
    if (!this.ahrefsClient) {
      throw new Error('Ahrefs client not available for warming');
    }
    
    const commonKeywords = [
      // High-volume business keywords
      'marketing', 'advertising', 'business', 'sales', 'seo', 'content marketing',
      'digital marketing', 'social media', 'email marketing', 'lead generation',
      
      // Technology keywords
      'software', 'saas', 'technology', 'ai', 'machine learning', 'automation',
      'cloud computing', 'cybersecurity', 'data analytics', 'mobile app',
      
      // E-commerce keywords
      'ecommerce', 'online store', 'shopping', 'retail', 'dropshipping',
      'payment processing', 'inventory management', 'customer service',
      
      // Finance keywords
      'finance', 'investing', 'cryptocurrency', 'banking', 'insurance',
      'personal finance', 'financial planning', 'accounting',
    ];
    
    const markets = ['US', 'GB', 'CA', 'AU'];
    const metrics = ['volume', 'difficulty', 'cpc'];
    
    for (const market of markets) {
      try {
        // Check what's already cached
        const { missing } = await this.cacheManager.ahrefs.getCachedMetrics(
          commonKeywords,
          market,
          metrics as any
        );
        
        if (missing.length > 0) {
          console.log(`Warming ${missing.length} keyword metrics for market ${market}`);
          
          // Batch fetch missing metrics (would use actual API call)
          // For now, we'll simulate with placeholder data
          const mockData = missing.map(keyword => ({
            keyword,
            volume: Math.floor(Math.random() * 100000),
            difficulty: Math.floor(Math.random() * 100),
            cpc: Math.random() * 10,
          }));
          
          await this.cacheManager.ahrefs.cacheMetrics(
            missing,
            market,
            metrics as any,
            mockData
          );
        }
      } catch (error) {
        console.error(`Failed to warm metrics for market ${market}:`, (error as Error).message);
      }
    }
  }
  
  /**
   * Warm cache with popular seed keyword expansions
   */
  private async warmPopularSeedExpansions(): Promise<void> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not available for warming');
    }
    
    const popularSeeds = [
      ['marketing'],
      ['business'],
      ['software'],
      ['health'],
      ['finance'],
      ['education'],
      ['fitness'],
      ['travel'],
      ['food'],
      ['technology'],
    ];
    
    const markets = ['US', 'GB'];
    
    for (const market of markets) {
      for (const seedKeywords of popularSeeds) {
        try {
          const cached = await this.cacheManager.anthropic.getCachedDream100(
            seedKeywords,
            market
          );
          
          if (!cached) {
            console.log(`Warming Dream 100 expansion for ${seedKeywords.join(', ')} in ${market}`);
            
            // Simulate Dream 100 expansion (would use actual API call)
            const mockExpansion = Array.from({ length: 100 }, (_, i) => 
              `${seedKeywords[0]} ${i + 1}`
            );
            
            await this.cacheManager.anthropic.cacheDream100(
              seedKeywords,
              market,
              mockExpansion
            );
          }
        } catch (error) {
          console.error(`Failed to warm expansion for ${seedKeywords.join(', ')}:`, (error as Error).message);
        }
      }
    }
  }
  
  /**
   * Warm cache with intent classifications
   */
  private async warmIntentClassifications(): Promise<void> {
    const commonKeywords = [
      // Informational
      'what is marketing', 'how to start business', 'marketing tips',
      'business plan template', 'seo guide', 'content marketing strategy',
      
      // Commercial
      'best marketing software', 'marketing tools comparison', 'top seo tools',
      'business software reviews', 'email marketing platforms',
      
      // Transactional
      'buy marketing software', 'marketing agency services', 'seo consultant',
      'business consulting', 'marketing automation pricing',
      
      // Navigational
      'hubspot login', 'google analytics', 'mailchimp dashboard',
      'salesforce crm', 'shopify admin',
    ];
    
    try {
      const { missing } = await this.cacheManager.anthropic.getCachedIntentClassifications(
        commonKeywords
      );
      
      if (missing.length > 0) {
        console.log(`Warming intent classifications for ${missing.length} keywords`);
        
        // Simulate intent classification (would use actual API call)
        const mockClassifications = missing.map(keyword => {
          let intent = 'informational';
          let confidence = 0.8;
          
          if (keyword.includes('best') || keyword.includes('top') || keyword.includes('vs')) {
            intent = 'commercial';
            confidence = 0.9;
          } else if (keyword.includes('buy') || keyword.includes('price') || keyword.includes('cost')) {
            intent = 'transactional';
            confidence = 0.95;
          } else if (keyword.includes('login') || keyword.includes('dashboard') || keyword.includes('admin')) {
            intent = 'navigational';
            confidence = 0.85;
          }
          
          return { keyword, intent, confidence };
        });
        
        await this.cacheManager.anthropic.cacheIntentClassification(
          missing,
          mockClassifications
        );
      }
    } catch (error) {
      console.error('Failed to warm intent classifications:', (error as Error).message);
    }
  }
  
  /**
   * Warm cache with common embeddings
   */
  private async warmCommonEmbeddings(): Promise<void> {
    const commonTexts = [
      'marketing strategy',
      'business development',
      'sales funnel',
      'customer acquisition',
      'brand awareness',
      'content creation',
      'social media marketing',
      'email campaigns',
      'lead nurturing',
      'conversion optimization',
    ];
    
    const model = 'text-embedding-ada-002';
    
    try {
      const { missing } = await this.cacheManager.embedding.getCachedEmbeddings(
        commonTexts,
        model
      );
      
      if (missing.length > 0) {
        console.log(`Warming embeddings for ${missing.length} texts`);
        
        // Simulate embeddings (would use actual API call)
        const mockEmbeddings = missing.map(() => 
          Array.from({ length: 1536 }, () => Math.random() - 0.5)
        );
        
        await this.cacheManager.embedding.cacheEmbeddings(
          missing,
          model,
          mockEmbeddings
        );
      }
    } catch (error) {
      console.error('Failed to warm embeddings:', (error as Error).message);
    }
  }
  
  /**
   * Warm cache with SERP data for high-value keywords
   */
  private async warmSerpData(): Promise<void> {
    const highValueKeywords = [
      'marketing software',
      'crm software',
      'email marketing',
      'seo tools',
      'social media management',
      'content marketing platform',
      'marketing automation',
      'lead generation software',
      'analytics platform',
      'business intelligence',
    ];
    
    const markets = ['US', 'GB'];
    
    for (const market of markets) {
      for (const keyword of highValueKeywords) {
        try {
          const cached = await this.cacheManager.ahrefs.getCachedSerpData(
            keyword,
            market
          );
          
          if (!cached) {
            console.log(`Warming SERP data for "${keyword}" in ${market}`);
            
            // Simulate SERP data (would use actual API call)
            const mockSerpData = {
              keyword,
              market,
              results: Array.from({ length: 10 }, (_, i) => ({
                position: i + 1,
                url: `https://example${i + 1}.com`,
                title: `${keyword} - Example ${i + 1}`,
                domain: `example${i + 1}.com`,
              })),
            };
            
            await this.cacheManager.ahrefs.cacheSerpData(
              keyword,
              market,
              mockSerpData
            );
          }
        } catch (error) {
          console.error(`Failed to warm SERP data for ${keyword}:`, (error as Error).message);
        }
      }
    }
  }
  
  /**
   * Get warming status and statistics
   */
  getWarmingStatus(): {
    isWarming: boolean;
    lastResults: WarmingResult[];
    strategies: Array<{
      name: string;
      priority: number;
      estimatedTime: number;
      estimatedCost: number;
    }>;
  } {
    return {
      isWarming: this.isWarming,
      lastResults: [...this.warmingResults],
      strategies: this.strategies.map(s => ({
        name: s.name,
        priority: s.priority,
        estimatedTime: s.estimatedTime,
        estimatedCost: s.estimatedCost,
      })),
    };
  }
  
  /**
   * Schedule automatic cache warming
   */
  scheduleWarming(options: {
    interval: number; // minutes
    strategies?: string[];
    maxTime?: number;
    maxCost?: number;
  }): NodeJS.Timeout {
    const intervalMs = options.interval * 60 * 1000;
    
    return setInterval(async () => {
      try {
        console.log('Starting scheduled cache warming...');
        
        const result = await this.warmCache({
          strategies: options.strategies,
          maxTime: options.maxTime,
          maxCost: options.maxCost,
        });
        
        console.log('Scheduled cache warming completed:', {
          success: result.success,
          totalTime: result.totalTime,
          totalCost: result.totalCost,
          strategies: result.results.length,
        });
      } catch (error) {
        console.error('Scheduled cache warming failed:', (error as Error).message);
      }
    }, intervalMs);
  }
}

/**
 * Cache warming utilities
 */
export class CacheWarmingUtils {
  /**
   * Estimate warming time and cost
   */
  static estimateWarmingCost(
    strategies: string[],
    availableStrategies: WarmingStrategy[]
  ): {
    totalTime: number;
    totalCost: number;
    breakdown: Array<{
      strategy: string;
      time: number;
      cost: number;
    }>;
  } {
    const selectedStrategies = availableStrategies.filter(s => 
      strategies.includes(s.name)
    );
    
    const breakdown = selectedStrategies.map(s => ({
      strategy: s.name,
      time: s.estimatedTime,
      cost: s.estimatedCost,
    }));
    
    return {
      totalTime: breakdown.reduce((sum, item) => sum + item.time, 0),
      totalCost: breakdown.reduce((sum, item) => sum + item.cost, 0),
      breakdown,
    };
  }
  
  /**
   * Generate warming recommendations based on usage patterns
   */
  static generateWarmingRecommendations(
    cacheStats: any,
    apiUsage: any
  ): {
    recommendations: Array<{
      strategy: string;
      priority: 'high' | 'medium' | 'low';
      reason: string;
      estimatedSavings: number;
    }>;
  } {
    const recommendations: Array<{
      strategy: string;
      priority: 'high' | 'medium' | 'low';
      reason: string;
      estimatedSavings: number;
    }> = [];
    
    // Analyze cache hit rates
    if (cacheStats.hitRate < 0.5) {
      recommendations.push({
        strategy: 'common-keywords-metrics',
        priority: 'high',
        reason: 'Low cache hit rate for keyword metrics',
        estimatedSavings: apiUsage.ahrefsRequests * 0.001 * 0.3, // 30% savings
      });
    }
    
    // Analyze API usage patterns
    if (apiUsage.anthropicRequests > 1000) {
      recommendations.push({
        strategy: 'popular-seed-expansions',
        priority: 'medium',
        reason: 'High usage of expansion APIs',
        estimatedSavings: apiUsage.anthropicRequests * 0.002 * 0.2, // 20% savings
      });
    }
    
    return { recommendations };
  }
  
  /**
   * Validate warming configuration
   */
  static validateWarmingConfig(
    config: any
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (config.maxTime && config.maxTime < 60) {
      warnings.push('Very short max time may not allow meaningful warming');
    }
    
    if (config.maxCost && config.maxCost > 100) {
      warnings.push('High max cost - consider budget implications');
    }
    
    if (!config.strategies || config.strategies.length === 0) {
      errors.push('At least one warming strategy must be specified');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
