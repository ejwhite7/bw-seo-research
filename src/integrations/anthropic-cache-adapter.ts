import { AnthropicClient, DEFAULT_ANTHROPIC_MODEL } from './anthropic';
import { CacheFactory, getCacheSystem } from '../lib/cache-init';
import { CACHE_TTL } from '../lib/cache-integrations';
import { 
  AnthropicResponse, 
  AnthropicExpansionResult,
  AnthropicIntentResult,
  AnthropicTitleResult,
  AnthropicClusterResult,
  AnthropicCompetitorResult
} from '../types/anthropic';

/**
 * Cache-enhanced Anthropic client that integrates with the comprehensive Redis cache system
 */
export class CachedAnthropicClient {
  private client: AnthropicClient;
  private cache: ReturnType<typeof CacheFactory.createAnthropicCache> | null = null;
  
  constructor(client: AnthropicClient) {
    this.client = client;
    
    try {
      this.cache = CacheFactory.createAnthropicCache();
    } catch (error) {
      console.warn('Advanced caching not available for Anthropic, falling back to base client cache:', error);
    }
  }
  
  /**
   * Generate Dream 100 keywords with caching
   */
  async generateDream100(
    seedKeywords: string[],
    industry: string,
    targetAudience?: string,
    market: string = 'US'
  ): Promise<AnthropicResponse<AnthropicExpansionResult>> {
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return this.client.generateDream100(seedKeywords, industry, targetAudience, market);
    }
    
    const anthropic = cacheSystem.getIntegrations().anthropic;
    
    try {
      // Check cache first
      const cached = await anthropic.getCachedDream100(seedKeywords, market);
      
      if (cached) {
        console.log(`Dream 100 for [${seedKeywords.join(', ')}] served from cache`);
        // Transform cached data to proper structure
        const expansionResult: AnthropicExpansionResult = Array.isArray(cached) 
          ? {
              keywords: cached.map((kw: string) => ({ keyword: kw, intent: 'informational' as const, relevance_score: 0.8, reasoning: 'From cache' })),
              total_generated: cached.length,
              processing_time: 0,
              model_used: 'cached'
            }
          : cached as AnthropicExpansionResult;
        return {
          data: expansionResult,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            model: 'cached',
            cost_estimate: 0,
            request_id: `cached_${Date.now()}`
          },
          model: 'cached',
          finish_reason: 'cached',
          request_id: `cached_${Date.now()}`,
          processing_time: 0
        };
      }
      
      // Generate new Dream 100
      console.log(`Generating Dream 100 for [${seedKeywords.join(', ')}] from Anthropic API`);
      const response = await this.client.generateDream100(seedKeywords, industry, targetAudience, market);
      
      if (response.data && response.data.keywords) {
        // Cache the result
        // Cache the keywords array for backwards compatibility
        const keywordsArray = response.data.keywords.map(k => k.keyword);
        await anthropic.cacheDream100(seedKeywords, market, keywordsArray);
        console.log(`Cached Dream 100 for [${seedKeywords.join(', ')}]`);
      }
      
