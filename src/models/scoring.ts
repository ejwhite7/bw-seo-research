/**
 * Scoring Data Models
 * 
 * Stage-specific scoring weights, blended score calculations,
 * and optimization algorithms for keyword prioritization.
 */

import { z } from 'zod';
import type { KeywordStage, KeywordIntent } from '../types/database';
import type { UUID, KeywordString } from './index';
import type { Keyword } from './keyword';

/**
 * Stage-specific scoring weights configuration
 */
export interface ScoringWeights {
  readonly dream100: StageWeights;
  readonly tier2: StageWeights;
  readonly tier3: StageWeights;
}

/**
 * Individual stage weight configuration
 */
export interface StageWeights {
  readonly volume: number; // 0-1
  readonly intent: number; // 0-1
  readonly relevance: number; // 0-1
  readonly trend: number; // 0-1
  readonly ease: number; // 0-1 (1 - normalized difficulty)
}

// StageWeights is already exported above, no need to re-export

/**
 * Scoring input data for a single keyword
 */
export interface ScoringInput {
  readonly keyword: KeywordString;
  readonly stage: KeywordStage;
  readonly volume: number;
  readonly difficulty: number; // 0-100
  readonly intent: KeywordIntent | null;
  readonly relevance: number; // 0-1
  readonly trend: number; // -1 to 1
  readonly weights?: Partial<StageWeights>;
}

/**
 * Detailed scoring result with component breakdown
 */
export interface ScoringResult {
  readonly keyword: KeywordString;
  readonly stage: KeywordStage;
  readonly blendedScore: number; // 0-1
  readonly componentScores: {
    readonly volume: number; // 0-1
    readonly intent: number; // 0-1
    readonly relevance: number; // 0-1
    readonly trend: number; // 0-1
    readonly ease: number; // 0-1
  };
  readonly weightedScores: {
    readonly volume: number;
    readonly intent: number;
    readonly relevance: number;
    readonly trend: number;
    readonly ease: number;
  };
  readonly quickWin: boolean;
  readonly tier: 'high' | 'medium' | 'low';
  readonly recommendations: string[];
}

/**
 * Batch scoring configuration
 */
export interface BatchScoringConfig {
  readonly keywords: ScoringInput[];
  readonly weights: ScoringWeights;
  readonly normalizationMethod: 'min-max' | 'z-score' | 'percentile';
  readonly quickWinThreshold: number; // 0-1
  readonly applySeasonalAdjustments: boolean;
  readonly seasonalFactors?: SeasonalFactor[];
}

/**
 * Seasonal scoring adjustments
 */
export interface SeasonalFactor {
  readonly startDate: string; // MM-DD format
  readonly endDate: string; // MM-DD format
  readonly keywords: KeywordString[];
  readonly multiplier: number; // 0.5-2.0
  readonly reason: string;
}

/**
 * Scoring model configuration and parameters
 */
export interface ScoringModel {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly weights: ScoringWeights;
  readonly parameters: ScoringParameters;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isActive: boolean;
}

/**
 * Advanced scoring parameters
 */
export interface ScoringParameters {
  readonly volumeNormalization: {
    readonly method: 'log' | 'sqrt' | 'linear';
    readonly minVolume: number;
    readonly maxVolume: number;
  };
  readonly difficultyAdjustment: {
    readonly curve: 'linear' | 'exponential' | 'sigmoid';
    readonly inflectionPoint: number; // 0-100
    readonly steepness: number;
  };
  readonly intentBoosts: Record<KeywordIntent, number>; // multipliers
  readonly relevanceThresholds: {
    readonly minimum: number; // 0-1
    readonly excellent: number; // 0-1
  };
  readonly trendSensitivity: number; // how much trend affects score
  readonly competitiveFactors: {
    readonly includeCompetitorStrength: boolean;
    readonly competitorWeightReduction: number; // 0-1
  };
}

/**
 * Scoring optimization configuration
 */
export interface ScoringOptimization {
  readonly targetMetrics: {
    readonly avgQuickWinRatio: number; // desired % of quick wins
    readonly avgDifficulty: number; // target average difficulty
    readonly trafficPotential: number; // target total volume
  };
  readonly constraints: {
    readonly maxDifficulty: number;
    readonly minVolume: number;
    readonly requiredIntents: KeywordIntent[];
  };
  readonly optimizationMethod: 'genetic' | 'grid_search' | 'bayesian';
  readonly iterations: number;
}

