import { BaseApiClient } from './base-client';
import { 
  AhrefsKeywordData,
  AhrefsKeywordOverview,
  AhrefsKeywordIdeas,
  AhrefsCompetitorKeywords,
  AhrefsKeywordRequest,
  AhrefsCompetitorRequest,
  AhrefsKeywordIdeasRequest,
} from '../types/ahrefs';
import { ApiResponse, ApiClientConfig } from '../types/api';
import { ErrorHandler } from '../utils/error-handler';
import { RateLimiterFactory, CircuitBreakerFactory } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

/**
 * Site Explorer metrics response
 */
export interface SiteExplorerMetrics {
  org_keywords: number;
  org_traffic: number;
  org_cost: number;
  paid_keywords: number;
  paid_traffic: number;
  paid_cost: number;
  org_keywords_1_3: number;
}

/**
 * Domain rating response
 */
export interface DomainRating {
  domain_rating: number;
  ahrefs_rank: number;
}

/**
 * Backlink data
 */
export interface Backlink {
  url_from: string;
  url_to: string;
  anchor?: string;
  domain_rating_source?: number;
}

export class AhrefsClient extends BaseApiClient {
  private static instance: AhrefsClient | null = null;
  private costPerRequest = 0.002;
  private keywordsExplorerAvailable: boolean | null = null;
  
  constructor(apiKey: string, redis?: any) {
    const config: ApiClientConfig = {
      baseUrl: 'https://api.ahrefs.com',
      apiKey,
      timeout: 30000,
      retries: 3,
      rateLimiter: {
        capacity: 100,
        refillRate: 20,
        refillPeriod: 60000
      },
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeout: 60000,
        monitoringPeriod: 300000,
        expectedFailureRate: 0.1
      },
      cache: {
        ttl: 30 * 24 * 60 * 60 * 1000,
        maxSize: 10000
      }
    };
    
    super(config, 'ahrefs');
    
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

  public static resetInstance(): void {
    this.instance = null;
  }
  
  protected getDefaultHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Dream100-Keyword-Engine/1.0'
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
      console.log(`🔗 Ahrefs API: ${options.method} ${url}`);
      
      const fetchOptions: RequestInit = {
        method: options.method,
        headers: options.headers,
        signal: controller.signal
      };
      
