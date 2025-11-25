/**
 * Unified Keyword Provider Interface
 * 
 * Provides a consistent interface for keyword data using DataForSEO (preferred)
 * or Ahrefs as providers with graceful fallback to mock data.
 * 
 * DataForSEO is recommended: ~$0.002 per keyword vs Ahrefs Enterprise $14,990/yr
 */

import { AhrefsClient, isAhrefsConfigured } from './ahrefs';
import { DataForSEOClient, isDataForSEOConfigured, DATAFORSEO_LOCATIONS } from './dataforseo';
import type { ApiMetrics } from '../types/api';

// Unified keyword data interface
export interface UnifiedKeywordData {
  keyword: string;
  volume: number | null;
  difficulty: number | null; // 0-100 scale
  cpc: number | null;
  competition: number | null; // 0-100 scale
  trend: Array<{ month: string; volume: number }> | null;
  source: 'dataforseo' | 'ahrefs' | 'mock' | 'unavailable';
  confidence: number; // 0-1 scale indicating data quality
}

export interface ProviderHealth {
  provider: 'dataforseo' | 'ahrefs';
  isHealthy: boolean;
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
  resetDate?: Date;
  responseTime?: number;
  balance?: number;
}

export interface KeywordProviderConfig {
  mockMode?: boolean;
  cacheTTL?: number;
  maxRetries?: number;
  preferredProvider?: 'dataforseo' | 'ahrefs' | 'auto';
}

/**
 * Unified Keyword Provider
 * Supports DataForSEO (preferred, pay-per-use) and Ahrefs with mock fallback
 */
export class KeywordProvider {
  private config: KeywordProviderConfig;
  private dataForSEOClient: DataForSEOClient | null = null;
  private ahrefsClient: AhrefsClient | null = null;
  private activeProvider: 'dataforseo' | 'ahrefs' | 'mock' = 'mock';

  constructor(config: KeywordProviderConfig = {}) {
    this.config = {
      mockMode: process.env.MOCK_EXTERNAL_APIS === 'true',
      cacheTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxRetries: 2,
      preferredProvider: 'auto',
      ...config
    };

    this.initializeProviders();
  }

  /**
   * Initialize keyword data providers
   * Priority: DataForSEO (cheaper) > Ahrefs > Mock
   */
  private initializeProviders(): void {
    const preferred = this.config.preferredProvider;
    
    // Try DataForSEO first (much cheaper)
    if ((preferred === 'auto' || preferred === 'dataforseo') && isDataForSEOConfigured()) {
      try {
        this.dataForSEOClient = DataForSEOClient.getInstance(
          process.env.DATAFORSEO_LOGIN!,
          process.env.DATAFORSEO_PASSWORD!
        );
        this.activeProvider = 'dataforseo';
        console.log('✓ DataForSEO provider initialized (recommended - pay-per-use)');
        return;
      } catch (error) {
        console.warn('Failed to initialize DataForSEO provider:', error);
      }
    }

    // Fall back to Ahrefs
    if ((preferred === 'auto' || preferred === 'ahrefs') && isAhrefsConfigured()) {
      try {
        this.ahrefsClient = AhrefsClient.getInstance(process.env.AHREFS_API_KEY!, undefined);
        this.activeProvider = 'ahrefs';
        console.log('✓ Ahrefs provider initialized');
        return;
      } catch (error) {
        console.warn('Failed to initialize Ahrefs provider:', error);
      }
    }

    console.log('ℹ️ No keyword data provider configured - using mock data');
    console.log('   💡 Tip: Add DataForSEO credentials for affordable keyword data (~$0.002/keyword)');
    this.activeProvider = 'mock';
  }

  /**
   * Get the active provider name
   */
  getActiveProvider(): 'dataforseo' | 'ahrefs' | 'mock' {
    return this.activeProvider;
  }

