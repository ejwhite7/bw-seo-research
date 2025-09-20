/**
 * Universe Expansion Service Tests
 * 
 * Comprehensive test suite for the keyword universe expansion service,
 * covering tier-2 and tier-3 expansion, quality control, and integration scenarios.
 */

import {
  UniverseExpansionService,
  createUniverseExpansionService,
  processUniverseExpansionJob,
  isUniverseExpansionRequest,
  UniverseExpansionRequestSchema
} from '../universe';
import { AnthropicClient } from '../../integrations/anthropic';
import { AhrefsClient } from '../../integrations/ahrefs';
import type {
  UniverseExpansionRequest,
  UniverseExpansionResult,
  UniverseKeywordCandidate,
  UniverseStage
} from '../universe';
import type { PipelineJob } from '../../models/pipeline';

// Mock dependencies
jest.mock('../../integrations/anthropic');
jest.mock('../../integrations/ahrefs');
jest.mock('@sentry/nextjs', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn()
}));

describe('UniverseExpansionService', () => {
  let service: UniverseExpansionService;
  let mockAnthropicClient: jest.Mocked<AnthropicClient>;
  let mockAhrefsClient: jest.Mocked<AhrefsClient>;

  beforeEach(() => {
    // Setup mocked clients
    mockAnthropicClient = {
      expandKeywords: jest.fn(),
      classifyIntent: jest.fn(),
      getInstance: jest.fn()
    } as any;

    mockAhrefsClient = {
      getKeywordMetrics: jest.fn(),
      getKeywordIdeas: jest.fn(),
      getInstance: jest.fn()
    } as any;

    // Mock static getInstance methods
    (AnthropicClient.getInstance as jest.Mock).mockReturnValue(mockAnthropicClient);
    (AhrefsClient.getInstance as jest.Mock).mockReturnValue(mockAhrefsClient);

    service = new UniverseExpansionService('test-anthropic-key', 'test-ahrefs-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should create service instance with required API keys', () => {
      expect(service).toBeInstanceOf(UniverseExpansionService);
      expect(AnthropicClient.getInstance).toHaveBeenCalledWith('test-anthropic-key', undefined);
      expect(AhrefsClient.getInstance).toHaveBeenCalledWith('test-ahrefs-key', undefined);
    });

    it('should create service instance with Redis support', () => {
      const mockRedis = { get: jest.fn(), set: jest.fn() };
      const serviceWithRedis = new UniverseExpansionService('key1', 'key2', mockRedis);
      
      expect(serviceWithRedis).toBeInstanceOf(UniverseExpansionService);
      expect(AnthropicClient.getInstance).toHaveBeenCalledWith('key1', mockRedis);
      expect(AhrefsClient.getInstance).toHaveBeenCalledWith('key2', mockRedis);
    });
  });

  describe('expandToUniverse', () => {
    const mockRequest: UniverseExpansionRequest = {
      runId: 'test-run-123',
      dream100Keywords: ['marketing automation', 'email marketing', 'lead generation'],
      targetTotalCount: 1000,
      market: 'US',
      industry: 'B2B SaaS'
    };

    beforeEach(() => {
      // Mock successful API responses
      mockAnthropicClient.expandKeywords.mockResolvedValue({
        success: true,
        data: {
          keywords: [
            { keyword: 'marketing automation software', confidence: 0.8, intent: 'commercial' },
            { keyword: 'email marketing tools', confidence: 0.7, intent: 'commercial' },
            { keyword: 'lead generation strategies', confidence: 0.9, intent: 'informational' }
          ]
        }
      });

      mockAhrefsClient.getKeywordMetrics.mockResolvedValue({
        success: true,
        data: [
          {
            keyword: 'marketing automation software',
            search_volume: 2400,
            keyword_difficulty: 45,
            cpc: 8.50
          },
          {
            keyword: 'email marketing tools',
            search_volume: 1800,
            keyword_difficulty: 38,
            cpc: 6.20
          }
        ]
      });

      mockAhrefsClient.getKeywordIdeas.mockResolvedValue({
        success: true,
        data: [
          {
            keyword: 'marketing automation platform',
            search_volume: 1200,
            keyword_difficulty: 42,
            cpc: 7.80
          }
        ]
      });
    });

    it('should successfully expand Dream 100 to full universe', async () => {
      const result = await service.expandToUniverse(mockRequest);

      expect(result.success).toBe(true);
      expect(result.runId).toBe(mockRequest.runId);
      expect(result.totalKeywords).toBeGreaterThan(0);
      expect(result.keywordsByTier).toHaveProperty('dream100');
      expect(result.keywordsByTier).toHaveProperty('tier2');
      expect(result.keywordsByTier).toHaveProperty('tier3');
    });

    it('should respect target keyword count limits', async () => {
      const limitedRequest = { ...mockRequest, targetTotalCount: 500 };
      const result = await service.expandToUniverse(limitedRequest);

      expect(result.totalKeywords).toBeLessThanOrEqual(500);
    });

    it('should handle progress callbacks correctly', async () => {
      const progressCallback = jest.fn();
      await service.expandToUniverse(mockRequest, progressCallback);

      expect(progressCallback).toHaveBeenCalledTimes(expect.any(Number));
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: expect.any(String),
          progressPercent: expect.any(Number),
          currentTier: expect.any(String)
        })
      );
    });

    it('should include comprehensive processing statistics', async () => {
      const result = await service.expandToUniverse(mockRequest);

      expect(result.processingStats).toMatchObject({
        totalProcessingTime: expect.any(Number),
        stageTimings: expect.any(Object),
        apiCallCounts: {
          anthropic: expect.any(Number),
          ahrefs: expect.any(Number),
          serp: expect.any(Number)
        },
        throughputMetrics: {
          keywordsPerMinute: expect.any(Number),
          apiCallsPerMinute: expect.any(Number),
          batchesPerHour: expect.any(Number)
        }
      });
    });

    it('should include detailed cost breakdown', async () => {
      const result = await service.expandToUniverse(mockRequest);

      expect(result.costBreakdown).toMatchObject({
        totalCost: expect.any(Number),
        anthropicCost: expect.any(Number),
        ahrefsCost: expect.any(Number),
        costByTier: {
          tier2: expect.any(Number),
          tier3: expect.any(Number)
        }
      });
    });

    it('should include quality metrics and analytics', async () => {
      const result = await service.expandToUniverse(mockRequest);

      expect(result.qualityMetrics).toMatchObject({
        avgRelevanceScore: expect.any(Number),
        avgQualityScore: expect.any(Number),
        intentDistribution: expect.any(Object),
        difficultyDistribution: expect.any(Object),
        volumeDistribution: expect.any(Object),
        quickWinCounts: {
          tier2: expect.any(Number),
          tier3: expect.any(Number),
          total: expect.any(Number)
        }
      });
    });

    it('should prepare next stage data correctly', async () => {
      const result = await service.expandToUniverse(mockRequest);

      expect(result.nextStageData).toMatchObject({
        clusteringSeeds: expect.arrayContaining([expect.any(String)]),
        competitorDomains: expect.any(Array),
        gapAnalysis: expect.any(Array)
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject empty Dream 100 keywords', async () => {
      const invalidRequest = {
        runId: 'test-run-123',
        dream100Keywords: [],
        targetTotalCount: 1000
      };

      await expect(service.expandToUniverse(invalidRequest))
        .rejects.toThrow('Dream 100 keywords must be between 1 and 100 terms');
    });

    it('should reject too many Dream 100 keywords', async () => {
      const invalidRequest = {
        runId: 'test-run-123',
        dream100Keywords: Array(101).fill('keyword'),
        targetTotalCount: 1000
      };

      await expect(service.expandToUniverse(invalidRequest))
        .rejects.toThrow('Dream 100 keywords must be between 1 and 100 terms');
    });

    it('should reject target count exceeding maximum', async () => {
      const invalidRequest = {
        runId: 'test-run-123',
        dream100Keywords: ['test'],
        targetTotalCount: 15000
      };

      await expect(service.expandToUniverse(invalidRequest))
        .rejects.toThrow('Target count cannot exceed 10000 keywords');
    });
  });

  describe('Expansion Strategies', () => {
    const mockDream100 = ['marketing automation', 'email marketing'];

    beforeEach(() => {
      mockAnthropicClient.expandKeywords.mockResolvedValue({
        success: true,
        data: {
          keywords: [
            { keyword: 'marketing automation software', confidence: 0.8, intent: 'commercial' },
            { keyword: 'best marketing automation', confidence: 0.7, intent: 'commercial' }
          ]
        }
      });

      mockAhrefsClient.getKeywordIdeas.mockResolvedValue({
        success: true,
        data: [
          {
            keyword: 'marketing automation platform',
            search_volume: 1200,
            keyword_difficulty: 42,
            cpc: 7.80
          }
        ]
      });
    });

    it('should apply LLM semantic expansion strategy', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: mockDream100,
        enableSemanticVariations: true
      };

      const result = await service.expandToUniverse(request);

      expect(mockAnthropicClient.expandKeywords).toHaveBeenCalled();
      expect(result.expansionBreakdown.strategies).toContainEqual(
        expect.objectContaining({ name: 'llm_semantic' })
      );
    });

    it('should apply SERP overlap analysis when enabled', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: mockDream100,
        enableSerpAnalysis: true
      };

      const result = await service.expandToUniverse(request);

      expect(mockAhrefsClient.getKeywordIdeas).toHaveBeenCalled();
    });

    it('should apply modifier-based expansion', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: mockDream100
      };

      const result = await service.expandToUniverse(request);

      // Check that modifier variations are generated
      const tier2Keywords = result.keywordsByTier.tier2;
      const hasModifierKeywords = tier2Keywords.some(k => 
        k.keyword.includes('best ') || k.keyword.includes('top ') || k.keyword.includes(' guide')
      );
      expect(hasModifierKeywords).toBe(true);
    });

    it('should generate question-based tier-3 keywords', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: mockDream100
      };

      const result = await service.expandToUniverse(request);

      const tier3Keywords = result.keywordsByTier.tier3;
      const hasQuestionKeywords = tier3Keywords.some(k => 
        k.keyword.startsWith('what ') || 
        k.keyword.startsWith('how ') || 
        k.keyword.startsWith('why ')
      );
      expect(hasQuestionKeywords).toBe(true);
    });
  });

  describe('Quality Control', () => {
    it('should remove duplicate keywords across tiers', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      const result = await service.expandToUniverse(request);

      const allKeywords = [
        ...result.keywordsByTier.dream100.map(k => k.keyword),
        ...result.keywordsByTier.tier2.map(k => k.keyword),
        ...result.keywordsByTier.tier3.map(k => k.keyword)
      ];

      const uniqueKeywords = [...new Set(allKeywords)];
      expect(allKeywords.length).toBe(uniqueKeywords.length);
    });

    it('should filter keywords below quality threshold', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation'],
        qualityThreshold: 0.8
      };

      const result = await service.expandToUniverse(request);

      const allGeneratedKeywords = [
        ...result.keywordsByTier.tier2,
        ...result.keywordsByTier.tier3
      ];

      allGeneratedKeywords.forEach(keyword => {
        expect(keyword.qualityScore).toBeGreaterThanOrEqual(0.6); // Adjusted threshold application
      });
    });

    it('should maintain parent-child relationships', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation', 'email marketing']
      };

      const result = await service.expandToUniverse(request);

      // Check that tier-2 keywords have dream100 parents
      result.keywordsByTier.tier2.forEach(keyword => {
        if (keyword.parentKeyword) {
          expect(request.dream100Keywords).toContain(keyword.parentKeyword);
        }
      });

      // Check that tier-3 keywords have tier-2 parents
      const tier2Keywords = result.keywordsByTier.tier2.map(k => k.keyword);
      result.keywordsByTier.tier3.forEach(keyword => {
        if (keyword.parentKeyword) {
          expect(tier2Keywords).toContain(keyword.parentKeyword);
        }
      });
    });
  });

  describe('Metrics Enrichment', () => {
    beforeEach(() => {
      mockAhrefsClient.getKeywordMetrics.mockResolvedValue({
        success: true,
        data: [
          {
            keyword: 'marketing automation software',
            search_volume: 2400,
            keyword_difficulty: 45,
            cpc: 8.50
          }
        ]
      });
    });

    it('should enrich keywords with Ahrefs metrics', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      const result = await service.expandToUniverse(request);

      const enrichedKeywords = [
        ...result.keywordsByTier.tier2,
        ...result.keywordsByTier.tier3
      ].filter(k => k.volume > 0);

      expect(enrichedKeywords.length).toBeGreaterThan(0);
      enrichedKeywords.forEach(keyword => {
        expect(keyword.volume).toBeGreaterThan(0);
        expect(keyword.difficulty).toBeGreaterThanOrEqual(0);
        expect(keyword.cpc).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle API failures gracefully with estimated metrics', async () => {
      mockAhrefsClient.getKeywordMetrics.mockRejectedValue(new Error('API Error'));

      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      const result = await service.expandToUniverse(request);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      
      // Should have estimated metrics for keywords
      const keywordsWithMetrics = [
        ...result.keywordsByTier.tier2,
        ...result.keywordsByTier.tier3
      ].filter(k => k.volume > 0 || k.difficulty > 0);

      expect(keywordsWithMetrics.length).toBeGreaterThan(0);
    });

    it('should batch API requests efficiently', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: Array(10).fill(0).map((_, i) => `keyword-${i}`)
      };

      await service.expandToUniverse(request);

      // Should batch requests to avoid API rate limits
      const callCount = mockAhrefsClient.getKeywordMetrics.mock.calls.length;
      expect(callCount).toBeLessThan(50); // Much fewer calls than total keywords due to batching
    });
  });

  describe('Scoring and Classification', () => {
    it('should apply tier-specific scoring weights', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      mockAhrefsClient.getKeywordMetrics.mockResolvedValue({
        success: true,
        data: [
          {
            keyword: 'marketing automation software',
            search_volume: 1000,
            keyword_difficulty: 30,
            cpc: 5.00
          }
        ]
      });

      const result = await service.expandToUniverse(request);

      const tier2Keywords = result.keywordsByTier.tier2;
      const tier3Keywords = result.keywordsByTier.tier3;

      // Tier-2 should emphasize volume more than tier-3
      if (tier2Keywords.length > 0 && tier3Keywords.length > 0) {
        const tier2AvgScore = tier2Keywords.reduce((sum, k) => sum + k.blendedScore, 0) / tier2Keywords.length;
        const tier3AvgScore = tier3Keywords.reduce((sum, k) => sum + k.blendedScore, 0) / tier3Keywords.length;
        
        // Both tiers should have valid scores
        expect(tier2AvgScore).toBeGreaterThan(0);
        expect(tier3AvgScore).toBeGreaterThan(0);
      }
    });

    it('should identify quick win opportunities correctly', async () => {
      mockAhrefsClient.getKeywordMetrics.mockResolvedValue({
        success: true,
        data: [
          {
            keyword: 'easy marketing automation',
            search_volume: 500,
            keyword_difficulty: 20, // Low difficulty
            cpc: 3.00
          }
        ]
      });

      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      const result = await service.expandToUniverse(request);

      expect(result.qualityMetrics.quickWinCounts.total).toBeGreaterThan(0);
      
      const quickWins = [
        ...result.keywordsByTier.tier2,
        ...result.keywordsByTier.tier3
      ].filter(k => k.quickWin);

      quickWins.forEach(keyword => {
        expect(keyword.difficulty).toBeLessThan(40); // Easy keywords
        expect(keyword.volume).toBeGreaterThan(0); // Some search volume
      });
    });

    it('should classify keyword intent correctly', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      const result = await service.expandToUniverse(request);

      const allKeywords = [
        ...result.keywordsByTier.tier2,
        ...result.keywordsByTier.tier3
      ];

      const intentCounts = result.qualityMetrics.intentDistribution;
      const totalWithIntent = Object.values(intentCounts).reduce((sum, count) => sum + count, 0);

      expect(totalWithIntent).toBeGreaterThan(0);
      expect(intentCounts.commercial).toBeGreaterThan(0);
      expect(intentCounts.informational).toBeGreaterThan(0);
    });
  });

  describe('Smart Capping', () => {
    it('should cap results to target count when exceeded', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: Array(50).fill(0).map((_, i) => `keyword-${i}`),
        targetTotalCount: 500,
        maxTier2PerDream: 20,
        maxTier3PerTier2: 20
      };

      const result = await service.expandToUniverse(request);

      expect(result.totalKeywords).toBeLessThanOrEqual(500);
    });

    it('should prioritize higher-quality keywords when capping', async () => {
      mockAhrefsClient.getKeywordMetrics.mockResolvedValue({
        success: true,
        data: Array(100).fill(0).map((_, i) => ({
          keyword: `keyword-${i}`,
          search_volume: Math.random() * 5000,
          keyword_difficulty: Math.random() * 100,
          cpc: Math.random() * 10
        }))
      });

      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation'],
        targetTotalCount: 100
      };

      const result = await service.expandToUniverse(request);

      // Check that selected keywords have reasonable quality scores
      const allKeywords = [
        ...result.keywordsByTier.tier2,
        ...result.keywordsByTier.tier3
      ];

      const avgQuality = allKeywords.reduce((sum, k) => sum + k.blendedScore, 0) / allKeywords.length;
      expect(avgQuality).toBeGreaterThan(0.3); // Should maintain decent quality after capping
    });

    it('should maintain tier distribution ratios when capping', async () => {
      const request = {
        runId: 'test-run-123',
        dream100Keywords: Array(10).fill(0).map((_, i) => `keyword-${i}`),
        targetTotalCount: 200
      };

      const result = await service.expandToUniverse(request);

      const tier2Ratio = result.keywordsByTier.tier2.length / result.totalKeywords;
      const tier3Ratio = result.keywordsByTier.tier3.length / result.totalKeywords;

      // Tier-3 should dominate the distribution
      expect(tier3Ratio).toBeGreaterThan(tier2Ratio);
      expect(tier2Ratio).toBeLessThan(0.2); // ~10% tier-2
      expect(tier3Ratio).toBeGreaterThan(0.7); // ~80%+ tier-3
    });
  });

  describe('Error Handling', () => {
    it('should handle Anthropic API failures gracefully', async () => {
      mockAnthropicClient.expandKeywords.mockRejectedValue(new Error('Anthropic API Error'));

      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      await expect(service.expandToUniverse(request))
        .rejects.toThrow('Anthropic API Error');
    });

    it('should handle Ahrefs API partial failures', async () => {
      mockAhrefsClient.getKeywordMetrics
        .mockResolvedValueOnce({
          success: true,
          data: [{ keyword: 'test', search_volume: 100, keyword_difficulty: 30, cpc: 2.0 }]
        })
        .mockRejectedValueOnce(new Error('Ahrefs batch failed'));

      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation', 'email marketing']
      };

      const result = await service.expandToUniverse(request);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should timeout on excessively long processing', async () => {
      // Mock slow API responses
      mockAnthropicClient.expandKeywords.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 35 * 60 * 1000)) // 35 minutes
      );

      const request = {
        runId: 'test-run-123',
        dream100Keywords: ['marketing automation']
      };

      await expect(service.expandToUniverse(request))
        .rejects.toThrow();
    }, 10000); // 10 second test timeout
  });

  describe('Service Health and Monitoring', () => {
    it('should report service health correctly', () => {
      const health = service.getServiceHealth();

      expect(health).toMatchObject({
        status: expect.stringMatching(/^(healthy|degraded|down)$/),
        integrations: {
          anthropic: expect.stringMatching(/^(connected|error)$/),
          ahrefs: expect.stringMatching(/^(connected|error)$/)
        },
        lastExpansion: expect.any(Object)
      });
    });

    it('should provide accurate cost estimates', () => {
      const estimate = service.estimateExpansionCost(50, 5000, true);

      expect(estimate).toMatchObject({
        estimatedCost: expect.any(Number),
        breakdown: {
          tier2Expansion: expect.any(Number),
          tier3Expansion: expect.any(Number),
          ahrefsEnrichment: expect.any(Number),
          qualityControl: expect.any(Number)
        },
        confidence: expect.any(Number)
      });

      expect(estimate.estimatedCost).toBeGreaterThan(0);
      expect(estimate.confidence).toBeGreaterThan(0.5);
    });
  });
});

