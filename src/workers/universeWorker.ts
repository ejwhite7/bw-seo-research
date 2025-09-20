/**
 * Universe Worker
 * 
 * Background worker for processing Universe expansion jobs.
 * Handles Tier-2 and Tier-3 keyword expansion from Dream 100 keywords.
 * 
 * Features:
 * - Parallel tier expansion processing
 * - Metrics enrichment with batched API calls
 * - Competitor analysis and SERP scraping
 * - Progress tracking with detailed metrics
 * - Quality control and filtering
 * - Cost optimization and budget monitoring
 * 
 * @fileoverview Universe expansion background worker
 * @version 1.0.0
 */

import { Job } from 'bullmq';
import * as Sentry from '@sentry/nextjs';
import type { UUID, Keyword } from '../models';
import type { KeywordStage, KeywordIntent } from '../types/database';
import { UniverseExpansionService, type UniverseExpansionRequest, type UniverseProgressCallback } from '../services/universe';

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

interface JobMetrics {
  [key: string]: any;
}
import { supabase } from '../lib/supabase';

/**
 * Universe job data structure
 */
export interface UniverseJobData {
  runId: UUID;
  dreamKeywords: Keyword[];
  settings: {
    maxTier2PerDream?: number;
    maxTier3PerTier2?: number;
    maxTotalKeywords?: number;
    enableCompetitorAnalysis?: boolean;
    enableSerpScraping?: boolean;
    market?: string;
    qualityThreshold?: number;
  };
  userId?: string;
}

/**
 * Universe job result structure
 */
export interface UniverseJobResult {
  tier2Keywords: Keyword[];
  tier3Keywords: Keyword[];
  allKeywords: Keyword[];
  metrics: {
    dreamCount: number;
    tier2Generated: number;
    tier3Generated: number;
    totalKeywords: number;
    competitorsFound: number;
    serpUrlsScraped: number;
    processingTime: number;
    apiCalls: {
      anthropic: number;
      ahrefs: number;
      scraping: number;
    };
    costs: {
      anthropic: number;
      ahrefs: number;
      scraping: number;
      total: number;
    };
  };
  qualityMetrics: {
    tier2: {
      avgVolume: number;
      avgDifficulty: number;
      avgRelevance: number;
    };
    tier3: {
      avgVolume: number;
      avgDifficulty: number;
      avgRelevance: number;
    };
  };
}

/**
 * Process universe expansion job
 */
