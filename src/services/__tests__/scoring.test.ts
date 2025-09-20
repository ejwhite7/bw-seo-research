/**
 * Scoring Service Tests
 * 
 * Comprehensive test suite for the stage-specific scoring engine
 * including component scoring, quick win detection, batch processing,
 * and weight optimization.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ScoringEngine,
  scoreKeyword,
  scoreKeywordBatch,
  detectQuickWins,
  getScoringPresets,
  scoringEngine
} from '../scoring';
import {
  ScoringInput,
  ScoringResult,
  ScoringWeights,
  BatchScoringConfig,
  getDefaultScoringWeights,
  type KeywordStage,
  type KeywordIntent
} from '../../models/scoring';

// Mock dependencies
jest.mock('../../utils/circuit-breaker');
jest.mock('../../utils/rate-limiter');
jest.mock('../../utils/sentry');

describe('ScoringEngine', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine();
    jest.clearAllMocks();
  });

  describe('Single Keyword Scoring', () => {
    const createTestInput = (overrides: Partial<ScoringInput> = {}): ScoringInput => ({
      keyword: 'test keyword' as any,
      stage: 'dream100',
      volume: 10000,
      difficulty: 30,
      intent: 'commercial',
      relevance: 0.8,
      trend: 0.1,
      ...overrides
    });

    it('should calculate Dream 100 score with correct weights', async () => {
      const input = createTestInput({
        stage: 'dream100',
        volume: 50000,
        difficulty: 25,
        intent: 'transactional',
        relevance: 0.9,
        trend: 0.2
      });

      const result = await engine.calculateScore(input);

      expect(result.stage).toBe('dream100');
      expect(result.blendedScore).toBeGreaterThan(0);
      expect(result.blendedScore).toBeLessThanOrEqual(1);
      
      // Dream 100 should prioritize volume and intent
      expect(result.weightedScores.volume).toBeGreaterThan(result.weightedScores.ease);
      expect(result.weightedScores.intent).toBeGreaterThan(result.weightedScores.trend);
      
      // Verify weights sum to blended score (approximately)
      const weightSum = Object.values(result.weightedScores).reduce((sum, score) => sum + score, 0);
      expect(Math.abs(weightSum - result.blendedScore)).toBeLessThan(0.01);
    });

    it('should calculate Tier-2 score with correct weights', async () => {
      const input = createTestInput({
        stage: 'tier2',
        volume: 5000,
        difficulty: 40,
        intent: 'commercial',
        relevance: 0.7,
        trend: 0.0
      });

      const result = await engine.calculateScore(input);

      expect(result.stage).toBe('tier2');
      
      // Tier-2 should balance volume and ease
      expect(result.weightedScores.volume).toBeGreaterThan(0);
      expect(result.weightedScores.ease).toBeGreaterThan(0);
      expect(result.weightedScores.ease).toBeGreaterThan(result.weightedScores.intent);
    });

    it('should calculate Tier-3 score with correct weights', async () => {
      const input = createTestInput({
        stage: 'tier3',
        volume: 1000,
        difficulty: 20,
        intent: 'informational',
        relevance: 0.8,
        trend: -0.1
      });

      const result = await engine.calculateScore(input);

      expect(result.stage).toBe('tier3');
      
      // Tier-3 should prioritize ease and relevance
      expect(result.weightedScores.ease).toBeGreaterThan(result.weightedScores.volume);
      expect(result.weightedScores.relevance).toBeGreaterThan(result.weightedScores.volume);
    });

    it('should handle null intent correctly', async () => {
      const input = createTestInput({
        intent: null,
        relevance: 0.8
      });

      const result = await engine.calculateScore(input);

      expect(result.componentScores.intent).toBe(0.6); // Default to informational
      expect(result.blendedScore).toBeGreaterThan(0);
    });

    it('should normalize volume using logarithmic transformation', async () => {
      const lowVolumeInput = createTestInput({ volume: 100 });
      const highVolumeInput = createTestInput({ volume: 100000 });

      const lowResult = await engine.calculateScore(lowVolumeInput);
      const highResult = await engine.calculateScore(highVolumeInput);

      expect(highResult.componentScores.volume).toBeGreaterThan(lowResult.componentScores.volume);
      expect(lowResult.componentScores.volume).toBeGreaterThan(0);
      expect(highResult.componentScores.volume).toBeLessThanOrEqual(1);
    });

    it('should normalize difficulty correctly (ease calculation)', async () => {
      const easyInput = createTestInput({ difficulty: 10 });
      const hardInput = createTestInput({ difficulty: 90 });

      const easyResult = await engine.calculateScore(easyInput);
      const hardResult = await engine.calculateScore(hardInput);

      expect(easyResult.componentScores.ease).toBeGreaterThan(hardResult.componentScores.ease);
      expect(easyResult.componentScores.ease).toBe(0.9); // (100-10)/100
      expect(hardResult.componentScores.ease).toBe(0.1); // (100-90)/100
    });

    it('should normalize trend values correctly', async () => {
      const decliningInput = createTestInput({ trend: -0.5 });
      const growingInput = createTestInput({ trend: 0.5 });

      const decliningResult = await engine.calculateScore(decliningInput);
      const growingResult = await engine.calculateScore(growingInput);

      expect(growingResult.componentScores.trend).toBeGreaterThan(decliningResult.componentScores.trend);
      expect(decliningResult.componentScores.trend).toBe(0.25); // (-0.5+1)/2
      expect(growingResult.componentScores.trend).toBe(0.75); // (0.5+1)/2
    });
  });

  describe('Quick Win Detection', () => {
    it('should identify quick wins correctly', async () => {
      const quickWinInput: ScoringInput = {
        keyword: 'easy keyword' as any,
        stage: 'tier2',
        volume: 5000,
        difficulty: 20, // Easy (ease = 0.8)
        intent: 'commercial',
        relevance: 0.8,
        trend: 0.1
      };

      const result = await engine.calculateScore(quickWinInput, undefined, 2000); // Cluster median

      expect(result.quickWin).toBe(true);
      expect(result.componentScores.ease).toBeGreaterThanOrEqual(0.7);
      expect(result.blendedScore).toBeGreaterThan(result.blendedScore * 0.9); // Should have boost
    });

    it('should not mark difficult keywords as quick wins', async () => {
      const difficultInput: ScoringInput = {
        keyword: 'difficult keyword' as any,
        stage: 'dream100',
        volume: 50000,
        difficulty: 85, // Very difficult (ease = 0.15)
        intent: 'transactional',
        relevance: 0.9,
        trend: 0.3
      };

      const result = await engine.calculateScore(difficultInput);

      expect(result.quickWin).toBe(false);
      expect(result.componentScores.ease).toBeLessThan(0.7);
    });

    it('should consider cluster median volume for quick wins', async () => {
      const input: ScoringInput = {
        keyword: 'keyword' as any,
        stage: 'tier3',
        volume: 500, // Below median
        difficulty: 15, // Easy
        intent: 'informational',
        relevance: 0.7,
        trend: 0.0
      };

      const resultWithHighMedian = await engine.calculateScore(input, undefined, 1000);
      const resultWithLowMedian = await engine.calculateScore(input, undefined, 200);

      expect(resultWithHighMedian.quickWin).toBe(false); // Volume below median
      expect(resultWithLowMedian.quickWin).toBe(true);   // Volume above median
    });

    it('should apply quick win rank boost correctly', async () => {
      const quickWinInput: ScoringInput = {
        keyword: 'boosted keyword' as any,
        stage: 'tier2',
        volume: 3000,
        difficulty: 25,
        intent: 'commercial',
        relevance: 0.7,
        trend: 0.0
      };

      const result = await engine.calculateScore(quickWinInput, undefined, 1000);

      if (result.quickWin) {
        // Score should be boosted by 10% (rank boost)
        const originalScore = result.blendedScore / 1.1; // Reverse the boost
        expect(result.blendedScore).toBeGreaterThan(originalScore);
      }
    });
  });

  describe('Batch Scoring', () => {
    const createBatchConfig = (keywords: ScoringInput[]): BatchScoringConfig => ({
      keywords,
      weights: getDefaultScoringWeights(),
      normalizationMethod: 'min-max',
      quickWinThreshold: 0.7,
      applySeasonalAdjustments: false
    });

    it('should process batch of keywords correctly', async () => {
      const keywords: ScoringInput[] = [
        {
          keyword: 'keyword 1' as any,
          stage: 'dream100',
          volume: 10000,
          difficulty: 30,
          intent: 'transactional',
          relevance: 0.8,
          trend: 0.1
        },
        {
          keyword: 'keyword 2' as any,
          stage: 'tier2',
          volume: 5000,
          difficulty: 40,
          intent: 'commercial',
          relevance: 0.7,
          trend: 0.0
        },
        {
          keyword: 'keyword 3' as any,
          stage: 'tier3',
          volume: 1000,
          difficulty: 20,
          intent: 'informational',
          relevance: 0.9,
          trend: -0.1
        }
      ];

      const config = createBatchConfig(keywords);
      const results = await engine.batchScore(config);

      expect(results).toHaveLength(3);
      expect(results[0].blendedScore).toBeGreaterThanOrEqual(results[1].blendedScore); // Sorted desc
      expect(results[1].blendedScore).toBeGreaterThanOrEqual(results[2].blendedScore);
      
      // Each result should have all required fields
      results.forEach(result => {
        expect(result.keyword).toBeDefined();
        expect(result.stage).toBeDefined();
        expect(result.blendedScore).toBeGreaterThanOrEqual(0);
        expect(result.blendedScore).toBeLessThanOrEqual(1);
        expect(result.componentScores).toBeDefined();
        expect(result.weightedScores).toBeDefined();
        expect(typeof result.quickWin).toBe('boolean');
        expect(result.tier).toMatch(/^(high|medium|low)$/);
        expect(Array.isArray(result.recommendations)).toBe(true);
      });
    });

    it('should handle large batches efficiently', async () => {
      const keywords: ScoringInput[] = Array.from({ length: 1000 }, (_, i) => ({
        keyword: `keyword ${i}` as any,
        stage: (['dream100', 'tier2', 'tier3'] as KeywordStage[])[i % 3],
        volume: Math.floor(Math.random() * 100000) + 100,
        difficulty: Math.floor(Math.random() * 100),
        intent: (['transactional', 'commercial', 'informational', 'navigational'] as KeywordIntent[])[i % 4],
        relevance: Math.random(),
        trend: (Math.random() - 0.5) * 2
      }));

      const config = createBatchConfig(keywords);
      const startTime = performance.now();
      const results = await engine.batchScore(config);
      const endTime = performance.now();

      expect(results).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should apply seasonal adjustments correctly', async () => {
      const keywords: ScoringInput[] = [
        {
          keyword: 'christmas gifts' as any,
          stage: 'dream100',
          volume: 50000,
          difficulty: 40,
          intent: 'commercial',
          relevance: 0.8,
          trend: 0.2
        }
      ];

      const seasonalFactors = [{
        startDate: '12-01',
        endDate: '12-31',
        keywords: ['christmas'],
        multiplier: 1.5,
        reason: 'Holiday season boost'
      }];

      // Mock current date to be in December
      const mockDate = new Date('2024-12-15');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const config: BatchScoringConfig = {
        keywords,
        weights: getDefaultScoringWeights(),
        normalizationMethod: 'min-max',
        quickWinThreshold: 0.7,
        applySeasonalAdjustments: true,
        seasonalFactors
      };

      const results = await engine.batchScore(config);

      expect(results[0].recommendations.some(r => r.includes('Holiday season'))).toBe(true);
      
      // Clean up mock
      jest.restoreAllMocks();
    });
  });

  describe('Weight Optimization', () => {
    it('should optimize weights to increase quick win ratio', async () => {
      // Create test results with low quick win ratio
      const testResults: ScoringResult[] = [
        {
          keyword: 'keyword 1' as any,
          stage: 'dream100',
          blendedScore: 0.5,
          componentScores: { volume: 0.8, intent: 0.7, relevance: 0.6, trend: 0.5, ease: 0.3 },
          weightedScores: { volume: 0.32, intent: 0.21, relevance: 0.09, trend: 0.05, ease: 0.015 },
          quickWin: false,
          tier: 'medium',
          recommendations: []
        }
      ];

      const targetMetrics = {
        avgQuickWinRatio: 0.3, // Target 30% quick wins
        avgDifficulty: 40,
        trafficPotential: 1000000
      };

      const constraints = {
        maxDifficulty: 60,
        minVolume: 1000,
        requiredIntents: ['commercial', 'transactional'] as KeywordIntent[]
      };

      const optimizedWeights = await engine.optimizeWeights(testResults, targetMetrics, constraints);

      // Should increase ease weights to get more quick wins
      expect(optimizedWeights.dream100.ease).toBeGreaterThan(getDefaultScoringWeights().dream100.ease);
      expect(optimizedWeights.tier2.ease).toBeGreaterThan(getDefaultScoringWeights().tier2.ease);
      expect(optimizedWeights.tier3.ease).toBeGreaterThan(getDefaultScoringWeights().tier3.ease);

      // Weights should still sum to 1.0 for each stage
      Object.values(optimizedWeights).forEach(stageWeights => {
        const sum = Object.values(stageWeights).reduce((s, w) => s + w, 0);
        expect(Math.abs(sum - 1)).toBeLessThan(0.01);
      });
    });
  });

  describe('Scoring Quality Validation', () => {
    it('should validate scoring quality and identify issues', async () => {
      const results: ScoringResult[] = [
        // Too many high scores (potential issue)
        ...Array.from({ length: 80 }, (_, i) => ({
          keyword: `keyword ${i}` as any,
          stage: 'dream100' as KeywordStage,
          blendedScore: 0.9,
          componentScores: { volume: 0.9, intent: 0.8, relevance: 0.8, trend: 0.7, ease: 0.8 },
          weightedScores: { volume: 0.36, intent: 0.24, relevance: 0.12, trend: 0.07, ease: 0.04 },
          quickWin: true,
          tier: 'high' as const,
          recommendations: []
        })),
        ...Array.from({ length: 20 }, (_, i) => ({
          keyword: `keyword ${i + 80}` as any,
          stage: 'tier2' as KeywordStage,
          blendedScore: 0.3,
          componentScores: { volume: 0.3, intent: 0.4, relevance: 0.3, trend: 0.2, ease: 0.2 },
          weightedScores: { volume: 0.105, intent: 0.06, relevance: 0.06, trend: 0.01, ease: 0.05 },
          quickWin: false,
          tier: 'low' as const,
          recommendations: []
        }))
      ];

      const validation = await engine.validateScoringQuality(results);

      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some(w => w.includes('high ratio of high-scoring'))).toBe(true);
      expect(validation.metrics.scoreDistribution.high).toBe(80);
      expect(validation.metrics.quickWinRatio).toBe(0.8); // Should be flagged as too high
    });

    it('should pass validation for balanced score distribution', async () => {
      const results: ScoringResult[] = [
        ...Array.from({ length: 20 }, (_, i) => ({
          keyword: `high ${i}` as any,
          stage: 'dream100' as KeywordStage,
          blendedScore: 0.8,
          componentScores: { volume: 0.8, intent: 0.7, relevance: 0.7, trend: 0.6, ease: 0.6 },
          weightedScores: { volume: 0.32, intent: 0.21, relevance: 0.105, trend: 0.06, ease: 0.03 },
          quickWin: false,
          tier: 'high' as const,
          recommendations: []
        })),
        ...Array.from({ length: 60 }, (_, i) => ({
          keyword: `medium ${i}` as any,
          stage: 'tier2' as KeywordStage,
          blendedScore: 0.5,
          componentScores: { volume: 0.5, intent: 0.6, relevance: 0.5, trend: 0.4, ease: 0.4 },
          weightedScores: { volume: 0.175, intent: 0.09, relevance: 0.1, trend: 0.02, ease: 0.1 },
          quickWin: false,
          tier: 'medium' as const,
          recommendations: []
        })),
        ...Array.from({ length: 20 }, (_, i) => ({
          keyword: `low ${i}` as any,
          stage: 'tier3' as KeywordStage,
          blendedScore: 0.2,
          componentScores: { volume: 0.2, intent: 0.3, relevance: 0.2, trend: 0.1, ease: 0.1 },
          weightedScores: { volume: 0.04, intent: 0.03, relevance: 0.06, trend: 0.005, ease: 0.035 },
          quickWin: false,
          tier: 'low' as const,
          recommendations: []
        }))
      ];

      const validation = await engine.validateScoringQuality(results);

      expect(validation.isValid).toBe(true);
      expect(validation.warnings.length).toBeLessThan(3);
      expect(validation.metrics.scoreDistribution.high).toBe(20);
      expect(validation.metrics.scoreDistribution.medium).toBe(60);
      expect(validation.metrics.scoreDistribution.low).toBe(20);
    });
  });

  describe('Recommendations Generation', () => {
    it('should generate appropriate recommendations for different scenarios', async () => {
      // High volume, high difficulty keyword
      const highVolumeHardInput: ScoringInput = {
        keyword: 'competitive keyword' as any,
        stage: 'dream100',
        volume: 100000,
        difficulty: 85,
        intent: 'transactional',
        relevance: 0.9,
        trend: 0.2
      };

      const result = await engine.calculateScore(highVolumeHardInput);

      expect(result.recommendations).toContain(
        expect.stringMatching(/High search volume.*excellent for pillar content/i)
      );
      expect(result.recommendations).toContain(
        expect.stringMatching(/High difficulty.*requires strong domain authority/i)
      );
      expect(result.recommendations).toContain(
        expect.stringMatching(/Transactional intent.*optimize for conversion/i)
      );
    });

    it('should identify trending opportunities', async () => {
      const trendingInput: ScoringInput = {
        keyword: 'trending keyword' as any,
        stage: 'tier2',
        volume: 5000,
        difficulty: 30,
        intent: 'commercial',
        relevance: 0.8,
        trend: 0.8 // Strong upward trend
      };

      const result = await engine.calculateScore(trendingInput);

      expect(result.recommendations).toContain(
        expect.stringMatching(/Trending upward.*time-sensitive opportunity/i)
      );
    });

    it('should flag low relevance issues', async () => {
      const lowRelevanceInput: ScoringInput = {
        keyword: 'irrelevant keyword' as any,
        stage: 'tier3',
        volume: 2000,
        difficulty: 25,
        intent: 'informational',
        relevance: 0.2, // Very low relevance
        trend: 0.0
      };

      const result = await engine.calculateScore(lowRelevanceInput);

      expect(result.recommendations).toContain(
        expect.stringMatching(/Low relevance.*verify alignment with content strategy/i)
      );
    });
  });
});

describe('Utility Functions', () => {
  describe('scoreKeyword', () => {
    it('should score a single keyword correctly', async () => {
      const result = await scoreKeyword(
        'test keyword',
        'dream100',
        10000,
        30,
        'commercial',
        0.8,
        0.1
      );

      expect(result.keyword).toBe('test keyword');
      expect(result.stage).toBe('dream100');
      expect(result.blendedScore).toBeGreaterThan(0);
      expect(result.blendedScore).toBeLessThanOrEqual(1);
    });
  });

  describe('scoreKeywordBatch', () => {
    it('should score multiple keywords', async () => {
      const keywords = [
        {
          keyword: 'keyword 1',
          stage: 'dream100' as KeywordStage,
          volume: 10000,
          difficulty: 30,
          intent: 'commercial' as KeywordIntent,
          relevance: 0.8,
          trend: 0.1
        },
        {
          keyword: 'keyword 2',
          stage: 'tier2' as KeywordStage,
          volume: 5000,
          difficulty: 40,
          intent: 'informational' as KeywordIntent,
          relevance: 0.7,
          trend: 0.0
        }
      ];

      const results = await scoreKeywordBatch(keywords);

      expect(results).toHaveLength(2);
      expect(results[0].blendedScore).toBeGreaterThanOrEqual(results[1].blendedScore);
    });

    it('should apply custom options', async () => {
      const keywords = [
        {
          keyword: 'seasonal keyword',
          stage: 'dream100' as KeywordStage,
          volume: 20000,
          difficulty: 25,
          intent: 'commercial' as KeywordIntent,
          relevance: 0.9,
          trend: 0.3
        }
      ];

      const seasonalFactors = [{
        startDate: '01-01',
        endDate: '12-31',
        keywords: ['seasonal'],
        multiplier: 1.2,
        reason: 'Year-round relevance'
      }];

      const results = await scoreKeywordBatch(keywords, undefined, {
        quickWinThreshold: 0.6,
        enableSeasonalAdjustments: true,
        seasonalFactors
      });

      expect(results).toHaveLength(1);
      // Verify seasonal adjustment was applied
      expect(results[0].recommendations.some(r => r.includes('Year-round relevance'))).toBe(true);
    });
  });

  describe('detectQuickWins', () => {
    const sampleResults: ScoringResult[] = [
      {
        keyword: 'quick win 1' as any,
        stage: 'tier2',
        blendedScore: 0.8,
        componentScores: { volume: 0.6, intent: 0.7, relevance: 0.8, trend: 0.5, ease: 0.9 },
        weightedScores: { volume: 0.21, intent: 0.105, relevance: 0.16, trend: 0.025, ease: 0.225 },
        quickWin: true,
        tier: 'high',
        recommendations: []
      },
      {
        keyword: 'not quick win' as any,
        stage: 'dream100',
        blendedScore: 0.6,
        componentScores: { volume: 0.8, intent: 0.9, relevance: 0.7, trend: 0.4, ease: 0.5 },
        weightedScores: { volume: 0.32, intent: 0.27, relevance: 0.105, trend: 0.04, ease: 0.025 },
        quickWin: false,
        tier: 'medium',
        recommendations: []
      },
      {
        keyword: 'quick win 2' as any,
        stage: 'tier3',
        blendedScore: 0.75,
        componentScores: { volume: 0.4, intent: 0.6, relevance: 0.9, trend: 0.3, ease: 0.8 },
        weightedScores: { volume: 0.08, intent: 0.06, relevance: 0.27, trend: 0.015, ease: 0.28 },
        quickWin: true,
        tier: 'high',
        recommendations: []
      }
    ];

    it('should filter and sort quick wins correctly', () => {
      const quickWins = detectQuickWins(sampleResults);

      expect(quickWins).toHaveLength(2);
      expect(quickWins[0].blendedScore).toBeGreaterThanOrEqual(quickWins[1].blendedScore);
      expect(quickWins.every(result => result.quickWin)).toBe(true);
    });

    it('should apply custom threshold', () => {
      const quickWins = detectQuickWins(sampleResults, 0.8);

      expect(quickWins).toHaveLength(1); // Only one result has score >= 0.8
      expect(quickWins[0].blendedScore).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('getScoringPresets', () => {
    it('should return valid industry presets', () => {
      const presets = getScoringPresets();

      expect(presets).toHaveProperty('ecommerce');
      expect(presets).toHaveProperty('saas');
      expect(presets).toHaveProperty('content');

      // Verify each preset has valid structure
      Object.values(presets).forEach(preset => {
        expect(preset).toHaveProperty('dream100');
        expect(preset).toHaveProperty('tier2');
        expect(preset).toHaveProperty('tier3');

        // Verify weights sum to 1.0 for each stage
        Object.values(preset).forEach(stageWeights => {
          const sum = Object.values(stageWeights).reduce((s, w) => s + w, 0);
          expect(Math.abs(sum - 1)).toBeLessThan(0.01);
        });
      });
    });

    it('should have appropriate weights for different industries', () => {
      const presets = getScoringPresets();

      // E-commerce should prioritize volume and intent more heavily
      expect(presets.ecommerce.dream100.volume).toBeGreaterThan(presets.saas.dream100.volume);
      expect(presets.ecommerce.dream100.intent).toBeGreaterThan(presets.content.dream100.intent);

      // SaaS should balance relevance higher
      expect(presets.saas.dream100.relevance).toBeGreaterThan(presets.ecommerce.dream100.relevance);

      // Content should prioritize relevance in tier-3
      expect(presets.content.tier3.relevance).toBeGreaterThan(presets.ecommerce.tier3.relevance);
    });
  });
});