  /**
   * Get keyword metrics using DataForSEO, Ahrefs, or mock fallback
   */
  async getKeywordMetrics(keyword: string, options?: {
    location?: string;
    language?: string;
  }): Promise<UnifiedKeywordData> {
    
    if (this.config.mockMode) {
      return this.getMockKeywordData(keyword);
    }

    // Try DataForSEO first
    if (this.dataForSEOClient) {
      try {
        const locationCode = this.getLocationCode(options?.location || 'US');
        const result = await this.dataForSEOClient.getKeywordData([keyword], {
          location: locationCode,
          language: options?.language || 'en'
        });
        if (result.success && result.data?.[0]) {
          return this.normalizeDataForSEOData(result.data[0]);
        }
      } catch (error) {
        console.warn(`DataForSEO failed, trying fallback:`, (error as Error).message);
      }
    }

    // Fall back to Ahrefs
    if (this.ahrefsClient) {
      try {
        const result = await this.ahrefsClient.getKeywordOverview(keyword, options?.location || 'US');
        if (result.success && result.data) {
          return this.normalizeAhrefsData(result.data);
        }
      } catch (error) {
        console.warn(`Ahrefs failed:`, (error as Error).message);
      }
    }

    return this.getMockKeywordData(keyword);
  }

  /**
   * Get bulk keyword metrics
   * DataForSEO is much more cost-effective for bulk operations
   */
  async getBulkKeywordMetrics(keywords: string[], options?: {
    location?: string;
    language?: string;
    batchSize?: number;
  }): Promise<UnifiedKeywordData[]> {
    
    console.log(`📊 getBulkKeywordMetrics called for ${keywords.length} keywords, provider: ${this.activeProvider}`);
    
    if (this.config.mockMode || keywords.length === 0) {
      console.log(`⚠️ Using mock mode for all ${keywords.length} keywords`);
      return keywords.map(keyword => this.getMockKeywordData(keyword));
    }

    // Try DataForSEO first (handles up to 1000 keywords per request)
    if (this.dataForSEOClient) {
      try {
        const locationCode = this.getLocationCode(options?.location || 'US');
        const result = await this.dataForSEOClient.getKeywordData(keywords, {
          location: locationCode,
          language: options?.language || 'en'
        });
        
        if (result.success && result.data) {
          const enriched = result.data.map((kw: any) => this.normalizeDataForSEOData(kw));
          // Fill in any missing keywords with UNAVAILABLE data (not fake mock data)
          const enrichedKeywords = new Set(enriched.map(k => k.keyword.toLowerCase()));
          const missing = keywords.filter(k => !enrichedKeywords.has(k.toLowerCase()));
          
          console.log(`📊 DataForSEO returned ${enriched.length} keywords, ${missing.length} missing`);
          
          // Sample some real data for debugging
          if (enriched.length > 0) {
            const sample = enriched[0];
            console.log(`📊 Sample DataForSEO result: "${sample.keyword}" volume=${sample.volume}, difficulty=${sample.difficulty}, source=${sample.source}`);
          }
          
          // DON'T use mock data for missing keywords - mark as unavailable instead
          const unavailableKeywords = missing.map(k => ({
            keyword: k,
            volume: null,
            difficulty: null,
            cpc: null,
            competition: null,
            trend: null,
            source: 'unavailable' as const,
            confidence: 0
          }));
          
          return [...enriched, ...unavailableKeywords];
        }
      } catch (error) {
        console.warn(`DataForSEO bulk fetch failed:`, (error as Error).message);
      }
    }

    // Fall back to Ahrefs
    if (this.ahrefsClient) {
      try {
        const result = await this.ahrefsClient.getKeywordMetrics({
          keywords,
          country: options?.location || 'US'
        });
        
        if (result.success && result.data) {
          console.log(`📊 Ahrefs returned ${result.data.length} keywords`);
          return result.data.map((kw: any) => this.normalizeAhrefsData(kw));
        }
      } catch (error) {
        console.warn(`Ahrefs bulk fetch failed:`, (error as Error).message);
      }
    }

    console.log(`⚠️ No provider available, using mock for ${keywords.length} keywords`);
    return keywords.map(keyword => this.getMockKeywordData(keyword));
  }

