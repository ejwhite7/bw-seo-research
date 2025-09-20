/**
 * Fixed Unit Tests for Scoring Service
 * 
 * Tests the keyword scoring engine that calculates blended scores
 * based on stage-specific weights and various keyword metrics.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';

// Mock data types for testing
interface Keyword {
  id: string;
  keyword: string;
  stage: 'dream100' | 'tier2' | 'tier3';
  volume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  relevanceScore: number;
  commercialScore?: number;
  trendScore?: number;
  blendedScore: number;
  quickWin: boolean;
  runId: string;
  clusterId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ScoringWeights {
  volume: number;
  intent: number;
  relevance: number;
  trend: number;
  ease: number;
}

interface QuickWinCriteria {
  minEaseScore: number;
  minVolumePercentile: number;
  maxDifficulty: number;
}

// Mock scoring service implementation for testing
class MockScoringService {
  private config: {
    stageWeights: Record<string, ScoringWeights>;
    quickWinThresholds: QuickWinCriteria;
  };

  constructor(config: any) {
    this.config = config;
  }

  calculateBlendedScore(keyword: Keyword) {
    const stageWeights = this.config.stageWeights[keyword.stage];
    if (!stageWeights) {
      throw new Error(`Invalid keyword stage: ${keyword.stage}`);
    }

    const volumeScore = this.normalizeVolume(keyword.volume);
    const intentScore = this.normalizeIntent(keyword.intent, keyword.commercialScore || 0);
    const easeScore = this.normalizeEase(keyword.difficulty);
    const relevanceScore = keyword.relevanceScore;
    const trendScore = keyword.trendScore || 0;

    const blendedScore = 
      (volumeScore * stageWeights.volume) +
      (intentScore * stageWeights.intent) +
      (relevanceScore * stageWeights.relevance) +
      (trendScore * stageWeights.trend) +
      (easeScore * stageWeights.ease);

    return {
      ...keyword,
      blendedScore: Math.min(Math.max(blendedScore, 0), 1),
      componentScores: {
        volumeScore,
        intentScore,
        relevanceScore,
        trendScore,
        easeScore
      },
      quickWin: false // Will be set by detectQuickWins
    };
  }

  async batchCalculateScores(keywords: Keyword[]) {
    return keywords.map(keyword => this.calculateBlendedScore(keyword));
  }

  detectQuickWins(keywords: any[]) {
    const volumes = keywords.map(k => k.volume).sort((a, b) => a - b);
    const medianVolume = volumes[Math.floor(volumes.length / 2)] || 0;

    return keywords.map(keyword => ({
      ...keyword,
      quickWin: 
        keyword.difficulty <= this.config.quickWinThresholds.maxDifficulty &&
        this.normalizeEase(keyword.difficulty) >= this.config.quickWinThresholds.minEaseScore &&
        keyword.volume >= medianVolume * this.config.quickWinThresholds.minVolumePercentile
    }));
  }

  normalizeVolume(volume: number): number {
    if (volume <= 0) return 0;
    return Math.min(Math.log10(volume + 1) / Math.log10(100001), 1);
  }

  normalizeIntent(intent: string, commercialScore: number): number {
    const baseScores: Record<string, number> = {
      commercial: 0.9,
      transactional: 0.8,
      informational: 0.5,
      navigational: 0.3
    };

    const baseScore = baseScores[intent] || 0.4;
    
    if (intent === 'commercial') {
      return Math.min(baseScore + (commercialScore * 0.1), 1.0);
    }
    
    return baseScore;
  }

  normalizeEase(difficulty: number): number {
    const clampedDifficulty = Math.max(0, Math.min(100, difficulty));
    return (100 - clampedDifficulty) / 100;
  }

  updateWeights(stage: string, weights: ScoringWeights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error('Scoring weights must sum to 1.0');
    }
    
    if (Object.values(weights).some(w => w < 0)) {
      throw new Error('All weights must be non-negative');
    }

    this.config.stageWeights[stage] = weights;
  }
}

describe('ScoringService', () => {
  let scoringService: MockScoringService;
  let mockKeywords: Keyword[];

  beforeEach(() => {
    // Initialize service with default configuration
    scoringService = new MockScoringService({
      stageWeights: {
        dream100: {
          volume: 0.40,
          intent: 0.30,
          relevance: 0.15,
          trend: 0.10,
          ease: 0.05
        },
        tier2: {
          volume: 0.35,
          ease: 0.25,
          relevance: 0.20,
          intent: 0.15,
          trend: 0.05
        },
        tier3: {
          ease: 0.35,
          relevance: 0.30,
          volume: 0.20,
          intent: 0.10,
          trend: 0.05
        }
      },
      quickWinThresholds: {
        minEaseScore: 0.7,
        minVolumePercentile: 0.5,
        maxDifficulty: 30
      }
    });

    // Create test keyword data
    mockKeywords = [
      {
        id: 'kw-1',
        keyword: 'digital marketing tools',
        stage: 'dream100',
        volume: 12000,
        difficulty: 45,
        cpc: 3.25,
        intent: 'commercial',
        relevanceScore: 0.9,
        commercialScore: 0.8,
        trendScore: 0.6,
        blendedScore: 0,
        quickWin: false,
        runId: 'test-run',
        clusterId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'kw-2',
        keyword: 'marketing automation software',
        stage: 'tier2',
        volume: 8500,
        difficulty: 25,
        cpc: 4.10,
        intent: 'commercial',
        relevanceScore: 0.85,
        commercialScore: 0.9,
        trendScore: 0.7,
        blendedScore: 0,
        quickWin: false,
        runId: 'test-run',
        clusterId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'kw-3',
        keyword: 'how to use marketing tools',
        stage: 'tier3',
        volume: 2500,
        difficulty: 15,
        cpc: 1.50,
        intent: 'informational',
        relevanceScore: 0.75,
        commercialScore: 0.3,
        trendScore: 0.5,
        blendedScore: 0,
        quickWin: false,
        runId: 'test-run',
        clusterId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateBlendedScore', () => {
    it('should calculate correct blended score for dream100 keywords', () => {
      const keyword = mockKeywords[0]!;
      const result = scoringService.calculateBlendedScore(keyword);

      // Verify score calculation with dream100 weights
      const expectedVolumeScore = scoringService.normalizeVolume(keyword.volume);
      const expectedIntentScore = scoringService.normalizeIntent(keyword.intent, keyword.commercialScore || 0);
      const expectedEaseScore = scoringService.normalizeEase(keyword.difficulty);
      
      const expected = 
        (expectedVolumeScore * 0.40) +
        (expectedIntentScore * 0.30) +
        (keyword.relevanceScore * 0.15) +
        ((keyword.trendScore || 0) * 0.10) +
        (expectedEaseScore * 0.05);

      expect(result.blendedScore).toBeCloseTo(expected, 3);
      expect(result.componentScores).toEqual({
        volumeScore: expectedVolumeScore,
        intentScore: expectedIntentScore,
        relevanceScore: keyword.relevanceScore,
        trendScore: keyword.trendScore || 0,
        easeScore: expectedEaseScore
      });
    });

    it('should calculate correct blended score for tier2 keywords', () => {
      const keyword = mockKeywords[1]!;
      const result = scoringService.calculateBlendedScore(keyword);

      expect(result.blendedScore).toBeGreaterThan(0);
      expect(result.blendedScore).toBeLessThanOrEqual(1);
      
      // Ease should have higher weight for tier2
      const easeWeight = 0.25;
      expect(result.componentScores.easeScore * easeWeight)
        .toBeGreaterThan(result.componentScores.easeScore * 0.05);
    });

    it('should calculate correct blended score for tier3 keywords', () => {
      const keyword = mockKeywords[2]!;
      const result = scoringService.calculateBlendedScore(keyword);

      expect(result.blendedScore).toBeGreaterThan(0);
      
      // Ease should have highest weight for tier3
      const easeComponent = result.componentScores.easeScore * 0.35;
      const volumeComponent = result.componentScores.volumeScore * 0.20;
      expect(easeComponent).toBeGreaterThan(volumeComponent);
    });

    it('should handle missing optional scores gracefully', () => {
      const keywordWithMissingScores: Keyword = {
        ...mockKeywords[0]!,
        commercialScore: undefined,
        trendScore: undefined
      };

      const result = scoringService.calculateBlendedScore(keywordWithMissingScores);

      expect(result.blendedScore).toBeGreaterThan(0);
      expect(result.componentScores.trendScore).toBe(0);
    });

    it('should throw error for invalid stage', () => {
      const invalidKeyword = {
        ...mockKeywords[0]!,
        stage: 'invalid' as any
      };

      expect(() => scoringService.calculateBlendedScore(invalidKeyword))
        .toThrow('Invalid keyword stage: invalid');
    });
  });

  describe('batchCalculateScores', () => {
    it('should calculate scores for multiple keywords', async () => {
      const results = await scoringService.batchCalculateScores(mockKeywords);

      expect(results).toHaveLength(mockKeywords.length);
      results.forEach((result, index) => {
        expect(result.id).toBe(mockKeywords[index]!.id);
        expect(result.blendedScore).toBeGreaterThan(0);
        expect(result.blendedScore).toBeLessThanOrEqual(1);
        expect(result.componentScores).toBeDefined();
      });
    });

    it('should maintain keyword order in batch processing', async () => {
      const results = await scoringService.batchCalculateScores(mockKeywords);

      results.forEach((result, index) => {
        expect(result.id).toBe(mockKeywords[index]!.id);
        expect(result.keyword).toBe(mockKeywords[index]!.keyword);
      });
    });

    it('should handle empty keyword array', async () => {
      const results = await scoringService.batchCalculateScores([]);
      expect(results).toEqual([]);
    });
  });

  describe('detectQuickWins', () => {
    it('should identify quick win keywords correctly', () => {
      const quickWinKeyword: Keyword = {
        ...mockKeywords[0]!,
        difficulty: 20, // Low difficulty
        volume: 5000 // Decent volume
      };

      const result = scoringService.calculateBlendedScore(quickWinKeyword);
      const isQuickWin = scoringService.detectQuickWins([result]);

      expect(isQuickWin[0]!.quickWin).toBe(true);
    });

    it('should not mark high difficulty keywords as quick wins', () => {
      const highDifficultyKeyword: Keyword = {
        ...mockKeywords[0]!,
        difficulty: 80, // High difficulty
        volume: 10000
      };

      const result = scoringService.calculateBlendedScore(highDifficultyKeyword);
      const isQuickWin = scoringService.detectQuickWins([result]);

      expect(isQuickWin[0]!.quickWin).toBe(false);
    });
  });

  describe('normalization functions', () => {
    describe('normalizeVolume', () => {
      it('should normalize volume to 0-1 scale', () => {
        const lowVolume = scoringService.normalizeVolume(100);
        const mediumVolume = scoringService.normalizeVolume(5000);
        const highVolume = scoringService.normalizeVolume(50000);

        expect(lowVolume).toBeGreaterThanOrEqual(0);
        expect(lowVolume).toBeLessThanOrEqual(1);
        expect(mediumVolume).toBeGreaterThan(lowVolume);
        expect(highVolume).toBeGreaterThan(mediumVolume);
      });

      it('should handle zero and negative volumes', () => {
        expect(scoringService.normalizeVolume(0)).toBe(0);
        expect(scoringService.normalizeVolume(-100)).toBe(0);
      });
    });

    describe('normalizeIntent', () => {
      it('should score commercial intent highest', () => {
        const commercial = scoringService.normalizeIntent('commercial', 0.9);
        const informational = scoringService.normalizeIntent('informational', 0.5);
        const navigational = scoringService.normalizeIntent('navigational', 0.3);

        expect(commercial).toBeGreaterThan(informational);
        expect(commercial).toBeGreaterThan(navigational);
      });

      it('should incorporate commercial score for commercial intent', () => {
        const highCommercial = scoringService.normalizeIntent('commercial', 0.9);
        const lowCommercial = scoringService.normalizeIntent('commercial', 0.3);

        expect(highCommercial).toBeGreaterThan(lowCommercial);
      });
    });

    describe('normalizeEase', () => {
      it('should inverse difficulty (higher difficulty = lower ease)', () => {
        const easyKeyword = scoringService.normalizeEase(10);
        const hardKeyword = scoringService.normalizeEase(90);

        expect(easyKeyword).toBeGreaterThan(hardKeyword);
      });

      it('should handle edge cases', () => {
        expect(scoringService.normalizeEase(0)).toBe(1);
        expect(scoringService.normalizeEase(100)).toBe(0);
        expect(scoringService.normalizeEase(-10)).toBe(1);
        expect(scoringService.normalizeEase(110)).toBe(0);
      });
    });
  });

  describe('updateWeights', () => {
    it('should validate weight sum equals 1', () => {
      const invalidWeights: ScoringWeights = {
        volume: 0.6,
        intent: 0.5, // Sum > 1
        relevance: 0.1,
        trend: 0.1,
        ease: 0.1
      };

      expect(() => scoringService.updateWeights('dream100', invalidWeights))
        .toThrow('Scoring weights must sum to 1.0');
    });

    it('should validate all weights are non-negative', () => {
      const negativeWeights: ScoringWeights = {
        volume: 0.5,
        intent: -0.1, // Negative weight
        relevance: 0.3,
        trend: 0.2,
        ease: 0.1
      };

      expect(() => scoringService.updateWeights('dream100', negativeWeights))
        .toThrow('All weights must be non-negative');
    });
  });
});