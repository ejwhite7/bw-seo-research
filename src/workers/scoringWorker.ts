/**
 * Scoring Worker
 * 
 * Background worker for processing blended scoring jobs.
 * Handles multi-stage keyword scoring with weighted algorithms.
 * 
 * Features:
 * - Stage-specific scoring weights (Dream100, Tier-2, Tier-3)
 * - Quick win detection and flagging
 * - Batch processing with progress tracking
 * - Score normalization and calibration
 * - Quality validation and outlier detection
 * - Performance optimization for large datasets
 * 
 * @fileoverview Blended scoring background worker
 * @version 1.0.0
 */

import { Job } from 'bullmq';
import * as Sentry from '@sentry/nextjs';
import type { UUID, Keyword } from '../models';
import type { ScoringWeights } from '../models/scoring';

/**
 * Worker-specific job progress interface
 */
interface WorkerJobProgress {
  stage: string;
  stepName: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
  estimatedTimeRemaining?: number;
  metadata?: Record<string, any>;
}
import type { KeywordStage, KeywordIntent } from '../types/database';
import { KeywordScoringService } from '../services/scoring';
import { supabase } from '../lib/supabase';

/**
 * Scoring job data structure
 */
export interface ScoringJobData {
  runId: UUID;
  keywords: Keyword[];
  settings: {
    scoringWeights?: ScoringWeights;
    quickWinThreshold?: number;
    enableNormalization?: boolean;
    enableOutlierDetection?: boolean;
    batchSize?: number;
  };
  userId?: string;
}

/**
 * Scoring job result structure
 */
export interface ScoringJobResult {
  scoredKeywords: Keyword[];
  quickWins: Keyword[];
  metrics: {
    totalKeywords: number;
    quickWinCount: number;
    avgScoreByStage: {
      dream100: number;
      tier2: number;
      tier3: number;
    };
    scoreDistribution: {
      high: number; // > 0.8
      medium: number; // 0.4-0.8
      low: number; // < 0.4
    };
    processingTime: number;
    keywordsPerSecond: number;
  };
  qualityMetrics: {
    scoreVariance: number;
    outlierCount: number;
    normalizedScores: boolean;
    weightingAccuracy: number;
  };
}

/**
 * Process scoring job
 */