/**
 * Scoring performance analytics
 */
export interface ScoringAnalytics {
  readonly runId: UUID;
  readonly model: string;
  readonly totalKeywords: number;
  readonly scoringTime: number; // milliseconds
  readonly distribution: {
    readonly high: number; // count of high-scoring keywords
    readonly medium: number;
    readonly low: number;
  };
  readonly quickWinAnalysis: {
    readonly total: number;
    readonly byStage: Record<KeywordStage, number>;
    readonly byIntent: Record<KeywordIntent, number>;
    readonly avgVolume: number;
    readonly avgDifficulty: number;
  };
  readonly componentContributions: {
    readonly volume: number; // avg contribution to final score
    readonly intent: number;
    readonly relevance: number;
    readonly trend: number;
    readonly ease: number;
  };
  readonly recommendations: string[];
}

/**
 * A/B testing configuration for scoring models
 */
export interface ScoringABTest {
  readonly testId: UUID;
  readonly name: string;
  readonly description: string;
  readonly baselineModel: string;
  readonly variantModel: string;
  readonly trafficSplit: number; // 0-1 (% to variant)
  readonly startDate: string;
  readonly endDate: string;
  readonly successMetrics: string[];
  readonly isActive: boolean;
}

/**
 * Scoring comparison between models
 */
export interface ScoringComparison {
  readonly testId: UUID;
  readonly baselineResults: ScoringAnalytics;
  readonly variantResults: ScoringAnalytics;
  readonly improvements: {
    readonly quickWinIncrease: number; // percentage points
    readonly avgScoreImprovement: number;
    readonly difficultyReduction: number;
    readonly trafficPotentialIncrease: number;
  };
  readonly statisticalSignificance: number; // p-value
  readonly recommendation: 'baseline' | 'variant' | 'continue_testing';
  readonly confidenceLevel: number; // 0-1
}

/**
 * Custom scoring rule for specific scenarios
 */
export interface ScoringRule {
  readonly id: UUID;
  readonly name: string;
  readonly description: string;
  readonly conditions: {
    readonly volumeRange?: { min: number; max: number };
    readonly difficultyRange?: { min: number; max: number };
    readonly intents?: KeywordIntent[];
    readonly stages?: KeywordStage[];
    readonly keywordPatterns?: string[]; // regex patterns
  };
  readonly adjustments: {
    readonly scoreMultiplier?: number;
    readonly weightOverrides?: Partial<StageWeights>;
    readonly forceQuickWin?: boolean;
    readonly forceTier?: 'high' | 'medium' | 'low';
  };
  readonly priority: number; // 1-10, higher = applied first
  readonly isActive: boolean;
}

/**
 * Validation schemas using Zod
 */
export const StageWeightsSchema = z.object({
  volume: z.number().min(0).max(1),
  intent: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  trend: z.number().min(0).max(1),
  ease: z.number().min(0).max(1)
}).refine(data => {
  const sum = data.volume + data.intent + data.relevance + data.trend + data.ease;
  return Math.abs(sum - 1) < 0.01;
}, {
  message: "Stage weights must sum to 1.0"
});

export const ScoringWeightsSchema = z.object({
  dream100: StageWeightsSchema,
  tier2: StageWeightsSchema,
  tier3: StageWeightsSchema
});

export const ScoringInputSchema = z.object({
  keyword: z.string().min(1).max(255).transform(val => val as KeywordString),
  stage: z.enum(['dream100', 'tier2', 'tier3']),
  volume: z.number().int().min(0).max(10000000),
  difficulty: z.number().int().min(0).max(100),
  intent: z.enum(['transactional', 'commercial', 'informational', 'navigational']).nullable(),
  relevance: z.number().min(0).max(1),
  trend: z.number().min(-1).max(1),
  weights: StageWeightsSchema.optional()
});