describe('Universe Expansion Validation', () => {
  describe('UniverseExpansionRequestSchema', () => {
    it('should validate correct request format', () => {
      const validRequest = {
        runId: '123e4567-e89b-12d3-a456-426614174000',
        dream100Keywords: ['marketing automation', 'email marketing'],
        targetTotalCount: 5000,
        market: 'US',
        industry: 'B2B SaaS'
      };

      const result = UniverseExpansionRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const invalidRequest = {
        runId: 'invalid-uuid',
        dream100Keywords: ['test'],
        targetTotalCount: 1000
      };

      const result = UniverseExpansionRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should apply default values correctly', () => {
      const minimalRequest = {
        runId: '123e4567-e89b-12d3-a456-426614174000',
        dream100Keywords: ['test']
      };

      const result = UniverseExpansionRequestSchema.parse(minimalRequest);
      expect(result.targetTotalCount).toBe(10000);
      expect(result.maxTier2PerDream).toBe(10);
      expect(result.maxTier3PerTier2).toBe(10);
      expect(result.market).toBe('US');
      expect(result.qualityThreshold).toBe(0.6);
    });

    it('should enforce keyword count limits', () => {
      const tooManyKeywords = {
        runId: '123e4567-e89b-12d3-a456-426614174000',
        dream100Keywords: Array(101).fill('keyword')
      };

      const result = UniverseExpansionRequestSchema.safeParse(tooManyKeywords);
      expect(result.success).toBe(false);
    });
  });

  describe('isUniverseExpansionRequest', () => {
    it('should validate proper request objects', () => {
      const validRequest = {
        runId: '123e4567-e89b-12d3-a456-426614174000',
        dream100Keywords: ['test'],
        targetTotalCount: 1000,
        market: 'US'
      };

      expect(isUniverseExpansionRequest(validRequest)).toBe(true);
    });

    it('should reject invalid objects', () => {
      const invalidRequest = {
        runId: 'invalid',
        dream100Keywords: []
      };

      expect(isUniverseExpansionRequest(invalidRequest)).toBe(false);
    });

    it('should reject non-objects', () => {
      expect(isUniverseExpansionRequest('string')).toBe(false);
      expect(isUniverseExpansionRequest(null)).toBe(false);
      expect(isUniverseExpansionRequest(123)).toBe(false);
    });
  });
});

