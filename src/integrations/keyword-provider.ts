/**
 * Unified Keyword Provider Interface
 * 
 * Provides a consistent interface for keyword data regardless of the underlying
 * API provider (Ahrefs, Moz, or SEMRush). Automatically detects available providers
 * and falls back gracefully.
 */

import { AhrefsClient, isAhrefsConfigured } from './ahrefs';
import { MozClient, isMozConfigured, MozKeywordData } from './moz';
import { SEMRushClient, isSEMRushConfigured, SEMRushKeywordData } from './semrush';

// Unified keyword data interface
export interface UnifiedKeywordData {
  keyword: string;
  volume: number | null;
  difficulty: number | null; // 0-100 scale, normalized across providers
  cpc: number | null;
  competition: number | null; // 0-100 scale, normalized
  trend: Array<{ month: string; volume: number }> | null;
  source: 'ahrefs' | 'moz' | 'semrush' | 'mock';
  confidence: number; // 0-1 scale indicating data quality
}

export interface ProviderHealth {
  provider: 'ahrefs' | 'moz' | 'semrush';
  isHealthy: boolean;
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
  resetDate?: Date;
  responseTime?: number;
}

export interface KeywordProviderConfig {
  preferredProvider?: 'ahrefs' | 'moz' | 'semrush' | 'auto';
  fallbackProviders?: Array<'ahrefs' | 'moz' | 'semrush'>;
  mockMode?: boolean;
  cacheTTL?: number;
  maxRetries?: number;
}

/**
 * Unified Keyword Provider
 * Manages multiple keyword data providers with automatic fallback
 */
export class KeywordProvider {
  private config: KeywordProviderConfig;
  private providers: Map<string, any> = new Map();
  private lastHealthCheck: Map<string, { timestamp: number; health: ProviderHealth }> = new Map();

  constructor(config: KeywordProviderConfig = {}) {
    this.config = {
      preferredProvider: 'auto',
      fallbackProviders: ['ahrefs', 'moz', 'semrush'],
      mockMode: process.env.MOCK_EXTERNAL_APIS === 'true',
      cacheTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxRetries: 2,
      ...config
    };

    this.initializeProviders();
  }

  /**
   * Initialize available API providers
   */
  private initializeProviders(): void {
    // Initialize Ahrefs if configured
    if (isAhrefsConfigured()) {
      try {
        this.providers.set('ahrefs', AhrefsClient.getInstance(process.env.AHREFS_API_KEY!, undefined));
        console.log('✓ Ahrefs provider initialized');
      } catch (error) {
        console.warn('Failed to initialize Ahrefs provider:', error);
      }
    }

    // Initialize Moz if configured
    if (isMozConfigured()) {
      try {
        this.providers.set('moz', new MozClient({
          apiKey: process.env.MOZ_API_KEY!
        }));
        console.log('✓ Moz provider initialized');
      } catch (error) {
        console.warn('Failed to initialize Moz provider:', error);
      }
    }

    // Initialize SEMRush if configured
    if (isSEMRushConfigured()) {
      try {
        this.providers.set('semrush', new SEMRushClient({
          apiKey: process.env.SEMRUSH_API_KEY!
        }));
        console.log('✓ SEMRush provider initialized');
      } catch (error) {
        console.warn('Failed to initialize SEMRush provider:', error);
      }
    }

    console.log(`Initialized ${this.providers.size} keyword providers`);
  }

  /**
   * Get keyword metrics using the best available provider
   */
  async getKeywordMetrics(keyword: string, options?: {
    provider?: 'ahrefs' | 'moz' | 'semrush';
    location?: string;
    language?: string;
  }): Promise<UnifiedKeywordData> {
    
    if (this.config.mockMode) {
      return this.getMockKeywordData(keyword);
    }

    const provider = await this.selectProvider(options?.provider);
    
    if (!provider) {
      return this.getMockKeywordData(keyword);
    }

    try {
      const rawData = await this.getKeywordDataFromProvider(provider.name, keyword, options);
      return this.normalizeKeywordData(rawData, provider.name as any);
    } catch (error) {
      console.warn(`Failed to get keyword data from ${provider.name}:`, error);
      
      // Try fallback providers
      for (const fallbackName of this.config.fallbackProviders || []) {
        if (fallbackName !== provider.name && this.providers.has(fallbackName)) {
          try {
            const rawData = await this.getKeywordDataFromProvider(fallbackName, keyword, options);
            return this.normalizeKeywordData(rawData, fallbackName as any);
          } catch (fallbackError) {
            console.warn(`Fallback provider ${fallbackName} also failed:`, fallbackError);
          }
        }
      }

      // Return mock data if all providers fail
      return this.getMockKeywordData(keyword);
    }
  }