export async function processUniverseJob(
  job: Job<UniverseJobData>
): Promise<UniverseJobResult> {
  const startTime = Date.now();
  const { runId, dreamKeywords, settings, userId } = job.data;
  
  console.log(`Processing universe job ${job.id} for run ${runId} with ${dreamKeywords.length} dream keywords`);
  
  try {
    // Initialize universe service
    const universeService = new UniverseExpansionService(
      process.env.ANTHROPIC_API_KEY || '',
      process.env.AHREFS_API_KEY || ''
    );
    
    // Update initial progress
    await job.updateProgress({
      stage: 'universe',
      stepName: 'Initializing',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Starting universe expansion',
      metadata: {
        dreamCount: dreamKeywords.length,
        runId,
        maxTier2: settings.maxTier2PerDream || 10,
        maxTier3: settings.maxTier3PerTier2 || 10,
      },
    } satisfies WorkerJobProgress);

    // Update run status
    await supabase
      .from('runs')
      .update({
        status: 'processing',
        progress: {
          current_stage: 'universe',
          stages_completed: ['expansion'],
          keywords_discovered: dreamKeywords.length,
          percent_complete: 20,
        },
      })
      .eq('id', runId);

    // Process universe expansion with progress tracking
    let currentStep = 0;
    const totalSteps = 5; // Tier-2 expansion, Tier-3 expansion, Metrics enrichment, Competitor analysis, Quality filtering
    
    const universeRequest: UniverseExpansionRequest = {
      runId,
      dream100Keywords: dreamKeywords.map(k => k.keyword),
      maxTier2PerDream: settings.maxTier2PerDream || 10,
      maxTier3PerTier2: settings.maxTier3PerTier2 || 10,
      targetTotalCount: settings.maxTotalKeywords || 10000,
      enableCompetitorMining: settings.enableCompetitorAnalysis ?? true,
      enableSerpAnalysis: settings.enableSerpScraping ?? true,
      market: settings.market || 'US',
      qualityThreshold: settings.qualityThreshold || 0.3,
    };
    
    const result = await universeService.expandToUniverse(
      universeRequest,
      async (progress) => {
        const overallProgress = (currentStep / totalSteps) * 100 + ((progress.progressPercent || 0) / totalSteps);
        
        await job.updateProgress({
          stage: 'universe',
          stepName: progress.currentStep || '',
          current: progress.keywordsProcessed || 0,
          total: settings.maxTotalKeywords || 10000,
          percentage: Math.min(overallProgress, 100),
          message: `Processing ${progress.currentTier} keywords: ${progress.currentStep}`,
          estimatedTimeRemaining: progress.estimatedTimeRemaining || 0,
          metadata: {
            currentStep: currentStep + 1,
            totalSteps,
            dreamCount: dreamKeywords.length,
            runId,
          },
        } satisfies WorkerJobProgress);
        
        // Update database progress
        await supabase
          .from('runs')
          .update({
            progress: {
              current_stage: 'universe',
              stages_completed: ['expansion'],
              keywords_discovered: progress.keywordsProcessed,
              percent_complete: 20 + Math.min(overallProgress * 0.4, 40), // Universe is ~40% of pipeline
              estimated_time_remaining: progress.estimatedTimeRemaining || 0,
            },
          })
          .eq('id', runId);
      }
    );
        // Track API usage in database
        // TODO: Implement proper API usage tracking
        

    // Calculate quality metrics
    const qualityMetrics = calculateUniverseQualityMetrics(
      result.keywordsByTier.tier2 as any,
      result.keywordsByTier.tier3 as any
    );
    
    const totalKeywords = dreamKeywords.length + result.keywordsByTier.tier2.length + result.keywordsByTier.tier3.length;
    
    // Update final progress
    await job.updateProgress({
      stage: 'universe',
      stepName: 'Completed',
      current: totalKeywords,
      total: totalKeywords,
      percentage: 100,
      message: `Universe expansion completed with ${totalKeywords} total keywords`,
      metadata: {
        tier2Count: result.keywordsByTier.tier2.length,
        tier3Count: result.keywordsByTier.tier3.length,
        totalCount: totalKeywords,
        qualityMetrics,
        runId,
      },
    } satisfies WorkerJobProgress);

    // Update run with completed universe stage
    await supabase
      .from('runs')
      .update({
        progress: {
          current_stage: 'universe',
          stages_completed: ['expansion', 'universe'],
          keywords_discovered: totalKeywords,
          percent_complete: 60, // Universe completion brings us to ~60%
          competitors_found: 0,
        },
        total_keywords: totalKeywords,
      })
      .eq('id', runId);

    const processingTime = Date.now() - startTime;
    console.log(`Universe job ${job.id} completed in ${processingTime}ms with ${totalKeywords} total keywords`);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      message: 'Universe job completed successfully',
      category: 'job',
      level: 'info',
      data: {
        jobId: job.id,
        runId,
        totalKeywords,
        tier2Count: result.keywordsByTier.tier2.length,
        tier3Count: result.keywordsByTier.tier3.length,
        processingTime,
      },
    });

    return {
      tier2Keywords: result.keywordsByTier.tier2 as any,
      tier3Keywords: result.keywordsByTier.tier3 as any,
      allKeywords: [...dreamKeywords, ...result.keywordsByTier.tier2 as any, ...result.keywordsByTier.tier3 as any],
      metrics: {
        dreamCount: dreamKeywords.length,
        tier2Generated: result.keywordsByTier.tier2.length,
        tier3Generated: result.keywordsByTier.tier3.length,
        totalKeywords,
        competitorsFound: 0,
        serpUrlsScraped: 0,
        processingTime,
        apiCalls: {
          anthropic: result.processingStats.apiCallCounts.anthropic || 0,
          ahrefs: result.processingStats.apiCallCounts.ahrefs || 0,
          scraping: result.processingStats.apiCallCounts.serp || 0
        },
        costs: {
          anthropic: result.costBreakdown.anthropicCost,
          ahrefs: result.costBreakdown.ahrefsCost,
          scraping: result.costBreakdown.serpApiCost || 0,
          total: result.costBreakdown.totalCost
        },
      },
      qualityMetrics,
    };

  } catch (error) {
    console.error(`Universe job ${job.id} failed:`, error);
    
    // Update run status to failed
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage: 'universe',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      })
      .eq('id', runId);

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        jobType: 'universe',
        jobId: job.id,
        runId,
      },
      extra: {
        jobData: job.data,
        attemptsMade: job.attemptsMade,
      },
    });

    throw error;
  }
}