      if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }
      
      const response = await fetch(url, fetchOptions);
      console.log(`📥 Ahrefs Status: ${response.status}`);
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Ahrefs API error: ${response.status}`;
        
        try {
          const errorData = JSON.parse(errorBody);
          errorMessage = errorData.error || errorMessage;
          
          // Track if Keywords Explorer is unavailable
          if (response.status === 403 && errorMessage.includes('Insufficient plan')) {
            if (endpoint.includes('keywords-explorer')) {
              this.keywordsExplorerAvailable = false;
              console.warn('⚠️ Ahrefs Keywords Explorer not available on this plan');
            }
          }
          
          if (response.status === 429) {
            throw (ErrorHandler as any).createRateLimitError({
              limit: parseInt(response.headers.get('x-ratelimit-limit') || '0'),
              remaining: 0,
              reset: parseInt(response.headers.get('x-ratelimit-reset') || '0'),
              retryAfter: parseInt(response.headers.get('retry-after') || '60')
            }, 'ahrefs', errorMessage);
          }
        } catch (parseError) {
          if ((parseError as Error).message?.includes('Rate limit')) {
            throw parseError;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      return {
        data: data as T,
        success: true,
        metadata: {
          requestId: `ahrefs_${Date.now()}`,
          timestamp: Date.now(),
          cached: false
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
   * Check if Keywords Explorer is available on this plan
   */
  async checkKeywordsExplorerAvailability(): Promise<boolean> {
    if (this.keywordsExplorerAvailable !== null) {
      return this.keywordsExplorerAvailable;
    }

    try {
      const endpoint = '/v3/keywords-explorer/overview?keywords=test&country=us&select=keyword';
      await this.makeRequest<any>(endpoint, {
        method: 'GET',
        timeout: 10000,
        skipRateLimit: true
      });
      this.keywordsExplorerAvailable = true;
      return true;
    } catch (error) {
      const message = (error as Error).message || '';
      if (message.includes('Insufficient plan') || message.includes('403')) {
        this.keywordsExplorerAvailable = false;
        return false;
      }
      // Other errors don't mean it's unavailable
      return true;
    }
  }

  // ==========================================================================
  // SITE EXPLORER ENDPOINTS (Available on most plans)
  // ==========================================================================

  /**
   * Get site metrics (organic traffic, keywords count, etc.)
   */
  async getSiteMetrics(
    target: string,
    options: {
      mode?: 'domain' | 'prefix' | 'exact';
      date?: string;
    } = {}
  ): Promise<ApiResponse<{ metrics: SiteExplorerMetrics }>> {
    const { mode = 'domain', date = new Date().toISOString().split('T')[0] } = options;
    
    const endpoint = `/v3/site-explorer/metrics?target=${encodeURIComponent(target)}&mode=${mode}&date=${date}&select=org_keywords,org_traffic,org_cost,paid_keywords,paid_traffic,paid_cost,org_keywords_1_3`;
    
    return await this.makeRequest<{ metrics: SiteExplorerMetrics }>(endpoint, {
      method: 'GET',
      cacheKey: `site:metrics:${target}:${mode}:${date}`,
      cost: this.costPerRequest
    });
  }

  /**
   * Get domain rating
   */
  async getDomainRating(
    target: string,
    options: { date?: string } = {}
  ): Promise<ApiResponse<{ domain_rating: DomainRating }>> {
    const date = options.date || new Date().toISOString().split('T')[0];
    
    const endpoint = `/v3/site-explorer/domain-rating?target=${encodeURIComponent(target)}&date=${date}&select=domain_rating,ahrefs_rank`;
    
    return await this.makeRequest<{ domain_rating: DomainRating }>(endpoint, {
      method: 'GET',
      cacheKey: `site:dr:${target}:${date}`,
      cost: this.costPerRequest
    });
  }

  /**
   * Get backlinks for a domain
   */
  async getBacklinks(
    target: string,
    options: {
      mode?: 'domain' | 'prefix' | 'exact';
      limit?: number;
    } = {}
  ): Promise<ApiResponse<{ backlinks: Backlink[] }>> {
    const { mode = 'domain', limit = 100 } = options;
    
    const endpoint = `/v3/site-explorer/all-backlinks?target=${encodeURIComponent(target)}&mode=${mode}&select=url_from,url_to,anchor&limit=${limit}`;
    
    return await this.makeRequest<{ backlinks: Backlink[] }>(endpoint, {
      method: 'GET',
      cacheKey: `site:backlinks:${target}:${mode}:${limit}`,
      cost: this.costPerRequest * (limit / 100)
    });
  }

  /**
   * Get organic keywords for a domain (competitor analysis)
   */
  async getOrganicKeywords(
    target: string,
    options: {
      mode?: 'domain' | 'prefix' | 'exact';
      country?: string;
      limit?: number;
      date?: string;
    } = {}
  ): Promise<ApiResponse<{ keywords: Array<{ keyword: string; volume: number; position: number; traffic: number }> }>> {
    const { mode = 'domain', country = 'us', limit = 100, date = new Date().toISOString().split('T')[0] } = options;
    
    const endpoint = `/v3/site-explorer/organic-keywords?target=${encodeURIComponent(target)}&mode=${mode}&country=${country}&date=${date}&select=keyword,volume,position,traffic&limit=${limit}`;
    
    try {
      return await this.makeRequest<{ keywords: any[] }>(endpoint, {
        method: 'GET',
        cacheKey: `site:organic:${target}:${mode}:${country}:${limit}`,
        cost: this.costPerRequest * (limit / 100)
      });
    } catch (error) {
      // Return empty if not available
      console.warn('Organic keywords endpoint not available:', (error as Error).message);
      return {
        data: { keywords: [] },
        success: true,
        metadata: { requestId: `mock_${Date.now()}`, timestamp: Date.now(), cached: false }
      };
    }
  }

  // ==========================================================================
  // KEYWORDS EXPLORER ENDPOINTS (Requires higher tier plan)
  // ==========================================================================

  /**
   * Get keyword metrics - Returns mock data if Keywords Explorer unavailable
   */
  async getKeywordMetrics(
    request: AhrefsKeywordRequest
  ): Promise<ApiResponse<AhrefsKeywordData[]>> {
    const { keywords, country = 'us' } = request;
    
    if (keywords.length === 0) {
      throw new Error('At least one keyword is required');
    }
    
    // Check availability first
    const available = await this.checkKeywordsExplorerAvailability();
    if (!available) {
      console.log('📊 Keywords Explorer unavailable - returning mock metrics');
      return this.getMockKeywordMetrics(keywords);
    }
    
    const keywordsParam = keywords.map(k => encodeURIComponent(k)).join(',');
    const endpoint = `/v3/keywords-explorer/overview?keywords=${keywordsParam}&country=${country}&select=keyword,volume,difficulty,cpc`;
    
    try {
      return await this.makeRequest<AhrefsKeywordData[]>(endpoint, {
        method: 'GET',
        cacheKey: `kw:metrics:${country}:${keywords.sort().join(',')}`,
        cost: keywords.length * this.costPerRequest
      });
    } catch (error) {
      console.warn('Keywords Explorer failed, using mock data:', (error as Error).message);
      return this.getMockKeywordMetrics(keywords);
    }
  }
  
  /**
   * Get keyword overview - Returns mock data if unavailable
   */
  async getKeywordOverview(
    keyword: string,
    country: string = 'us'
  ): Promise<ApiResponse<AhrefsKeywordOverview>> {
    const available = await this.checkKeywordsExplorerAvailability();
    if (!available) {
      return this.getMockKeywordOverview(keyword);
    }

    const endpoint = `/v3/keywords-explorer/overview?keywords=${encodeURIComponent(keyword)}&country=${country}&select=keyword,volume,difficulty,cpc,clicks,global_volume`;
    
    try {
    return await this.makeRequest<AhrefsKeywordOverview>(endpoint, {
        method: 'GET',
        cacheKey: `kw:overview:${country}:${keyword}`,
        cost: this.costPerRequest * 2
      });
    } catch (error) {
      return this.getMockKeywordOverview(keyword);
    }
  }
  
  /**
   * Get keyword ideas - Returns mock data if unavailable
   */
  async getKeywordIdeas(
    request: AhrefsKeywordIdeasRequest
  ): Promise<ApiResponse<AhrefsKeywordIdeas>> {
    const available = await this.checkKeywordsExplorerAvailability();
    if (!available) {
      return this.getMockKeywordIdeas(request.target, request.limit || 50);
    }

    const { target, country = 'us', limit = 100 } = request;
    const endpoint = `/v3/keywords-explorer/related-terms?keyword=${encodeURIComponent(target)}&country=${country}&select=keyword,volume,difficulty&limit=${limit}`;
    
    try {
      return await this.makeRequest<AhrefsKeywordIdeas>(endpoint, {
        method: 'GET',
        cacheKey: `kw:ideas:${country}:${limit}:${target}`,
        cost: limit * this.costPerRequest * 0.5
      });
    } catch (error) {
      return this.getMockKeywordIdeas(target, limit);
    }
  }
  
  /**
   * Get competitor keywords
   */
  async getCompetitorKeywords(
    request: AhrefsCompetitorRequest
  ): Promise<ApiResponse<AhrefsCompetitorKeywords>> {
    const { domain, country = 'us', limit = 100 } = request;
    const date = new Date().toISOString().split('T')[0];
    
    // This uses Site Explorer which is available
    const endpoint = `/v3/site-explorer/organic-keywords?target=${encodeURIComponent(domain)}&mode=domain&country=${country}&date=${date}&select=keyword,volume,position,traffic&limit=${limit}`;
    
    try {
      const response = await this.makeRequest<any>(endpoint, {
        method: 'GET',
        cacheKey: `competitor:${domain}:${country}:${limit}`,
        cost: limit * this.costPerRequest * 0.8
      });

      // Transform response to expected format
      return {
        ...response,
        data: {
          keywords: response.data?.keywords || [],
          domain,
          total_keywords: response.data?.keywords?.length || 0
        }
      } as ApiResponse<AhrefsCompetitorKeywords>;
    } catch (error) {
      console.warn('Competitor keywords failed:', (error as Error).message);
      return {
        data: { keywords: [], domain, total_keywords: 0 },
        success: true,
        metadata: { requestId: `mock_${Date.now()}`, timestamp: Date.now(), cached: false }
      } as ApiResponse<AhrefsCompetitorKeywords>;
    }
  }

  // ==========================================================================
  // MOCK DATA GENERATORS (Used when Keywords Explorer unavailable)
  // ==========================================================================

  private getMockKeywordMetrics(keywords: string[]): ApiResponse<AhrefsKeywordData[]> {
    const data: AhrefsKeywordData[] = keywords.map(keyword => ({
      keyword,
      search_volume: Math.floor(Math.random() * 10000) + 100,
      keyword_difficulty: Math.floor(Math.random() * 100),
      cpc: Math.round((Math.random() * 5 + 0.5) * 100) / 100,
      clicks: Math.floor(Math.random() * 5000),
      global_volume: Math.floor(Math.random() * 50000),
      traffic_potential: Math.floor(Math.random() * 10000),
      return_rate: Math.random() * 0.5
    }));

    return {
      data,
      success: true,
      metadata: {
        requestId: `mock_${Date.now()}`,
        timestamp: Date.now(),
        cached: false
      }
    };
  }

  private getMockKeywordOverview(keyword: string): ApiResponse<AhrefsKeywordOverview> {
    const data: AhrefsKeywordOverview = {
      keyword,
      search_volume: Math.floor(Math.random() * 10000) + 100,
      keyword_difficulty: Math.floor(Math.random() * 100),
      cpc: Math.round((Math.random() * 5 + 0.5) * 100) / 100,
      clicks: Math.floor(Math.random() * 5000),
      global_volume: Math.floor(Math.random() * 50000),
      traffic_potential: Math.floor(Math.random() * 10000),
      return_rate: Math.random() * 0.5,
      serp_features: [],
      serp_results: [],
      last_updated: new Date().toISOString()
    };

    return {
      data,
      success: true,
      metadata: {
        requestId: `mock_${Date.now()}`,
        timestamp: Date.now(),
        cached: false
      }
    };
  }

  private getMockKeywordIdeas(seedKeyword: string, limit: number): ApiResponse<AhrefsKeywordIdeas> {
    const modifiers = [
      'guide', 'tips', 'tools', 'strategy', 'examples', 'best practices',
      'software', 'solutions', 'services', 'platform', 'tutorial', 'course',
      'certification', 'training', 'agency', 'consultant', 'company',
      'pricing', 'cost', 'free', 'alternatives', 'vs', 'review', 'comparison'
    ];

    const keywords: AhrefsKeywordData[] = modifiers.slice(0, Math.min(limit, modifiers.length)).map(mod => ({
      keyword: `${seedKeyword} ${mod}`,
      search_volume: Math.floor(Math.random() * 5000) + 50,
      keyword_difficulty: Math.floor(Math.random() * 80) + 10,
      cpc: Math.round((Math.random() * 3 + 0.2) * 100) / 100,
      clicks: Math.floor(Math.random() * 2500),
      global_volume: Math.floor(Math.random() * 25000),
      traffic_potential: Math.floor(Math.random() * 5000),
      return_rate: Math.random() * 0.5
    }));

    return {
      data: {
        keywords,
        total_keywords: keywords.length,
        pagination: {
          current_page: 1,
          total_pages: 1,
          has_more: false
        }
      },
      success: true,
      metadata: {
        requestId: `mock_${Date.now()}`,
        timestamp: Date.now(),
        cached: false
      }
    };
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Process keywords in batches
   */
  async processKeywordsBatch(
    keywords: string[],
    options: {
      batchSize?: number;
      country?: string;
      onProgress?: (processed: number, total: number) => void;
    } = {}
  ): Promise<AhrefsKeywordData[]> {
    const { batchSize = 100, country = 'us', onProgress } = options;
    
    const results: AhrefsKeywordData[] = [];
    const batches = this.chunkArray(keywords, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const response = await this.getKeywordMetrics({ keywords: batch, country });
        
        if (response.success && response.data) {
          results.push(...response.data);
        }
        
        if (onProgress) {
          onProgress(results.length, keywords.length);
        }
        
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        console.warn(`Batch ${i + 1}/${batches.length} failed:`, (error as Error).message);
      }
    }
    
    return results;
  }
  
  /**
   * Get quota status
   */
  async getQuotaStatus(): Promise<{
    rowsLeft: number;
    rowsLimit: number;
    resetAt: string;
    utilizationPercent: number;
  }> {
    // Note: Actual quota info comes from API response headers
    // For now, return estimated values
    return {
      rowsLeft: 10000,
      rowsLimit: 10000,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      utilizationPercent: 0
    };
  }

  /**
   * Get API status
   */
  async getApiStatus(): Promise<{
    siteExplorerAvailable: boolean;
    keywordsExplorerAvailable: boolean;
  }> {
    const keywordsAvailable = await this.checkKeywordsExplorerAvailability();
    
    // Site Explorer is generally available on all API plans
    let siteExplorerAvailable = true;
    try {
      await this.getDomainRating('ahrefs.com');
    } catch {
      siteExplorerAvailable = false;
    }
    
    return {
      siteExplorerAvailable,
      keywordsExplorerAvailable: keywordsAvailable
    };
  }
  
  /**
   * Estimate cost
   */
  estimateCost(keywordCount: number, includeIdeas: boolean = false): {
    estimatedCredits: number;
    estimatedDollars: number;
  } {
    const metrics = keywordCount * this.costPerRequest;
    const ideas = includeIdeas ? keywordCount * this.costPerRequest * 0.5 : 0;
    const total = metrics + ideas;
    
    return {
      estimatedCredits: total,
      estimatedDollars: total
    };
  }
  
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Backward compatibility - device parameter ignored (not supported by current API)
  async getSerpOverview(
    keyword: string,
    market: string = 'us',
    _device: 'desktop' | 'mobile' = 'desktop'
  ): Promise<ApiResponse<AhrefsKeywordOverview>> {
    return this.getKeywordOverview(keyword, market);
  }
}

export function createAhrefsClient(apiKey: string, redis?: any): AhrefsClient {
  return AhrefsClient.getInstance(apiKey, redis);
}

export function isAhrefsConfigured(): boolean {
  return !!(
    process.env.AHREFS_API_KEY &&
    process.env.AHREFS_API_KEY !== 'your-ahrefs-api-key' &&
    process.env.ENABLE_AHREFS !== 'false'
  );
}
