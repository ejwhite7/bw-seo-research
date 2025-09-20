/**
 * SEMRush API Integration for Dream 100 Keyword Engine
 * 
 * Provides keyword volume, difficulty, and competitive metrics using SEMRush's
 * API with proper authentication and rate limiting.
 */

import axios, { AxiosResponse, AxiosInstance } from 'axios';

// SEMRush API Types
export interface SEMRushKeywordData {
  keyword: string;
  volume: number | null;
  difficulty: number | null; // 0-100 scale
  cpc: number | null;
  competition: number | null; // 0-1 scale
  competitionIndex: number | null; // 0-100 scale
  results: number | null;
  trend: Array<{ month: string; volume: number }> | null;
}

export interface SEMRushKeywordResponse {
  keyword: string;
  database: string;
  volume: number;
  cpc: number;
  competition: number;
  competitionIndex: number;
  results: number;
  difficulty?: number;
  trend?: string; // CSV format: month1,volume1;month2,volume2
}

export interface SEMRushBulkResponse {
  [keyword: string]: SEMRushKeywordResponse;
}

export interface SEMRushRelatedKeywords {
  keywords: Array<{
    keyword: string;
    volume: number;
    cpc: number;
    competition: number;
    relevance: number;
  }>;
}

export interface SEMRushConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  rateLimit?: {
    requestsPerSecond: number;
    burstLimit: number;
  };
  defaultDatabase?: string; // us, uk, ca, au, etc.
  exportColumns?: string[];
}

/**
 * SEMRush API Client
 * Handles authentication, rate limiting, and data transformation
 */
export class SEMRushClient {
  private config: SEMRushConfig;
  private client: AxiosInstance;
  private readonly baseURL = 'https://api.semrush.com';
  private lastRequestTime: number = 0;
  private readonly minRequestInterval = 1000; // 1 second between requests