export async function processScoringJob(
  job: Job<ScoringJobData>
): Promise<ScoringJobResult> {
  const startTime = Date.now();
  const { runId, keywords, settings, userId } = job.data;
  
  console.log(`Processing scoring job ${job.id} for run ${runId} with ${keywords.length} keywords`);
  
  try {
    // Initialize scoring service
    const scoringService = new KeywordScoringService();
    
    // Update initial progress
    await job.updateProgress({
      stage: 'scoring',
      stepName: 'Initializing',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Starting blended scoring',
      metadata: {
        keywordCount: keywords.length,
        runId,
        batchSize: settings.batchSize || 100,
        quickWinThreshold: settings.quickWinThreshold || 0.7,
      },
    } satisfies WorkerJobProgress);

    // Update run status
    await supabase
      .from('runs')
      .update({
        status: 'processing',
        progress: {
          current_stage: 'scoring',
          stages_completed: ['expansion', 'universe', 'clustering'],
          keywords_discovered: keywords.length,
          percent_complete: 80,
        },
      })
      .eq('id', runId);

    // Group keywords by stage for stage-specific scoring
    const keywordsByStage = {
      dream100: keywords.filter(k => k.stage === 'dream100'),
      tier2: keywords.filter(k => k.stage === 'tier2'),
      tier3: keywords.filter(k => k.stage === 'tier3')
    };
    
    // Process scoring with progress tracking
    let currentStep = 0;
    const totalSteps = 4; // Score calculation, Quick win detection, Normalization, Validation
    let processedCount = 0;
    
    const result = await scoringService.scoreKeywords({
      keywords,
      runId,
      settings: {
        weights: settings.scoringWeights || (await import('../models/scoring')).getDefaultScoringWeights(),
        quickWinThreshold: settings.quickWinThreshold || 0.7,
        enableSeasonalAdjustments: settings.enableNormalization ?? true,
      }
    }, async (progress) => {
      const overallProgress = progress.percentage || 0;
      
      await job.updateProgress({
        stage: 'scoring',
        stepName: progress.stepName,
        current: progress.current,
        total: progress.total,
        percentage: Math.min(overallProgress, 100),
        message: progress.message || 'Scoring keywords',
        estimatedTimeRemaining: 0,
        metadata: {
          keywordCount: keywords.length,
          processedCount: progress.current,
          runId,
        },
      } satisfies WorkerJobProgress);
      
      // Update database progress
      await supabase
        .from('runs')
        .update({
          progress: {
            current_stage: 'scoring',
            stages_completed: ['expansion', 'universe', 'clustering'],
            keywords_discovered: keywords.length,
            percent_complete: 80 + Math.min(overallProgress * 0.15, 15), // Scoring is ~15% of pipeline
          },
        })
        .eq('id', runId);
    });

    // Map results to Keyword array - converting from ScoringResult to Keyword
    const scoredKeywords = result.scoredKeywords.map(scoringResult => {
      // Find original keyword and update with score
      const originalKeyword = keywords.find(k => k.keyword === scoringResult.keyword);
      if (!originalKeyword) {
        throw new Error(`Could not find original keyword: ${scoringResult.keyword}`);
      }
      return {
        ...originalKeyword,
        blendedScore: scoringResult.blendedScore,
        quickWin: scoringResult.quickWin
      };
    });
    const quickWins = result.quickWins.map(scoringResult => {
      const originalKeyword = keywords.find(k => k.keyword === scoringResult.keyword);
      if (!originalKeyword) {
        throw new Error(`Could not find original keyword: ${scoringResult.keyword}`);
      }
      return {
        ...originalKeyword,
        blendedScore: scoringResult.blendedScore,
        quickWin: scoringResult.quickWin
      };
    });
    
    // Calculate comprehensive metrics
    const metrics = calculateScoringMetrics(scoredKeywords, startTime);
    const qualityMetrics = calculateScoringQualityMetrics(scoredKeywords, quickWins);
    
    // Update final progress
    await job.updateProgress({
      stage: 'scoring',
      stepName: 'Completed',
      current: scoredKeywords.length,
      total: scoredKeywords.length,
      percentage: 100,
      message: `Scoring completed with ${quickWins.length} quick wins identified`,
      metadata: {
        totalKeywords: scoredKeywords.length,
        quickWinCount: quickWins.length,
        avgScore: metrics.avgScoreByStage,
        scoreDistribution: metrics.scoreDistribution,
        runId,
      },
    } satisfies WorkerJobProgress);

    // Update run with completed scoring stage
    await supabase
      .from('runs')
      .update({
        progress: {
          current_stage: 'scoring',
          stages_completed: ['expansion', 'universe', 'clustering', 'scoring'],
          keywords_discovered: keywords.length,
          clusters_created: 0,
          percent_complete: 95, // Scoring completion brings us to ~95%
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    const totalProcessingTime = Date.now() - startTime;
    const keywordsPerSecond = Math.round((keywords.length / totalProcessingTime) * 1000);
    
    console.log(`Scoring job ${job.id} completed in ${totalProcessingTime}ms (${keywordsPerSecond} keywords/sec)`);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      message: 'Scoring job completed successfully',
      category: 'job',
      level: 'info',
      data: {
        jobId: job.id,
        runId,
        keywordCount: keywords.length,
        quickWinCount: result.quickWins.length,
        processingTime: totalProcessingTime,
        keywordsPerSecond,
      },
    });

    return {
      scoredKeywords,
      quickWins,
      metrics: {
        ...metrics,
        processingTime: totalProcessingTime,
        keywordsPerSecond,
      },
      qualityMetrics,
    };

  } catch (error) {
    console.error(`Scoring job ${job.id} failed:`, error);
    
    // Update run status to failed
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage: 'scoring',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      })
      .eq('id', runId);

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        jobType: 'scoring',
        jobId: job.id,
        runId,
      },
      extra: {
        jobData: job.data,
        attemptsMade: job.attemptsMade,
        keywordCount: keywords.length,
      },
    });

    throw error;
  }
}

/**
 * Group keywords by stage for stage-specific processing
 */
function groupKeywordsByStage(keywords: Keyword[]): Record<KeywordStage, Keyword[]> {
  return keywords.reduce(
    (groups, keyword) => {
      groups[keyword.stage].push(keyword);
      return groups;
    },
    { dream100: [], tier2: [], tier3: [] } as Record<KeywordStage, Keyword[]>
  );
}

/**
 * Get default scoring weights
 */
function getDefaultScoringWeights(): ScoringWeights {
  return {
    dream100: {
      volume: 0.40,
      intent: 0.30,
      relevance: 0.15,
      trend: 0.10,
      ease: 0.05,
    },
    tier2: {
      volume: 0.35,
      ease: 0.25,
      relevance: 0.20,
      intent: 0.15,
      trend: 0.05,
    },
    tier3: {
      ease: 0.35,
      relevance: 0.30,
      volume: 0.20,
      intent: 0.10,
      trend: 0.05,
    },
  };
}

/**
 * Calculate comprehensive scoring metrics
 */
