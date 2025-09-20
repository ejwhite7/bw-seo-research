/**
 * Clustering Service Tests
 * 
 * Comprehensive test suite for the semantic clustering service including:
 * - Unit tests for core algorithms
 * - Integration tests with embedding APIs
 * - Performance benchmarks
 * - Quality validation tests
 * - Error handling and edge cases
 */

import { ClusteringService, createClusteringService, getDefaultClusteringParams } from '../clustering';
import { Keyword } from '../../models/keyword';
import { ClusteringParams, ClusteringResult } from '../../models/cluster';
import type { KeywordStage, KeywordIntent, UUID } from '../../models';

// Mock external dependencies
jest.mock('openai');
jest.mock('../../integrations/anthropic');
jest.mock('../../utils/circuit-breaker');
jest.mock('../../utils/rate-limiter');
jest.mock('../../utils/sentry');

describe('ClusteringService', () => {
  let clusteringService: ClusteringService;
  let mockKeywords: Keyword[];
  let defaultParams: ClusteringParams;

  const mockOpenAIResponse = {
    data: [
      { embedding: new Array(1536).fill(0).map(() => Math.random()) },
      { embedding: new Array(1536).fill(0).map(() => Math.random()) },
      { embedding: new Array(1536).fill(0).map(() => Math.random()) }
    ]
  };

  const mockAnthropicResponse = {
    data: {
      clusters: [{
        id: 'cluster_1',
        label: 'Digital Marketing Strategies',
        keywords: ['digital marketing', 'online marketing'],
        primary_intent: 'informational',
        confidence: 0.85,
        suggested_content_pillar: 'Educational content about digital marketing'
      }],
      outliers: [],
      confidence_score: 0.90
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock OpenAI
    const mockOpenAI = {
      embeddings: {
        create: jest.fn().mockResolvedValue(mockOpenAIResponse)
      }
    };

    // Mock Anthropic
    const mockAnthropic = {
      clusterKeywords: jest.fn().mockResolvedValue(mockAnthropicResponse)
    };

    // Mock circuit breaker and rate limiter
    const mockCircuitBreaker = {
      execute: jest.fn().mockImplementation((fn) => fn()),
      metrics: { requests: 0, failures: 0, avgResponseTime: 100 }
    };

    const mockRateLimiter = {
      checkLimit: jest.fn().mockResolvedValue(true),
      tryConsume: jest.fn().mockResolvedValue(true)
    };

    // Create service with mocked dependencies
    clusteringService = new ClusteringService(
      'mock-openai-key',
      'mock-anthropic-key',
      {
        embeddingBatchSize: 2, // Small batch size for testing
        similarityBatchSize: 10,
        clusteringBatchSize: 10,
        maxConcurrent: 2
      }
    );

    // Inject mocks
    (clusteringService as any).openai = mockOpenAI;
    (clusteringService as any).anthropic = mockAnthropic;
    (clusteringService as any).circuitBreaker = mockCircuitBreaker;
    (clusteringService as any).rateLimiter = mockRateLimiter;

    // Create test data
    mockKeywords = createMockKeywords();
    defaultParams = getDefaultClusteringParams().balanced;
  });

  describe('Initialization', () => {
    it('should create clustering service with default config', () => {
      const service = createClusteringService('openai-key', 'anthropic-key');
      expect(service).toBeInstanceOf(ClusteringService);
    });

    it('should create clustering service with custom config', () => {
      const service = createClusteringService('openai-key', 'anthropic-key', {
        embeddingBatchSize: 50,
        maxConcurrent: 3
      });
      expect(service).toBeInstanceOf(ClusteringService);
    });

    it('should initialize with correct batch configuration', () => {
      const service = new ClusteringService('openai-key', 'anthropic-key', {
        embeddingBatchSize: 25,
        similarityBatchSize: 100
      });
      
      const config = (service as any).batchConfig;
      expect(config.embeddingBatchSize).toBe(25);
      expect(config.similarityBatchSize).toBe(100);
    });
  });

  describe('Main Clustering Pipeline', () => {
    it('should successfully cluster keywords', async () => {
      const result = await clusteringService.clusterKeywords(
        mockKeywords,
        defaultParams
      );

      expect(result).toBeDefined();
      expect(result.clusters).toBeDefined();
      expect(result.outliers).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.quality).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle progress callbacks', async () => {
      const progressCallback = jest.fn();
      
      await clusteringService.clusterKeywords(
        mockKeywords,
        defaultParams,
        progressCallback
      );

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: expect.any(String),
          processed: expect.any(Number),
          total: expect.any(Number),
          percentComplete: expect.any(Number)
        })
      );
    });

    it('should validate clustering parameters', async () => {
      const invalidParams = {
        ...defaultParams,
        minClusterSize: -1, // Invalid
        similarityThreshold: 1.5 // Invalid
      };

      await expect(
        clusteringService.clusterKeywords(mockKeywords, invalidParams)
      ).rejects.toThrow();
    });

    it('should reject empty keyword list', async () => {
      await expect(
        clusteringService.clusterKeywords([], defaultParams)
      ).rejects.toThrow('No keywords provided for clustering');
    });

    it('should reject too many keywords', async () => {
      const tooManyKeywords = new Array(10001).fill(null).map((_, i) => 
        createMockKeyword(`keyword_${i}`)
      );

      await expect(
        clusteringService.clusterKeywords(tooManyKeywords, defaultParams)
      ).rejects.toThrow('Maximum 10,000 keywords supported');
    });

    it('should prevent concurrent clustering operations', async () => {
      // Start first clustering
      const promise1 = clusteringService.clusterKeywords(mockKeywords, defaultParams);
      
      // Try to start second clustering while first is running
      await expect(
        clusteringService.clusterKeywords(mockKeywords, defaultParams)
      ).rejects.toThrow('Clustering operation already in progress');

      // Wait for first to complete
      await promise1;
    });
  });

  describe('Embedding Generation', () => {
    it('should generate embeddings for all keywords', async () => {
      const embeddings = await (clusteringService as any).generateEmbeddings(mockKeywords);

      expect(embeddings).toHaveLength(mockKeywords.length);
      expect(embeddings[0]).toHaveProperty('keywordId');
      expect(embeddings[0]).toHaveProperty('keyword');
      expect(embeddings[0]).toHaveProperty('embedding');
      expect(embeddings[0].embedding).toHaveLength(1536); // OpenAI embedding dimension
    });

    it('should batch embedding requests efficiently', async () => {
      const manyKeywords = new Array(250).fill(null).map((_, i) => 
        createMockKeyword(`keyword_${i}`)
      );

      const mockOpenAI = (clusteringService as any).openai;
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: manyKeywords.slice(0, 2).map(() => ({ 
          embedding: new Array(1536).fill(0).map(() => Math.random()) 
        }))
      });

      await (clusteringService as any).generateEmbeddings(manyKeywords);

      // Should make multiple API calls due to batching
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(
        Math.ceil(manyKeywords.length / 2) // Batch size is 2 for test
      );
    });

    it('should cache embeddings', async () => {
      const mockCache = new Map();
      (clusteringService as any).cache = mockCache;

      // First call should generate embeddings
      await (clusteringService as any).generateEmbeddings(mockKeywords);
      expect(mockCache.size).toBeGreaterThan(0);

      // Second call should use cache
      const mockOpenAI = (clusteringService as any).openai;
      mockOpenAI.embeddings.create.mockClear();
      
      await (clusteringService as any).generateEmbeddings(mockKeywords);
      expect(mockOpenAI.embeddings.create).not.toHaveBeenCalled();
    });

    it('should handle embedding API failures gracefully', async () => {
      const mockOpenAI = (clusteringService as any).openai;
      mockOpenAI.embeddings.create
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockOpenAIResponse);

      // Should retry and eventually succeed
      const embeddings = await (clusteringService as any).generateEmbeddings(mockKeywords);
      expect(embeddings.length).toBeGreaterThan(0);
    });
  });

  describe('Similarity Matrix Calculation', () => {
    let mockEmbeddings: any[];

    beforeEach(() => {
      mockEmbeddings = mockKeywords.map((keyword, i) => ({
        keywordId: keyword.id,
        keyword: keyword.keyword,
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        stage: keyword.stage,
        volume: keyword.volume,
        difficulty: keyword.difficulty,
        intent: keyword.intent,
        relevance: keyword.relevance
      }));
    });

    it('should calculate similarity matrix', async () => {
      const similarities = await (clusteringService as any).calculateSimilarityMatrix(
        mockEmbeddings,
        defaultParams
      );

      expect(Array.isArray(similarities)).toBe(true);
      expect(similarities.every(s => 
        typeof s.similarity === 'number' && 
        s.similarity >= 0 && 
        s.similarity <= 1
      )).toBe(true);
    });

    it('should filter similarities by threshold', async () => {
      const highThresholdParams = { ...defaultParams, similarityThreshold: 0.9 };
      const similarities = await (clusteringService as any).calculateSimilarityMatrix(
        mockEmbeddings,
        highThresholdParams
      );

      expect(similarities.every(s => s.similarity >= 0.9)).toBe(true);
    });

    it('should calculate cosine similarity correctly', () => {
      const vectorA = [1, 0, 0, 0];
      const vectorB = [0, 1, 0, 0];
      const vectorC = [1, 0, 0, 0];

      const simAB = (clusteringService as any).calculateCosineSimilarity(vectorA, vectorB);
      const simAC = (clusteringService as any).calculateCosineSimilarity(vectorA, vectorC);

      expect(simAB).toBeCloseTo(0); // Orthogonal vectors
      expect(simAC).toBeCloseTo(1); // Identical vectors
    });

    it('should handle zero vectors', () => {
      const vectorA = [0, 0, 0, 0];
      const vectorB = [1, 1, 1, 1];

      const similarity = (clusteringService as any).calculateCosineSimilarity(vectorA, vectorB);
      expect(similarity).toBe(0);
    });

    it('should reject vectors of different lengths', () => {
      const vectorA = [1, 0, 0];
      const vectorB = [1, 0];

      expect(() => {
        (clusteringService as any).calculateCosineSimilarity(vectorA, vectorB);
      }).toThrow('Vectors must have the same length');
    });
  });

  describe('Hierarchical Clustering', () => {
    let mockEmbeddings: any[];
    let mockSimilarities: any[];

    beforeEach(() => {
      mockEmbeddings = mockKeywords.slice(0, 5).map((keyword, i) => ({
        keywordId: keyword.id,
        keyword: keyword.keyword,
        embedding: new Array(10).fill(0).map(() => Math.random()),
        stage: keyword.stage,
        volume: keyword.volume,
        difficulty: keyword.difficulty,
        intent: keyword.intent,
        relevance: keyword.relevance
      }));

      mockSimilarities = [
        { keyword1: mockEmbeddings[0].keywordId, keyword2: mockEmbeddings[1].keywordId, similarity: 0.8, distance: 0.2 },
        { keyword1: mockEmbeddings[1].keywordId, keyword2: mockEmbeddings[2].keywordId, similarity: 0.75, distance: 0.25 },
        { keyword1: mockEmbeddings[2].keywordId, keyword2: mockEmbeddings[3].keywordId, similarity: 0.7, distance: 0.3 }
      ];
    });

    it('should perform hierarchical clustering', async () => {
      const clusterNodes = await (clusteringService as any).performHierarchicalClustering(
        mockEmbeddings,
        mockSimilarities,
        defaultParams
      );

      expect(Array.isArray(clusterNodes)).toBe(true);
      expect(clusterNodes.length).toBeLessThanOrEqual(mockEmbeddings.length);
      expect(clusterNodes.every(node => node.keywordIds.length >= 1)).toBe(true);
    });

    it('should respect max clusters constraint', async () => {
      const limitedParams = { ...defaultParams, maxClusters: 2 };
      const clusterNodes = await (clusteringService as any).performHierarchicalClustering(
        mockEmbeddings,
        mockSimilarities,
        limitedParams
      );

      expect(clusterNodes.length).toBeLessThanOrEqual(2);
    });

    it('should calculate linkage similarity correctly', () => {
      const cluster1 = { keywordIds: [mockEmbeddings[0].keywordId] };
      const cluster2 = { keywordIds: [mockEmbeddings[1].keywordId] };
      
      const similarityLookup = new Map([
        [mockEmbeddings[0].keywordId, new Map([[mockEmbeddings[1].keywordId, 0.8]])]
      ]);

      const linkage = (clusteringService as any).calculateLinkageSimilarity(
        cluster1,
        cluster2,
        similarityLookup,
        'average'
      );

      expect(linkage).toBeCloseTo(0.8);
    });

    it('should calculate centroid correctly', () => {
      const clusters = [
        { keywordIds: [mockEmbeddings[0].keywordId, mockEmbeddings[1].keywordId] }
      ];

      const centroid = (clusteringService as any).calculateCentroid(clusters, mockEmbeddings);
      
      expect(Array.isArray(centroid)).toBe(true);
      expect(centroid.length).toBe(10); // Embedding dimension
    });
  });

  describe('Cluster Creation and Analytics', () => {
    let mockClusterNodes: any[];

    beforeEach(() => {
      mockClusterNodes = [
        {
          id: 'cluster_1',
          keywordIds: mockKeywords.slice(0, 3).map(k => k.id),
          centroid: new Array(10).fill(0.5),
          similarity: 0.8,
          size: 3,
          children: [],
          level: 0
        },
        {
          id: 'cluster_2',
          keywordIds: mockKeywords.slice(3, 5).map(k => k.id),
          centroid: new Array(10).fill(0.3),
          similarity: 0.75,
          size: 2,
          children: [],
          level: 0
        }
      ];
    });

    it('should create clusters with metadata', async () => {
      const clusters = await (clusteringService as any).createClusters(
        mockClusterNodes,
        mockKeywords,
        defaultParams
      );

      expect(clusters).toHaveLength(mockClusterNodes.length);
      expect(clusters[0]).toHaveProperty('id');
      expect(clusters[0]).toHaveProperty('label');
      expect(clusters[0]).toHaveProperty('size');
      expect(clusters[0]).toHaveProperty('score');
      expect(clusters[0]).toHaveProperty('intentMix');
      expect(clusters[0]).toHaveProperty('analytics');
    });

    it('should calculate cluster analytics correctly', () => {
      const testKeywords = mockKeywords.slice(0, 3);
      const analytics = (clusteringService as any).calculateClusterAnalytics(testKeywords);

      expect(analytics).toHaveProperty('actualKeywordCount', 3);
      expect(analytics).toHaveProperty('avgVolume');
      expect(analytics).toHaveProperty('avgDifficulty');
      expect(analytics).toHaveProperty('topKeywords');
      expect(analytics).toHaveProperty('contentOpportunities');
      expect(analytics.topKeywords.length).toBeLessThanOrEqual(5);
    });

    it('should identify content opportunities', () => {
      const highVolumeKeywords = mockKeywords.map(k => ({
        ...k,
        volume: 15000,
        quickWin: true
      }));

      const opportunities = (clusteringService as any).identifyContentOpportunities(highVolumeKeywords);
      
      expect(Array.isArray(opportunities)).toBe(true);
      expect(opportunities.every(opp => 
        opp.type && opp.priority && opp.keywords && opp.estimatedTraffic
      )).toBe(true);
    });

    it('should filter clusters by minimum size', async () => {
      const strictParams = { ...defaultParams, minClusterSize: 5 };
      const clusters = await (clusteringService as any).createClusters(
        mockClusterNodes,
        mockKeywords,
        strictParams
      );

      expect(clusters.every(c => c.size >= 5)).toBe(true);
    });
  });

  describe('Quality Assessment', () => {
    let mockClusters: any[];
    let mockMetrics: any;

    beforeEach(() => {
      mockClusters = [
        {
          id: 'cluster_1',
          size: 5,
          similarityThreshold: 0.8,
          keywords: mockKeywords.slice(0, 5)
        },
        {
          id: 'cluster_2',
          size: 3,
          similarityThreshold: 0.75,
          keywords: mockKeywords.slice(5, 8)
        }
      ];

      mockMetrics = {
        totalKeywords: 10,
        clustersCreated: 2,
        outlierCount: 2,
        avgClusterSize: 4,
        avgSilhouetteScore: 0.7,
        withinClusterSimilarity: 0.77,
        betweenClusterSeparation: 0.6,
        coverageRatio: 0.8
      };
    });

    it('should assess clustering quality', () => {
      const quality = (clusteringService as any).assessClusteringQuality(
        mockClusters,
        mockMetrics,
        defaultParams
      );

      expect(quality).toHaveProperty('overallScore');
      expect(quality).toHaveProperty('coherence');
      expect(quality).toHaveProperty('separation');
      expect(quality).toHaveProperty('coverage');
      expect(quality).toHaveProperty('balance');
      expect(quality).toHaveProperty('recommendations');
      
      expect(quality.overallScore).toBeGreaterThan(0);
      expect(quality.overallScore).toBeLessThanOrEqual(1);
    });

    it('should calculate clustering metrics', () => {
      const metrics = (clusteringService as any).calculateClusteringMetrics(
        mockClusters,
        mockKeywords.slice(8, 10), // Outliers
        mockKeywords
      );

      expect(metrics.totalKeywords).toBe(mockKeywords.length);
      expect(metrics.clustersCreated).toBe(mockClusters.length);
      expect(metrics.outlierCount).toBe(2);
      expect(metrics.coverageRatio).toBeGreaterThan(0);
      expect(metrics.coverageRatio).toBeLessThanOrEqual(1);
    });

    it('should generate quality recommendations', () => {
      const poorMetrics = {
        ...mockMetrics,
        withinClusterSimilarity: 0.4,
        betweenClusterSeparation: 0.2,
        coverageRatio: 0.5
      };

      const quality = (clusteringService as any).assessClusteringQuality(
        mockClusters,
        poorMetrics,
        defaultParams
      );

      expect(quality.recommendations.length).toBeGreaterThan(0);
      expect(quality.recommendations.some(r => r.includes('coherence'))).toBe(true);
    });
  });

  describe('Cluster Validation', () => {
    let mockClusters: any[];

    beforeEach(() => {
      mockClusters = [
        {
          id: 'cluster_1',
          size: 2, // Small size should trigger warning
          similarityThreshold: 0.8,
          intentMix: { informational: 0.4, commercial: 0.3, transactional: 0.2, navigational: 0.1 },
          keywords: mockKeywords.slice(0, 2)
        },
        {
          id: 'cluster_2',
          size: 5,
          similarityThreshold: 0.4, // Low threshold should trigger warning
          intentMix: { informational: 0.9, commercial: 0.05, transactional: 0.03, navigational: 0.02 },
          keywords: mockKeywords.slice(2, 7)
        }
      ];
    });

    it('should validate clusters and identify issues', async () => {
      const validations = await clusteringService.validateClusters(mockClusters);

      expect(validations).toHaveLength(mockClusters.length);
      expect(validations[0].clusterId).toBe('cluster_1');
      expect(validations[0].issues.some(i => i.type === 'size')).toBe(true);
      expect(validations[1].issues.some(i => i.type === 'coherence')).toBe(true);
    });

    it('should calculate validation scores', () => {
      const issues = [
        { type: 'size' as const, severity: 'warning' as const, message: 'Small cluster' },
        { type: 'coherence' as const, severity: 'error' as const, message: 'Low coherence' }
      ];

      const score = (clusteringService as any).calculateValidationScore(issues);
      expect(score).toBeLessThan(1);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should identify duplicate keywords', async () => {
      const duplicateCluster = {
        id: 'cluster_duplicate',
        size: 3,
        similarityThreshold: 0.8,
        intentMix: { informational: 1, commercial: 0, transactional: 0, navigational: 0 },
        keywords: [
          mockKeywords[0],
          mockKeywords[1],
          { ...mockKeywords[1], id: 'different_id' } // Duplicate keyword with different ID
        ]
      };

      const validations = await clusteringService.validateClusters([duplicateCluster]);
      expect(validations[0].issues.some(i => i.type === 'duplicate_keywords')).toBe(true);
    });
  });

  describe('Service Status and Management', () => {
    it('should return current status', () => {
      const status = clusteringService.getStatus();

      expect(status).toHaveProperty('isProcessing');
      expect(status).toHaveProperty('currentProgress');
      expect(status).toHaveProperty('cacheSize');
      expect(status).toHaveProperty('metrics');
    });

    it('should clear cache', () => {
      (clusteringService as any).cache.set('test', 'value');
      expect((clusteringService as any).cache.size).toBe(1);
      
      clusteringService.clearCache();
      expect((clusteringService as any).cache.size).toBe(0);
    });

    it('should estimate processing time and cost', () => {
      const estimate = clusteringService.estimateProcessing(1000);

      expect(estimate).toHaveProperty('estimatedTime');
      expect(estimate).toHaveProperty('estimatedCost');
      expect(estimate).toHaveProperty('breakdown');
      
      expect(estimate.estimatedTime).toBeGreaterThan(0);
      expect(estimate.estimatedCost).toBeGreaterThan(0);
      
      expect(estimate.breakdown).toHaveProperty('embeddings');
      expect(estimate.breakdown).toHaveProperty('clustering');
      expect(estimate.breakdown).toHaveProperty('enhancement');
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API errors gracefully', async () => {
      const mockOpenAI = (clusteringService as any).openai;
      mockOpenAI.embeddings.create.mockRejectedValue(new Error('OpenAI API Error'));

      await expect(
        clusteringService.clusterKeywords(mockKeywords, defaultParams)
      ).rejects.toThrow();
    });

    it('should handle Anthropic API errors gracefully', async () => {
      const mockAnthropic = (clusteringService as any).anthropic;
      mockAnthropic.clusterKeywords.mockRejectedValue(new Error('Anthropic API Error'));

      // Should still complete clustering even if label enhancement fails
      const result = await clusteringService.clusterKeywords(mockKeywords, defaultParams);
      expect(result).toBeDefined();
    });

    it('should handle circuit breaker failures', async () => {
      const mockCircuitBreaker = (clusteringService as any).circuitBreaker;
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Circuit breaker open'));

      await expect(
        clusteringService.clusterKeywords(mockKeywords, defaultParams)
      ).rejects.toThrow();
    });

    it('should handle rate limit errors', async () => {
      const mockRateLimiter = (clusteringService as any).rateLimiter;
      mockRateLimiter.checkLimit.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(
        clusteringService.clusterKeywords(mockKeywords, defaultParams)
      ).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large keyword sets efficiently', async () => {
      const largeKeywordSet = new Array(1000).fill(null).map((_, i) => 
        createMockKeyword(`large_keyword_${i}`)
      );

      // Mock embeddings for large set
      const mockOpenAI = (clusteringService as any).openai;
      mockOpenAI.embeddings.create.mockImplementation(({ input }) => 
        Promise.resolve({
          data: input.map(() => ({ 
            embedding: new Array(1536).fill(0).map(() => Math.random()) 
          }))
        })
      );

      const startTime = performance.now();
      const result = await clusteringService.clusterKeywords(largeKeywordSet, {
        ...defaultParams,
        maxClusters: 50,
        similarityThreshold: 0.7
      });
      const endTime = performance.now();

      expect(result).toBeDefined();
      expect(result.clusters.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(30000); // Should complete in under 30 seconds
    }, 35000);

    it('should batch operations efficiently', async () => {
      const batchService = new ClusteringService('test-key', 'test-key', {
        embeddingBatchSize: 5,
        similarityBatchSize: 20
      });

      // Mock the batch operations
      (batchService as any).openai = (clusteringService as any).openai;
      (batchService as any).anthropic = (clusteringService as any).anthropic;
      (batchService as any).circuitBreaker = (clusteringService as any).circuitBreaker;
      (batchService as any).rateLimiter = (clusteringService as any).rateLimiter;

      const result = await batchService.clusterKeywords(mockKeywords, defaultParams);
      expect(result).toBeDefined();
    });
  });

  describe('Configuration Presets', () => {
    it('should provide default clustering parameters', () => {
      const presets = getDefaultClusteringParams();

      expect(presets).toHaveProperty('precision');
      expect(presets).toHaveProperty('balanced');
      expect(presets).toHaveProperty('coverage');

      Object.values(presets).forEach(preset => {
        expect(preset).toHaveProperty('method');
        expect(preset).toHaveProperty('similarityThreshold');
        expect(preset).toHaveProperty('minClusterSize');
        expect(preset).toHaveProperty('maxClusters');
      });
    });

    it('should have valid parameter ranges in presets', () => {
      const presets = getDefaultClusteringParams();

      Object.values(presets).forEach(preset => {
        expect(preset.similarityThreshold).toBeGreaterThan(0);
        expect(preset.similarityThreshold).toBeLessThanOrEqual(1);
        expect(preset.minClusterSize).toBeGreaterThan(0);
        expect(preset.maxClusterSize).toBeGreaterThan(preset.minClusterSize);
        expect(preset.intentWeight + preset.semanticWeight).toBeCloseTo(1);
      });
    });
  });

  // Helper functions
  function createMockKeywords(): Keyword[] {
    return [
      createMockKeyword('digital marketing', 'dream100', 15000, 65, 'commercial'),
      createMockKeyword('online marketing', 'dream100', 12000, 70, 'commercial'),
      createMockKeyword('content marketing', 'tier2', 8000, 45, 'informational'),
      createMockKeyword('social media marketing', 'tier2', 9500, 55, 'commercial'),
      createMockKeyword('email marketing', 'tier3', 6000, 40, 'commercial'),
      createMockKeyword('seo optimization', 'tier3', 7500, 60, 'informational'),
      createMockKeyword('ppc advertising', 'tier3', 4500, 50, 'transactional'),
      createMockKeyword('marketing automation', 'tier2', 5500, 65, 'commercial'),
      createMockKeyword('brand awareness', 'tier3', 3500, 35, 'informational'),
      createMockKeyword('lead generation', 'tier2', 8500, 55, 'commercial')
    ];
  }

  function createMockKeyword(
    keyword: string, 
    stage: KeywordStage = 'tier2',
    volume: number = 5000,
    difficulty: number = 50,
    intent: KeywordIntent | null = 'informational'
  ): Keyword {
    return {
      id: `mock_${keyword.replace(/\s+/g, '_')}_${Math.random().toString(36).substr(2, 9)}` as UUID,
      runId: 'mock_run_id' as UUID,
      clusterId: null,
      keyword,
      stage,
      volume,
      difficulty,
      intent,
      relevance: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
      trend: Math.random() * 2 - 1, // -1 to 1
      blendedScore: Math.random() * 0.6 + 0.3, // 0.3 to 0.9
      quickWin: Math.random() > 0.7,
      canonicalKeyword: null,
      topSerpUrls: null,
      embedding: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
});

describe('Integration Tests', () => {
  // These tests would run against real APIs in a CI/CD environment
  describe.skip('Real API Integration', () => {
    let realClusteringService: ClusteringService;

    beforeAll(() => {
      const openaiKey = process.env.OPENAI_API_KEY;
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      
      if (!openaiKey || !anthropicKey) {
        throw new Error('API keys required for integration tests');
      }

      realClusteringService = new ClusteringService(openaiKey, anthropicKey);
    });

    it('should integrate with OpenAI embeddings API', async () => {
      const testKeywords = [
        'machine learning',
        'artificial intelligence',
        'deep learning'
      ].map(k => createMockKeyword(k));

      const embeddings = await (realClusteringService as any).generateEmbeddings(testKeywords);
      
      expect(embeddings).toHaveLength(3);
      expect(embeddings[0].embedding).toHaveLength(1536);
    });

    it('should integrate with Anthropic clustering API', async () => {
      const testKeywords = [
        'machine learning basics',
        'AI fundamentals',
        'neural networks',
        'data science',
        'python programming'
      ];

      const response = await (realClusteringService as any).anthropic.clusterKeywords({
        keywords: testKeywords,
        cluster_method: 'semantic',
        target_clusters: 2,
        industry_context: 'technology'
      });

      expect(response.data).toBeDefined();
      expect(response.data.clusters).toBeDefined();
      expect(Array.isArray(response.data.clusters)).toBe(true);
    });

    function createMockKeyword(keyword: string): any {
      return {
        id: `test_${Math.random().toString(36).substr(2, 9)}`,
        runId: 'test_run',
        keyword,
        stage: 'tier2',
        volume: 1000,
        difficulty: 50,
        intent: 'informational',
        relevance: 0.8,
        trend: 0.1,
        blendedScore: 0.7,
        quickWin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
  });
});