/**
 * Calculate quality metrics for universe keywords
 */
function calculateUniverseQualityMetrics(
  tier2Keywords: Keyword[],
  tier3Keywords: Keyword[]
): {
  tier2: { avgVolume: number; avgDifficulty: number; avgRelevance: number };
  tier3: { avgVolume: number; avgDifficulty: number; avgRelevance: number };
} {
  const calculateTierMetrics = (keywords: Keyword[]) => {
    if (keywords.length === 0) {
      return { avgVolume: 0, avgDifficulty: 0, avgRelevance: 0 };
    }

    const totalVolume = keywords.reduce((sum, k) => sum + k.volume, 0);
    const totalDifficulty = keywords.reduce((sum, k) => sum + k.difficulty, 0);
    const totalRelevance = keywords.reduce((sum, k) => sum + k.relevance, 0);

    return {
      avgVolume: Math.round(totalVolume / keywords.length),
      avgDifficulty: Math.round((totalDifficulty / keywords.length) * 100) / 100,
      avgRelevance: Math.round((totalRelevance / keywords.length) * 100) / 100,
    };
  };

  return {
    tier2: calculateTierMetrics(tier2Keywords),
    tier3: calculateTierMetrics(tier3Keywords),
  };
}

/**
 * Validate universe job data
 */
export function validateUniverseJobData(data: any): data is UniverseJobData {
  return (
    data &&
    typeof data.runId === 'string' &&
    Array.isArray(data.dreamKeywords) &&
    data.dreamKeywords.length > 0 &&
    typeof data.settings === 'object'
  );
}

/**
 * Estimate universe job duration
 */
export function estimateUniverseJobDuration(data: UniverseJobData): number {
  const baseTimePerDream = 45000; // 45 seconds per dream keyword
  const tier2Multiplier = (data.settings.maxTier2PerDream || 10) / 10;
  const tier3Multiplier = (data.settings.maxTier3PerTier2 || 10) / 10;
  const competitorMultiplier = data.settings.enableCompetitorAnalysis ? 1.5 : 1.0;
  const serpMultiplier = data.settings.enableSerpScraping ? 1.3 : 1.0;
  
  return (
    data.dreamKeywords.length * 
    baseTimePerDream * 
    tier2Multiplier * 
    tier3Multiplier * 
    competitorMultiplier * 
    serpMultiplier
  );
}

/**
 * Calculate universe job complexity score
 */
export function calculateUniverseJobComplexity(data: UniverseJobData): {
  score: number;
  factors: {
    keywordCount: number;
    expansionRatio: number;
    competitorAnalysis: boolean;
    serpScraping: boolean;
  };
} {
  const keywordCount = data.dreamKeywords.length;
  const tier2Per = data.settings.maxTier2PerDream || 10;
  const tier3Per = data.settings.maxTier3PerTier2 || 10;
  const expansionRatio = tier2Per * tier3Per;
  
  let score = keywordCount * 0.1; // Base score from keyword count
  score += expansionRatio * 0.05; // Expansion complexity
  
  if (data.settings.enableCompetitorAnalysis) score += 20;
  if (data.settings.enableSerpScraping) score += 15;
  
  // Cap at 100
  score = Math.min(score, 100);
  
  return {
    score,
    factors: {
      keywordCount,
      expansionRatio,
      competitorAnalysis: data.settings.enableCompetitorAnalysis ?? true,
      serpScraping: data.settings.enableSerpScraping ?? true,
    },
  };
}

export default processUniverseJob;