function calculateScoringMetrics(
  keywords: Keyword[],
  startTime: number
): {
  totalKeywords: number;
  quickWinCount: number;
  avgScoreByStage: { dream100: number; tier2: number; tier3: number };
  scoreDistribution: { high: number; medium: number; low: number };
} {
  const keywordsByStage = groupKeywordsByStage(keywords);
  
  // Calculate average scores by stage
  const avgScoreByStage = {
    dream100: calculateAverageScore(keywordsByStage.dream100),
    tier2: calculateAverageScore(keywordsByStage.tier2),
    tier3: calculateAverageScore(keywordsByStage.tier3),
  };
  
  // Calculate score distribution
  const high = keywords.filter(k => k.blendedScore > 0.8).length;
  const low = keywords.filter(k => k.blendedScore < 0.4).length;
  const medium = keywords.length - high - low;
  
  const quickWinCount = keywords.filter(k => k.quickWin).length;
  
  return {
    totalKeywords: keywords.length,
    quickWinCount,
    avgScoreByStage,
    scoreDistribution: { high, medium, low },
  };
}

/**
 * Calculate average score for a list of keywords
 */
function calculateAverageScore(keywords: Keyword[]): number {
  if (keywords.length === 0) return 0;
  const total = keywords.reduce((sum, k) => sum + k.blendedScore, 0);
  return Math.round((total / keywords.length) * 100) / 100;
}

/**
 * Calculate scoring quality metrics
 */
function calculateScoringQualityMetrics(
  keywords: Keyword[],
  quickWins: Keyword[]
): {
  scoreVariance: number;
  outlierCount: number;
  normalizedScores: boolean;
  weightingAccuracy: number;
} {
  if (keywords.length === 0) {
    return {
      scoreVariance: 0,
      outlierCount: 0,
      normalizedScores: false,
      weightingAccuracy: 0,
    };
  }

  // Calculate score variance
  const scores = keywords.map(k => k.blendedScore);
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
  
  // Detect outliers (scores beyond 2 standard deviations)
  const stdDev = Math.sqrt(variance);
  const outliers = scores.filter(s => Math.abs(s - avgScore) > 2 * stdDev);
  
  // Check if scores are normalized (between 0 and 1)
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const normalizedScores = minScore >= 0 && maxScore <= 1;
  
  // Calculate weighting accuracy (how well quick wins align with high scores)
  const quickWinScores = quickWins.map(k => k.blendedScore);
  const avgQuickWinScore = quickWinScores.length > 0 
    ? quickWinScores.reduce((sum, s) => sum + s, 0) / quickWinScores.length
    : 0;
  const weightingAccuracy = avgQuickWinScore > avgScore ? avgQuickWinScore / Math.max(avgScore, 0.1) : 0;
  
  return {
    scoreVariance: Math.round(variance * 10000) / 10000,
    outlierCount: outliers.length,
    normalizedScores,
    weightingAccuracy: Math.round(Math.min(weightingAccuracy, 1) * 100) / 100,
  };
}

/**
 * Validate scoring job data
 */
export function validateScoringJobData(data: any): data is ScoringJobData {
  return (
    data &&
    typeof data.runId === 'string' &&
    Array.isArray(data.keywords) &&
    data.keywords.length > 0 &&
    typeof data.settings === 'object'
  );
}

/**
 * Estimate scoring job duration
 */
export function estimateScoringJobDuration(data: ScoringJobData): number {
  const keywordCount = data.keywords.length;
  const batchSize = data.settings.batchSize || 100;
  const batchCount = Math.ceil(keywordCount / batchSize);
  
  // Base processing time per keyword (includes score calculation and database updates)
  const timePerKeyword = 50; // 50ms per keyword
  const batchOverhead = 500; // 500ms overhead per batch
  
  return (keywordCount * timePerKeyword) + (batchCount * batchOverhead);
}

/**
 * Calculate scoring complexity based on keyword distribution
 */
export function calculateScoringComplexity(data: ScoringJobData): {
  score: number;
  factors: {
    keywordCount: number;
    stageDistribution: Record<KeywordStage, number>;
    customWeights: boolean;
    outlierDetection: boolean;
    normalization: boolean;
  };
} {
  const keywordsByStage = groupKeywordsByStage(data.keywords);
  const stageDistribution = {
    dream100: keywordsByStage.dream100.length,
    tier2: keywordsByStage.tier2.length,
    tier3: keywordsByStage.tier3.length,
  };
  
  // Base complexity from keyword count
  let score = Math.log(data.keywords.length) * 10;
  
  // Add complexity for custom weights
  if (data.settings.scoringWeights) score += 10;
  
  // Add complexity for outlier detection
  if (data.settings.enableOutlierDetection) score += 5;
  
  // Add complexity for normalization
  if (data.settings.enableNormalization) score += 5;
  
  // Cap at 100
  score = Math.min(score, 100);
  
  return {
    score,
    factors: {
      keywordCount: data.keywords.length,
      stageDistribution,
      customWeights: !!data.settings.scoringWeights,
      outlierDetection: data.settings.enableOutlierDetection ?? true,
      normalization: data.settings.enableNormalization ?? true,
    },
  };
}

export default processScoringJob;