  /**
   * Get bulk keyword metrics
   */
  async getBulkKeywordMetrics(keywords: string[], options?: {
    provider?: 'ahrefs' | 'moz' | 'semrush';
    location?: string;
    language?: string;
    batchSize?: number;
  }): Promise<UnifiedKeywordData[]> {
    
    if (this.config.mockMode) {
      return keywords.map(keyword => this.getMockKeywordData(keyword));
    }

    const provider = await this.selectProvider(options?.provider);
    
    if (!provider) {
      return keywords.map(keyword => this.getMockKeywordData(keyword));
    }

    try {
      const batchSize = options?.batchSize || 100;
      const batches = this.chunkArray(keywords, batchSize);
      const allResults: UnifiedKeywordData[] = [];

      for (const batch of batches) {
        const rawDataArray = await this.getBulkKeywordDataFromProvider(
          provider.name, 
          batch, 
          options
        );
        
        const normalizedBatch = rawDataArray.map(rawData => 
          this.normalizeKeywordData(rawData, provider.name as any)
        );
        
        allResults.push(...normalizedBatch);
      }

      return allResults;

    } catch (error) {
      console.warn(`Bulk keyword fetch failed for ${provider.name}:`, error);
      return keywords.map(keyword => this.getMockKeywordData(keyword));
    }
  }

  /**
   * Get keyword suggestions for expansion
   */
  async getKeywordSuggestions(seedKeyword: string, options?: {
    provider?: 'ahrefs' | 'moz' | 'semrush';
    limit?: number;
    location?: string;
  }): Promise<string[]> {
    
    if (this.config.mockMode) {
      return this.getMockKeywordSuggestions(seedKeyword, options?.limit || 50);
    }

    const provider = await this.selectProvider(options?.provider);
    
    if (!provider) {
      return this.getMockKeywordSuggestions(seedKeyword, options?.limit || 50);
    }

    try {
      return await provider.client.getKeywordSuggestions(
        seedKeyword, 
        options?.location,
        options?.limit
      );
    } catch (error) {
      console.warn(`Keyword suggestions failed for ${provider.name}:`, error);
      return this.getMockKeywordSuggestions(seedKeyword, options?.limit || 50);
    }
  }