  /**
   * Get keyword suggestions for expansion
   */
  async getKeywordSuggestions(seedKeyword: string, options?: {
    limit?: number;
    location?: string;
    language?: string;
  }): Promise<string[]> {
    
    if (this.config.mockMode) {
      return this.getMockKeywordSuggestions(seedKeyword, options?.limit || 50);
    }

    // Try DataForSEO first
    if (this.dataForSEOClient) {
      try {
        const locationCode = this.getLocationCode(options?.location || 'US');
        const result = await this.dataForSEOClient.getKeywordIdeas(seedKeyword, {
          location: locationCode,
          language: options?.language || 'en',
          limit: options?.limit || 50
        });
        
        if (result.success && result.data) {
          return result.data.map((item: any) => item.keyword).filter(Boolean);
        }
      } catch (error) {
        console.warn(`DataForSEO suggestions failed:`, (error as Error).message);
      }
    }

    // Fall back to Ahrefs
    if (this.ahrefsClient) {
      try {
        const result = await this.ahrefsClient.getKeywordIdeas({
          target: seedKeyword,
          country: options?.location || 'US',
          limit: options?.limit || 50
        });
        
        if (result.success && result.data?.keywords) {
          return result.data.keywords.map((kw: any) => kw.keyword || kw);
        }
      } catch (error) {
        console.warn(`Ahrefs suggestions failed:`, (error as Error).message);
      }
    }

    return this.getMockKeywordSuggestions(seedKeyword, options?.limit || 50);
  }

  /**
   * Get provider health status
   */
  async getProviderStatus(): Promise<ProviderHealth[]> {
    const statuses: ProviderHealth[] = [];

    // Check DataForSEO
    if (this.dataForSEOClient) {
      try {
        const startTime = Date.now();
        const balance = await this.dataForSEOClient.getBalance();
        const responseTime = Date.now() - startTime;

        statuses.push({
          provider: 'dataforseo',
          isHealthy: balance.balance > 0,
          quotaUsed: 0, // Pay-per-use
          quotaLimit: Infinity,
          quotaRemaining: balance.balance,
          responseTime,
          balance: balance.balance
        });
      } catch (error) {
        statuses.push({
          provider: 'dataforseo',
          isHealthy: false,
          quotaUsed: 0,
          quotaLimit: 0,
          quotaRemaining: 0
        });
      }
    }

    // Check Ahrefs
    if (this.ahrefsClient) {
      try {
        const startTime = Date.now();
        const health = await this.ahrefsClient.healthCheck();
        const responseTime = Date.now() - startTime;
        const metrics: ApiMetrics = this.ahrefsClient.getMetrics();

        statuses.push({
          provider: 'ahrefs',
          isHealthy: health.healthy,
          quotaUsed: metrics.requests,
          quotaLimit: 10000,
          quotaRemaining: 10000 - metrics.requests,
          responseTime
        });
      } catch (error) {
        statuses.push({
          provider: 'ahrefs',
          isHealthy: false,
          quotaUsed: 0,
          quotaLimit: 0,
          quotaRemaining: 0
        });
      }
    }

    return statuses;
  }

  /**
   * Convert country code to DataForSEO location code
   */
  private getLocationCode(country: string): number {
    const locationMap: Record<string, number> = {
      'US': DATAFORSEO_LOCATIONS.US,
      'UK': DATAFORSEO_LOCATIONS.UK,
      'GB': DATAFORSEO_LOCATIONS.UK,
      'CA': DATAFORSEO_LOCATIONS.CA,
      'AU': DATAFORSEO_LOCATIONS.AU,
      'DE': DATAFORSEO_LOCATIONS.DE,
      'FR': DATAFORSEO_LOCATIONS.FR,
      'ES': DATAFORSEO_LOCATIONS.ES,
      'IT': DATAFORSEO_LOCATIONS.IT,
      'NL': DATAFORSEO_LOCATIONS.NL,
      'BR': DATAFORSEO_LOCATIONS.BR,
      'IN': DATAFORSEO_LOCATIONS.IN,
      'JP': DATAFORSEO_LOCATIONS.JP
    };
    return locationMap[country.toUpperCase()] || DATAFORSEO_LOCATIONS.US;
  }

  /**
   * Normalize DataForSEO keyword data to unified format
   */
  private normalizeDataForSEOData(rawData: any): UnifiedKeywordData {
    const keywordInfo = rawData.keyword_info || rawData;
    return {
      keyword: rawData.keyword || '',
      volume: keywordInfo.search_volume ?? null,
      difficulty: rawData.keyword_properties?.keyword_difficulty ?? null,
      cpc: keywordInfo.cpc ?? null,
      competition: keywordInfo.competition != null 
        ? Math.round(keywordInfo.competition * 100) // 0-1 to 0-100
        : null,
      trend: keywordInfo.monthly_searches?.map((m: any) => ({
        month: `${m.year}-${String(m.month).padStart(2, '0')}`,
        volume: m.search_volume
      })) || null,
      source: 'dataforseo',
      confidence: 0.95 // DataForSEO uses Google Ads data
    };
  }