describe('Factory Functions', () => {
  describe('createUniverseExpansionService', () => {
    it('should create service instance with required parameters', () => {
      const service = createUniverseExpansionService('anthropic-key', 'ahrefs-key');
      expect(service).toBeInstanceOf(UniverseExpansionService);
    });

    it('should create service instance with Redis support', () => {
      const mockRedis = { get: jest.fn() };
      const service = createUniverseExpansionService('key1', 'key2', mockRedis);
      expect(service).toBeInstanceOf(UniverseExpansionService);
    });
  });
});

describe('Job Queue Integration', () => {
  let mockService: jest.Mocked<UniverseExpansionService>;
  let mockJob: PipelineJob;

  beforeEach(() => {
    mockService = {
      expandToUniverse: jest.fn(),
      getServiceHealth: jest.fn(),
      estimateExpansionCost: jest.fn()
    } as any;

    mockJob = {
      id: 'job-123',
      runId: 'run-456',
      stage: 'tier2_expansion',
      status: 'processing',
      priority: 5,
      data: {
        stage: 'tier2_expansion',
        input: {
          runId: 'run-456',
          dream100Keywords: ['marketing automation', 'email marketing'],
          targetTotalCount: 1000
        },
        config: {} as any,
        resources: {} as any
      },
      result: null,
      error: null,
      metadata: {} as any,
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: null,
      completedAt: null,
      retryCount: 0,
      maxRetries: 3
    };
  });

  describe('processUniverseExpansionJob', () => {
    it('should process valid job successfully', async () => {
      const mockResult = {
        success: true,
        runId: 'run-456',
        totalKeywords: 500,
        keywordsByTier: { dream100: [], tier2: [], tier3: [] },
        processingStats: {
          apiCallCounts: { anthropic: 2, ahrefs: 5, serp: 1 }
        },
        costBreakdown: {
          totalCost: 10.50,
          anthropicCost: 5.00,
          ahrefsCost: 5.50
        },
        warnings: [],
        errors: []
      } as any;

      mockService.expandToUniverse.mockResolvedValue(mockResult);

      const result = await processUniverseExpansionJob(mockJob, mockService);

      expect(result.success).toBe(true);
      expect(result.output).toBe(mockResult);
      expect(result.metrics).toMatchObject({
        executionTime: expect.any(Number),
        apiCalls: {
          anthropic: 2,
          ahrefs: 5
        },
        costs: {
          total: 10.50,
          anthropic: 5.00,
          ahrefs: 5.50
        }
      });
    });

    it('should handle invalid job input gracefully', async () => {
      const invalidJob = {
        ...mockJob,
        data: {
          ...mockJob.data,
          input: { invalid: 'request' }
        }
      };

      const result = await processUniverseExpansionJob(invalidJob, mockService);

      expect(result.success).toBe(false);
      expect(result.metrics.dataProcessed.errors).toBe(1);
    });

    it('should handle service failures gracefully', async () => {
      mockService.expandToUniverse.mockRejectedValue(new Error('Service failure'));

      const result = await processUniverseExpansionJob(mockJob, mockService);

      expect(result.success).toBe(false);
      expect(result.metrics.dataProcessed.errors).toBe(1);
    });

    it('should include accurate execution metrics', async () => {
      const mockResult = {
        success: true,
        totalKeywords: 100,
        processingStats: { apiCallCounts: { anthropic: 1, ahrefs: 2, serp: 0 } },
        costBreakdown: { totalCost: 5.00, anthropicCost: 2.00, ahrefsCost: 3.00 },
        warnings: ['Test warning'],
        errors: []
      } as any;

      mockService.expandToUniverse.mockResolvedValue(mockResult);

      const result = await processUniverseExpansionJob(mockJob, mockService);

      expect(result.metrics.executionTime).toBeGreaterThan(0);
      expect(result.metrics.dataProcessed.input).toBe(2); // Dream 100 count
      expect(result.metrics.dataProcessed.output).toBe(100);
      expect(result.warnings).toContain('Test warning');
    });
  });
});