export const BatchScoringConfigSchema = z.object({
  keywords: z.array(ScoringInputSchema).min(1).max(10000),
  weights: ScoringWeightsSchema,
  normalizationMethod: z.enum(['min-max', 'z-score', 'percentile']).default('min-max'),
  quickWinThreshold: z.number().min(0.5).max(1).default(0.7),
  applySeasonalAdjustments: z.boolean().default(false),
  seasonalFactors: z.array(z.object({
    startDate: z.string().regex(/^\d{2}-\d{2}$/), // MM-DD format
    endDate: z.string().regex(/^\d{2}-\d{2}$/),
    keywords: z.array(z.string().min(1).max(255)),
    multiplier: z.number().min(0.5).max(2.0),
    reason: z.string().min(1).max(200)
  })).optional()
});

export const ScoringModelSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(20),
  description: z.string().min(1).max(500),
  weights: ScoringWeightsSchema,
  parameters: z.object({
    volumeNormalization: z.object({
      method: z.enum(['log', 'sqrt', 'linear']).default('log'),
      minVolume: z.number().int().min(0).default(0),
      maxVolume: z.number().int().min(1).default(1000000)
    }),
    difficultyAdjustment: z.object({
      curve: z.enum(['linear', 'exponential', 'sigmoid']).default('linear'),
      inflectionPoint: z.number().min(0).max(100).default(50),
      steepness: z.number().min(0.1).max(5).default(1)
    }),
    intentBoosts: z.record(z.enum(['transactional', 'commercial', 'informational', 'navigational']), z.number().min(0.5).max(2.0)),
    relevanceThresholds: z.object({
      minimum: z.number().min(0).max(1).default(0.3),
      excellent: z.number().min(0.5).max(1).default(0.9)
    }),
    trendSensitivity: z.number().min(0).max(2).default(1),
    competitiveFactors: z.object({
      includeCompetitorStrength: z.boolean().default(false),
      competitorWeightReduction: z.number().min(0).max(1).default(0.2)
    })
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isActive: z.boolean().default(true)
});

/**
 * Type guards for runtime type checking
 */
export const isScoringInput = (value: unknown): value is ScoringInput => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.keyword === 'string' &&
    typeof obj.stage === 'string' &&
    typeof obj.volume === 'number' &&
    typeof obj.difficulty === 'number' &&
    typeof obj.relevance === 'number' &&
    typeof obj.trend === 'number'
  );
};

export const isScoringResult = (value: unknown): value is ScoringResult => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.keyword === 'string' &&
    typeof obj.stage === 'string' &&
    typeof obj.blendedScore === 'number' &&
    typeof obj.quickWin === 'boolean' &&
    typeof obj.tier === 'string'
  );
};

/**
 * Core scoring calculation functions
 */
export const calculateBlendedScore = (
  input: ScoringInput,
  weights: ScoringWeights,
  normalizationData?: {
    minVolume: number;
    maxVolume: number;
    avgTrend: number;
    stdTrend: number;
  }
): ScoringResult => {
  const { keyword, stage, volume, difficulty, intent, relevance, trend } = input;
  const stageWeights = weights[stage];
  
  // Calculate component scores (0-1)
  const componentScores = {
    volume: normalizeVolume(volume, normalizationData),
    intent: normalizeIntent(intent),
    relevance: Math.max(0, Math.min(1, relevance)),
    trend: normalizeTrend(trend, normalizationData),
    ease: Math.max(0, (100 - difficulty) / 100)
  };
  
  // Apply weights
  const weightedScores = {
    volume: componentScores.volume * stageWeights.volume,
    intent: componentScores.intent * stageWeights.intent,
    relevance: componentScores.relevance * stageWeights.relevance,
    trend: componentScores.trend * stageWeights.trend,
    ease: componentScores.ease * stageWeights.ease
  };
  
  // Calculate blended score
  const blendedScore = Object.values(weightedScores).reduce((sum, score) => sum + score, 0);
  
  // Determine if it's a quick win
  const quickWin = componentScores.ease >= 0.7 && volume >= 1000 && blendedScore >= 0.6;
  
  // Determine tier
  let tier: 'high' | 'medium' | 'low' = 'low';
  if (blendedScore >= 0.7) tier = 'high';
  else if (blendedScore >= 0.4) tier = 'medium';
  
  // Generate recommendations
  const recommendations = generateScoringRecommendations(componentScores, stage, quickWin);
  
  return {
    keyword,
    stage,
    blendedScore: Math.max(0, Math.min(1, blendedScore)),
    componentScores,
    weightedScores,
    quickWin,
    tier,
    recommendations
  };
};

