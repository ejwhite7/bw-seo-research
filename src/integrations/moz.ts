/**
 * Moz API Integration for Dream 100 Keyword Engine
 * 
 * Provides keyword volume, difficulty, and competitive metrics using Moz's
 * Keyword Explorer API with proper authentication and rate limiting.
 */

import axios, { AxiosResponse, AxiosInstance } from 'axios';

// Moz API Types
export interface MozKeywordData {
  keyword: string;
  volume: number | null;
  difficulty: number | null; // 0-100 scale
  opportunity: number | null; // 0-100 scale
  cpc: number | null;
  priority: number | null; // 0-100 scale
  ctr: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
}

export interface MozKeywordResponse {
  results: Array<{
    keyword: string;
    location: number;
    language: string;
    metrics: {
      volume: number;
      difficulty: number;
      opportunity: number;
      potential: number;
      cpc: number;
    };
    suggestions?: Array<{
      keyword: string;
      type: string;
      metrics: {
        volume: number;
        difficulty: number;
      };
    }>;
  }>;
  totalResults: number;
  requestId: string;
}

export interface MozBulkMetricsResponse {
  results: Array<{
    keyword: string;
    location: number;
    metrics: {
      volume: number;
      difficulty: number;
      opportunity: number;
      potential: number;
    };
  }>;
}

export interface MozConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  rateLimit?: {
    requestsPerSecond: number;
    burstLimit: number;
  };
  defaultLocation?: number; // Default to US (2840)
  defaultLanguage?: string;
}

/**
 * Moz API Client
 * Handles authentication, rate limiting, and data transformation
 */
export class MozClient {
  private config: MozConfig;
  private client: AxiosInstance;
  private readonly baseURL = 'https://lsapi.seomoz.com/v2';
  private lastRequestTime: number = 0;
  private readonly minRequestInterval = 1000; // 1 second between requests