      return response;
    } catch (error) {
      console.error('Cached Dream 100 generation failed:', error);
      return this.client.generateDream100(seedKeywords, industry, targetAudience, market);
    }
  }
  
  /**
   * Classify keyword intents with caching
   */
  async classifyKeywordIntents(
    keywords: string[]
  ): Promise<AnthropicResponse<AnthropicIntentResult[]>> {
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return this.client.classifyKeywordIntents(keywords);
    }
    
    const anthropic = cacheSystem.getIntegrations().anthropic;
    
    try {
      // Check cache for all keywords
      const { cached, missing } = await anthropic.getCachedIntentClassifications(keywords);
      
      const results: AnthropicIntentResult[] = [];
      let fromCache = 0;
      let fromApi = 0;
      
      // Add cached results
      for (const keyword of keywords) {
        if (cached[keyword]) {
          const cachedData = cached[keyword];
          // Ensure cached data has all required properties
          const intentResult: AnthropicIntentResult = {
            keyword,
            intent: (cachedData.intent || 'informational') as 'informational' | 'commercial' | 'transactional' | 'navigational',
            confidence: cachedData.confidence || 0.8,
            reasoning: (cachedData as any).reasoning || 'From cache',
            suggested_content_type: (cachedData as any).suggested_content_type || ['blog_post']
          };
          results.push(intentResult);
          fromCache++;
        }
      }
      
      // Classify missing keywords
      if (missing.length > 0) {
        console.log(`Classifying ${missing.length} keyword intents from Anthropic API, ${fromCache} from cache`);
        
        try {
          const apiResponse = await this.client.classifyKeywordIntents(missing);
          
          if (apiResponse.data && Array.isArray(apiResponse.data)) {
            // Add API results
            // Ensure API results have proper structure
            const processedResults: AnthropicIntentResult[] = apiResponse.data.map(item => ({
              keyword: item.keyword,
              intent: item.intent,
              confidence: item.confidence,
              reasoning: item.reasoning || 'From API',
              suggested_content_type: item.suggested_content_type || ['blog_post']
            }));
            results.push(...processedResults);
            fromApi = apiResponse.data.length;
            
            // Cache the new classifications
            await anthropic.cacheIntentClassification(missing, processedResults);
            
            console.log(`Cached ${apiResponse.data.length} intent classifications`);
          } else {
            // If API call fails, return cached results only
            console.warn('Intent classification API call failed, returning cached results only');
            if (fromCache === 0) {
              // Create proper error response structure
              return {
                data: [],
                usage: {
                  input_tokens: 0,
                  output_tokens: 0,
                  model: 'error',
                  cost_estimate: 0,
                  request_id: `error_${Date.now()}`
                },
                model: 'error',
                finish_reason: 'error',
                request_id: `error_${Date.now()}`,
                processing_time: 0
              };
            }
          }
        } catch (error) {
          console.error('Intent classification API call failed:', error);
          
          if (fromCache === 0) {
            throw error; // No cached data available
          }
          
          console.warn('Returning partial results from cache due to API failure');
        }
      }
      
      return {
        data: results,
        usage: {
          input_tokens: fromApi * 50,
          output_tokens: fromApi * 20,
          model: DEFAULT_ANTHROPIC_MODEL,
          cost_estimate: fromApi * 0.001,
          request_id: `intent_classification_${Date.now()}`
        },
        model: DEFAULT_ANTHROPIC_MODEL,
        finish_reason: 'complete',
        request_id: `intent_classification_${Date.now()}`,
        processing_time: 0 // Cached response has no processing time
      };
    } catch (error) {
      console.error('Cached intent classification request failed:', error);
      return this.client.classifyKeywordIntents(keywords);
    }
  }
  
  /**
   * Generate content titles with caching
   */
  async generateContentTitles(
    keywords: string[],
    intent: string,
    count: number = 5
  ): Promise<AnthropicResponse<AnthropicTitleResult>> {
    if (!this.cache) {
      return this.client.generateContentTitles(keywords, intent, count);
    }
    
    try {
      // Create cache key based on keywords, intent, and count
      const cacheKey = `titles:${intent}:${count}:${keywords.sort().join(',')}`;
      const cached = await this.cache.get(cacheKey, DEFAULT_ANTHROPIC_MODEL);
      
      if (cached) {
        console.log(`Content titles for [${keywords.join(', ')}] served from cache`);
        return {
          data: cached,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            model: 'cached',
            cost_estimate: 0,
            request_id: `cached_${Date.now()}`
          },
          model: 'cached',
          finish_reason: 'cached',
          request_id: `cached_${Date.now()}`,
          processing_time: 0
        };
      }
      
      // Generate new titles
      const response = await this.client.generateContentTitles(keywords, intent, count);
      
      if (response.data) {
        // Cache the result
        await this.cache.set(cacheKey, DEFAULT_ANTHROPIC_MODEL, response.data);
        console.log(`Cached content titles for [${keywords.join(', ')}]`);
      }
      
      return response;
    } catch (error) {
      console.error('Cached title generation request failed:', error);
      return this.client.generateContentTitles(keywords, intent, count);
    }
  }
  
  /**
   * Expand keyword variations with caching
   */
  async expandKeywordVariations(
    baseKeywords: string[],
    variationType: 'tier2' | 'tier3',
    count: number = 10,
    market: string = 'US'
  ): Promise<AnthropicResponse<AnthropicExpansionResult>> {
    if (!this.cache) {
      return this.client.expandKeywordVariations(baseKeywords, variationType, count, market);
    }
    
    try {
      // Create cache key
      const cacheKey = `expand:${variationType}:${count}:${market}:${baseKeywords.sort().join(',')}`;
      const cached = await this.cache.get(cacheKey, DEFAULT_ANTHROPIC_MODEL);
      
      if (cached) {
        console.log(`Keyword variations for [${baseKeywords.join(', ')}] served from cache`);
        return {
          data: cached,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            model: 'cached',
            cost_estimate: 0,
            request_id: `cached_${Date.now()}`
          },
          model: 'cached',
          finish_reason: 'cached',
          request_id: `cached_${Date.now()}`,
          processing_time: 0
        };
      }
      
      // Generate new variations
      const response = await this.client.expandKeywordVariations(baseKeywords, variationType, count, market);
      
      if (response.data) {
        // Cache the result
        await this.cache.set(cacheKey, DEFAULT_ANTHROPIC_MODEL, response.data);
        console.log(`Cached keyword variations for [${baseKeywords.join(', ')}]`);
      }
      
      return response;
    } catch (error) {
      console.error('Cached keyword expansion request failed:', error);
      return this.client.expandKeywordVariations(baseKeywords, variationType, count, market);
    }
  }
  
  /**
   * Process prompts with automatic caching
   */
  async processPrompt(
    prompt: string,
    model: string = DEFAULT_ANTHROPIC_MODEL,
    temperature: number = 0.1,
    maxTokens: number = 1000
  ): Promise<AnthropicResponse<string>> {
    if (!this.cache) {
      return this.client.processPrompt(prompt, model, temperature, maxTokens);
    }
    
    try {
      // Check cache
      const cached = await this.cache.get(prompt, model);
      
      if (cached) {
        return {
          data: cached,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            model,
            cost_estimate: 0,
            request_id: `cached_${Date.now()}`
          },
          model,
          finish_reason: 'cached',
          request_id: `cached_${Date.now()}`,
          processing_time: 0
        };
      }
      
      // Process new prompt
      const response = await this.client.processPrompt(prompt, model, temperature, maxTokens);
      
      if (response.data) {
        // Cache the result
        await this.cache.set(prompt, model, response.data);
      }
      
      return response;
    } catch (error) {
      console.error('Cached prompt processing failed:', error);
      return this.client.processPrompt(prompt, model, temperature, maxTokens);
    }
  }
  
  /**
   * Invalidate cache
   */
  async invalidateCache(options: {
    all?: boolean;
    prompts?: string[];
  }): Promise<number> {
    if (!this.cache) {
      console.warn('Cache not available for invalidation');
      return 0;
    }
    
    try {
      return await this.cache.invalidate();
    } catch (error) {
      console.error('Cache invalidation failed:', error);
      return 0;
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    enabled: boolean;
    stats?: any;
    recommendations?: string[];
  } {
    if (!this.cache) {
      return { enabled: false };
    }
    
    const cacheSystem = getCacheSystem();
    if (!cacheSystem) {
      return { enabled: false };
    }
    
    const stats = cacheSystem.getCache().getStats();
    
    const recommendations: string[] = [];
    if (stats.hitRate < 0.7) {
      recommendations.push('Consider warming cache with common prompts');
    }
    
    return {
      enabled: true,
      stats: {
        hitRate: stats.hitRate,
        avgResponseTime: stats.operations.avgLatency,
        tokensUsed: 0, // Would track separately
        costSaved: stats.hits * 0.01, // Estimated
      },
      recommendations,
    };
  }
  
  /**
   * Proxy other methods to original client
   */
  async createCompletionStream(
    prompt: string,
    options?: any
  ): Promise<any> {
    // Streaming responses typically aren't cached
    return this.client.createCompletionStream(prompt, options);
  }
  
  async createChatCompletion(
    messages: any[],
    options?: any
  ): Promise<AnthropicResponse<any>> {
    // Could add caching for chat completions too
    return this.client.createChatCompletion(messages, options);
  }
  
  // Health check method
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: any;
    circuitBreaker: any;
    rateLimit: any;
    cache: any;
  }> {
    try {
      return await this.client.healthCheck();
    } catch (error) {
      return {
        healthy: false,
        issues: [(error as Error).message],
        metrics: null,
        circuitBreaker: null,
        rateLimit: null,
        cache: null
      };
    }
  }
  
  // Usage tracking method
  getUsage(): { tokens: number; cost: number } {
    return this.client.getUsage();
  }
}

