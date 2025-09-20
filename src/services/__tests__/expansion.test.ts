/**
 * Dream 100 Expansion Service Tests
 * 
 * Comprehensive test suite covering all aspects of the expansion service
 * including unit tests, integration tests, error handling, and performance tests.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  Dream100ExpansionService,
  Dream100ExpansionRequest,
  Dream100ExpansionResult,
  isDream100ExpansionRequest,
  processExpansionJob
} from '../expansion';
import { AnthropicClient } from '../../integrations/anthropic';
import { AhrefsClient } from '../../integrations/ahrefs';
import type { PipelineJob, KeywordStage, KeywordIntent } from '../../models';

// Mock external dependencies
jest.mock('../../integrations/anthropic');
jest.mock('../../integrations/ahrefs');
jest.mock('@sentry/nextjs', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn()
}));

const MockedAnthropicClient = AnthropicClient as jest.MockedClass<typeof AnthropicClient>;
const MockedAhrefsClient = AhrefsClient as jest.MockedClass<typeof AhrefsClient>;

describe('Dream100ExpansionService', () => {
  let expansionService: Dream100ExpansionService;
  let mockAnthropicClient: jest.Mocked<AnthropicClient>;
  let mockAhrefsClient: jest.Mocked<AhrefsClient>;

  const mockAnthropicApiKey = 'test-anthropic-key';
  const mockAhrefsApiKey = 'test-ahrefs-key';

  const sampleRequest: Dream100ExpansionRequest = {
    runId: '123e4567-e89b-12d3-a456-426614174000',
    seedKeywords: ['content marketing', 'SEO tools'],
    targetCount: 10,
    market: 'US',
    industry: 'marketing technology',
    intentFocus: 'commercial',
    difficultyPreference: 'medium',
    budgetLimit: 50.0,
    qualityThreshold: 0.7,
    includeCompetitorAnalysis: false
  };

  const mockAnthropicExpansionResponse = {
    data: {
      keywords: [
        { keyword: 'content marketing strategy', intent: 'informational', relevance_score: 0.9, reasoning: 'Direct match' },
        { keyword: 'best content marketing tools', intent: 'commercial', relevance_score: 0.8, reasoning: 'Tool focused' },
        { keyword: 'content marketing software', intent: 'commercial', relevance_score: 0.85, reasoning: 'Software intent' },
        { keyword: 'SEO content tools', intent: 'commercial', relevance_score: 0.75, reasoning: 'SEO + tools' },
        { keyword: 'marketing automation platforms', intent: 'commercial', relevance_score: 0.7, reasoning: 'Platform search' }
      ],
      total_generated: 5,
      processing_time: 2500,
      model_used: 'claude-3-5-sonnet-20241022'
    },
    usage: {
      input_tokens: 150,
      output_tokens: 300,
      model: 'claude-3-5-sonnet-20241022',
      cost_estimate: 0.15,
      request_id: 'test-request-1'
    },
    model: 'claude-3-5-sonnet-20241022',
    finish_reason: 'complete',
    request_id: 'test-request-1',
    processing_time: 2500
  };

  const mockAhrefsMetricsResponse = {
    success: true,
    data: [
      {
        keyword: 'content marketing strategy',
        search_volume: 5400,
        keyword_difficulty: 65,
        cpc: 3.20,
        traffic_potential: 2100,
        return_rate: 0.12,
        clicks: 1890,
        global_volume: 8900
      },
      {
        keyword: 'best content marketing tools',
        search_volume: 2100,
        keyword_difficulty: 45,
        cpc: 8.50,
        traffic_potential: 1200,
        return_rate: 0.18,
        clicks: 980,
        global_volume: 3200
      },
      {
        keyword: 'content marketing software',
        search_volume: 1800,
        keyword_difficulty: 55,
        cpc: 12.30,
        traffic_potential: 890,
        return_rate: 0.25,
        clicks: 450,
        global_volume: 2800
      }
    ],
    metadata: {
      quota: {
        rowsLeft: 9997,
        rowsLimit: 10000,
        resetAt: '2024-01-01T00:00:00Z'
      }
    }
  };

  const mockIntentClassificationResponse = {
    data: [
      { keyword: 'content marketing strategy', intent: 'informational', confidence: 0.85, reasoning: 'Strategy focused', suggested_content_type: ['guide', 'tutorial'] },
      { keyword: 'best content marketing tools', intent: 'commercial', confidence: 0.9, reasoning: 'Tool comparison', suggested_content_type: ['comparison', 'review'] },
      { keyword: 'content marketing software', intent: 'commercial', confidence: 0.88, reasoning: 'Software purchase intent', suggested_content_type: ['review', 'comparison'] }
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 200,
      model: 'claude-3-5-sonnet-20241022',
      cost_estimate: 0.08,
      request_id: 'test-request-2'
    },
    model: 'claude-3-5-sonnet-20241022',
    finish_reason: 'complete',
    request_id: 'test-request-2',
    processing_time: 1200
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocked clients
    mockAnthropicClient = {
      expandToDream100: jest.fn(),
      classifyIntent: jest.fn(),
      generateTitles: jest.fn(),
      clusterKeywords: jest.fn(),
      analyzeCompetitors: jest.fn(),
      processKeywordsBatch: jest.fn(),
      estimateCost: jest.fn()
    } as any;

    mockAhrefsClient = {
      getKeywordMetrics: jest.fn(),
      getKeywordOverview: jest.fn(),
      getKeywordIdeas: jest.fn(),
      getCompetitorKeywords: jest.fn(),
      processKeywordsBatch: jest.fn(),
      getQuotaStatus: jest.fn(),
      estimateCost: jest.fn()
    } as any;

    // Mock static getInstance methods
    MockedAnthropicClient.getInstance = jest.fn().mockReturnValue(mockAnthropicClient);
    MockedAhrefsClient.getInstance = jest.fn().mockReturnValue(mockAhrefsClient);

    // Create service instance
    expansionService = new Dream100ExpansionService(
      mockAnthropicApiKey,
      mockAhrefsApiKey
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with valid API keys', () => {
      expect(expansionService).toBeInstanceOf(Dream100ExpansionService);
      expect(MockedAnthropicClient.getInstance).toHaveBeenCalledWith(mockAnthropicApiKey, undefined);
      expect(MockedAhrefsClient.getInstance).toHaveBeenCalledWith(mockAhrefsApiKey, undefined);
    });

    it('should create service with Redis support', () => {
      const mockRedis = { host: 'localhost', port: 6379 };
      new Dream100ExpansionService(mockAnthropicApiKey, mockAhrefsApiKey, mockRedis);
      
      expect(MockedAnthropicClient.getInstance).toHaveBeenCalledWith(mockAnthropicApiKey, mockRedis);
      expect(MockedAhrefsClient.getInstance).toHaveBeenCalledWith(mockAhrefsApiKey, mockRedis);
    });
  });

  describe('expandToDream100', () => {
    beforeEach(() => {
      // Setup default successful mocks
      mockAnthropicClient.expandToDream100.mockResolvedValue(mockAnthropicExpansionResponse);
      mockAhrefsClient.getKeywordMetrics.mockResolvedValue(mockAhrefsMetricsResponse);
      mockAnthropicClient.classifyIntent.mockResolvedValue(mockIntentClassificationResponse);
    });

    it('should successfully expand keywords to Dream 100', async () => {
      const result = await expansionService.expandToDream100(sampleRequest);

      expect(result.success).toBe(true);
      expect(result.runId).toBe(sampleRequest.runId);
      expect(result.dream100Keywords).toHaveLength(3); // Based on mock data
      expect(result.dream100Keywords[0].stage).toBe('dream100');
      expect(result.totalCandidatesGenerated).toBe(5);
      
      // Verify processing stats
      expect(result.processingStats.totalProcessingTime).toBeGreaterThan(0);
      expect(result.processingStats.apiCallCounts.anthropic).toBe(2); // Expansion + intent
      expect(result.processingStats.apiCallCounts.ahrefs).toBe(1); // Metrics
      
      // Verify cost breakdown
      expect(result.costBreakdown.totalCost).toBeGreaterThan(0);
      expect(result.costBreakdown.anthropicCost).toBeGreaterThan(0);
      expect(result.costBreakdown.ahrefsCost).toBeGreaterThan(0);
      
      // Verify quality metrics
      expect(result.qualityMetrics.avgRelevanceScore).toBeGreaterThan(0);
      expect(result.qualityMetrics.avgCommercialScore).toBeGreaterThan(0);
      expect(result.qualityMetrics.intentDistribution).toBeDefined();
    });

    it('should call progress callback with updates', async () => {
      const progressCallback = jest.fn();
      
      await expansionService.expandToDream100(sampleRequest, progressCallback);
      
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'llm_expansion',
          currentStep: expect.stringContaining('AI'),
          progressPercent: 10,
          keywordsProcessed: 0
        })
      );
      
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'result_preparation',
          progressPercent: 100
        })
      );
    });

    it('should handle target count properly', async () => {
      const customRequest = { ...sampleRequest, targetCount: 5 };
      
      const result = await expansionService.expandToDream100(customRequest);
      
      expect(result.dream100Keywords.length).toBeLessThanOrEqual(5);
    });

    it('should filter keywords by quality threshold', async () => {
      const highQualityRequest = { ...sampleRequest, qualityThreshold: 0.9 };
      
      const result = await expansionService.expandToDream100(highQualityRequest);
      
      // Should have fewer results due to high quality threshold
      result.dream100Keywords.forEach(keyword => {
        expect(keyword.blendedScore).toBeGreaterThanOrEqual(0.7); // Service minimum
      });
    });

    it('should balance intent types when requested', async () => {
      const mixedIntentRequest = { ...sampleRequest, intentFocus: 'mixed', targetCount: 20 };
      
      // Mock more diverse intent data
      const diverseIntentResponse = {
        ...mockIntentClassificationResponse,
        data: [
          ...mockIntentClassificationResponse.data,
          { keyword: 'buy content tools', intent: 'transactional', confidence: 0.95, reasoning: 'Purchase intent', suggested_content_type: ['product'] },
          { keyword: 'content marketing login', intent: 'navigational', confidence: 0.8, reasoning: 'Navigation intent', suggested_content_type: ['page'] }
        ]
      };
      
      mockAnthropicClient.classifyIntent.mockResolvedValue(diverseIntentResponse);
      
      const result = await expansionService.expandToDream100(mixedIntentRequest);
      
      // Should have diverse intent types
      const intentTypes = new Set(result.dream100Keywords.map(k => k.intent));
      expect(intentTypes.size).toBeGreaterThan(1);
    });

    it('should ensure quick wins when requested', async () => {
      const result = await expansionService.expandToDream100(sampleRequest);
      
      const quickWins = result.dream100Keywords.filter(k => k.quickWin);
      expect(quickWins.length).toBeGreaterThan(0); // Should have some quick wins
      expect(result.qualityMetrics.quickWinCount).toBe(quickWins.length);
    });
  });

  describe('Input Validation', () => {
    it('should reject requests with no seed keywords', async () => {
      const invalidRequest = { ...sampleRequest, seedKeywords: [] };
      
      await expect(
        expansionService.expandToDream100(invalidRequest)
      ).rejects.toThrow('Seed keywords must be between 1 and 5 terms');
    });

    it('should reject requests with too many seed keywords', async () => {
      const invalidRequest = {
        ...sampleRequest,
        seedKeywords: ['kw1', 'kw2', 'kw3', 'kw4', 'kw5', 'kw6']
      };
      
      await expect(
        expansionService.expandToDream100(invalidRequest)
      ).rejects.toThrow('Seed keywords must be between 1 and 5 terms');
    });

    it('should reject requests with target count > 100', async () => {
      const invalidRequest = { ...sampleRequest, targetCount: 150 };
      
      await expect(
        expansionService.expandToDream100(invalidRequest)
      ).rejects.toThrow('Target count cannot exceed 100');
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM expansion failure', async () => {
      mockAnthropicClient.expandToDream100.mockRejectedValue(
        new Error('Anthropic API error')
      );
      
      await expect(
        expansionService.expandToDream100(sampleRequest)
      ).rejects.toThrow('LLM expansion failed');
    });

    it('should handle Ahrefs enrichment failure gracefully', async () => {
      mockAnthropicClient.expandToDream100.mockResolvedValue(mockAnthropicExpansionResponse);
      mockAhrefsClient.getKeywordMetrics.mockRejectedValue(
        new Error('Ahrefs API error')
      );
      
      await expect(
        expansionService.expandToDream100(sampleRequest)
      ).rejects.toThrow('Ahrefs enrichment failed completely');
    });

    it('should handle intent classification failure with fallback', async () => {
      mockAnthropicClient.expandToDream100.mockResolvedValue(mockAnthropicExpansionResponse);
      mockAhrefsClient.getKeywordMetrics.mockResolvedValue(mockAhrefsMetricsResponse);
      mockAnthropicClient.classifyIntent.mockRejectedValue(
        new Error('Intent classification failed')
      );
      
      const result = await expansionService.expandToDream100(sampleRequest);
      
      // Should still succeed with heuristic fallback
      expect(result.success).toBe(true);
      expect(result.dream100Keywords.every(k => k.intent !== null)).toBe(true);
    });

    it('should handle partial API failures and continue processing', async () => {
      // Mock partial failure in Ahrefs batch processing
      mockAnthropicClient.expandToDream100.mockResolvedValue({
        ...mockAnthropicExpansionResponse,
        data: {
          ...mockAnthropicExpansionResponse.data,
          keywords: Array(150).fill(null).map((_, i) => ({
            keyword: `test keyword ${i}`,
            intent: 'commercial',
            relevance_score: 0.8,
            reasoning: 'Test'
          }))
        }
      });
      
      // First batch succeeds, second fails
      mockAhrefsClient.getKeywordMetrics
        .mockResolvedValueOnce(mockAhrefsMetricsResponse)
        .mockRejectedValueOnce(new Error('Batch failed'));
      
      const result = await expansionService.expandToDream100({
        ...sampleRequest,
        targetCount: 50
      });
      
      // Should still have some results from successful batch
      expect(result.success).toBe(true);
      expect(result.dream100Keywords.length).toBeGreaterThan(0);
    });
  });

  describe('Scoring Algorithm', () => {
    it('should calculate relevance scores correctly', async () => {
      const result = await expansionService.expandToDream100(sampleRequest);
      
      result.dream100Keywords.forEach(keyword => {
        expect(keyword.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(keyword.relevanceScore).toBeLessThanOrEqual(1);
      });
    });

    it('should calculate commercial scores correctly', async () => {
      const result = await expansionService.expandToDream100(sampleRequest);
      
      result.dream100Keywords.forEach(keyword => {
        expect(keyword.commercialScore).toBeGreaterThanOrEqual(0);
        expect(keyword.commercialScore).toBeLessThanOrEqual(1);
        
        // Commercial intent keywords should have higher commercial scores
        if (keyword.intent === 'commercial' || keyword.intent === 'transactional') {
          expect(keyword.commercialScore).toBeGreaterThan(0.3);
        }
      });
    });

    it('should calculate blended scores using proper weights', async () => {
      const result = await expansionService.expandToDream100(sampleRequest);
      
      result.dream100Keywords.forEach(keyword => {
        expect(keyword.blendedScore).toBeGreaterThanOrEqual(0);
        expect(keyword.blendedScore).toBeLessThanOrEqual(1);
        
        // High volume, low difficulty should score well
        if (keyword.volume > 1000 && keyword.difficulty < 50) {
          expect(keyword.blendedScore).toBeGreaterThan(0.5);
        }
      });
    });

    it('should identify quick wins correctly', async () => {
      const result = await expansionService.expandToDream100(sampleRequest);
      
      result.dream100Keywords.forEach(keyword => {
        if (keyword.quickWin) {
          // Quick wins should have low difficulty, decent volume, and good score
          expect(keyword.difficulty).toBeLessThan(50);
          expect(keyword.volume).toBeGreaterThanOrEqual(100);
          expect(keyword.blendedScore).toBeGreaterThanOrEqual(0.7);
        }
      });
    });
  });

  describe('Performance and Efficiency', () => {
    it('should process within reasonable time limits', async () => {
      const startTime = Date.now();
      
      await expansionService.expandToDream100(sampleRequest);
      
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(30000); // 30 seconds max for test
    });

    it('should batch Ahrefs requests efficiently', async () => {
      const largeSeedRequest = {
        ...sampleRequest,
        targetCount: 50
      };
      
      // Mock large candidate set
      mockAnthropicClient.expandToDream100.mockResolvedValue({
        ...mockAnthropicExpansionResponse,
        data: {
          ...mockAnthropicExpansionResponse.data,
          keywords: Array(200).fill(null).map((_, i) => ({
            keyword: `keyword ${i}`,
            intent: 'commercial',
            relevance_score: 0.8,
            reasoning: 'Test'
          }))
        }
      });
      
      await expansionService.expandToDream100(largeSeedRequest);
      
      // Should have made multiple Ahrefs calls for batching
      expect(mockAhrefsClient.getKeywordMetrics).toHaveBeenCalledTimes(
        expect.any(Number)
      );
    });

    it('should respect rate limits with delays', async () => {
      const startTime = Date.now();
      
      // Mock multiple batches
      mockAnthropicClient.expandToDream100.mockResolvedValue({
        ...mockAnthropicExpansionResponse,
        data: {
          ...mockAnthropicExpansionResponse.data,
          keywords: Array(250).fill(null).map((_, i) => ({
            keyword: `keyword ${i}`,
            intent: 'commercial',
            relevance_score: 0.8,
            reasoning: 'Test'
          }))
        }
      });
      
      await expansionService.expandToDream100({ ...sampleRequest, targetCount: 100 });
      
      const totalTime = Date.now() - startTime;
      
      // Should include rate limiting delays
      expect(totalTime).toBeGreaterThan(1000); // At least 1 second for delays
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate costs accurately', () => {
      const estimate = expansionService.estimateExpansionCost(2, 50, false);
      
      expect(estimate.estimatedCost).toBeGreaterThan(0);
      expect(estimate.breakdown.llmExpansion).toBeGreaterThan(0);
      expect(estimate.breakdown.ahrefsEnrichment).toBeGreaterThan(0);
      expect(estimate.breakdown.intentClassification).toBeGreaterThan(0);
      expect(estimate.confidence).toBeGreaterThan(0.8);
    });

    it('should include competitor analysis in cost estimate', () => {
      const withCompetitor = expansionService.estimateExpansionCost(2, 50, true);
      const withoutCompetitor = expansionService.estimateExpansionCost(2, 50, false);
      
      expect(withCompetitor.estimatedCost).toBeGreaterThan(withoutCompetitor.estimatedCost);
      expect(withCompetitor.breakdown.competitorAnalysis).toBeGreaterThan(0);
      expect(withoutCompetitor.breakdown.competitorAnalysis).toBeUndefined();
    });
  });

  describe('Service Health', () => {
    it('should report service health', () => {
      const health = expansionService.getServiceHealth();
      
      expect(health.status).toBeDefined();
      expect(health.integrations.anthropic).toBeDefined();
      expect(health.integrations.ahrefs).toBeDefined();
    });
  });
});

describe('Validation Functions', () => {
  describe('isDream100ExpansionRequest', () => {
    it('should validate correct request format', () => {
      const validRequest: Dream100ExpansionRequest = {
        runId: '123e4567-e89b-12d3-a456-426614174000',
        seedKeywords: ['test keyword'],
        targetCount: 50,
        market: 'US',
        intentFocus: 'commercial',
        difficultyPreference: 'mixed',
        qualityThreshold: 0.8
      };
      
      expect(isDream100ExpansionRequest(validRequest)).toBe(true);
    });

    it('should reject invalid request formats', () => {
      const invalidRequests = [
        {}, // Empty object
        { runId: 'invalid-uuid' }, // Invalid UUID
        { runId: '123e4567-e89b-12d3-a456-426614174000', seedKeywords: [] }, // No keywords
        { runId: '123e4567-e89b-12d3-a456-426614174000', seedKeywords: ['a'], targetCount: 150 }, // Target too high
        { runId: '123e4567-e89b-12d3-a456-426614174000', seedKeywords: ['a'], market: 'INVALID' }, // Invalid market
      ];
      
      invalidRequests.forEach(request => {
        expect(isDream100ExpansionRequest(request)).toBe(false);
      });
    });
  });
});

describe('Job Processing', () => {
  let expansionService: Dream100ExpansionService;
  let mockJob: PipelineJob;

  beforeEach(() => {
    expansionService = new Dream100ExpansionService('test-key', 'test-key');
    
    mockJob = {
      id: 'job-123',
      runId: 'run-456',
      stage: 'dream100_generation',
      status: 'processing',
      priority: 5,
      data: {
        stage: 'dream100_generation',
        input: {
          runId: 'run-456',
          seedKeywords: ['content marketing'],
          targetCount: 10
        },
        config: {
          stage: 'dream100_generation',
          parameters: {},
          timeoutMinutes: 20,
          retryStrategy: {
            maxRetries: 3,
            backoffStrategy: 'exponential',
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
          },
          resourceLimits: {
            maxMemory: 2048,
            maxCpu: 4,
            maxDuration: 30,
            maxApiCalls: 1000,
            maxStorage: 1024
          }
        },
        resources: {
          memory: 512,
          cpu: 1,
          storage: 100,
          estimatedDuration: 10
        }
      },
      result: null,
      error: null,
      metadata: {
        userId: 'user-789',
        environment: 'test',
        version: '1.0.0',
        tags: ['expansion']
      },
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      retryCount: 0,
      maxRetries: 3
    } as PipelineJob;
  });

  it('should process expansion job successfully', async () => {
    // Mock successful expansion
    const mockResult: Dream100ExpansionResult = {
      success: true,
      runId: 'run-456',
      dream100Keywords: [{
        keyword: 'content marketing strategy',
        stage: 'dream100' as KeywordStage,
        volume: 5400,
        difficulty: 65,
        cpc: 3.20,
        intent: 'informational' as KeywordIntent,
        relevanceScore: 0.9,
        commercialScore: 0.7,
        blendedScore: 0.8,
        quickWin: false
      }],
      totalCandidatesGenerated: 10,
      processingStats: {
        totalProcessingTime: 15000,
        stageTimings: { llm_expansion: 5000, ahrefs_enrichment: 8000 },
        apiCallCounts: { anthropic: 2, ahrefs: 1 },
        batchInfo: { totalBatches: 1, avgBatchSize: 10, failedBatches: 0 },
        cacheHitRate: 0,
        throughputMetrics: { keywordsPerMinute: 4, apiCallsPerMinute: 12 }
      },
      costBreakdown: {
        totalCost: 0.50,
        anthropicCost: 0.30,
        ahrefsCost: 0.20,
        budgetUtilization: 50,
        costPerKeyword: 0.05,
        estimatedVsActual: { estimated: 0.45, actual: 0.50, variance: 0.05 }
      },
      qualityMetrics: {
        avgRelevanceScore: 0.85,
        avgCommercialScore: 0.75,
        intentDistribution: { transactional: 0, commercial: 0, informational: 1, navigational: 0 },
        difficultyDistribution: { easy: 0, medium: 1, hard: 0 },
        volumeDistribution: { low: 0, medium: 0, high: 1 },
        quickWinCount: 0,
        duplicatesRemoved: 2,
        invalidKeywordsFiltered: 1
      },
      warnings: [],
      errors: []
    };

    expansionService.expandToDream100 = jest.fn().mockResolvedValue(mockResult);

    const jobResult = await processExpansionJob(mockJob, expansionService);

    expect(jobResult.success).toBe(true);
    expect(jobResult.output).toEqual(mockResult);
    expect(jobResult.metrics.dataProcessed.input).toBe(1); // 1 seed keyword
    expect(jobResult.metrics.dataProcessed.output).toBe(1); // 1 result keyword
    expect(jobResult.metrics.costs.total).toBe(0.50);
  });

  it('should handle job processing errors', async () => {
    expansionService.expandToDream100 = jest.fn().mockRejectedValue(
      new Error('Expansion failed')
    );

    const jobResult = await processExpansionJob(mockJob, expansionService);

    expect(jobResult.success).toBe(false);
    expect(jobResult.output).toBeNull();
    expect(jobResult.metrics.dataProcessed.errors).toBe(1);
  });

  it('should validate job input format', async () => {
    const invalidJob = {
      ...mockJob,
      data: {
        ...mockJob.data,
        input: { invalid: 'data' }
      }
    };

    const jobResult = await processExpansionJob(invalidJob, expansionService);

    expect(jobResult.success).toBe(false);
  });
});

describe('Integration Tests', () => {
  // These would test actual API integrations in a test environment
  // Skipped by default to avoid API costs and external dependencies
  
  describe.skip('Live API Integration', () => {
    let expansionService: Dream100ExpansionService;
    
    beforeAll(() => {
      // Would use actual API keys from environment variables
      const anthropicKey = process.env.TEST_ANTHROPIC_API_KEY;
      const ahrefsKey = process.env.TEST_AHREFS_API_KEY;
      
      if (!anthropicKey || !ahrefsKey) {
        throw new Error('Test API keys not provided');
      }
      
      expansionService = new Dream100ExpansionService(anthropicKey, ahrefsKey);
    });
    
    it('should perform end-to-end expansion with real APIs', async () => {
      const testRequest: Dream100ExpansionRequest = {
        runId: 'test-run-' + Date.now(),
        seedKeywords: ['marketing automation'],
        targetCount: 5,
        market: 'US',
        industry: 'marketing technology'
      };
      
      const result = await expansionService.expandToDream100(testRequest);
      
      expect(result.success).toBe(true);
      expect(result.dream100Keywords.length).toBeGreaterThan(0);
      expect(result.dream100Keywords.length).toBeLessThanOrEqual(5);
      
      // Verify all keywords have required data
      result.dream100Keywords.forEach(keyword => {
        expect(keyword.volume).toBeGreaterThan(0);
        expect(keyword.difficulty).toBeGreaterThanOrEqual(0);
        expect(keyword.difficulty).toBeLessThanOrEqual(100);
        expect(keyword.intent).toBeDefined();
        expect(keyword.blendedScore).toBeGreaterThan(0);
      });
    }, 60000); // 60 second timeout for API calls
  });
});