  constructor(config: MozConfig) {
    this.config = {
      baseURL: this.baseURL,
      timeout: 30000,
      defaultLocation: 2840, // US
      defaultLanguage: 'en-US',
      rateLimit: {
        requestsPerSecond: 1,
        burstLimit: 5
      },
      ...config
    };

    // Configure axios with Moz-specific settings
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.config.apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get keyword metrics for a single keyword
   */
  async getKeywordMetrics(
    keyword: string,
    location?: number,
    language?: string
  ): Promise<MozKeywordData> {
    try {
      await this.checkRateLimit();

      const requestData = {
        keywords: [keyword],
        location: location || this.config.defaultLocation,
        language: language || this.config.defaultLanguage
      };

      const response: AxiosResponse<MozKeywordResponse> = await this.client.post(
        '/keyword_research',
        requestData
      );

      if (response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        return this.transformKeywordData(result);
      }

      return this.getEmptyKeywordData(keyword);

    } catch (error) {
      console.error('Moz API error:', error);
      return this.getEmptyKeywordData(keyword);
    }
  }

  /**
   * Simple delay utility
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get keyword metrics for multiple keywords (batch request)
   */
  async getBulkKeywordMetrics(
    keywords: string[],
    location?: number,
    language?: string
  ): Promise<MozKeywordData[]> {
    try {
      // Moz API typically limits to 1000 keywords per request
      const batchSize = 1000;
      const batches = this.chunkArray(keywords, batchSize);
      const allResults: MozKeywordData[] = [];

      for (const batch of batches) {
        await this.checkRateLimit();

        const requestData = {
          keywords: batch,
          location: location || this.config.defaultLocation,
          language: language || this.config.defaultLanguage
        };

        const response: AxiosResponse<MozBulkMetricsResponse> = await this.client.post(
          '/keyword_research/bulk',
          requestData
        );

        if (response.data.results) {
          const transformedResults = response.data.results.map(result => 
            this.transformBulkKeywordData(result)
          );
          allResults.push(...transformedResults);
        }

        // Add delay between batches to respect rate limits
        if (batches.length > 1) {
          await this.delay(1000);
        }
      }

      // Fill in missing keywords with empty data
      const keywordMap = new Map(allResults.map(item => [item.keyword, item]));
      return keywords.map(keyword => 
        keywordMap.get(keyword) || this.getEmptyKeywordData(keyword)
      );

    } catch (error) {
      console.error('Moz bulk API error:', error);
      return keywords.map(keyword => this.getEmptyKeywordData(keyword));
    }
  }

  /**
   * Get keyword suggestions for expansion
   */
  async getKeywordSuggestions(
    seedKeyword: string,
    location?: number,
    limit: number = 100
  ): Promise<string[]> {
    try {
      await this.checkRateLimit();

      const requestData = {
        keyword: seedKeyword,
        location: location || this.config.defaultLocation,
        limit: Math.min(limit, 1000), // Moz API limit
        suggestion_types: ['phrase_match', 'broad_match', 'related']
      };

      const response: AxiosResponse<{
        suggestions: Array<{
          keyword: string;
          type: string;
          metrics: {
            volume: number;
            difficulty: number;
          };
        }>;
      }> = await this.client.post('/keyword_research/suggestions', requestData);

      if (response.data.suggestions) {
        return response.data.suggestions
          .filter(suggestion => suggestion.metrics.volume > 0)
          .sort((a, b) => b.metrics.volume - a.metrics.volume)
          .map(suggestion => suggestion.keyword)
          .slice(0, limit);
      }

      return [];

    } catch (error) {
      console.error('Moz suggestions API error:', error);
      return [];
    }
  }

  /**
   * Get SERP analysis for a keyword
   */
  async getSERPAnalysis(
    keyword: string,
    location?: number
  ): Promise<{
    totalResults: number;
    competitors: Array<{
      domain: string;
      url: string;
      position: number;
      title?: string;
      domainAuthority?: number;
      pageAuthority?: number;
    }>;
  }> {
    try {
      await this.checkRateLimit();

      const requestData = {
        keyword,
        location: location || this.config.defaultLocation,
        limit: 10 // Top 10 results
      };

      const response = await this.client.post('/keyword_research/serp', requestData);

      return {
        totalResults: response.data.totalResults || 0,
        competitors: response.data.results?.map((result: any, index: number) => ({
          domain: this.extractDomain(result.url),
          url: result.url,
          position: index + 1,
          title: result.title,
          domainAuthority: result.metrics?.domainAuthority,
          pageAuthority: result.metrics?.pageAuthority
        })) || []
      };

    } catch (error) {
      console.error('Moz SERP analysis error:', error);
      return {
        totalResults: 0,
        competitors: []
      };
    }
  }

  /**
   * Check API quota and health
   */
  async getAPIHealth(): Promise<{
    isHealthy: boolean;
    quotaUsed: number;
    quotaLimit: number;
    quotaRemaining: number;
    resetDate?: Date;
  }> {
    try {
      const response = await this.client.get('/usage_data');

      const data = response.data;
      return {
        isHealthy: true,
        quotaUsed: data.rows_used || 0,
        quotaLimit: data.rows_limit || 0,
        quotaRemaining: (data.rows_limit || 0) - (data.rows_used || 0),
        resetDate: data.reset_at ? new Date(data.reset_at) : undefined
      };

    } catch (error) {
      console.error('Moz health check error:', error);
      return {
        isHealthy: false,
        quotaUsed: 0,
        quotaLimit: 0,
        quotaRemaining: 0
      };
    }
  }


  /**
   * Transform Moz API response to standard format
   */
  private transformKeywordData(result: any): MozKeywordData {
    const metrics = result.metrics || {};
    
    return {
      keyword: result.keyword,
      volume: metrics.volume || null,
      difficulty: metrics.difficulty || null,
      opportunity: metrics.opportunity || null,
      cpc: metrics.cpc || null,
      priority: metrics.potential || null, // Moz calls it "potential"
      ctr: null, // Not available in standard Moz API
      rangeHigh: null,
      rangeLow: null
    };
  }

  /**
   * Transform bulk API response to standard format
   */
  private transformBulkKeywordData(result: any): MozKeywordData {
    const metrics = result.metrics || {};
    
    return {
      keyword: result.keyword,
      volume: metrics.volume || null,
      difficulty: metrics.difficulty || null,
      opportunity: metrics.opportunity || null,
      cpc: null, // Not available in bulk API
      priority: metrics.potential || null,
      ctr: null,
      rangeHigh: null,
      rangeLow: null
    };
  }

  /**
   * Get empty keyword data structure
   */
  private getEmptyKeywordData(keyword: string): MozKeywordData {
    return {
      keyword,
      volume: null,
      difficulty: null,
      opportunity: null,
      cpc: null,
      priority: null,
      ctr: null,
      rangeHigh: null,
      rangeLow: null
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

}

/**
 * Factory function to create Moz client instance
 */
export function createMozClient(apiKey: string, options?: Partial<MozConfig>): MozClient {
  return new MozClient({
    apiKey,
    ...options
  });
}

/**
 * Check if Moz API is configured
 */
export function isMozConfigured(): boolean {
  return !!(process.env.MOZ_API_KEY && process.env.MOZ_API_KEY !== 'your-dev-moz-api-key');
}