  constructor(config: SEMRushConfig) {
    this.config = {
      baseURL: this.baseURL,
      timeout: 30000,
      defaultDatabase: 'us',
      rateLimit: {
        requestsPerSecond: 1,
        burstLimit: 10
      },
      exportColumns: [
        'Ph', // Phrase (keyword)
        'Nq', // Search Volume
        'Cp', // CPC
        'Co', // Competition (0-1)
        'Nr', // Number of Results
        'Kd'  // Keyword Difficulty (if available)
      ],
      ...config
    };

    // Configure axios with SEMRush-specific settings
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      params: {
        key: this.config.apiKey,
        export_format: 'json'
      }
    });
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
   * Get keyword metrics for a single keyword
   */
  async getKeywordMetrics(
    keyword: string,
    database?: string
  ): Promise<SEMRushKeywordData> {
    try {
      await this.checkRateLimit();

      const params = {
        type: 'phrase_this',
        phrase: keyword,
        database: database || this.config.defaultDatabase,
        export_columns: this.config.exportColumns?.join(',')
      };

      const response: AxiosResponse<SEMRushKeywordResponse[]> = await this.client.get('/', { params });


      if (response.data && response.data.length > 0) {
        return this.transformKeywordData(response.data[0]);
      }

      return this.getEmptyKeywordData(keyword);

    } catch (error) {
      console.error('SEMRush API error:', error);
      return this.getEmptyKeywordData(keyword);
    }
  }

  /**
   * Get keyword metrics for multiple keywords
   */
  async getBulkKeywordMetrics(
    keywords: string[],
    database?: string
  ): Promise<SEMRushKeywordData[]> {
    try {
      // SEMRush doesn't have a native bulk endpoint, so we'll batch individual requests
      const batchSize = 5; // Conservative batching to respect rate limits
      const batches = this.chunkArray(keywords, batchSize);
      const allResults: SEMRushKeywordData[] = [];

      for (const batch of batches) {
        const batchPromises = batch.map(keyword => 
          this.getKeywordMetrics(keyword, database)
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allResults.push(result.value);
          } else {
            allResults.push(this.getEmptyKeywordData(batch[index]));
          }
        });

        // Add delay between batches to respect rate limits
        if (batches.indexOf(batch) < batches.length - 1) {
          await this.delay(2000);
        }
      }

      return allResults;

    } catch (error) {
      console.error('SEMRush bulk API error:', error);
      return keywords.map(keyword => this.getEmptyKeywordData(keyword));
    }
  }

  /**
   * Get related keywords for expansion
   */
  async getKeywordSuggestions(
    seedKeyword: string,
    database?: string,
    limit: number = 100
  ): Promise<string[]> {
    try {
      await this.checkRateLimit();

      const params = {
        type: 'phrase_related',
        phrase: seedKeyword,
        database: database || this.config.defaultDatabase,
        export_columns: 'Ph,Nq,Cp,Co',
        export_limit: Math.min(limit, 10000).toString() // SEMRush limit
      };

      const response: AxiosResponse<Array<{
        Ph: string; // Phrase
        Nq: number; // Search Volume
        Cp: number; // CPC
        Co: number; // Competition
      }>> = await this.client.get('/', { params });


      if (response.data && Array.isArray(response.data)) {
        return response.data
          .filter(item => item.Nq > 0) // Filter out zero volume keywords
          .sort((a, b) => b.Nq - a.Nq) // Sort by volume
          .map(item => item.Ph)
          .slice(0, limit);
      }

      return [];

    } catch (error) {
      console.error('SEMRush suggestions API error:', error);
      return [];
    }
  }

  /**
   * Get broad match keywords
   */
  async getBroadMatchKeywords(
    seedKeyword: string,
    database?: string,
    limit: number = 50
  ): Promise<string[]> {
    try {
      await this.checkRateLimit();

      const params = {
        type: 'phrase_fullsearch',
        phrase: seedKeyword,
        database: database || this.config.defaultDatabase,
        export_columns: 'Ph,Nq',
        export_limit: Math.min(limit, 5000).toString()
      };

      const response: AxiosResponse<Array<{
        Ph: string;
        Nq: number;
      }>> = await this.client.get('/', { params });


      if (response.data && Array.isArray(response.data)) {
        return response.data
          .filter(item => item.Nq > 0)
          .sort((a, b) => b.Nq - a.Nq)
          .map(item => item.Ph)
          .slice(0, limit);
      }

      return [];

    } catch (error) {
      console.error('SEMRush broad match API error:', error);
      return [];
    }
  }

  /**
   * Get organic search results for SERP analysis
   */
  async getSERPAnalysis(
    keyword: string,
    database?: string
  ): Promise<{
    totalResults: number;
    competitors: Array<{
      domain: string;
      url: string;
      position: number;
      title?: string;
      traffic?: number;
      trafficCost?: number;
    }>;
  }> {
    try {
      await this.checkRateLimit();

      const params = {
        type: 'phrase_organic',
        phrase: keyword,
        database: database || this.config.defaultDatabase,
        export_columns: 'Dn,Ur,Pp,Tr,Tc', // Domain, URL, Position, Traffic, Traffic Cost
        export_limit: '10'
      };

      const response = await this.client.get('/', { params });


      const competitors = response.data?.map((result: any) => ({
        domain: result.Dn,
        url: result.Ur,
        position: parseInt(result.Pp) || 0,
        traffic: result.Tr || 0,
        trafficCost: result.Tc || 0
      })) || [];

      return {
        totalResults: competitors.length,
        competitors
      };

    } catch (error) {
      console.error('SEMRush SERP analysis error:', error);
      return {
        totalResults: 0,
        competitors: []
      };
    }
  }

  /**
   * Get keyword trends data
   */
  async getKeywordTrends(
    keyword: string,
    database?: string
  ): Promise<Array<{ month: string; volume: number }>> {
    try {
      await this.checkRateLimit();

      const params = {
        type: 'phrase_kdi',
        phrase: keyword,
        database: database || this.config.defaultDatabase,
        export_columns: 'Ph,Nq,Kd'
      };

      const response = await this.client.get('/', { params });


      // SEMRush trend data format varies, implement parsing based on actual API response
      if (response.data && response.data[0]?.trend) {
        return this.parseTrendData(response.data[0].trend);
      }

      return [];

    } catch (error) {
      console.error('SEMRush trends API error:', error);
      return [];
    }
  }

  /**
   * Check API limits and health
   */
  async getAPIHealth(): Promise<{
    isHealthy: boolean;
    quotaUsed: number;
    quotaLimit: number;
    quotaRemaining: number;
    resetDate?: Date;
  }> {
    try {
      const params = {
        type: 'info'
      };

      const response = await this.client.get('/', { params });


      // SEMRush info endpoint returns usage data
      const data = response.data;
      return {
        isHealthy: true,
        quotaUsed: parseInt(data.limit_used) || 0,
        quotaLimit: parseInt(data.limit_total) || 0,
        quotaRemaining: parseInt(data.limit_left) || 0,
        resetDate: data.reset_date ? new Date(data.reset_date) : undefined
      };

    } catch (error) {
      console.error('SEMRush health check error:', error);
      return {
        isHealthy: false,
        quotaUsed: 0,
        quotaLimit: 0,
        quotaRemaining: 0
      };
    }
  }

  /**
   * Transform SEMRush API response to standard format
   */
  private transformKeywordData(result: SEMRushKeywordResponse): SEMRushKeywordData {
    return {
      keyword: result.keyword || '',
      volume: result.volume || null,
      difficulty: result.difficulty || null,
      cpc: result.cpc || null,
      competition: result.competition || null,
      competitionIndex: result.competitionIndex || null,
      results: result.results || null,
      trend: result.trend ? this.parseTrendData(result.trend) : null
    };
  }

  /**
   * Parse trend data from SEMRush format
   */
  private parseTrendData(trendString: string): Array<{ month: string; volume: number }> {
    try {
      const trends: Array<{ month: string; volume: number }> = [];
      const pairs = trendString.split(';');
      
      pairs.forEach(pair => {
        const [month, volume] = pair.split(',');
        if (month && volume) {
          trends.push({
            month: month.trim(),
            volume: parseInt(volume) || 0
          });
        }
      });
      
      return trends;
    } catch {
      return [];
    }
  }

  /**
   * Get empty keyword data structure
   */
  private getEmptyKeywordData(keyword: string): SEMRushKeywordData {
    return {
      keyword,
      volume: null,
      difficulty: null,
      cpc: null,
      competition: null,
      competitionIndex: null,
      results: null,
      trend: null
    };
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

  /**
   * Add delay between requests
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create SEMRush client instance
 */
export function createSEMRushClient(apiKey: string, options?: Partial<SEMRushConfig>): SEMRushClient {
  return new SEMRushClient({
    apiKey,
    ...options
  });
}

/**
 * Check if SEMRush API is configured
 */
export function isSEMRushConfigured(): boolean {
  return !!(process.env.SEMRUSH_API_KEY && process.env.SEMRUSH_API_KEY !== 'your-dev-semrush-api-key');
}