const normalizeVolume = (
  volume: number,
  normalizationData?: { minVolume: number; maxVolume: number }
): number => {
  if (!normalizationData) {
    // Default log normalization
    return Math.min(1, Math.log10(volume + 1) / 6); // Assumes max ~1M volume
  }
  
  const { minVolume, maxVolume } = normalizationData;
  return Math.max(0, Math.min(1, (volume - minVolume) / (maxVolume - minVolume)));
};

const normalizeIntent = (intent: KeywordIntent | null): number => {
  const intentScores: Record<KeywordIntent, number> = {
    'transactional': 1.0,
    'commercial': 0.8,
    'informational': 0.6,
    'navigational': 0.4
  };
  
  return intent ? intentScores[intent] : 0.6; // Default to informational
};

const normalizeTrend = (
  trend: number,
  normalizationData?: { avgTrend: number; stdTrend: number }
): number => {
  if (!normalizationData) {
    // Simple normalization from -1,1 to 0,1
    return (trend + 1) / 2;
  }
  
  const { avgTrend, stdTrend } = normalizationData;
  const zScore = stdTrend > 0 ? (trend - avgTrend) / stdTrend : 0;
  return Math.max(0, Math.min(1, (zScore + 3) / 6)); // Assumes ±3 std devs
};

const generateScoringRecommendations = (
  componentScores: ScoringResult['componentScores'],
  stage: KeywordStage,
  quickWin: boolean
): string[] => {
  const recommendations: string[] = [];
  
  if (quickWin) {
    recommendations.push('Quick win opportunity - prioritize for immediate content creation');
  }
  
  if (componentScores.volume < 0.3) {
    recommendations.push('Low search volume - consider for long-tail strategy only');
  } else if (componentScores.volume > 0.8) {
    recommendations.push('High search volume - excellent for pillar content');
  }
  
  if (componentScores.ease < 0.3) {
    recommendations.push('High difficulty - requires strong domain authority and comprehensive content');
  }
  
  if (componentScores.relevance < 0.4) {
    recommendations.push('Low relevance - verify alignment with content strategy');
  }
  
  if (componentScores.trend > 0.7) {
    recommendations.push('Trending upward - time-sensitive opportunity');
  } else if (componentScores.trend < 0.3) {
    recommendations.push('Declining trend - consider lower priority or seasonal strategy');
  }
  
  if (stage === 'dream100' && componentScores.intent < 0.6) {
    recommendations.push('Consider targeting more commercial intent for Dream 100 keywords');
  }
  
  return recommendations;
};

/**
 * Batch scoring with optimization
 */
export const batchScore = (
  config: BatchScoringConfig
): ScoringResult[] => {
  const { keywords, weights, normalizationMethod, seasonalFactors } = config;
  
  // Calculate normalization data
  const volumes = keywords.map(k => k.volume);
  const trends = keywords.map(k => k.trend);
  
  const normalizationData = {
    minVolume: Math.min(...volumes),
    maxVolume: Math.max(...volumes),
    avgTrend: trends.reduce((sum, t) => sum + t, 0) / trends.length,
    stdTrend: Math.sqrt(trends.reduce((sum, t) => sum + Math.pow(t - (trends.reduce((s, tr) => s + tr, 0) / trends.length), 2), 0) / trends.length)
  };
  
  // Score all keywords
  let results = keywords.map(keyword => 
    calculateBlendedScore(keyword, weights, normalizationData)
  );
  
  // Apply seasonal adjustments if configured
  if (config.applySeasonalAdjustments && seasonalFactors) {
    results = applySeasonalAdjustments(results, seasonalFactors);
  }
  
  return results.sort((a, b) => b.blendedScore - a.blendedScore);
};

