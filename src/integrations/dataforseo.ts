/**
 * DataForSEO API Integration
 * 
 * Affordable keyword data provider with pay-per-use pricing.
 * Docs: https://docs.dataforseo.com/
 * 
 * Pricing: ~$0.002 per keyword (much cheaper than Ahrefs Enterprise)
 */

import { BaseApiClient } from './base-client';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

// DataForSEO response types
export interface DataForSEOKeywordData {
  keyword: string;
  search_volume: number;
  competition: number; // 0-1 scale
  competition_level: 'LOW' | 'MEDIUM' | 'HIGH';
  cpc: number;
  monthly_searches: Array<{ month: string; search_volume: number }>;
  keyword_difficulty?: number;
}

export interface DataForSEOKeywordInfo {
  keyword: string;
  location_code: number;
  language_code: string;
  search_volume: number;
  competition: number;
  competition_level: string;
  cpc: number;
  monthly_searches: Array<{
    year: number;
    month: number;
    search_volume: number;
  }>;
}

export interface DataForSEOResponse<T> {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    result_count: number;
    path: string[];
    data: any;
    result: T[];
  }>;
}

export interface DataForSEOKeywordResult {
  keyword: string;
  location_code: number;
  language_code: string;
  keyword_info: DataForSEOKeywordInfo;
}

export interface DataForSEOKeywordIdeasResult {
  keyword: string;
  keyword_info: DataForSEOKeywordInfo;
  keyword_properties: {
    keyword_difficulty: number;
  };
}

export class DataForSEOClient extends BaseApiClient {
  private static instance: DataForSEOClient | null = null;
  private login: string;
  private password: string;
  