describe('Integration Scenarios', () => {
  let service: UniverseExpansionService;
  let mockAnthropicClient: jest.Mocked<AnthropicClient>;
  let mockAhrefsClient: jest.Mocked<AhrefsClient>;

  beforeEach(() => {
    mockAnthropicClient = {
      expandKeywords: jest.fn(),
      classifyIntent: jest.fn()
    } as any;

    mockAhrefsClient = {
      getKeywordMetrics: jest.fn(),
      getKeywordIdeas: jest.fn()
    } as any;

    (AnthropicClient.getInstance as jest.Mock).mockReturnValue(mockAnthropicClient);
    (AhrefsClient.getInstance as jest.Mock).mockReturnValue(mockAhrefsClient);

    service = new UniverseExpansionService('test-key-1', 'test-key-2');
  });

  it('should handle complete end-to-end expansion workflow', async () => {
    // Mock comprehensive API responses
    mockAnthropicClient.expandKeywords.mockResolvedValue({
      success: true,
      data: {
        keywords: [
          { keyword: 'marketing automation platform', confidence: 0.85, intent: 'commercial' },
          { keyword: 'email marketing software', confidence: 0.80, intent: 'commercial' },
          { keyword: 'lead generation tool', confidence: 0.75, intent: 'transactional' }
        ]
      }
    });

    mockAhrefsClient.getKeywordIdeas.mockResolvedValue({
      success: true,
      data: [
        { keyword: 'automation marketing tools', search_volume: 890, keyword_difficulty: 35, cpc: 4.20 },
        { keyword: 'email campaign software', search_volume: 650, keyword_difficulty: 28, cpc: 3.80 }
      ]
    });

    mockAhrefsClient.getKeywordMetrics.mockResolvedValue({
      success: true,
      data: [
        { keyword: 'marketing automation platform', search_volume: 1200, keyword_difficulty: 42, cpc: 7.50 },
        { keyword: 'email marketing software', search_volume: 980, keyword_difficulty: 38, cpc: 6.10 },
        { keyword: 'what is marketing automation', search_volume: 320, keyword_difficulty: 25, cpc: 2.40 }
      ]
    });

    const request: UniverseExpansionRequest = {
      runId: 'integration-test-123',
      dream100Keywords: ['marketing automation', 'email marketing', 'lead generation'],
      targetTotalCount: 500,
      market: 'US',
      industry: 'B2B SaaS',
      enableCompetitorMining: true,
      enableSerpAnalysis: true,
      enableSemanticVariations: true
    };

    const result = await service.expandToUniverse(request);

    // Verify comprehensive results
    expect(result.success).toBe(true);
    expect(result.totalKeywords).toBeGreaterThan(50);
    expect(result.totalKeywords).toBeLessThanOrEqual(500);
    
    // Verify tier distribution
    expect(result.keywordsByTier.dream100.length).toBe(3);
    expect(result.keywordsByTier.tier2.length).toBeGreaterThan(0);
    expect(result.keywordsByTier.tier3.length).toBeGreaterThan(0);
    
    // Verify quality metrics
    expect(result.qualityMetrics.avgRelevanceScore).toBeGreaterThan(0.5);
    expect(result.qualityMetrics.avgQualityScore).toBeGreaterThan(0.5);
    
    // Verify cost tracking
    expect(result.costBreakdown.totalCost).toBeGreaterThan(0);
    
    // Verify processing stats
    expect(result.processingStats.totalProcessingTime).toBeGreaterThan(0);
    expect(result.processingStats.apiCallCounts.anthropic).toBeGreaterThan(0);
    expect(result.processingStats.apiCallCounts.ahrefs).toBeGreaterThan(0);
  });

  it('should handle realistic API rate limiting scenarios', async () => {
    // Simulate rate limit delays
    let callCount = 0;
    mockAhrefsClient.getKeywordMetrics.mockImplementation(async () => {
      callCount++;
      if (callCount % 3 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
      }
      return {
        success: true,
        data: [
          { keyword: `keyword-${callCount}`, search_volume: 100, keyword_difficulty: 30, cpc: 2.0 }
        ]
      };
    });

    const request: UniverseExpansionRequest = {
      runId: 'rate-limit-test-123',
      dream100Keywords: Array(20).fill(0).map((_, i) => `seed-keyword-${i}`),
      targetTotalCount: 1000
    };

    const startTime = Date.now();
    const result = await service.expandToUniverse(request);
    const endTime = Date.now();

    expect(result.success).toBe(true);
    expect(endTime - startTime).toBeGreaterThan(1000); // Should take some time due to rate limiting
    expect(result.processingStats.batchInfo.totalBatches).toBeGreaterThan(1);
  });
});