  /**
   * Get available providers and their health status
   */
  async getProviderStatus(): Promise<ProviderHealth[]> {
    const statuses: ProviderHealth[] = [];
    const providerEntries = Array.from(this.providers.entries());

    for (const [name, client] of providerEntries) {
      try {
        const startTime = Date.now();
        const health = await client.getAPIHealth();
        const responseTime = Date.now() - startTime;

        const providerHealth: ProviderHealth = {
          provider: name as any,
          isHealthy: health.isHealthy,
          quotaUsed: health.quotaUsed,
          quotaLimit: health.quotaLimit,
          quotaRemaining: health.quotaRemaining,
          resetDate: health.resetDate,
          responseTime
        };

        this.lastHealthCheck.set(name, {
          timestamp: Date.now(),
          health: providerHealth
        });

        statuses.push(providerHealth);
      } catch (error) {
        statuses.push({
          provider: name as any,
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
   * Select the best available provider
   */
  private async selectProvider(preferredProvider?: string): Promise<{ name: string; client: any } | null> {
    if (preferredProvider && this.providers.has(preferredProvider)) {
      return {
        name: preferredProvider,
        client: this.providers.get(preferredProvider)
      };
    }

    // Auto-select best provider based on health and quota
    if (this.config.preferredProvider === 'auto') {
      const statuses = await this.getProviderStatus();
      const healthyProviders = statuses
        .filter(status => status.isHealthy && status.quotaRemaining > 0)
        .sort((a, b) => {
          // Prefer providers with more quota remaining
          const quotaRatioA = a.quotaRemaining / (a.quotaLimit || 1);
          const quotaRatioB = b.quotaRemaining / (b.quotaLimit || 1);
          return quotaRatioB - quotaRatioA;
        });

      if (healthyProviders.length > 0) {
        const bestProvider = healthyProviders[0];
        return {
          name: bestProvider.provider,
          client: this.providers.get(bestProvider.provider)
        };
      }
    }

    // Fallback to configured preferred provider
    if (this.config.preferredProvider && this.providers.has(this.config.preferredProvider)) {
      return {
        name: this.config.preferredProvider,
        client: this.providers.get(this.config.preferredProvider)
      };
    }

    // Return first available provider
    const firstProvider = Array.from(this.providers.entries())[0];
    return firstProvider ? { name: firstProvider[0], client: firstProvider[1] } : null;
  }

  /**
   * Get keyword data from specific provider
   */
  private async getKeywordDataFromProvider(
    providerName: string, 
    keyword: string, 
    options?: any
  ): Promise<any> {
    const client = this.providers.get(providerName);
    if (!client) {
      throw new Error(`Provider ${providerName} not available`);
    }

    switch (providerName) {
      case 'ahrefs':
        return await client.getKeywordOverview(keyword, options?.location);
      case 'moz':
        return await client.getKeywordMetrics(keyword, options?.location, options?.language);
      case 'semrush':
        return await client.getKeywordMetrics(keyword, options?.location);
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Get bulk keyword data from specific provider
   */
  private async getBulkKeywordDataFromProvider(
    providerName: string, 
    keywords: string[], 
    options?: any
  ): Promise<any[]> {
    const client = this.providers.get(providerName);
    if (!client) {
      throw new Error(`Provider ${providerName} not available`);
    }

    switch (providerName) {
      case 'ahrefs':
        return await client.getBulkKeywordData(keywords, options?.location);
      case 'moz':
        return await client.getBulkKeywordMetrics(keywords, options?.location, options?.language);
      case 'semrush':
        return await client.getBulkKeywordMetrics(keywords, options?.location);
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Normalize keyword data from different providers to unified format
   */
  private normalizeKeywordData(
    rawData: any, 
    source: 'ahrefs' | 'moz' | 'semrush'
  ): UnifiedKeywordData {
    const normalized: UnifiedKeywordData = {
      keyword: rawData.keyword || '',
      volume: rawData.volume || null,
      difficulty: null,
      cpc: rawData.cpc || null,
      competition: null,
      trend: rawData.trend || null,
      source,
      confidence: 0.8 // Default confidence for real API data
    };

    // Normalize difficulty (0-100 scale)
    switch (source) {
      case 'ahrefs':
        normalized.difficulty = rawData.difficulty || null; // Already 0-100
        normalized.competition = rawData.traffic_potential ?
          Math.min(rawData.traffic_potential / 1000 * 100, 100) : null;
        break;
      case 'moz':
        normalized.difficulty = rawData.difficulty || null; // Already 0-100
        normalized.competition = rawData.opportunity ? 
          (100 - rawData.opportunity) : null; // Invert opportunity to competition
        break;
      case 'semrush':
        normalized.difficulty = rawData.difficulty || null;
        normalized.competition = rawData.competition ? 
          rawData.competition * 100 : null; // Convert 0-1 to 0-100
        break;
    }

    return normalized;
  }

  /**
   * Generate mock keyword data for development
   */
  private getMockKeywordData(keyword: string): UnifiedKeywordData {
    const baseVolume = keyword.length * 1000 + Math.random() * 5000;
    const difficulty = Math.floor(Math.random() * 100);
    
    return {
      keyword,
      volume: Math.floor(baseVolume),
      difficulty,
      cpc: Math.random() * 5 + 0.5,
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
 * Create a singleton keyword provider instance
 */
let keywordProviderInstance: KeywordProvider | null = null;

export function getKeywordProvider(config?: KeywordProviderConfig): KeywordProvider {
  if (!keywordProviderInstance) {
    keywordProviderInstance = new KeywordProvider(config);
  }
  return keywordProviderInstance;
}

/**
 * Check which providers are available
 */
export function getAvailableProviders(): Array<'ahrefs' | 'moz' | 'semrush'> {
  const available: Array<'ahrefs' | 'moz' | 'semrush'> = [];

  if (isAhrefsConfigured()) available.push('ahrefs');
  if (isMozConfigured()) available.push('moz');
  if (isSEMRushConfigured()) available.push('semrush');

  return available;
}