  /**
   * Normalize Ahrefs keyword data to unified format
   */
  private normalizeAhrefsData(rawData: any): UnifiedKeywordData {
    return {
      keyword: rawData.keyword || '',
      volume: rawData.volume ?? rawData.search_volume ?? null,
      difficulty: rawData.difficulty ?? rawData.keyword_difficulty ?? null,
      cpc: rawData.cpc ?? null,
      competition: rawData.traffic_potential ?
        Math.min(rawData.traffic_potential / 1000 * 100, 100) : null,
      trend: rawData.trend || null,
      source: 'ahrefs',
      confidence: 0.9
    };
  }

  /**
   * Generate mock keyword data for development/fallback
   */
  private getMockKeywordData(keyword: string): UnifiedKeywordData {
    const baseVolume = keyword.length * 1000 + Math.random() * 5000;
    const difficulty = Math.floor(Math.random() * 100);
    
    return {
      keyword,
      volume: Math.floor(baseVolume),
      difficulty,
      cpc: Math.round((Math.random() * 5 + 0.5) * 100) / 100,
      competition: Math.floor(Math.random() * 100),
      trend: this.generateMockTrend(),
      source: 'mock',
      confidence: 0.5
    };
  }

  /**
   * Generate mock keyword suggestions
   */
  private getMockKeywordSuggestions(seedKeyword: string, limit: number): string[] {
    const suggestions = [
      `${seedKeyword} guide`,
      `${seedKeyword} tips`,
      `${seedKeyword} tools`,
      `${seedKeyword} strategy`,
      `${seedKeyword} examples`,
      `${seedKeyword} best practices`,
      `${seedKeyword} software`,
      `${seedKeyword} solutions`,
      `${seedKeyword} services`,
      `${seedKeyword} platform`,
      `how to ${seedKeyword}`,
      `what is ${seedKeyword}`,
      `${seedKeyword} for beginners`,
      `${seedKeyword} vs`,
      `${seedKeyword} alternatives`
    ];

    return suggestions.slice(0, limit);
  }

  /**
   * Generate mock trend data
   */
  private generateMockTrend(): Array<{ month: string; volume: number }> {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const baseVolume = 1000 + Math.random() * 5000;
    
    return months.map(month => ({
      month,
      volume: Math.floor(baseVolume + (Math.random() - 0.5) * 1000)
    }));
  }
}

/**
 * Create a singleton keyword provider instance
 */
let keywordProviderInstance: KeywordProvider | null = null;

export function getKeywordProvider(config?: KeywordProviderConfig): KeywordProvider {
  if (!keywordProviderInstance) {
    keywordProviderInstance = new KeywordProvider(config);
  }
  return keywordProviderInstance;
}

export function resetKeywordProvider(): void {
  keywordProviderInstance = null;
}

/**
 * Check which providers are available
 */
export function getAvailableProviders(): Array<'dataforseo' | 'ahrefs'> {
  const providers: Array<'dataforseo' | 'ahrefs'> = [];
  if (isDataForSEOConfigured()) providers.push('dataforseo');
  if (isAhrefsConfigured()) providers.push('ahrefs');
  return providers;
}

/**
 * Estimate cost for keyword data operations
 */
export function estimateKeywordDataCost(keywordCount: number, provider: 'dataforseo' | 'ahrefs' = 'dataforseo'): {
  provider: string;
  costPerKeyword: number;
  totalCost: number;
  notes: string;
} {
  if (provider === 'dataforseo') {
    return {
      provider: 'DataForSEO',
      costPerKeyword: 0.002,
      totalCost: keywordCount * 0.002,
      notes: 'Pay-per-use pricing. Add credits at dataforseo.com'
    };
  } else {
    return {
      provider: 'Ahrefs',
      costPerKeyword: 14990 / 12 / 10000, // ~$0.125 per keyword (Enterprise plan)
      totalCost: keywordCount * (14990 / 12 / 10000),
      notes: 'Requires Enterprise plan ($14,990/year). Keywords Explorer may not be available on lower plans.'
    };
  }
}