const applySeasonalAdjustments = (
  results: ScoringResult[],
  seasonalFactors: SeasonalFactor[]
): ScoringResult[] => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentDay = currentDate.getDate();
  const currentDateStr = `${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;
  
  // Find applicable seasonal factors
  const applicableFactors = seasonalFactors.filter(factor => {
    const [startMonth, startDay] = factor.startDate.split('-').map(Number);
    const [endMonth, endDay] = factor.endDate.split('-').map(Number);
    
    const startDate = new Date(currentDate.getFullYear(), startMonth - 1, startDay);
    const endDate = new Date(currentDate.getFullYear(), endMonth - 1, endDay);
    
    return currentDate >= startDate && currentDate <= endDate;
  });
  
  return results.map(result => {
    let adjustedScore = result.blendedScore;
    
    // Check if this keyword has seasonal adjustments
    applicableFactors.forEach(factor => {
      if (factor.keywords.some(k => k.toLowerCase() === result.keyword.toString().toLowerCase())) {
        adjustedScore *= factor.multiplier;
        
        // Add seasonal recommendation
        const seasonalRecommendation = `Seasonal opportunity (${factor.reason}) - score adjusted by ${Math.round((factor.multiplier - 1) * 100)}%`;
        result.recommendations.push(seasonalRecommendation);
      }
    });
    
    return {
      ...result,
      blendedScore: Math.max(0, Math.min(1, adjustedScore))
    };
  });
};

/**
 * Utility functions
 */
export const getDefaultScoringWeights = (): ScoringWeights => ({
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
});

export const optimizeScoringWeights = (
  keywords: Keyword[],
  targetMetrics: ScoringOptimization['targetMetrics']
): ScoringWeights => {
  // Simplified optimization - in reality would use more sophisticated algorithms
  const currentWeights = getDefaultScoringWeights();
  
  // Calculate current performance
  const currentQuickWinRatio = keywords.filter(k => k.quickWin).length / keywords.length;
  const currentAvgDifficulty = keywords.reduce((sum, k) => sum + k.difficulty, 0) / keywords.length;
  const currentTrafficPotential = keywords.reduce((sum, k) => sum + k.volume, 0);
  
  // Adjust weights based on targets (simplified approach)
  let adjustedWeights = { ...currentWeights };
  
  if (currentQuickWinRatio < targetMetrics.avgQuickWinRatio) {
    // Increase ease weight across all stages
    adjustedWeights = {
      dream100: { ...adjustedWeights.dream100, ease: Math.min(0.5, adjustedWeights.dream100.ease * 1.5) },
      tier2: { ...adjustedWeights.tier2, ease: Math.min(0.5, adjustedWeights.tier2.ease * 1.2) },
      tier3: { ...adjustedWeights.tier3, ease: Math.min(0.5, adjustedWeights.tier3.ease * 1.1) }
    };
  }
  
  if (currentAvgDifficulty > targetMetrics.avgDifficulty) {
    // Increase ease weight and decrease volume weight
    Object.keys(adjustedWeights).forEach(stage => {
      const stageWeights = adjustedWeights[stage as KeywordStage];
      adjustedWeights[stage as KeywordStage] = {
        ...stageWeights,
        ease: Math.min(0.6, stageWeights.ease * 1.3),
        volume: Math.max(0.1, stageWeights.volume * 0.9)
      };
    });
  }
  
  // Ensure weights still sum to 1.0 for each stage
  Object.keys(adjustedWeights).forEach(stage => {
    const stageWeights = adjustedWeights[stage as KeywordStage];
    const sum = Object.values(stageWeights).reduce((s, w) => s + w, 0);
    
    if (Math.abs(sum - 1) > 0.01) {
      const factor = 1 / sum;
      adjustedWeights[stage as KeywordStage] = {
        volume: stageWeights.volume * factor,
        intent: stageWeights.intent * factor,
        relevance: stageWeights.relevance * factor,
        trend: stageWeights.trend * factor,
        ease: stageWeights.ease * factor
      };
    }
  });
  
  return adjustedWeights;
};

export const getScoringTierColor = (tier: 'high' | 'medium' | 'low'): string => {
  switch (tier) {
    case 'high': return 'green';
    case 'medium': return 'yellow';
    case 'low': return 'red';
    default: return 'gray';
  }
};

export const formatScoreAsPercentage = (score: number): string => {
  return `${Math.round(score * 100)}%`;
};

export const getScoreGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
  if (score >= 0.9) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.5) return 'C';
  if (score >= 0.3) return 'D';
  return 'F';
};