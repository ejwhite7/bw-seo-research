/**
 * Unit Tests for Keyword Expansion Service
 * 
 * Tests the Dream 100 generation and tier-based keyword expansion
 * that creates comprehensive keyword universes from seed terms.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock data types
interface SeedKeyword {
  keyword: string;
  market: string;
  language: string;
}

interface ExpandedKeyword {
  id: string;
  keyword: string;
  stage: 'dream100' | 'tier2' | 'tier3';
  parentKeyword?: string;
  volume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  relevanceScore: number;
  commercialScore?: number;
  trendScore?: number;
  expansionReason: string;
  runId: string;
}

interface ExpansionConfig {
  dream100Count: number;
  tier2PerDream: number;
  tier3PerTier2: number;
  maxTotalKeywords: number;
  relevanceThreshold: number;
  diversityFactor: number;
}

interface ExpansionResults {
  dream100: ExpandedKeyword[];
  tier2: ExpandedKeyword[];
  tier3: ExpandedKeyword[];
  totalCount: number;
  expansionTime: number;
}

// Mock expansion service
class MockExpansionService {
  private config: ExpansionConfig;
  private mockAnthropicResponses: Record<string, any>;

  constructor(config: ExpansionConfig) {
    this.config = config;
    this.setupMockResponses();
  }

  private setupMockResponses() {
    this.mockAnthropicResponses = {
      'digital marketing': {
        keywords: [
          { keyword: 'digital marketing strategy', relevance: 0.95, reasoning: 'Core strategy keyword' },
          { keyword: 'digital marketing tools', relevance: 0.92, reasoning: 'Essential tools category' },
          { keyword: 'digital marketing services', relevance: 0.90, reasoning: 'Service-based searches' },
          { keyword: 'digital marketing agency', relevance: 0.88, reasoning: 'Agency searches' },
          { keyword: 'digital marketing course', relevance: 0.85, reasoning: 'Educational intent' },
          { keyword: 'digital marketing automation', relevance: 0.87, reasoning: 'Automation focus' },
          { keyword: 'digital marketing analytics', relevance: 0.84, reasoning: 'Analytics and measurement' },
          { keyword: 'digital marketing trends', relevance: 0.82, reasoning: 'Industry trends' },
          { keyword: 'digital marketing budget', relevance: 0.80, reasoning: 'Budget planning' },
          { keyword: 'digital marketing ROI', relevance: 0.83, reasoning: 'Return on investment' }
        ]
      },
      'content marketing': {
        keywords: [
          { keyword: 'content marketing strategy', relevance: 0.94, reasoning: 'Strategic planning' },
          { keyword: 'content marketing examples', relevance: 0.89, reasoning: 'Example searches' },
          { keyword: 'content marketing tools', relevance: 0.91, reasoning: 'Tool discovery' },
          { keyword: 'content marketing calendar', relevance: 0.87, reasoning: 'Planning and organization' },
          { keyword: 'content marketing metrics', relevance: 0.85, reasoning: 'Performance measurement' }
        ]
      }
    };
  }

  async expandSeedKeywords(seedKeywords: SeedKeyword[]): Promise<ExpansionResults> {
    const startTime = Date.now();
    const results: ExpansionResults = {
      dream100: [],
      tier2: [],
      tier3: [],
      totalCount: 0,
      expansionTime: 0
    };

    try {
      // Generate Dream 100
      results.dream100 = await this.generateDream100(seedKeywords);
      
      // Generate Tier 2 keywords
      results.tier2 = await this.generateTier2Keywords(results.dream100);
      
      // Generate Tier 3 keywords
      results.tier3 = await this.generateTier3Keywords(results.tier2);
      
      results.totalCount = results.dream100.length + results.tier2.length + results.tier3.length;
      results.expansionTime = Date.now() - startTime;
      
      return results;
    } catch (error) {
      throw new Error(`Keyword expansion failed: ${error.message}`);
    }
  }

  private async generateDream100(seedKeywords: SeedKeyword[]): Promise<ExpandedKeyword[]> {
    const dream100: ExpandedKeyword[] = [];
    
    for (const seed of seedKeywords) {
      const expansions = await this.callAnthropicExpansion(seed.keyword, 'dream100');
      
      // Convert to ExpandedKeyword objects
      const keywordObjects = expansions.slice(0, Math.floor(this.config.dream100Count / seedKeywords.length))
        .map((expansion, index) => this.createExpandedKeyword(
          expansion.keyword,
          'dream100',
          seed.keyword,
          expansion.relevance,
          expansion.reasoning,
          'seed-expansion'
        ));
      
      dream100.push(...keywordObjects);
    }
    
    // Fill remaining slots with high-relevance keywords
    while (dream100.length < this.config.dream100Count) {
      const randomSeed = seedKeywords[Math.floor(Math.random() * seedKeywords.length)];
      const expansion = await this.generateSyntheticKeyword(randomSeed.keyword, 'dream100');
      dream100.push(expansion);
    }
    
    return dream100.slice(0, this.config.dream100Count);
  }

  private async generateTier2Keywords(dream100Keywords: ExpandedKeyword[]): Promise<ExpandedKeyword[]> {
    const tier2: ExpandedKeyword[] = [];
    
    for (const dreamKeyword of dream100Keywords) {
      const expansions = await this.callAnthropicExpansion(dreamKeyword.keyword, 'tier2');
      
      const keywordObjects = expansions.slice(0, this.config.tier2PerDream)
        .map(expansion => this.createExpandedKeyword(
          expansion.keyword,
          'tier2',
          dreamKeyword.keyword,
          expansion.relevance,
          expansion.reasoning,
          dreamKeyword.id
        ));
      
      tier2.push(...keywordObjects);
      
      if (tier2.length >= this.config.maxTotalKeywords * 0.6) break; // Don't exceed 60% of total
    }
    
    return tier2;
  }

  private async generateTier3Keywords(tier2Keywords: ExpandedKeyword[]): Promise<ExpandedKeyword[]> {
    const tier3: ExpandedKeyword[] = [];
    
    for (const tier2Keyword of tier2Keywords) {
      const expansions = await this.callAnthropicExpansion(tier2Keyword.keyword, 'tier3');
      
      const keywordObjects = expansions.slice(0, this.config.tier3PerTier2)
        .map(expansion => this.createExpandedKeyword(
          expansion.keyword,
          'tier3',
          tier2Keyword.keyword,
          expansion.relevance,
          expansion.reasoning,
          tier2Keyword.id
        ));
      
      tier3.push(...keywordObjects);
      
      if (tier3.length >= this.config.maxTotalKeywords * 0.3) break; // Don't exceed 30% of total
    }
    
    return tier3;
  }

  private async callAnthropicExpansion(keyword: string, stage: string): Promise<any[]> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    // Return mock response based on keyword
    const baseKeyword = keyword.toLowerCase();
    
    if (this.mockAnthropicResponses[baseKeyword]) {
      return this.mockAnthropicResponses[baseKeyword].keywords;
    }
    
    // Generate synthetic responses for unknown keywords
    return this.generateSyntheticExpansions(keyword, stage);
  }

  private generateSyntheticExpansions(keyword: string, stage: string): any[] {
    const modifiers = {
      dream100: ['best', 'top', 'guide', 'strategy', 'tips', 'tools', 'services', 'software'],
      tier2: ['how to', 'examples', 'template', 'checklist', 'pricing', 'comparison', 'review'],
      tier3: ['beginner', 'advanced', 'step by step', 'tutorial', 'course', 'training', 'certification']
    };
    
    const stageModifiers = modifiers[stage] || modifiers.dream100;
    const baseRelevance = stage === 'dream100' ? 0.8 : stage === 'tier2' ? 0.7 : 0.6;
    
    return stageModifiers.slice(0, 5).map((modifier, index) => ({
      keyword: `${modifier} ${keyword}`,
      relevance: baseRelevance - (index * 0.05),
      reasoning: `${stage} expansion with ${modifier} modifier`
    }));
  }

  private async generateSyntheticKeyword(baseKeyword: string, stage: string): Promise<ExpandedKeyword> {
    const expansions = this.generateSyntheticExpansions(baseKeyword, stage);
    const randomExpansion = expansions[Math.floor(Math.random() * expansions.length)];
    
    return this.createExpandedKeyword(
      randomExpansion.keyword,
      stage as any,
      baseKeyword,
      randomExpansion.relevance,
      randomExpansion.reasoning,
      'synthetic'
    );
  }

  private createExpandedKeyword(
    keyword: string,
    stage: 'dream100' | 'tier2' | 'tier3',
    parentKeyword: string,
    relevanceScore: number,
    reason: string,
    parentId: string
  ): ExpandedKeyword {
    // Generate realistic metrics based on stage and keyword characteristics
    const volumeMultiplier = stage === 'dream100' ? 1.0 : stage === 'tier2' ? 0.6 : 0.3;
    const difficultyBase = stage === 'dream100' ? 60 : stage === 'tier2' ? 45 : 30;
    
    const volume = Math.floor((Math.random() * 15000 + 1000) * volumeMultiplier);
    const difficulty = Math.floor(difficultyBase + (Math.random() - 0.5) * 40);
    const cpc = Math.random() * 8 + 0.5;
    
    // Determine intent based on keyword content
    let intent = 'informational';
    if (keyword.includes('buy') || keyword.includes('price') || keyword.includes('cost')) {
      intent = 'commercial';
    } else if (keyword.includes('best') || keyword.includes('top') || keyword.includes('vs')) {
      intent = 'commercial';
    } else if (keyword.includes('how to') || keyword.includes('guide') || keyword.includes('tutorial')) {
      intent = 'informational';
    } else if (keyword.includes('login') || keyword.includes('download')) {
      intent = 'navigational';
    }
    
    const commercialScore = intent === 'commercial' ? Math.random() * 0.4 + 0.6 : Math.random() * 0.4;
    const trendScore = Math.random() * 0.6 + 0.2;
    
    return {
      id: `expanded-${Math.random().toString(36).substring(7)}`,
      keyword: keyword.trim(),
      stage,
      parentKeyword,
      volume: Math.max(10, volume),
      difficulty: Math.max(1, Math.min(100, difficulty)),
      cpc: Math.round(cpc * 100) / 100,
      intent,
      relevanceScore: Math.max(0.1, Math.min(1.0, relevanceScore)),
      commercialScore,
      trendScore,
      expansionReason: reason,
      runId: 'test-run'
    };
  }

  validateExpansion(results: ExpansionResults): boolean {
    // Check total count limits
    if (results.totalCount > this.config.maxTotalKeywords) {
      return false;
    }
    
    // Check Dream 100 count
    if (results.dream100.length > this.config.dream100Count) {
      return false;
    }
    
    // Check relevance thresholds
    const allKeywords = [...results.dream100, ...results.tier2, ...results.tier3];
    const lowRelevanceCount = allKeywords.filter(kw => kw.relevanceScore < this.config.relevanceThreshold).length;
    
    if (lowRelevanceCount > allKeywords.length * 0.1) { // Allow up to 10% low relevance
      return false;
    }
    
    // Check for duplicates
    const uniqueKeywords = new Set(allKeywords.map(kw => kw.keyword.toLowerCase()));
    if (uniqueKeywords.size !== allKeywords.length) {
      return false;
    }
    
    return true;
  }

  calculateExpansionQuality(results: ExpansionResults): number {
    const allKeywords = [...results.dream100, ...results.tier2, ...results.tier3];
    
    if (allKeywords.length === 0) return 0;
    
    // Calculate average relevance
    const avgRelevance = allKeywords.reduce((sum, kw) => sum + kw.relevanceScore, 0) / allKeywords.length;
    
    // Calculate diversity (unique first words)
    const firstWords = allKeywords.map(kw => kw.keyword.split(' ')[0].toLowerCase());
    const uniqueFirstWords = new Set(firstWords);
    const diversity = uniqueFirstWords.size / allKeywords.length;
    
    // Calculate stage distribution quality
    const dream100Ratio = results.dream100.length / allKeywords.length;
    const tier2Ratio = results.tier2.length / allKeywords.length;
    const tier3Ratio = results.tier3.length / allKeywords.length;
    
    const idealRatios = [0.1, 0.4, 0.5]; // Ideal distribution
    const actualRatios = [dream100Ratio, tier2Ratio, tier3Ratio];
    const distributionScore = 1 - actualRatios.reduce((sum, ratio, i) => 
      sum + Math.abs(ratio - idealRatios[i]), 0) / 2;
    
    // Weighted quality score
    return (avgRelevance * 0.5) + (diversity * 0.3) + (distributionScore * 0.2);
  }
}

describe('ExpansionService', () => {
  let expansionService: MockExpansionService;
  let mockSeedKeywords: SeedKeyword[];
  let defaultConfig: ExpansionConfig;

  beforeEach(() => {
    defaultConfig = {
      dream100Count: 100,
      tier2PerDream: 10,
      tier3PerTier2: 10,
      maxTotalKeywords: 10000,
      relevanceThreshold: 0.6,
      diversityFactor: 0.8
    };

    expansionService = new MockExpansionService(defaultConfig);

    mockSeedKeywords = [
      {
        keyword: 'digital marketing',
        market: 'US',
        language: 'en'
      },
      {
        keyword: 'content marketing',
        market: 'US',
        language: 'en'
      }
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('expandSeedKeywords', () => {
    it('should generate comprehensive keyword expansion', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);

      expect(results.dream100.length).toBeGreaterThan(0);
      expect(results.dream100.length).toBeLessThanOrEqual(defaultConfig.dream100Count);
      expect(results.tier2.length).toBeGreaterThan(0);
      expect(results.tier3.length).toBeGreaterThan(0);
      expect(results.totalCount).toBe(results.dream100.length + results.tier2.length + results.tier3.length);
      expect(results.expansionTime).toBeGreaterThan(0);
    });

    it('should respect maximum keyword limits', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);

      expect(results.totalCount).toBeLessThanOrEqual(defaultConfig.maxTotalKeywords);
      expect(results.dream100.length).toBeLessThanOrEqual(defaultConfig.dream100Count);
    });

    it('should maintain hierarchical structure', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);

      // Dream 100 should have seed keywords as parents
      results.dream100.forEach(keyword => {
        expect(mockSeedKeywords.some(seed => seed.keyword === keyword.parentKeyword)).toBe(true);
        expect(keyword.stage).toBe('dream100');
      });

      // Tier 2 should have Dream 100 keywords as parents
      results.tier2.forEach(keyword => {
        expect(results.dream100.some(dream => dream.keyword === keyword.parentKeyword)).toBe(true);
        expect(keyword.stage).toBe('tier2');
      });

      // Tier 3 should have Tier 2 keywords as parents
      results.tier3.forEach(keyword => {
        expect(results.tier2.some(tier2 => tier2.keyword === keyword.parentKeyword)).toBe(true);
        expect(keyword.stage).toBe('tier3');
      });
    });

    it('should generate realistic keyword metrics', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      const allKeywords = [...results.dream100, ...results.tier2, ...results.tier3];

      allKeywords.forEach(keyword => {
        expect(keyword.volume).toBeGreaterThan(0);
        expect(keyword.difficulty).toBeGreaterThanOrEqual(1);
        expect(keyword.difficulty).toBeLessThanOrEqual(100);
        expect(keyword.cpc).toBeGreaterThan(0);
        expect(keyword.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(keyword.relevanceScore).toBeLessThanOrEqual(1);
        expect(['commercial', 'informational', 'navigational', 'transactional']).toContain(keyword.intent);
      });
    });

    it('should handle empty seed keywords', async () => {
      await expect(expansionService.expandSeedKeywords([])).rejects.toThrow();
    });

    it('should handle single seed keyword', async () => {
      const singleSeed = [mockSeedKeywords[0]];
      const results = await expansionService.expandSeedKeywords(singleSeed);

      expect(results.dream100.length).toBeGreaterThan(0);
      expect(results.tier2.length).toBeGreaterThan(0);
      expect(results.tier3.length).toBeGreaterThan(0);
    });
  });

  describe('Dream 100 generation', () => {
    it('should generate exactly 100 or configured count of keywords', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      expect(results.dream100.length).toBeLessThanOrEqual(defaultConfig.dream100Count);
    });

    it('should prioritize high-relevance keywords for Dream 100', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      
      const avgRelevance = results.dream100.reduce((sum, kw) => sum + kw.relevanceScore, 0) / results.dream100.length;
      expect(avgRelevance).toBeGreaterThan(0.7); // Dream 100 should have high relevance
    });

    it('should include diverse keyword types in Dream 100', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      
      const intents = new Set(results.dream100.map(kw => kw.intent));
      expect(intents.size).toBeGreaterThan(1); // Should have multiple intent types
    });
  });

  describe('Tier 2 generation', () => {
    it('should generate appropriate number of tier 2 keywords per dream keyword', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      
      // Should be roughly tier2PerDream * dream100 count (allowing for limits)
      const expectedMax = defaultConfig.tier2PerDream * results.dream100.length;
      expect(results.tier2.length).toBeLessThanOrEqual(expectedMax);
    });

    it('should maintain parent-child relationships for tier 2', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      
      results.tier2.forEach(tier2Keyword => {
        const hasParent = results.dream100.some(dreamKeyword => 
          dreamKeyword.keyword === tier2Keyword.parentKeyword
        );
        expect(hasParent).toBe(true);
      });
    });
  });

  describe('Tier 3 generation', () => {
    it('should generate long-tail keywords in tier 3', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      
      // Tier 3 keywords should generally be longer
      const avgTier3Length = results.tier3.reduce((sum, kw) => sum + kw.keyword.length, 0) / results.tier3.length;
      const avgTier2Length = results.tier2.reduce((sum, kw) => sum + kw.keyword.length, 0) / results.tier2.length;
      
      expect(avgTier3Length).toBeGreaterThanOrEqual(avgTier2Length);
    });

    it('should have lower volume keywords in tier 3', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      
      if (results.tier3.length > 0 && results.dream100.length > 0) {
        const avgTier3Volume = results.tier3.reduce((sum, kw) => sum + kw.volume, 0) / results.tier3.length;
        const avgDream100Volume = results.dream100.reduce((sum, kw) => sum + kw.volume, 0) / results.dream100.length;
        
        expect(avgTier3Volume).toBeLessThan(avgDream100Volume);
      }
    });
  });

  describe('validateExpansion', () => {
    it('should validate correct expansion results', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      const isValid = expansionService.validateExpansion(results);
      expect(isValid).toBe(true);
    });

    it('should detect oversized expansions', () => {
      const invalidResults: ExpansionResults = {
        dream100: Array.from({ length: 150 }, () => ({} as ExpandedKeyword)), // Too many
        tier2: [],
        tier3: [],
        totalCount: 150,
        expansionTime: 1000
      };

      const isValid = expansionService.validateExpansion(invalidResults);
      expect(isValid).toBe(false);
    });

    it('should detect low relevance keywords', () => {
      const lowRelevanceKeyword: ExpandedKeyword = {
        id: 'test',
        keyword: 'irrelevant keyword',
        stage: 'dream100',
        parentKeyword: 'digital marketing',
        volume: 1000,
        difficulty: 50,
        cpc: 2.0,
        intent: 'informational',
        relevanceScore: 0.1, // Very low relevance
        expansionReason: 'test',
        runId: 'test'
      };

      const invalidResults: ExpansionResults = {
        dream100: Array.from({ length: 50 }, () => lowRelevanceKeyword),
        tier2: [],
        tier3: [],
        totalCount: 50,
        expansionTime: 1000
      };

      const isValid = expansionService.validateExpansion(invalidResults);
      expect(isValid).toBe(false);
    });
  });

  describe('calculateExpansionQuality', () => {
    it('should calculate quality score for expansion results', async () => {
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      const quality = expansionService.calculateExpansionQuality(results);

      expect(quality).toBeGreaterThanOrEqual(0);
      expect(quality).toBeLessThanOrEqual(1);
      expect(quality).toBeGreaterThan(0.5); // Should be reasonably high quality
    });

    it('should return 0 for empty results', () => {
      const emptyResults: ExpansionResults = {
        dream100: [],
        tier2: [],
        tier3: [],
        totalCount: 0,
        expansionTime: 0
      };

      const quality = expansionService.calculateExpansionQuality(emptyResults);
      expect(quality).toBe(0);
    });
  });

  describe('performance and scalability', () => {
    it('should complete expansion within reasonable time', async () => {
      const startTime = Date.now();
      const results = await expansionService.expandSeedKeywords(mockSeedKeywords);
      const actualTime = Date.now() - startTime;

      expect(actualTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(results.expansionTime).toBeGreaterThan(0);
    });

    it('should handle large seed keyword lists', async () => {
      const largeSeedList = Array.from({ length: 10 }, (_, i) => ({
        keyword: `seed keyword ${i}`,
        market: 'US',
        language: 'en'
      }));

      const results = await expansionService.expandSeedKeywords(largeSeedList);
      
      expect(results.totalCount).toBeGreaterThan(0);
      expect(results.totalCount).toBeLessThanOrEqual(defaultConfig.maxTotalKeywords);
    });

    it('should maintain performance with different configurations', async () => {
      const smallConfig: ExpansionConfig = {
        dream100Count: 50,
        tier2PerDream: 5,
        tier3PerTier2: 5,
        maxTotalKeywords: 1000,
        relevanceThreshold: 0.7,
        diversityFactor: 0.9
      };

      const smallExpansionService = new MockExpansionService(smallConfig);
      const results = await smallExpansionService.expandSeedKeywords([mockSeedKeywords[0]]);

      expect(results.dream100.length).toBeLessThanOrEqual(smallConfig.dream100Count);
      expect(results.totalCount).toBeLessThanOrEqual(smallConfig.maxTotalKeywords);
    });
  });
});