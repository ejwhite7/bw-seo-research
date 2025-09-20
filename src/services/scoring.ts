/**
 * Stage-Specific Blended Scoring Engine
 * 
 * Calculates weighted scores for Dream 100, Tier-2, and Tier-3 keywords
 * with stage-specific formulas, quick win detection, and weight optimization.
 * 
 * @fileoverview Core scoring service with comprehensive quality validation
 * @version 1.0.0
 */

import {
  ScoringInput,
  ScoringResult,
  ScoringWeights,
  StageWeights,
  BatchScoringConfig,
  ScoringAnalytics,
  ScoringOptimization,
  SeasonalFactor,
  ScoringModel,
  ScoringABTest,
  ScoringComparison,
  getDefaultScoringWeights,
  ScoringInputSchema,
  BatchScoringConfigSchema
} from '../models/scoring';
import type { KeywordStage, KeywordIntent } from '../types/database';
import { 
  Keyword, 
  ClusterWithKeywords,
  type UUID 
} from '../models';
import type { ProcessingStage } from '../models/pipeline';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { TokenBucket, RateLimiterFactory, type RateLimiter } from '../utils/rate-limiter';
import * as Sentry from '@sentry/nextjs';

// Create a simple logger for this service
const logger = {
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[ScoringEngine] ${message}`, data);
    }
  },
  info: (message: string, data?: any) => {
    console.log(`[ScoringEngine] ${message}`, data);
  },
  error: (message: string, data?: any) => {
    console.error(`[ScoringEngine] ${message}`, data);
    Sentry.captureMessage(`ScoringEngine: ${message}`, 'error');
  }
};

/**
 * Stage-specific scoring configuration
 */
interface StageConfig {
  readonly name: KeywordStage;
  readonly weights: StageWeights;
  readonly quickWinCriteria: QuickWinCriteria;
  readonly normalizationParams: NormalizationParams;
}

/**
 * Quick win detection criteria
 */
interface QuickWinCriteria {
  readonly minEase: number; // minimum ease score (0-1)
  readonly minVolume: number; // minimum search volume
  readonly minBlendedScore: number; // minimum overall score
  readonly enableVolumeMedianCheck: boolean; // check against cluster median
  readonly rankBoost: number; // percentage boost for display
}

/**
 * Normalization parameters for score components
 */
interface NormalizationParams {
  readonly volumeTransform: 'linear' | 'log' | 'sqrt' | 'percentile';
  readonly difficultyTransform: 'linear' | 'exponential' | 'sigmoid';
  readonly trendSensitivity: number;
  readonly outlierCapping: {
    readonly enabled: boolean;
    readonly percentile: number; // cap at 95th percentile
  };
}

/**
 * Scoring engine with comprehensive validation and optimization
 */
export class ScoringEngine {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;
  private readonly defaultWeights: ScoringWeights;
  private readonly stageConfigs: Map<KeywordStage, StageConfig>;
  private scoringHistory: ScoringAnalytics[] = [];

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringPeriod: 30000
    }, 'scoring-engine');
    
    this.rateLimiter = RateLimiterFactory.createTokenBucket({
      capacity: 1000,
      refillRate: 1000,
      refillPeriod: 60000 // 1 minute
    });

    this.defaultWeights = getDefaultScoringWeights();
    this.stageConfigs = this.initializeStageConfigs();
  }

  /**
   * Initialize stage-specific configurations
   */
  private initializeStageConfigs(): Map<KeywordStage, StageConfig> {
    const configs = new Map<KeywordStage, StageConfig>();

    // Dream 100: Focus on volume and intent
    configs.set('dream100', {
      name: 'dream100',
      weights: {
        volume: 0.40,
        intent: 0.30,
        relevance: 0.15,
        trend: 0.10,
        ease: 0.05
      },
      quickWinCriteria: {
        minEase: 0.7,
        minVolume: 1000,
        minBlendedScore: 0.6,
        enableVolumeMedianCheck: true,
        rankBoost: 0.10 // 10% boost
      },
      normalizationParams: {
        volumeTransform: 'log',
        difficultyTransform: 'linear',
        trendSensitivity: 1.2,
        outlierCapping: {
          enabled: true,
          percentile: 95
        }
      }
    });

    // Tier-2: Balance between volume and ease
    configs.set('tier2', {
      name: 'tier2',
      weights: {
        volume: 0.35,
        ease: 0.25,
        relevance: 0.20,
        intent: 0.15,
        trend: 0.05
      },
      quickWinCriteria: {
        minEase: 0.7,
        minVolume: 500,
        minBlendedScore: 0.55,
        enableVolumeMedianCheck: true,
        rankBoost: 0.10
      },
      normalizationParams: {
        volumeTransform: 'sqrt',
        difficultyTransform: 'linear',
        trendSensitivity: 1.0,
        outlierCapping: {
          enabled: true,
          percentile: 95
        }
      }
    });

    // Tier-3: Prioritize ease and relevance
    configs.set('tier3', {
      name: 'tier3',
      weights: {
        ease: 0.35,
        relevance: 0.30,
        volume: 0.20,
        intent: 0.10,
        trend: 0.05
      },
      quickWinCriteria: {
        minEase: 0.7,
        minVolume: 100,
        minBlendedScore: 0.5,
        enableVolumeMedianCheck: true,
        rankBoost: 0.10
      },
      normalizationParams: {
        volumeTransform: 'linear',
        difficultyTransform: 'exponential',
        trendSensitivity: 0.8,
        outlierCapping: {
          enabled: true,
          percentile: 90
        }
      }
    });

    return configs;
  }

  /**
   * Calculate blended score for a single keyword
   */
  async calculateScore(
    input: ScoringInput,
    customWeights?: Partial<ScoringWeights>,
    clusterMedianVolume?: number
  ): Promise<ScoringResult> {
    // Validate input
    const validatedInput = ScoringInputSchema.parse(input);
    
    // Get stage configuration
    const stageConfig = this.stageConfigs.get(validatedInput.stage);
    if (!stageConfig) {
      throw new Error(`Invalid stage: ${validatedInput.stage}`);
    }

    // Use custom weights or stage defaults
    const weights = customWeights?.[validatedInput.stage] || stageConfig.weights;

    try {
      // Apply rate limiting
      if (!this.rateLimiter.tryConsume(1)) {
        throw new Error('Rate limit exceeded for scoring operations');
      }

      // Calculate normalized component scores
      const componentScores = await this.calculateComponentScores(
        validatedInput,
        stageConfig.normalizationParams
      );

      // Apply stage-specific weights
      const weightedScores = this.applyWeights(componentScores, weights);

      // Calculate blended score
      const blendedScore = this.calculateBlendedScore(weightedScores);

      // Determine quick win status
      const quickWin = this.isQuickWin(
        validatedInput,
        componentScores,
        blendedScore,
        stageConfig.quickWinCriteria,
        clusterMedianVolume
      );

      // Apply quick win boost if enabled
      const finalScore = quickWin ? 
        Math.min(1, blendedScore * (1 + stageConfig.quickWinCriteria.rankBoost)) : 
        blendedScore;

      // Determine tier
      const tier = this.determineTier(finalScore);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        validatedInput,
        componentScores,
        finalScore,
        quickWin
      );

      const result: ScoringResult = {
        keyword: validatedInput.keyword,
        stage: validatedInput.stage,
        blendedScore: finalScore,
        componentScores,
        weightedScores,
        quickWin,
        tier,
        recommendations
      };

      logger.debug('Calculated score for keyword', {
        keyword: validatedInput.keyword,
        stage: validatedInput.stage,
        score: finalScore,
        quickWin
      });

      return result;

    } catch (error) {
      logger.error('Error calculating score', {
        keyword: validatedInput.keyword,
        stage: validatedInput.stage,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Batch score multiple keywords with optimization
   */
  async batchScore(config: BatchScoringConfig): Promise<ScoringResult[]> {
    // Validate configuration
    const validatedConfig = BatchScoringConfigSchema.parse(config);

    return this.circuitBreaker.execute(async () => {
      const startTime = performance.now();
      
      try {
        // Calculate normalization data for the entire batch
        const normalizationData = this.calculateNormalizationData(
          validatedConfig.keywords,
          validatedConfig.normalizationMethod
        );

        // Group keywords by stage for optimized processing
        const keywordsByStage = this.groupKeywordsByStage(validatedConfig.keywords);

        // Process each stage separately with stage-specific optimizations
        const results: ScoringResult[] = [];
        
        for (const [stage, keywords] of keywordsByStage) {
          const stageResults = await this.processStage(
            stage,
            keywords,
            validatedConfig.weights,
            normalizationData,
            validatedConfig.quickWinThreshold
          );
          results.push(...stageResults);
        }

        // Apply seasonal adjustments if configured
        let finalResults = results;
        if (validatedConfig.applySeasonalAdjustments && validatedConfig.seasonalFactors) {
          finalResults = this.applySeasonalAdjustments(results, validatedConfig.seasonalFactors as SeasonalFactor[]);
        }

        // Sort by blended score (descending)
        finalResults.sort((a, b) => b.blendedScore - a.blendedScore);

        // Track performance analytics
        const endTime = performance.now();
        const scoringTime = endTime - startTime;
        
        this.trackScoringAnalytics({
          keywords: validatedConfig.keywords.length,
          scoringTime,
          results: finalResults,
          config: validatedConfig as BatchScoringConfig
        });

        logger.info('Batch scoring completed', {
          keywordCount: validatedConfig.keywords.length,
          scoringTime: Math.round(scoringTime),
          quickWins: finalResults.filter(r => r.quickWin).length
        });

        return finalResults;

      } catch (error) {
        logger.error('Batch scoring failed', {
          keywordCount: validatedConfig.keywords.length,
          error: (error as Error).message
        });
        throw error;
      }
    });
  }

  /**
   * Calculate normalized component scores
   */
  private async calculateComponentScores(
    input: ScoringInput,
    params: NormalizationParams
  ): Promise<ScoringResult['componentScores']> {
    const { volume, difficulty, intent, relevance, trend } = input;

    return {
      volume: this.normalizeVolume(volume, params.volumeTransform),
      intent: this.normalizeIntent(intent),
      relevance: Math.max(0, Math.min(1, relevance)),
      trend: this.normalizeTrend(trend, params.trendSensitivity),
      ease: this.normalizeEase(difficulty, params.difficultyTransform)
    };
  }

  /**
   * Normalize volume using specified transformation
   */
  private normalizeVolume(volume: number, transform: NormalizationParams['volumeTransform']): number {
    if (volume <= 0) return 0;

    switch (transform) {
      case 'log':
        // Logarithmic normalization (good for volume distribution)
        return Math.min(1, Math.log10(volume + 1) / 6); // Assumes max ~1M volume
      
      case 'sqrt':
        // Square root normalization (moderate compression)
        return Math.min(1, Math.sqrt(volume) / 1000); // Assumes max 1M volume
      
      case 'linear':
        // Linear normalization
        return Math.min(1, volume / 100000); // Assumes max 100k volume
      
      case 'percentile':
        // Would require batch context - simplified for now
        return Math.min(1, Math.log10(volume + 1) / 6);
      
      default:
        return Math.min(1, Math.log10(volume + 1) / 6);
    }
  }

  /**
   * Normalize intent with stage-aware scoring
   */
  private normalizeIntent(intent: KeywordIntent | null): number {
    const intentScores: Record<KeywordIntent, number> = {
      'transactional': 1.0, // Highest commercial value
      'commercial': 0.9,    // High commercial value
      'informational': 0.7, // Medium value (educational content)
      'navigational': 0.5   // Lower value (brand searches)
    };

    return intent ? intentScores[intent] : 0.6; // Default to informational
  }

  /**
   * Normalize trend with sensitivity adjustment
   */
  private normalizeTrend(trend: number, sensitivity: number): number {
    // Trend is typically in range [-1, 1]
    // Apply sensitivity multiplier and normalize to [0, 1]
    const adjustedTrend = trend * sensitivity;
    return Math.max(0, Math.min(1, (adjustedTrend + 1) / 2));
  }

  /**
   * Normalize ease (inverse of difficulty) with transformation
   */
  private normalizeEase(difficulty: number, transform: NormalizationParams['difficultyTransform']): number {
    const normalizedDifficulty = Math.max(0, Math.min(100, difficulty)) / 100;

    switch (transform) {
      case 'linear':
        return 1 - normalizedDifficulty;
      
      case 'exponential':
        // Exponential curve - easier keywords get disproportionately higher scores
        return Math.pow(1 - normalizedDifficulty, 0.5);
      
      case 'sigmoid':
        // S-curve transformation around difficulty 50
        const x = (difficulty - 50) / 20; // Scale and center
        const sigmoid = 1 / (1 + Math.exp(x));
        return sigmoid;
      
      default:
        return 1 - normalizedDifficulty;
    }
  }

  /**
   * Apply stage-specific weights to component scores
   */
  private applyWeights(
    componentScores: ScoringResult['componentScores'],
    weights: StageWeights
  ): ScoringResult['weightedScores'] {
    return {
      volume: componentScores.volume * weights.volume,
      intent: componentScores.intent * weights.intent,
      relevance: componentScores.relevance * weights.relevance,
      trend: componentScores.trend * weights.trend,
      ease: componentScores.ease * weights.ease
    };
  }

  /**
   * Calculate final blended score from weighted components
   */
  private calculateBlendedScore(weightedScores: ScoringResult['weightedScores']): number {
    const score = Object.values(weightedScores).reduce((sum, score) => sum + score, 0);
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Determine if keyword qualifies as quick win
   */
  private isQuickWin(
    input: ScoringInput,
    componentScores: ScoringResult['componentScores'],
    blendedScore: number,
    criteria: QuickWinCriteria,
    clusterMedianVolume?: number
  ): boolean {
    // Check basic criteria
    const meetsEaseCriteria = componentScores.ease >= criteria.minEase;
    const meetsVolumeCriteria = input.volume >= criteria.minVolume;
    const meetsScoreCriteria = blendedScore >= criteria.minBlendedScore;

    // Check against cluster median if enabled and available
    let meetsMedianCriteria = true;
    if (criteria.enableVolumeMedianCheck && clusterMedianVolume !== undefined) {
      meetsMedianCriteria = input.volume >= clusterMedianVolume;
    }

    return meetsEaseCriteria && meetsVolumeCriteria && meetsScoreCriteria && meetsMedianCriteria;
  }

  /**
   * Determine score tier
   */
  private determineTier(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Generate contextual recommendations
   */
  private generateRecommendations(
    input: ScoringInput,
    componentScores: ScoringResult['componentScores'],
    finalScore: number,
    quickWin: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (quickWin) {
      recommendations.push(`Quick win opportunity - prioritize for immediate content creation`);
    }

    // Volume-based recommendations
    if (componentScores.volume < 0.3) {
      recommendations.push(`Low search volume (${input.volume.toLocaleString()}) - consider for long-tail strategy`);
    } else if (componentScores.volume > 0.8) {
      recommendations.push(`High search volume (${input.volume.toLocaleString()}) - excellent for pillar content`);
    }

    // Difficulty-based recommendations
    if (componentScores.ease < 0.3) {
      recommendations.push(`High difficulty (${input.difficulty}/100) - requires strong domain authority`);
    } else if (componentScores.ease > 0.7) {
      recommendations.push(`Low difficulty (${input.difficulty}/100) - good opportunity for quick ranking`);
    }

    // Intent-based recommendations
    if (input.intent === 'transactional') {
      recommendations.push(`Transactional intent - optimize for conversion and product pages`);
    } else if (input.intent === 'commercial') {
      recommendations.push(`Commercial intent - create comparison and review content`);
    } else if (input.intent === 'informational') {
      recommendations.push(`Informational intent - focus on educational and how-to content`);
    }

    // Relevance recommendations
    if (componentScores.relevance < 0.4) {
      recommendations.push(`Low relevance score - verify alignment with content strategy`);
    } else if (componentScores.relevance > 0.9) {
      recommendations.push(`Highly relevant - perfect fit for content pillars`);
    }

    // Trend recommendations
    if (componentScores.trend > 0.7) {
      recommendations.push(`Trending upward - time-sensitive opportunity`);
    } else if (componentScores.trend < 0.3) {
      recommendations.push(`Declining trend - consider lower priority or seasonal approach`);
    }

    // Stage-specific recommendations
    if (input.stage === 'dream100' && finalScore < 0.6) {
      recommendations.push(`Below average for Dream 100 - consider moving to supporting content`);
    } else if (input.stage === 'tier3' && finalScore > 0.8) {
      recommendations.push(`High-scoring Tier-3 keyword - consider promoting to higher tier`);
    }

    return recommendations;
  }

  /**
   * Calculate normalization data for batch processing
   */
  private calculateNormalizationData(
    keywords: ScoringInput[],
    method: BatchScoringConfig['normalizationMethod']
  ): {
    volumeStats: { min: number; max: number; median: number; p95: number };
    difficultyStats: { min: number; max: number; median: number };
    trendStats: { mean: number; stdDev: number };
  } {
    const volumes = keywords.map(k => k.volume).sort((a, b) => a - b);
    const difficulties = keywords.map(k => k.difficulty).sort((a, b) => a - b);
    const trends = keywords.map(k => k.trend);

    const volumeStats = {
      min: volumes[0] || 0,
      max: volumes[volumes.length - 1] || 0,
      median: volumes[Math.floor(volumes.length / 2)] || 0,
      p95: volumes[Math.floor(volumes.length * 0.95)] || 0
    };

    const difficultyStats = {
      min: difficulties[0] || 0,
      max: difficulties[difficulties.length - 1] || 0,
      median: difficulties[Math.floor(difficulties.length / 2)] || 0
    };

    const trendMean = trends.reduce((sum, t) => sum + t, 0) / trends.length;
    const trendVariance = trends.reduce((sum, t) => sum + Math.pow(t - trendMean, 2), 0) / trends.length;
    const trendStats = {
      mean: trendMean,
      stdDev: Math.sqrt(trendVariance)
    };

    return { volumeStats, difficultyStats, trendStats };
  }

  /**
   * Group keywords by stage for optimized batch processing
   */
  private groupKeywordsByStage(keywords: ScoringInput[]): Map<KeywordStage, ScoringInput[]> {
    const grouped = new Map<KeywordStage, ScoringInput[]>();
    
    for (const keyword of keywords) {
      const existing = grouped.get(keyword.stage) || [];
      existing.push(keyword);
      grouped.set(keyword.stage, existing);
    }

    return grouped;
  }

  /**
   * Process keywords for a specific stage
   */
  private async processStage(
    stage: KeywordStage,
    keywords: ScoringInput[],
    weights: ScoringWeights,
    normalizationData: any,
    quickWinThreshold: number
  ): Promise<ScoringResult[]> {
    const results: ScoringResult[] = [];
    const stageConfig = this.stageConfigs.get(stage);
    
    if (!stageConfig) {
      throw new Error(`Invalid stage: ${stage}`);
    }

    // Calculate cluster median volume for quick win detection
    const volumes = keywords.map(k => k.volume).sort((a, b) => a - b);
    const clusterMedianVolume = volumes[Math.floor(volumes.length / 2)];

    // Process keywords in batches to avoid overwhelming the system
    const batchSize = 100;
    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(keyword => 
          this.calculateScore(keyword, weights, clusterMedianVolume)
        )
      );
      
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Apply seasonal adjustments to scores
   */
  private applySeasonalAdjustments(
    results: ScoringResult[],
    seasonalFactors: SeasonalFactor[]
  ): ScoringResult[] {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();

    // Find applicable seasonal factors for current date
    const applicableFactors = seasonalFactors.filter(factor => {
      const [startMonth, startDay] = factor.startDate.split('-').map(Number);
      const [endMonth, endDay] = factor.endDate.split('-').map(Number);
      
      const startDate = new Date(currentDate.getFullYear(), startMonth - 1, startDay);
      const endDate = new Date(currentDate.getFullYear(), endMonth - 1, endDay);
      
      return currentDate >= startDate && currentDate <= endDate;
    });

    if (applicableFactors.length === 0) {
      return results;
    }

    return results.map(result => {
      let adjustedScore = result.blendedScore;
      const seasonalRecommendations: string[] = [];

      // Apply relevant seasonal factors
      for (const factor of applicableFactors) {
        const keywordMatches = factor.keywords.some(factorKeyword =>
          result.keyword.toString().toLowerCase().includes(factorKeyword.toLowerCase()) ||
          factorKeyword.toLowerCase().includes(result.keyword.toString().toLowerCase())
        );

        if (keywordMatches) {
          adjustedScore *= factor.multiplier;
          const adjustmentPercent = Math.round((factor.multiplier - 1) * 100);
          seasonalRecommendations.push(
            `Seasonal adjustment: ${factor.reason} (${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%)`
          );
        }
      }

      // Ensure score stays within bounds
      adjustedScore = Math.max(0, Math.min(1, adjustedScore));

      return {
        ...result,
        blendedScore: adjustedScore,
        recommendations: [...result.recommendations, ...seasonalRecommendations]
      };
    });
  }

  /**
   * Track scoring analytics for performance monitoring
   */
  private trackScoringAnalytics(data: {
    keywords: number;
    scoringTime: number;
    results: ScoringResult[];
    config: BatchScoringConfig;
  }): void {
    const { keywords, scoringTime, results, config } = data;
    
    const distribution = {
      high: results.filter(r => r.tier === 'high').length,
      medium: results.filter(r => r.tier === 'medium').length,
      low: results.filter(r => r.tier === 'low').length
    };

    const quickWins = results.filter(r => r.quickWin);
    const quickWinAnalysis = {
      total: quickWins.length,
      byStage: {
        dream100: quickWins.filter(r => r.stage === 'dream100').length,
        tier2: quickWins.filter(r => r.stage === 'tier2').length,
        tier3: quickWins.filter(r => r.stage === 'tier3').length
      } as Record<KeywordStage, number>,
      byIntent: {
        transactional: quickWins.filter(r => r.keyword.toString().includes('buy')).length, // Simplified
        commercial: quickWins.filter(r => r.keyword.toString().includes('best')).length,
        informational: quickWins.filter(r => r.keyword.toString().includes('how')).length,
        navigational: quickWins.filter(r => r.keyword.toString().includes('login')).length
      } as Record<KeywordIntent, number>,
      avgVolume: quickWins.reduce((sum, r) => sum + (r.componentScores.volume * 100000), 0) / quickWins.length, // Approximation
      avgDifficulty: quickWins.reduce((sum, r) => sum + ((1 - r.componentScores.ease) * 100), 0) / quickWins.length
    };

    const componentContributions = {
      volume: results.reduce((sum, r) => sum + r.weightedScores.volume, 0) / results.length,
      intent: results.reduce((sum, r) => sum + r.weightedScores.intent, 0) / results.length,
      relevance: results.reduce((sum, r) => sum + r.weightedScores.relevance, 0) / results.length,
      trend: results.reduce((sum, r) => sum + r.weightedScores.trend, 0) / results.length,
      ease: results.reduce((sum, r) => sum + r.weightedScores.ease, 0) / results.length
    };

    const analytics: ScoringAnalytics = {
      runId: 'current-run' as UUID, // Would be passed in from actual run context
      model: 'stage-specific-v1',
      totalKeywords: keywords,
      scoringTime,
      distribution,
      quickWinAnalysis,
      componentContributions,
      recommendations: this.generateAnalyticsRecommendations(results, quickWinAnalysis)
    };

    this.scoringHistory.push(analytics);

    // Keep only last 100 analytics records
    if (this.scoringHistory.length > 100) {
      this.scoringHistory = this.scoringHistory.slice(-100);
    }
  }

  /**
   * Generate analytics-based recommendations
   */
  private generateAnalyticsRecommendations(
    results: ScoringResult[],
    quickWinAnalysis: ScoringAnalytics['quickWinAnalysis']
  ): string[] {
    const recommendations: string[] = [];
    const totalKeywords = results.length;

    // Quick win ratio analysis
    const quickWinRatio = quickWinAnalysis.total / totalKeywords;
    if (quickWinRatio < 0.1) {
      recommendations.push('Low quick win ratio - consider adjusting difficulty thresholds or focusing on easier keywords');
    } else if (quickWinRatio > 0.3) {
      recommendations.push('High quick win ratio - excellent keyword selection for immediate impact');
    }

    // Score distribution analysis
    const highScoreRatio = results.filter(r => r.tier === 'high').length / totalKeywords;
    if (highScoreRatio < 0.2) {
      recommendations.push('Few high-scoring keywords - review keyword selection criteria and relevance scoring');
    }

    // Stage balance analysis
    const dreamCount = results.filter(r => r.stage === 'dream100').length;
    const tier2Count = results.filter(r => r.stage === 'tier2').length;
    const tier3Count = results.filter(r => r.stage === 'tier3').length;

    if (dreamCount / totalKeywords > 0.3) {
      recommendations.push('High Dream 100 ratio - ensure sufficient supporting content keywords');
    }

    if (tier3Count / totalKeywords < 0.4) {
      recommendations.push('Low Tier-3 ratio - consider expanding long-tail keyword research');
    }

    return recommendations;
  }

  /**
   * Get scoring performance analytics
   */
  getAnalytics(): ScoringAnalytics[] {
    return [...this.scoringHistory];
  }

  /**
   * Optimize scoring weights based on performance data
   */
  async optimizeWeights(
    currentResults: ScoringResult[],
    targetMetrics: ScoringOptimization['targetMetrics'],
    constraints: ScoringOptimization['constraints']
  ): Promise<ScoringWeights> {
    logger.info('Starting weight optimization', { targetMetrics, constraints });

    const currentWeights = this.defaultWeights;
    
    // Analyze current performance
    const currentQuickWinRatio = currentResults.filter(r => r.quickWin).length / currentResults.length;
    const currentAvgDifficulty = currentResults.reduce(
      (sum, r) => sum + ((1 - r.componentScores.ease) * 100), 0
    ) / currentResults.length;
    const currentTrafficPotential = currentResults.reduce(
      (sum, r) => sum + (r.componentScores.volume * 100000), 0
    ); // Approximation

    logger.debug('Current performance', {
      quickWinRatio: currentQuickWinRatio,
      avgDifficulty: currentAvgDifficulty,
      trafficPotential: currentTrafficPotential
    });

    // Simple optimization approach (in production, would use more sophisticated algorithms)
    const optimizedWeights = { ...currentWeights };

    // Adjust based on quick win target
    if (currentQuickWinRatio < targetMetrics.avgQuickWinRatio) {
      // Increase ease weights across stages
      optimizedWeights.dream100 = this.adjustStageWeights(optimizedWeights.dream100, 'ease', 1.3);
      optimizedWeights.tier2 = this.adjustStageWeights(optimizedWeights.tier2, 'ease', 1.2);
      optimizedWeights.tier3 = this.adjustStageWeights(optimizedWeights.tier3, 'ease', 1.1);
    }

    // Adjust based on difficulty target
    if (currentAvgDifficulty > targetMetrics.avgDifficulty) {
      // Further increase ease weights
      optimizedWeights.dream100 = this.adjustStageWeights(optimizedWeights.dream100, 'ease', 1.2);
      optimizedWeights.tier2 = this.adjustStageWeights(optimizedWeights.tier2, 'ease', 1.15);
      optimizedWeights.tier3 = this.adjustStageWeights(optimizedWeights.tier3, 'ease', 1.1);
    }

    // Adjust based on traffic potential target
    if (currentTrafficPotential < targetMetrics.trafficPotential) {
      // Increase volume weights
      optimizedWeights.dream100 = this.adjustStageWeights(optimizedWeights.dream100, 'volume', 1.1);
      optimizedWeights.tier2 = this.adjustStageWeights(optimizedWeights.tier2, 'volume', 1.05);
    }

    // Normalize weights to sum to 1.0
    const normalizedWeights = this.normalizeWeights(optimizedWeights);

    logger.info('Weight optimization completed', {
      originalWeights: currentWeights,
      optimizedWeights: normalizedWeights
    });

    return normalizedWeights;
  }

  /**
   * Adjust specific component weight in a stage
   */
  private adjustStageWeights(
    stageWeights: StageWeights,
    component: keyof StageWeights,
    multiplier: number
  ): StageWeights {
    const adjusted = { ...stageWeights };
    adjusted[component] = Math.min(0.8, adjusted[component] * multiplier);
    
    // Reduce other weights proportionally to maintain balance
    const otherComponents = Object.keys(adjusted).filter(k => k !== component) as (keyof StageWeights)[];
    const totalOther = otherComponents.reduce((sum, key) => sum + adjusted[key], 0);
    const availableForOthers = 1 - adjusted[component];
    
    if (totalOther > 0 && availableForOthers > 0) {
      const reductionFactor = availableForOthers / totalOther;
      otherComponents.forEach(key => {
        adjusted[key] = adjusted[key] * reductionFactor;
      });
    }

    return adjusted;
  }

  /**
   * Normalize weights to sum to 1.0 for each stage
   */
  private normalizeWeights(weights: ScoringWeights): ScoringWeights {
    const normalized = { ...weights };

    (['dream100', 'tier2', 'tier3'] as const).forEach((stage: KeywordStage) => {
      const stageWeights = (normalized as any)[stage] as StageWeights;
      const sum = Object.values(stageWeights).reduce((s: number, w: number) => s + w, 0);
      
      if (Math.abs(sum - 1) > 0.01) {
        const factor = 1 / sum;
        (normalized as any)[stage] = {
          volume: stageWeights.volume * factor,
          intent: stageWeights.intent * factor,
          relevance: stageWeights.relevance * factor,
          trend: stageWeights.trend * factor,
          ease: stageWeights.ease * factor
        } as StageWeights;
      }
    });

    return normalized;
  }

  /**
   * Validate score quality and consistency
   */
  async validateScoringQuality(results: ScoringResult[]): Promise<{
    isValid: boolean;
    warnings: string[];
    metrics: {
      scoreDistribution: Record<'high' | 'medium' | 'low', number>;
      quickWinRatio: number;
      avgComponentContribution: Record<string, number>;
      outlierCount: number;
    };
  }> {
    const warnings: string[] = [];
    
    // Check score distribution
    const scoreDistribution = {
      high: results.filter(r => r.tier === 'high').length,
      medium: results.filter(r => r.tier === 'medium').length,
      low: results.filter(r => r.tier === 'low').length
    };

    // Check for reasonable distribution
    const totalKeywords = results.length;
    const highRatio = scoreDistribution.high / totalKeywords;
    const lowRatio = scoreDistribution.low / totalKeywords;

    if (highRatio > 0.5) {
      warnings.push('Unusually high ratio of high-scoring keywords - review scoring criteria');
    }
    if (lowRatio > 0.7) {
      warnings.push('High ratio of low-scoring keywords - consider adjusting thresholds');
    }

    // Check quick win ratio
    const quickWinRatio = results.filter(r => r.quickWin).length / totalKeywords;
    if (quickWinRatio < 0.05) {
      warnings.push('Very few quick wins identified - review difficulty and volume thresholds');
    } else if (quickWinRatio > 0.4) {
      warnings.push('High quick win ratio - validate scoring accuracy');
    }

    // Calculate average component contributions
    const avgComponentContribution = {
      volume: results.reduce((sum, r) => sum + r.weightedScores.volume, 0) / totalKeywords,
      intent: results.reduce((sum, r) => sum + r.weightedScores.intent, 0) / totalKeywords,
      relevance: results.reduce((sum, r) => sum + r.weightedScores.relevance, 0) / totalKeywords,
      trend: results.reduce((sum, r) => sum + r.weightedScores.trend, 0) / totalKeywords,
      ease: results.reduce((sum, r) => sum + r.weightedScores.ease, 0) / totalKeywords
    };

    // Check for balanced component contributions
    const minContribution = Math.min(...Object.values(avgComponentContribution));
    const maxContribution = Math.max(...Object.values(avgComponentContribution));
    if (maxContribution / minContribution > 10) {
      warnings.push('Unbalanced component contributions - some factors may be overweighted');
    }

    // Count outliers (scores very close to 0 or 1)
    const outlierCount = results.filter(r => 
      r.blendedScore < 0.05 || r.blendedScore > 0.95
    ).length;

    if (outlierCount > totalKeywords * 0.1) {
      warnings.push('High number of extreme scores - review normalization parameters');
    }

    const isValid = warnings.length < 3; // Allow some warnings

    return {
      isValid,
      warnings,
      metrics: {
        scoreDistribution,
        quickWinRatio,
        avgComponentContribution,
        outlierCount
      }
    };
  }
}

/**
 * Singleton scoring engine instance
 */
export const scoringEngine = new ScoringEngine();

/**
 * Convenience function for single keyword scoring
 */
export const scoreKeyword = async (
  keyword: string,
  stage: KeywordStage,
  volume: number,
  difficulty: number,
  intent: KeywordIntent | null,
  relevance: number,
  trend: number = 0,
  customWeights?: Partial<ScoringWeights>,
  clusterMedianVolume?: number
): Promise<ScoringResult> => {
  const input: ScoringInput = {
    keyword: keyword as any, // Type assertion for brand type
    stage,
    volume,
    difficulty,
    intent,
    relevance,
    trend
  };

  return scoringEngine.calculateScore(input, customWeights, clusterMedianVolume);
};

/**
 * Convenience function for batch keyword scoring
 */
export const scoreKeywordBatch = async (
  keywords: Array<{
    keyword: string;
    stage: KeywordStage;
    volume: number;
    difficulty: number;
    intent: KeywordIntent | null;
    relevance: number;
    trend?: number;
  }>,
  weights?: ScoringWeights,
  options?: {
    quickWinThreshold?: number;
    enableSeasonalAdjustments?: boolean;
    seasonalFactors?: SeasonalFactor[];
  }
): Promise<ScoringResult[]> => {
  const scoringInputs: ScoringInput[] = keywords.map(k => ({
    keyword: k.keyword as any,
    stage: k.stage,
    volume: k.volume,
    difficulty: k.difficulty,
    intent: k.intent,
    relevance: k.relevance,
    trend: k.trend || 0
  }));

  const config: BatchScoringConfig = {
    keywords: scoringInputs,
    weights: weights || getDefaultScoringWeights(),
    normalizationMethod: 'min-max',
    quickWinThreshold: options?.quickWinThreshold || 0.7,
    applySeasonalAdjustments: options?.enableSeasonalAdjustments || false,
    seasonalFactors: options?.seasonalFactors
  };

  return scoringEngine.batchScore(config);
};

/**
 * Quick win detection utility
 */
export const detectQuickWins = (
  results: ScoringResult[],
  customThreshold?: number
): ScoringResult[] => {
  const threshold = customThreshold || 0.7;
  return results.filter(result => 
    result.quickWin && 
    result.blendedScore >= threshold
  ).sort((a, b) => b.blendedScore - a.blendedScore);
};

/**
 * Export configuration for different industry presets
 */
export const getScoringPresets = (): Record<string, ScoringWeights> => ({
  'ecommerce': {
    dream100: { volume: 0.45, intent: 0.35, relevance: 0.10, trend: 0.05, ease: 0.05 },
    tier2: { volume: 0.40, ease: 0.25, relevance: 0.15, intent: 0.15, trend: 0.05 },
    tier3: { ease: 0.40, relevance: 0.25, volume: 0.20, intent: 0.10, trend: 0.05 }
  },
  'saas': {
    dream100: { volume: 0.35, intent: 0.30, relevance: 0.20, trend: 0.10, ease: 0.05 },
    tier2: { volume: 0.30, ease: 0.30, relevance: 0.20, intent: 0.15, trend: 0.05 },
    tier3: { ease: 0.35, relevance: 0.35, volume: 0.15, intent: 0.10, trend: 0.05 }
  },
  'content': {
    dream100: { volume: 0.40, intent: 0.25, relevance: 0.20, trend: 0.10, ease: 0.05 },
    tier2: { volume: 0.30, ease: 0.25, relevance: 0.25, intent: 0.15, trend: 0.05 },
    tier3: { ease: 0.30, relevance: 0.35, volume: 0.20, intent: 0.10, trend: 0.05 }
  }
});

/**
 * Scoring Service - Wrapper around ScoringEngine for service layer consistency
 */
export class KeywordScoringService {
  private readonly engine: ScoringEngine;

  constructor() {
    this.engine = scoringEngine;
  }

  /**
   * Score a single keyword
   */
  async scoreKeyword(
    keyword: Keyword,
    weights?: ScoringWeights
  ): Promise<ScoringResult> {
    const input: ScoringInput = {
      keyword: keyword.keyword,
      stage: keyword.stage,
      volume: keyword.volume || 0,
      difficulty: keyword.difficulty || 0,
      intent: keyword.intent || 'informational',
      relevance: keyword.relevance || 0.5,
      trend: keyword.trend || 0
    };

    return this.engine.calculateScore(input, weights);
  }

  /**
   * Batch score multiple keywords
   */
  async batchScore(
    keywords: Keyword[],
    options?: {
      weights?: ScoringWeights;
      quickWinThreshold?: number;
      enableSeasonalAdjustments?: boolean;
      seasonalFactors?: SeasonalFactor[];
    }
  ): Promise<ScoringResult[]> {
    // Convert keywords to batch config format
    const config: BatchScoringConfig = {
      keywords: keywords.map(k => ({
        keyword: k.keyword,
        stage: k.stage,
        volume: k.volume,
        difficulty: k.difficulty,
        intent: k.intent,
        relevance: k.relevance || 0.5,
        trend: k.trend || 0
      })),
      weights: options?.weights || getDefaultScoringWeights(),
      normalizationMethod: 'min-max',
      applySeasonalAdjustments: options?.enableSeasonalAdjustments || false,
      seasonalFactors: options?.seasonalFactors || [],
      quickWinThreshold: options?.quickWinThreshold || 0.7
    };
    
    return this.engine.batchScore(config);
  }

  /**
   * Get scoring presets for different industries
   */
  getPresets(): Record<string, ScoringWeights> {
    return getScoringPresets();
  }

  /**
   * Detect quick wins from scoring results
   */
  detectQuickWins(
    results: ScoringResult[],
    threshold?: number
  ): ScoringResult[] {
    return detectQuickWins(results, threshold);
  }

  /**
   * Score keywords with progress tracking for pipeline integration
   */
  async scoreKeywords(
    request: {
      keywords: Keyword[];
      runId: UUID;
      settings?: {
        weights?: ScoringWeights;
        quickWinThreshold?: number;
        enableSeasonalAdjustments?: boolean;
        seasonalFactors?: SeasonalFactor[];
      };
    },
    onProgress?: (progress: {
      stage: ProcessingStage;
      stepName: string;
      current: number;
      total: number;
      percentage: number;
      message?: string;
    }) => Promise<void>
  ): Promise<{
    scoredKeywords: ScoringResult[];
    analytics: ScoringAnalytics;
    quickWins: ScoringResult[];
  }> {
    const { keywords, settings } = request;
    const startTime = Date.now();

    if (onProgress) {
      await onProgress({
        stage: 'scoring',
        stepName: 'Initializing scoring',
        current: 0,
        total: keywords.length,
        percentage: 0,
        message: `Preparing to score ${keywords.length} keywords`
      });
    }

    // Convert keywords to scoring inputs
    const scoringInputs: ScoringInput[] = keywords.map(keyword => ({
      keyword: keyword.keyword,
      stage: keyword.stage,
      volume: keyword.volume || 0,
      difficulty: keyword.difficulty || 0,
      intent: keyword.intent || 'informational',
      relevance: keyword.relevance || 0.5,
      trend: keyword.trend || 0
    }));

    if (onProgress) {
      await onProgress({
        stage: 'scoring',
        stepName: 'Calculating scores',
        current: 0,
        total: keywords.length,
        percentage: 10,
        message: 'Running blended scoring algorithm'
      });
    }

    // Create batch scoring configuration
    const config: BatchScoringConfig = {
      keywords: scoringInputs,
      weights: settings?.weights || getDefaultScoringWeights(),
      normalizationMethod: 'min-max',
      quickWinThreshold: settings?.quickWinThreshold || 0.7,
      applySeasonalAdjustments: settings?.enableSeasonalAdjustments || false,
      seasonalFactors: settings?.seasonalFactors
    };

    // Perform batch scoring
    const scoredKeywords = await this.engine.batchScore(config);

    if (onProgress) {
      await onProgress({
        stage: 'scoring',
        stepName: 'Detecting quick wins',
        current: scoredKeywords.length,
        total: keywords.length,
        percentage: 80,
        message: 'Identifying quick win opportunities'
      });
    }

    // Detect quick wins
    const quickWins = this.detectQuickWins(scoredKeywords, settings?.quickWinThreshold);

    // Generate analytics
    const processingTime = Date.now() - startTime;
    const analytics: ScoringAnalytics = {
      runId: request.runId,
      model: 'stage-specific-v1',
      totalKeywords: keywords.length,
      scoringTime: processingTime,
      distribution: {
        high: scoredKeywords.filter(r => r.tier === 'high').length,
        medium: scoredKeywords.filter(r => r.tier === 'medium').length,
        low: scoredKeywords.filter(r => r.tier === 'low').length
      },
      quickWinAnalysis: {
        total: quickWins.length,
        byStage: {
          dream100: quickWins.filter(r => r.stage === 'dream100').length,
          tier2: quickWins.filter(r => r.stage === 'tier2').length,
          tier3: quickWins.filter(r => r.stage === 'tier3').length
        } as Record<KeywordStage, number>,
        byIntent: {
          transactional: quickWins.filter(r => r.keyword.toString().includes('buy')).length,
          commercial: quickWins.filter(r => r.keyword.toString().includes('best')).length,
          informational: quickWins.filter(r => r.keyword.toString().includes('how')).length,
          navigational: quickWins.filter(r => r.keyword.toString().includes('login')).length
        } as Record<KeywordIntent, number>,
        avgVolume: quickWins.reduce((sum, r) => sum + (r.componentScores.volume * 100000), 0) / (quickWins.length || 1),
        avgDifficulty: quickWins.reduce((sum, r) => sum + ((1 - r.componentScores.ease) * 100), 0) / (quickWins.length || 1)
      },
      componentContributions: {
        volume: scoredKeywords.reduce((sum, r) => sum + r.weightedScores.volume, 0) / scoredKeywords.length,
        intent: scoredKeywords.reduce((sum, r) => sum + r.weightedScores.intent, 0) / scoredKeywords.length,
        relevance: scoredKeywords.reduce((sum, r) => sum + r.weightedScores.relevance, 0) / scoredKeywords.length,
        trend: scoredKeywords.reduce((sum, r) => sum + r.weightedScores.trend, 0) / scoredKeywords.length,
        ease: scoredKeywords.reduce((sum, r) => sum + r.weightedScores.ease, 0) / scoredKeywords.length
      },
      recommendations: this.generateRecommendations(scoredKeywords, quickWins)
    };

    if (onProgress) {
      await onProgress({
        stage: 'scoring',
        stepName: 'Scoring complete',
        current: keywords.length,
        total: keywords.length,
        percentage: 100,
        message: `Scored ${keywords.length} keywords, found ${quickWins.length} quick wins`
      });
    }

    return {
      scoredKeywords,
      analytics,
      quickWins
    };
  }

  /**
   * Generate recommendations based on scoring results
   */
  private generateRecommendations(
    scoredKeywords: ScoringResult[],
    quickWins: ScoringResult[]
  ): string[] {
    const recommendations: string[] = [];
    const totalKeywords = scoredKeywords.length;
    const quickWinRatio = quickWins.length / totalKeywords;

    if (quickWinRatio < 0.1) {
      recommendations.push('Low quick win ratio - consider focusing on easier keywords or adjusting difficulty thresholds');
    } else if (quickWinRatio > 0.3) {
      recommendations.push('Excellent quick win ratio - prioritize these for immediate content creation');
    }

    const highScoring = scoredKeywords.filter(r => r.tier === 'high').length;
    if (highScoring / totalKeywords < 0.2) {
      recommendations.push('Few high-scoring keywords - review keyword selection and relevance criteria');
    }

    const avgScore = scoredKeywords.reduce((sum, r) => sum + r.blendedScore, 0) / totalKeywords;
    if (avgScore < 0.4) {
      recommendations.push('Low average score - consider expanding keyword research or adjusting scoring weights');
    }

    return recommendations;
  }
}

/**
 * Alias class for backwards compatibility 
 */
export class ScoringService extends KeywordScoringService {
  // Inherits all functionality from KeywordScoringService
}
