import { BaseApiClient } from './base-client';
import { 
  AhrefsKeywordData,
  AhrefsKeywordOverview,
  AhrefsKeywordIdeas,
  AhrefsCompetitorKeywords,
  AhrefsKeywordRequest,
  AhrefsCompetitorRequest,
  AhrefsKeywordIdeasRequest,
  AhrefsResponse,
  AhrefsKeywordBatch,
  AhrefsGenericResponse
} from '../types/ahrefs';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

export class AhrefsClient extends BaseApiClient {
  private static instance: AhrefsClient | null = null;
  private costPerRequest = 0.002; // $0.002 per keyword lookup
  
  constructor(apiKey: string, redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: 'https://apiv2.ahrefs.com',
      apiKey,
      timeout: 30000,
      retries: 3,
      rateLimiter: {
        capacity: 100,
        refillRate: 20,
        refillPeriod: 60000 // 1 minute
      },
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeout: 60000,
        monitoringPeriod: 300000,
        expectedFailureRate: 0.1
      },
      cache: {
        ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxSize: 10000
      }
    };
    
    super(config, 'ahrefs');
    
    // Override with factory-created instances for better Redis support
    this.rateLimiter = RateLimiterFactory.createAhrefsLimiter(redis);
    this.circuitBreaker = CircuitBreakerFactory.createAhrefsBreaker();
  }
  
  public static getInstance(apiKey?: string, redis?: any): AhrefsClient {
    if (!this.instance) {
      if (!apiKey) {
        throw new Error('API key is required to create AhrefsClient instance');
      }
      this.instance = new AhrefsClient(apiKey, redis);
    }
    return this.instance;
  }
  
  protected getDefaultHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Olli-Social-Keyword-Engine/1.0',
      'X-Client-Version': '1.0.0'
    };
  }
  
  protected async executeRequest<T>(
    endpoint: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: any;
      timeout: number;
    }
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);
    
    try {
      const url = `${this.config.baseUrl}${endpoint}`;
      
      const fetchOptions: RequestInit = {
        method: options.method,
        headers: options.headers,
        signal: controller.signal
      };
      
      if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }
      
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);
      
      // Handle Ahrefs-specific error responses
      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Ahrefs API error: ${response.status} ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorBody);
          errorMessage = errorData.error || errorData.message || errorMessage;
          
          // Check for quota issues
          if (errorData.error_code === 'QUOTA_EXCEEDED' || response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const rateLimitInfo = {
              limit: parseInt(response.headers.get('x-ratelimit-limit') || '0'),
              remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '0'),
              reset: parseInt(response.headers.get('x-ratelimit-reset') || '0'),
              retryAfter: retryAfter ? parseInt(retryAfter) : 60
            };
            
            throw (ErrorHandler as any).createRateLimitError(rateLimitInfo, 'ahrefs', errorMessage);
          }
          
        } catch (parseError) {
          // If we can't parse the error, use the original message
          console.warn('Failed to parse error response:', parseError);
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Extract Ahrefs-specific metadata
      const quotaInfo = {
        rowsLeft: parseInt(response.headers.get('x-quota-rows-left') || '0'),
        rowsLimit: parseInt(response.headers.get('x-quota-rows-limit') || '0'),
        resetAt: response.headers.get('x-quota-reset') || ''
      };
      
      return {
        data: data as T,
        success: true,
        metadata: {
          requestId: `ahrefs_${Date.now()}`,
          timestamp: Date.now(),
          cached: false,
          quota: quotaInfo
        }
      } as ApiResponse<T>;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if ((error as Error).name === 'AbortError') {
        throw (ErrorHandler as any).createTimeoutError(options.timeout, 'ahrefs');
      }
      
      throw error as Error;
    }
  }
  
  /**
   * Get keyword metrics for multiple keywords
   */
  async getKeywordMetrics(
    request: AhrefsKeywordRequest
  ): Promise<ApiResponse<AhrefsKeywordData[]>> {
    const { keywords, country = 'US', mode = 'exact', include_serp = false } = request;
    
    if (keywords.length === 0) {
      throw new Error('At least one keyword is required');
    }
    
    if (keywords.length > 1000) {
      throw new Error('Maximum 1000 keywords per request');
    }
    
    const cacheKey = `metrics:${mode}:${country}:${keywords.sort().join(',')}`;
    const cost = keywords.length * this.costPerRequest;
    
    const endpoint = '/v2/keywords-explorer/overview';
    
    return await RetryHandler.withRetry(
      () => this.makeRequest<AhrefsKeywordData[]>(endpoint, {
        method: 'POST',
        body: {
          keywords,
          country,
          mode,
          include_serp_data: include_serp
        },
        cacheKey,
        cost,
        cacheTtl: 7 * 24 * 60 * 60 * 1000 // 7 days for metrics
      }),
      {
        maxAttempts: 3,
        provider: 'ahrefs',
        onRetry: (error, attempt) => {
          Sentry.addBreadcrumb({
            message: `Retrying Ahrefs keyword metrics (attempt ${attempt})`,
            level: 'warning',
            data: { keywordCount: keywords.length, error: error.message }
          });
        }
      }
    );
  }
  
  /**
   * Get detailed keyword overview with SERP data
   */
  async getKeywordOverview(
    keyword: string,
    country: string = 'US'
  ): Promise<ApiResponse<AhrefsKeywordOverview>> {
    const cacheKey = `overview:${country}:${keyword}`;
    const cost = this.costPerRequest * 2; // Overview costs more
    
    const endpoint = `/v2/keywords-explorer/overview`;
    
    return await this.makeRequest<AhrefsKeywordOverview>(endpoint, {
      method: 'POST',
      body: {
        keywords: [keyword],
        country,
        include_serp_data: true,
        include_serp_features: true
      },
      cacheKey,
      cost
    });
  }
  
  /**
   * Generate keyword ideas from seed terms
   */
  async getKeywordIdeas(
    request: AhrefsKeywordIdeasRequest
  ): Promise<ApiResponse<AhrefsKeywordIdeas>> {
    const {
      target,
      country = 'US',
      limit = 1000,
      mode = 'phrase_match'
    } = request;
    
    if (!target) {
      throw new Error('Target keyword is required');
    }
    
    const cacheKey = `ideas:${mode}:${country}:${limit}:${target}`;
    const cost = limit * this.costPerRequest * 0.5; // Ideas cost less than metrics
    
    const endpoint = '/v2/keywords-explorer/keyword-ideas';
    
    return await RetryHandler.withRetry(
      () => this.makeRequest<AhrefsKeywordIdeas>(endpoint, {
        method: 'POST',
        body: {
          target,
          country,
          limit,
          mode,
          volume_from: request.volume_from,
          volume_to: request.volume_to,
          difficulty_from: request.difficulty_from,
          difficulty_to: request.difficulty_to
        },
        cacheKey,
        cost,
        cacheTtl: 14 * 24 * 60 * 60 * 1000 // 14 days for ideas
      }),
      {
        maxAttempts: 3,
        provider: 'ahrefs',
        onRetry: (error, attempt) => {
          Sentry.addBreadcrumb({
            message: `Retrying Ahrefs keyword ideas (attempt ${attempt})`,
            level: 'warning',
            data: { target, limit, error: error.message }
          });
        }
      }
    );
  }
  
  /**
   * Get competitor keywords for a domain
   */
  async getCompetitorKeywords(
    request: AhrefsCompetitorRequest
  ): Promise<ApiResponse<AhrefsCompetitorKeywords>> {
    const {
      domain,
      country = 'US',
      limit = 1000,
      mode = 'exact'
    } = request;
    
    const cacheKey = `competitor:${domain}:${country}:${limit}:${mode}`;
    const cost = limit * this.costPerRequest * 0.8;
    
    const endpoint = '/v2/site-explorer/organic-keywords';
    
    return await this.makeRequest<AhrefsCompetitorKeywords>(endpoint, {
      method: 'POST',
      body: {
        target: domain,
        mode,
        country,
        limit,
        volume_from: request.volume_from,
        volume_to: request.volume_to,
        position_from: request.position_from || 1,
        position_to: request.position_to || 100
      },
      cacheKey,
      cost,
      cacheTtl: 7 * 24 * 60 * 60 * 1000 // 7 days for competitor data
    });
  }
  
  /**
   * Process keywords in batches to respect rate limits and API constraints
   */
  async processKeywordsBatch(
    keywords: string[],
    options: {
      batchSize?: number;
      country?: string;
      mode?: 'exact' | 'phrase' | 'broad';
      onProgress?: (processed: number, total: number) => void;
      onBatchComplete?: (batch: AhrefsKeywordData[], batchIndex: number) => void;
    } = {}
  ): Promise<AhrefsKeywordData[]> {
    const {
      batchSize = 100,
      country = 'US',
      mode = 'exact',
      onProgress,
      onBatchComplete
    } = options;
    
    const results: AhrefsKeywordData[] = [];
    const batches = this.chunkArray(keywords, batchSize);
    
    Sentry.addBreadcrumb({
      message: `Processing ${keywords.length} keywords in ${batches.length} batches`,
      level: 'info',
      category: 'ahrefs-batch',
      data: { total: keywords.length, batches: batches.length, batchSize }
    });
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const response = await this.getKeywordMetrics({
          keywords: batch,
          country,
          mode
        });
        
        if (response.success && response.data) {
          results.push(...response.data);
          
          if (onBatchComplete) {
            onBatchComplete(response.data, i);
          }
        }
        
        if (onProgress) {
          onProgress(results.length, keywords.length);
        }
        
        // Add small delay between batches to be respectful
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        Sentry.captureException(error, {
          tags: { batchIndex: i, batchSize: batch.length },
          extra: { keywords: batch }
        });
        
        console.warn(`Batch ${i + 1}/${batches.length} failed:`, (error as Error).message);
        // Continue with other batches
      }
    }
    
    return results;
  }
  
  /**
   * Get current API quota status
   */
  async getQuotaStatus(): Promise<{
    rowsLeft: number;
    rowsLimit: number;
    resetAt: string;
    utilizationPercent: number;
  }> {
    // Make a minimal request to get quota headers
    const response = await this.getKeywordMetrics({
      keywords: ['test'],
      mode: 'exact'
    });
    
    const quota = (response.metadata as any)?.quota || {};
    
    return {
      rowsLeft: quota.rowsLeft || 0,
      rowsLimit: quota.rowsLimit || 0,
      resetAt: quota.resetAt || '',
      utilizationPercent: quota.rowsLimit > 0 ? 
        ((quota.rowsLimit - quota.rowsLeft) / quota.rowsLimit) * 100 : 0
    };
  }
  
  /**
   * Estimate cost for a keyword research operation
   */
  estimateCost(keywordCount: number, includeIdeas: boolean = false): {
    estimatedCredits: number;
    estimatedDollars: number;
    breakdown: Record<string, number>;
  } {
    const breakdown = {
      keyword_metrics: keywordCount * this.costPerRequest,
      keyword_ideas: includeIdeas ? keywordCount * this.costPerRequest * 0.5 : 0
    };
    
    const totalCredits = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);
    
    return {
      estimatedCredits: totalCredits,
      estimatedDollars: totalCredits,
      breakdown
    };
  }
  
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Backward compatibility alias for cache adapters
  async getSerpOverview(
    keyword: string,
    market: string = 'US',
    device: 'desktop' | 'mobile' = 'desktop'
  ): Promise<ApiResponse<AhrefsKeywordOverview>> {
    return this.getKeywordOverview(keyword, market);
  }
}