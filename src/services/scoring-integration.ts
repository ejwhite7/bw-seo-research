/**
 * Scoring Service Integration
 * 
 * Integration layer between the scoring engine and the existing
 * keyword processing pipeline, providing seamless scoring workflow.
 */

import { 
  scoringEngine, 
  scoreKeywordBatch, 
  detectQuickWins,
  getScoringPresets 
} from './scoring';
import { 
  ScoringResult,
  ScoringWeights,
  BatchScoringConfig,
  getDefaultScoringWeights 
} from '../models/scoring';
import type { SeasonalFactor } from '../models/scoring';
import { Keyword, ClusterWithKeywords, RunSettings } from '../models';
import * as Sentry from '@sentry/nextjs';

// Create a simple logger for this service
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[ScoringIntegration] ${message}`, data);
  },
  error: (message: string, data?: any) => {
    console.error(`[ScoringIntegration] ${message}`, data);
    Sentry.captureMessage(`ScoringIntegration: ${message}`, 'error');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[ScoringIntegration] ${message}`, data);
  },
  debug: (message: string, data?: any) => {
    console.debug(`[ScoringIntegration] ${message}`, data);
  }
};
import type { KeywordStage, KeywordIntent } from '../types/database';

/**
 * Enhanced keyword with scoring results
 */
export interface ScoredKeyword extends Keyword {
  readonly scoringResult: ScoringResult;
  readonly quickWinRank?: number; // Rank among quick wins (1-based)
  readonly tierRank?: number;     // Rank within tier (1-based)
  readonly clusterRank?: number;  // Rank within cluster (1-based)
}

/**
 * Batch scoring configuration for pipeline integration
 */
export interface PipelineScoringConfig {
  readonly runId: string;
  readonly customWeights?: Partial<ScoringWeights>;
  readonly industryPreset?: 'ecommerce' | 'saas' | 'content';
  readonly quickWinThreshold?: number;
  readonly enableSeasonalAdjustments?: boolean;
  readonly performanceMode?: 'quality' | 'speed';
  readonly enableAnalytics?: boolean;
}

/**
 * Scoring pipeline integration service
 */