/**
 * Factory function to create cached Anthropic client
 */
export function createCachedAnthropicClient(originalClient: AnthropicClient): CachedAnthropicClient {
  return new CachedAnthropicClient(originalClient);
}

/**
 * Performance testing and migration utilities
 */
export class AnthropicCacheMigration {
  /**
   * Performance comparison test
   */
  static async performanceTest(
    cachedClient: CachedAnthropicClient,
    originalClient: AnthropicClient,
    testPrompts: string[]
  ): Promise<{
    cached: { time: number; cost: number; fromCache: number };
    uncached: { time: number; cost: number };
    improvement: { timeReduction: number; costSavings: number };
  }> {
    console.log('Starting Anthropic caching performance test...');
    
    // Test cached client (run twice to show cache benefit)
    const cachedStart = Date.now();
    await Promise.all(
      testPrompts.map(prompt => 
        cachedClient.processPrompt(prompt, 'claude-3-sonnet-20240229', 0.1, 100)
      )
    );
    const cachedTime = Date.now() - cachedStart;
    
    // Run again to hit cache
    const cachedStart2 = Date.now();
    const cachedResponses = await Promise.all(
      testPrompts.map(prompt => 
        cachedClient.processPrompt(prompt, 'claude-3-sonnet-20240229', 0.1, 100)
      )
    );
    const cachedTime2 = Date.now() - cachedStart2;
    
    const fromCache = cachedResponses.filter(r => r.usage?.input_tokens === 0).length;
    
    // Test original client (limited to avoid API costs)
    const uncachedStart = Date.now();
    await originalClient.processPrompt(
      testPrompts[0],
      'claude-3-sonnet-20240229',
      0.1,
      100
    );
    const uncachedTime = Date.now() - uncachedStart;
    
    const results = {
      cached: {
        time: cachedTime2, // Second run with cache hits
        cost: (testPrompts.length - fromCache) * 0.01,
        fromCache,
      },
      uncached: {
        time: uncachedTime * testPrompts.length, // Estimated
        cost: testPrompts.length * 0.01,
      },
      improvement: {
        timeReduction: ((uncachedTime - cachedTime2) / uncachedTime) * 100,
        costSavings: fromCache * 0.01,
      },
    };
    
    console.log('Anthropic performance test results:', results);
    return results;
  }
  
  /**
   * Cache warming for common prompts
   */
  static async warmCommonPrompts(
    client: CachedAnthropicClient,
    industry: string
  ): Promise<number> {
    const commonPrompts = [
      `Generate 10 keyword ideas for ${industry} business`,
      `Classify the intent of keywords related to ${industry}`,
      `Create content titles for ${industry} marketing`,
      `Expand keyword variations for ${industry} services`,
    ];
    
    let warmed = 0;
    for (const prompt of commonPrompts) {
      try {
        await client.processPrompt(prompt);
        warmed++;
      } catch (error) {
        console.warn(`Failed to warm prompt: ${prompt}`, error);
      }
    }
    
    return warmed;
  }
}