  constructor(login: string, password: string, redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: 'https://api.dataforseo.com',
      apiKey: '', // Using basic auth instead
      timeout: 60000, // 60 seconds
      retries: 3,
      rateLimiter: {
        capacity: 50,
        refillRate: 10,
        refillPeriod: 1000 // 10 requests per second
      },
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeout: 60000,
        monitoringPeriod: 300000,
        expectedFailureRate: 0.1
      },
      cache: {
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxSize: 10000
      }
    };
    
    super(config, 'dataforseo');
    this.login = login;
    this.password = password;
    
    // Use token bucket rate limiter (similar to Ahrefs config)
    const rateLimitConfig = {
      capacity: 50,
      refillRate: 10,
      refillPeriod: 1000
    };
    this.rateLimiter = RateLimiterFactory.createTokenBucket(rateLimitConfig);
    
    // Create circuit breaker using factory
    this.circuitBreaker = CircuitBreakerFactory.getOrCreate('dataforseo', {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringPeriod: 300000,
      expectedFailureRate: 0.1
    }, true);
  }
  
  public static getInstance(login?: string, password?: string, redis?: any): DataForSEOClient {
    if (!this.instance) {
      if (!login || !password) {
        throw new Error('DataForSEO login and password are required');
      }
      this.instance = new DataForSEOClient(login, password, redis);
    }
    return this.instance;
  }

  public static resetInstance(): void {
    this.instance = null;
  }
  
  protected getDefaultHeaders(): Record<string, string> {
    const auth = Buffer.from(`${this.login}:${this.password}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
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
      console.log(`🔗 DataForSEO API: ${options.method} ${endpoint}`);
      
      const fetchOptions: RequestInit = {
        method: options.method,
        headers: options.headers,
        signal: controller.signal
      };
      
      if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }
      
      const response = await fetch(url, fetchOptions);
      console.log(`📥 DataForSEO Status: ${response.status}`);
      clearTimeout(timeoutId);
      
      const data = await response.json() as DataForSEOResponse<any>;
      
      if (!response.ok || data.status_code !== 20000) {
        const errorMessage = data.status_message || `API error: ${response.status}`;
        
        if (response.status === 402) {
          throw new Error('DataForSEO: Insufficient balance. Add credits at dataforseo.com');
        }
        
        if (response.status === 429) {
          throw (ErrorHandler as any).createRateLimitError({
            limit: 10,
            remaining: 0,
            reset: 1,
            retryAfter: 1
          }, 'dataforseo', errorMessage);
        }
        
        throw new Error(`DataForSEO: ${errorMessage}`);
      }
      
      // Extract results from tasks
      const results = data.tasks?.[0]?.result || [];
      const cost = data.tasks?.[0]?.cost || 0;
      
      console.log(`💰 DataForSEO cost: $${cost.toFixed(4)}`);
      
      return {
        data: results as T,
        success: true,
        metadata: {
          requestId: data.tasks?.[0]?.id || `dfs_${Date.now()}`,
          timestamp: Date.now(),
          cached: false,
          cost: {
            credits: cost,
            estimatedDollars: cost
          }
        }
      } as ApiResponse<T>;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if ((error as Error).name === 'AbortError') {
        throw (ErrorHandler as any).createTimeoutError(options.timeout, 'dataforseo');
      }
      
      throw error as Error;
    }
  }

  /**
   * Get keyword search volume and metrics using DataForSEO Labs Bulk Search Volume
   * Uses Labs API (no Google Ads connection required)
   * Cost: ~$0.0006 per keyword
   */
  async getKeywordData(
    keywords: string[],
    options: {
      location?: number; // Location code (2840 = US)
      language?: string; // Language code (en)
    } = {}
  ): Promise<ApiResponse<DataForSEOKeywordResult[]>> {
    const { location = 2840, language = 'en' } = options;
    
    if (keywords.length === 0) {
      throw new Error('At least one keyword is required');
    }
    
    const results: DataForSEOKeywordResult[] = [];
    const batchSize = 1000; // Max keywords per request
    const batches = this.chunkArray(keywords, batchSize);
    
    console.log(`📊 DataForSEO Labs: Processing ${keywords.length} keywords in ${batches.length} batch(es)`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const cacheKey = `dfs:labs:bulk:${location}:${language}:${batch.slice(0, 3).join(',').substring(0, 50)}`;
      
      try {
        // Use DataForSEO Labs Bulk Search Volume (no Google Ads required)
        const response = await this.makeRequest<any>(
          '/v3/dataforseo_labs/google/bulk_search_volume/live',
          {
            method: 'POST',
            body: [{
              keywords: batch,
              location_code: location,
              language_code: language
            }],
            cacheKey,
            cost: batch.length * 0.0006, // ~$0.60 per 1000 keywords
            cacheTtl: 7 * 24 * 60 * 60 * 1000
          }
        );
        
        // Extract results from the response - Labs API returns data differently
        const items = response.data?.[0]?.result || [];
        
        console.log(`📊 DataForSEO Labs batch ${i + 1}/${batches.length}: Received ${items.length} results for ${batch.length} keywords`);
        
        for (const item of items) {
          if (item.keyword) {
            results.push({
              keyword: item.keyword,
              location_code: location,
              language_code: language,
              keyword_info: {
                keyword: item.keyword,
                location_code: location,
                language_code: language,
                search_volume: item.search_volume ?? 0,
                competition: 0, // Labs API doesn't return competition
                competition_level: 'UNKNOWN',
                cpc: 0, // Labs API doesn't return CPC
                monthly_searches: []
              }
            });
          }
        }
        
        // Small delay between batches to avoid rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        console.warn(`DataForSEO Labs batch ${i + 1}/${batches.length} failed:`, (error as Error).message);
        // Continue with other batches rather than failing completely
      }
    }
    
    console.log(`📊 DataForSEO Labs: Total ${results.length} keywords enriched out of ${keywords.length} requested`);
    
    return {
      data: results,
      success: true,
      metadata: {
        requestId: `dfs_labs_bulk_${Date.now()}`,
        timestamp: Date.now(),
        cached: false
      }
    } as ApiResponse<DataForSEOKeywordResult[]>;
  }

  /**
   * Get keyword suggestions/ideas from a seed keyword
   * Uses DataForSEO Labs related_keywords endpoint
   * Cost: ~$0.01 per request
   */
  async getKeywordIdeas(
    seedKeyword: string,
    options: {
      location?: number;
      language?: string;
      limit?: number;
      includeAdultKeywords?: boolean;
    } = {}
  ): Promise<ApiResponse<DataForSEOKeywordIdeasResult[]>> {
    const { 
      location = 2840, 
      language = 'en', 
      limit = 100
    } = options;
    
    const cacheKey = `dfs:ideas:${location}:${language}:${limit}:${seedKeyword}`;
    
    const body = [{
      keyword: seedKeyword,
      location_code: location,
      language_code: language,
      limit
    }];
    
    const response = await this.makeRequest<any>(
      '/v3/dataforseo_labs/google/related_keywords/live',
      {
        method: 'POST',
        body,
        cacheKey,
        cost: 0.01,
        cacheTtl: 14 * 24 * 60 * 60 * 1000
      }
    );
    
    // Transform response to expected format
    const items = response.data?.[0]?.items || [];
    const results: DataForSEOKeywordIdeasResult[] = items.map((item: any) => ({
      keyword: item.keyword_data?.keyword || '',
      keyword_info: item.keyword_data?.keyword_info || {
        search_volume: 0,
        competition: 0,
        competition_level: 'LOW',
        cpc: 0,
        monthly_searches: []
      },
      keyword_properties: {
        keyword_difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty || 0
      }
    }));
    
    return {
      data: results,
      success: true,
      metadata: response.metadata
    } as ApiResponse<DataForSEOKeywordIdeasResult[]>;
  }

  /**
   * Get keyword difficulty scores
   * Cost: ~$0.003 per keyword
   */
  async getKeywordDifficulty(
    keywords: string[],
    options: {
      location?: number;
      language?: string;
    } = {}
  ): Promise<ApiResponse<Array<{ keyword: string; difficulty: number }>>> {
    const { location = 2840, language = 'en' } = options;
    
    if (keywords.length === 0) {
      throw new Error('At least one keyword is required');
    }
    
    const cacheKey = `dfs:difficulty:${location}:${language}:${keywords.sort().join(',')}`;
    
    const body = [{
      location_code: location,
      language_code: language,
      keywords: keywords
    }];
    
    return await this.makeRequest<Array<{ keyword: string; difficulty: number }>>(
      '/v3/dataforseo_labs/google/keyword_difficulty/live',
      {
        method: 'POST',
        body,
        cacheKey,
        cost: keywords.length * 0.003,
        cacheTtl: 7 * 24 * 60 * 60 * 1000
      }
    );
  }

  /**
   * Get related keywords with full metrics
   * Cost: ~$0.01 per request
   */
  async getRelatedKeywords(
    keyword: string,
    options: {
      location?: number;
      language?: string;
      limit?: number;
    } = {}
  ): Promise<ApiResponse<DataForSEOKeywordIdeasResult[]>> {
    const { location = 2840, language = 'en', limit = 100 } = options;
    
    const cacheKey = `dfs:related:${location}:${language}:${limit}:${keyword}`;
    
    const body = [{
      keyword,
      location_code: location,
      language_code: language,
      limit
    }];
    
    const response = await this.makeRequest<any>(
      '/v3/dataforseo_labs/google/related_keywords/live',
      {
        method: 'POST',
        body,
        cacheKey,
        cost: 0.01,
        cacheTtl: 14 * 24 * 60 * 60 * 1000
      }
    );
    
    // Transform response to expected format
    const items = response.data?.[0]?.items || [];
    const results: DataForSEOKeywordIdeasResult[] = items.map((item: any) => ({
      keyword: item.keyword_data?.keyword || '',
      keyword_info: item.keyword_data?.keyword_info || {
        search_volume: 0,
        competition: 0,
        competition_level: 'LOW',
        cpc: 0,
        monthly_searches: []
      },
      keyword_properties: {
        keyword_difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty || 0
      }
    }));
    
    return {
      data: results,
      success: true,
      metadata: response.metadata
    } as ApiResponse<DataForSEOKeywordIdeasResult[]>;
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ balance: number; currency: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v3/appendix/user_data`, {
        method: 'GET',
        headers: this.getDefaultHeaders()
      });
      
      const data = await response.json();
      
      if (data.tasks?.[0]?.result?.[0]) {
        return {
          balance: data.tasks[0].result[0].money?.balance || 0,
          currency: data.tasks[0].result[0].money?.currency || 'USD'
        };
      }
      
      return { balance: 0, currency: 'USD' };
    } catch (error) {
      console.error('Failed to get DataForSEO balance:', error);
      return { balance: 0, currency: 'USD' };
    }
  }

  /**
   * Process keywords in batches
   */
  async processKeywordsBatch(
    keywords: string[],
    options: {
      batchSize?: number;
      location?: number;
      language?: string;
      onProgress?: (processed: number, total: number) => void;
    } = {}
  ): Promise<DataForSEOKeywordData[]> {
    const { batchSize = 1000, location = 2840, language = 'en', onProgress } = options;
    
    const results: DataForSEOKeywordData[] = [];
    const batches = this.chunkArray(keywords, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const response = await this.getKeywordData(batch, { location, language });
        
        if (response.success && response.data) {
          // Transform to standard format
          for (const item of response.data) {
            if (item.keyword_info) {
              results.push({
                keyword: item.keyword,
                search_volume: item.keyword_info.search_volume || 0,
                competition: item.keyword_info.competition || 0,
                competition_level: item.keyword_info.competition_level as any || 'LOW',
                cpc: item.keyword_info.cpc || 0,
                monthly_searches: item.keyword_info.monthly_searches?.map(m => ({
                  month: `${m.year}-${String(m.month).padStart(2, '0')}`,
                  search_volume: m.search_volume
                })) || []
              });
            }
          }
        }
        
        if (onProgress) {
          onProgress(results.length, keywords.length);
        }
        
        // Small delay between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        console.warn(`Batch ${i + 1}/${batches.length} failed:`, (error as Error).message);
        Sentry.captureException(error, {
          tags: { batchIndex: i, provider: 'dataforseo' }
        });
      }
    }
    
    return results;
  }

  /**
   * Estimate cost for an operation
   */
  estimateCost(keywordCount: number, includeIdeas: boolean = false, ideasPerKeyword: number = 50): {
    estimatedCredits: number;
    estimatedDollars: number;
    breakdown: Record<string, number>;
  } {
    const breakdown = {
      keyword_data: keywordCount * 0.002,
      keyword_ideas: includeIdeas ? keywordCount * ideasPerKeyword * 0.002 : 0
    };
    
    const total = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);
    
    return {
      estimatedCredits: total,
      estimatedDollars: total,
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
}

/**
 * Factory function
 */
export function createDataForSEOClient(login: string, password: string, redis?: any): DataForSEOClient {
  return DataForSEOClient.getInstance(login, password, redis);
}

/**
 * Check if DataForSEO is configured
 */
export function isDataForSEOConfigured(): boolean {
  return !!(
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD &&
    process.env.DATAFORSEO_LOGIN !== 'your-login' &&
    process.env.ENABLE_DATAFORSEO !== 'false'
  );
}

/**
 * Location codes for common countries
 */
export const DATAFORSEO_LOCATIONS = {
  US: 2840,
  UK: 2826,
  CA: 2124,
  AU: 2036,
  DE: 2276,
  FR: 2250,
  ES: 2724,
  IT: 2380,
  NL: 2528,
  BR: 2076,
  IN: 2356,
  JP: 2392
} as const;