class ScoringPipelineImpl {
  /**
   * Score keywords from expansion or universe generation stage
   */
  static async scoreKeywords(
    keywords: Keyword[],
    config: PipelineScoringConfig
  ): Promise<ScoredKeyword[]> {
    const startTime = performance.now();
    
    try {
      // Determine scoring weights
      const weights = this.determineScoringWeights(config);
      
      // Convert keywords to scoring inputs
      const scoringInputs = keywords.map(keyword => ({
        keyword: keyword.keyword,
        stage: keyword.stage,
        volume: keyword.volume,
        difficulty: keyword.difficulty,
        intent: keyword.intent,
        relevance: keyword.relevance,
        trend: keyword.trend
      }));

      // Configure batch scoring
      const batchConfig: BatchScoringConfig = {
        keywords: scoringInputs,
        weights,
        normalizationMethod: config.performanceMode === 'speed' ? 'percentile' : 'min-max',
        quickWinThreshold: config.quickWinThreshold || 0.7,
        applySeasonalAdjustments: config.enableSeasonalAdjustments || false,
        seasonalFactors: [] as SeasonalFactor[]
      };

      // Execute batch scoring
      const scoringResults = await scoreKeywordBatch(
        scoringInputs.map(input => ({
          keyword: input.keyword.toString(),
          stage: input.stage,
          volume: input.volume,
          difficulty: input.difficulty,
          intent: input.intent,
          relevance: input.relevance,
          trend: input.trend
        })),
        weights,
        {
          quickWinThreshold: batchConfig.quickWinThreshold,
          enableSeasonalAdjustments: batchConfig.applySeasonalAdjustments
        }
      );

      // Merge scoring results with original keywords
      const scoredKeywords = this.mergeKeywordsWithScores(keywords, scoringResults);
      
      // Apply ranking within categories
      const rankedKeywords = this.applyRankings(scoredKeywords);

      const duration = performance.now() - startTime;
      
      logger.info('Scoring pipeline completed', {
        runId: config.runId,
        keywordCount: keywords.length,
        quickWins: scoredKeywords.filter(k => k.quickWin).length,
        duration: Math.round(duration)
      });

      // Validate scoring quality if enabled
      if (config.enableAnalytics !== false) {
        await this.validateAndLogQuality(scoringResults, config.runId);
      }

      return rankedKeywords;

    } catch (error) {
      logger.error('Scoring pipeline failed', {
        runId: config.runId,
        keywordCount: keywords.length,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Score keywords within clusters for cluster-level optimization
   */
  static async scoreClustersWithKeywords(
    clusters: ClusterWithKeywords[],
    config: PipelineScoringConfig
  ): Promise<ClusterWithKeywords[]> {
    const scoredClusters: ClusterWithKeywords[] = [];

    for (const cluster of clusters) {
      if (!cluster.keywords || cluster.keywords.length === 0) {
        scoredClusters.push(cluster);
        continue;
      }

      // Score keywords within the cluster
      const scoredKeywords = await this.scoreKeywords(cluster.keywords, config);
      
      // Calculate cluster median volume for quick win detection
      const volumes = cluster.keywords.map(k => k.volume).sort((a, b) => a - b);
      const medianVolume = volumes[Math.floor(volumes.length / 2)];

      // Re-evaluate quick wins with cluster context
      const contextualQuickWins = scoredKeywords.map(keyword => ({
        ...keyword,
        quickWin: this.evaluateQuickWinWithClusterContext(
          keyword.scoringResult, 
          medianVolume
        )
      }));

      // Update cluster score based on keyword scores
      const updatedCluster: ClusterWithKeywords = {
        ...cluster,
        keywords: contextualQuickWins,
        score: this.calculateClusterScore(contextualQuickWins)
      };

      scoredClusters.push(updatedCluster);
    }

    // Sort clusters by score
    return scoredClusters.sort((a, b) => b.score - a.score);
  }

  /**
   * Generate scoring insights for roadmap planning
   */
  static async generateScoringInsights(
    scoredKeywords: ScoredKeyword[],
    runId: string
  ): Promise<{
    summary: {
      totalKeywords: number;
      quickWins: number;
      highTierKeywords: number;
      avgScore: number;
      topOpportunities: ScoredKeyword[];
    };
    stageBreakdown: Record<string, {
      count: number;
      avgScore: number;
      quickWins: number;
      topKeywords: ScoredKeyword[];
    }>;
    recommendations: string[];
  }> {
    const quickWins = scoredKeywords.filter(k => k.quickWin);
    const highTierKeywords = scoredKeywords.filter(k => k.scoringResult.tier === 'high');
    const avgScore = scoredKeywords.reduce((sum, k) => sum + k.blendedScore, 0) / scoredKeywords.length;

    // Stage breakdown
    const stageBreakdown: Record<string, any> = {};
    
    (['dream100', 'tier2', 'tier3']).forEach(stage => {
      const stageKeywords = scoredKeywords.filter(k => k.stage === stage);
      stageBreakdown[stage] = {
        count: stageKeywords.length,
        avgScore: stageKeywords.length > 0 ? 
          stageKeywords.reduce((sum, k) => sum + k.blendedScore, 0) / stageKeywords.length : 0,
        quickWins: stageKeywords.filter(k => k.quickWin).length,
        topKeywords: stageKeywords
          .sort((a, b) => b.blendedScore - a.blendedScore)
          .slice(0, 5)
      };
    });

    // Generate recommendations
    const recommendations = this.generateScoringRecommendations(
      scoredKeywords,
      quickWins.length / scoredKeywords.length,
      avgScore
    );

    return {
      summary: {
        totalKeywords: scoredKeywords.length,
        quickWins: quickWins.length,
        highTierKeywords: highTierKeywords.length,
        avgScore,
        topOpportunities: detectQuickWins(
          scoredKeywords.map(k => k.scoringResult)
        ).slice(0, 10).map(result => 
          scoredKeywords.find(k => k.keyword.toString() === result.keyword.toString())!
        )
      },
      stageBreakdown,
      recommendations
    };
  }

  /**
   * Update keywords in database with scoring results
   */
  static async updateKeywordScores(
    scoredKeywords: ScoredKeyword[],
    runId: string
  ): Promise<void> {
    // This would integrate with your database service
    // For now, just log the operation
    logger.info('Updating keyword scores in database', {
      runId,
      keywordCount: scoredKeywords.length,
      quickWins: scoredKeywords.filter(k => k.quickWin).length
    });
    
    // Example database update (would use your actual database service):
    /*
    const updates = scoredKeywords.map(keyword => ({
      id: keyword.id,
      blended_score: keyword.blendedScore,
      quick_win: keyword.quickWin,
      component_scores: keyword.scoringResult.componentScores,
      weighted_scores: keyword.scoringResult.weightedScores,
      tier: keyword.scoringResult.tier,
      recommendations: keyword.scoringResult.recommendations
    }));
    
    await database.keywords.batchUpdate(updates);
    */
  }

  /**
   * Determine scoring weights based on configuration
   */
  private static determineScoringWeights(config: PipelineScoringConfig): ScoringWeights {
    if (config.customWeights) {
      // Merge custom weights with defaults
      const defaultWeights = getDefaultScoringWeights();
      return {
        dream100: { ...defaultWeights.dream100, ...config.customWeights.dream100 },
        tier2: { ...defaultWeights.tier2, ...config.customWeights.tier2 },
        tier3: { ...defaultWeights.tier3, ...config.customWeights.tier3 }
      };
    }
    
    if (config.industryPreset) {
      const presets = getScoringPresets();
      return presets[config.industryPreset];
    }
    
    return getDefaultScoringWeights();
  }

  /**
   * Merge keywords with their scoring results
   */
  private static mergeKeywordsWithScores(
    keywords: Keyword[], 
    scoringResults: ScoringResult[]
  ): ScoredKeyword[] {
    const scoringMap = new Map(
      scoringResults.map(result => [result.keyword.toString(), result])
    );

    return keywords.map(keyword => {
      const scoringResult = scoringMap.get(keyword.keyword.toString());
      if (!scoringResult) {
        throw new Error(`No scoring result found for keyword: ${keyword.keyword}`);
      }

      return {
        ...keyword,
        blendedScore: scoringResult.blendedScore,
        quickWin: scoringResult.quickWin,
        scoringResult
      };
    });
  }

  /**
   * Apply rankings within different categories
   */
  private static applyRankings(scoredKeywords: ScoredKeyword[]): ScoredKeyword[] {
    // Sort all keywords by score for overall ranking
    const sortedKeywords = [...scoredKeywords].sort((a, b) => b.blendedScore - a.blendedScore);
    
    // Apply quick win rankings
    const quickWins = sortedKeywords.filter(k => k.quickWin);
    const quickWinMap = new Map(
      quickWins.map((keyword, index) => [keyword.id, index + 1])
    );

    // Apply tier rankings
    const tierRankings = new Map<string, number>();
    (['high', 'medium', 'low'] as const).forEach(tier => {
      const tierKeywords = sortedKeywords.filter(k => k.scoringResult.tier === tier);
      tierKeywords.forEach((keyword, index) => {
        tierRankings.set(keyword.id, index + 1);
      });
    });

    // Apply cluster rankings (grouped by cluster)
    const clusterRankings = new Map<string, number>();
    const keywordsByCluster = new Map<string, ScoredKeyword[]>();
    
    sortedKeywords.forEach(keyword => {
      if (keyword.clusterId) {
        const clusterId = keyword.clusterId;
        const existing = keywordsByCluster.get(clusterId) || [];
        existing.push(keyword);
        keywordsByCluster.set(clusterId, existing);
      }
    });

    keywordsByCluster.forEach(keywords => {
      keywords
        .sort((a, b) => b.blendedScore - a.blendedScore)
        .forEach((keyword, index) => {
          clusterRankings.set(keyword.id, index + 1);
        });
    });

    // Apply rankings to keywords
    return sortedKeywords.map(keyword => ({
      ...keyword,
      quickWinRank: quickWinMap.get(keyword.id),
      tierRank: tierRankings.get(keyword.id),
      clusterRank: clusterRankings.get(keyword.id)
    }));
  }

  /**
   * Evaluate quick win status with cluster context
   */
  private static evaluateQuickWinWithClusterContext(
    scoringResult: ScoringResult,
    clusterMedianVolume: number
  ): boolean {
    // Use existing quick win logic plus cluster median check
    return scoringResult.quickWin && 
           scoringResult.componentScores.volume * 100000 >= clusterMedianVolume; // Approximation
  }

  /**
   * Calculate overall cluster score from keyword scores
   */
  private static calculateClusterScore(scoredKeywords: ScoredKeyword[]): number {
    if (scoredKeywords.length === 0) return 0;

    const scores = scoredKeywords.map(k => k.blendedScore);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    // Boost score if cluster has quick wins
    const quickWinCount = scoredKeywords.filter(k => k.quickWin).length;
    const quickWinBoost = (quickWinCount / scoredKeywords.length) * 0.1; // Up to 10% boost
    
    // Boost score based on high-tier keywords
    const highTierCount = scoredKeywords.filter(k => k.scoringResult.tier === 'high').length;
    const tierBoost = (highTierCount / scoredKeywords.length) * 0.05; // Up to 5% boost

    return Math.min(1, avgScore + quickWinBoost + tierBoost);
  }

  /**
   * Validate scoring quality and log results
   */
  private static async validateAndLogQuality(
    scoringResults: ScoringResult[],
    runId: string
  ): Promise<void> {
    try {
      const validation = await scoringEngine.validateScoringQuality(scoringResults);
      
      if (!validation.isValid) {
        logger.warn('Scoring quality issues detected', {
          runId,
          warnings: validation.warnings,
          metrics: validation.metrics
        });
      } else {
        logger.debug('Scoring quality validation passed', {
          runId,
          quickWinRatio: validation.metrics.quickWinRatio,
          scoreDistribution: validation.metrics.scoreDistribution
        });
      }
    } catch (error) {
      logger.error('Scoring quality validation failed', {
        runId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Generate scoring-based recommendations
   */
  private static generateScoringRecommendations(
    scoredKeywords: ScoredKeyword[],
    quickWinRatio: number,
    avgScore: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (quickWinRatio < 0.1) {
      recommendations.push(
        'Low quick win ratio detected. Consider targeting easier keywords or adjusting difficulty thresholds.'
      );
    } else if (quickWinRatio > 0.3) {
      recommendations.push(
        'High quick win ratio - excellent opportunity for immediate content creation and ranking wins.'
      );
    }

    if (avgScore < 0.4) {
      recommendations.push(
        'Below-average keyword scores. Review keyword selection criteria and relevance scoring.'
      );
    } else if (avgScore > 0.7) {
      recommendations.push(
        'High-quality keyword set with strong scoring across all tiers. Prioritize content creation.'
      );
    }

    // Stage-specific recommendations
    const dreamCount = scoredKeywords.filter(k => k.stage === 'dream100').length;
    const totalCount = scoredKeywords.length;
    
    if (dreamCount / totalCount > 0.3) {
      recommendations.push(
        'High Dream 100 keyword ratio. Ensure sufficient supporting content (Tier-2, Tier-3) for topic authority.'
      );
    }

    const tier3Count = scoredKeywords.filter(k => k.stage === 'tier3').length;
    if (tier3Count / totalCount < 0.4) {
      recommendations.push(
        'Consider expanding long-tail keyword research (Tier-3) for comprehensive topic coverage.'
      );
    }

    // Intent mix recommendations
    const intentCounts = {
      transactional: scoredKeywords.filter(k => k.intent === 'transactional').length,
      commercial: scoredKeywords.filter(k => k.intent === 'commercial').length,
      informational: scoredKeywords.filter(k => k.intent === 'informational').length,
      navigational: scoredKeywords.filter(k => k.intent === 'navigational').length
    };

    const commercialRatio = (intentCounts.transactional + intentCounts.commercial) / totalCount;
    if (commercialRatio < 0.3) {
      recommendations.push(
        'Low commercial intent ratio. Consider adding more transactional and commercial keywords for conversion opportunities.'
      );
    }

    return recommendations;
  }
}

/**
 * Convenience functions for common scoring operations
 */

/**
 * Score keywords from expansion service
 */
export async function scoreExpansionKeywords(
  keywords: Keyword[],
  runId: string,
  settings?: RunSettings
): Promise<ScoredKeyword[]> {
  const config: PipelineScoringConfig = {
    runId,
    customWeights: (settings as any)?.scoringWeights,
    quickWinThreshold: (settings as any)?.quickWinThreshold || 0.7,
    enableSeasonalAdjustments: false,
    performanceMode: 'quality',
    enableAnalytics: true
  };

  return ScoringPipeline.scoreKeywords(keywords, config);
}

/**
 * Score keywords with industry-specific presets
 */
export async function scoreWithIndustryPreset(
  keywords: Keyword[],
  industry: 'ecommerce' | 'saas' | 'content',
  runId: string
): Promise<ScoredKeyword[]> {
  const config: PipelineScoringConfig = {
    runId,
    industryPreset: industry,
    performanceMode: 'quality',
    enableAnalytics: true
  };

  return ScoringPipeline.scoreKeywords(keywords, config);
}

/**
 * Quick scoring for fast preview/validation
 */
export async function quickScore(
  keywords: Keyword[],
  runId: string
): Promise<ScoredKeyword[]> {
  const config: PipelineScoringConfig = {
    runId,
    performanceMode: 'speed',
    enableAnalytics: false,
    quickWinThreshold: 0.6
  };

  return ScoringPipeline.scoreKeywords(keywords, config);
}

export const ScoringPipeline = ScoringPipelineImpl;
export { ScoringPipelineImpl };