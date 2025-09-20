/**
 * Expansion Worker
 * 
 * Background worker for processing Dream 100 expansion jobs.
 * Handles LLM-based seed keyword expansion with Ahrefs metrics enrichment.
 * 
 * Features:
 * - Asynchronous LLM expansion processing
 * - Intelligent batch processing with rate limiting
 * - Progress tracking and real-time updates
 * - Error handling and retry logic
 * - Cost monitoring and budget controls
 * - Quality validation and filtering
 * 
 * @fileoverview Dream 100 expansion background worker
 * @version 1.0.0
 */

import { Job } from 'bullmq';
import * as Sentry from '@sentry/nextjs';
import type { UUID, Keyword } from '../models';
import type { KeywordStage, KeywordIntent } from '../types/database';
import { ExpansionService, type Dream100ExpansionRequest, type ExpansionProgressCallback } from '../services/expansion';

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
 * Expansion job data structure
 */
export interface ExpansionJobData {
  runId: UUID;
  seedKeywords: string[];
  settings: {
    maxDream100?: number;
    market?: string;
    enableQualityFiltering?: boolean;
    commercialFocus?: boolean;
    scoringWeights?: any;
  };
  userId?: string;
}

/**
 * Expansion job result structure
 */
export interface ExpansionJobResult {
  dreamKeywords: Keyword[];
  metrics: {
    seedCount: number;
    candidatesGenerated: number;
    candidatesFiltered: number;
    finalCount: number;
    processingTime: number;
    apiCalls: {
      anthropic: number;
      ahrefs: number;
    };
    costs: {
      anthropic: number;
      ahrefs: number;
      total: number;
    };
  };
  qualityMetrics: {
    avgVolume: number;
    avgDifficulty: number;
    avgRelevance: number;
    commercialPercentage: number;
  };
}

/**
 * Process expansion job
 */
export async function processExpansionJob(
  job: Job<ExpansionJobData>
): Promise<ExpansionJobResult> {
  const startTime = Date.now();
  const { runId, seedKeywords, settings, userId } = job.data;
  
  console.log(`Processing expansion job ${job.id} for run ${runId}`);
  
  try {
    // Initialize expansion service
    const expansionService = new ExpansionService(
      process.env.ANTHROPIC_API_KEY || '',
      process.env.AHREFS_API_KEY || ''
    );
    
    // Update initial progress
    await job.updateProgress({
      stage: 'expansion',
      stepName: 'Initializing',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Starting Dream 100 expansion',
      metadata: {
        seedCount: seedKeywords.length,
        runId,
      },
    } satisfies WorkerJobProgress);

    // Update run status to processing
    await supabase
      .from('runs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: {
          current_stage: 'expansion',
          stages_completed: [],
          keywords_discovered: 0,
          percent_complete: 0,
        },
      })
      .eq('id', runId);

    // Process expansion with progress tracking
    let currentStep = 0;
    const totalSteps = 6; // LLM expansion, Ahrefs enrichment, Intent classification, Relevance scoring, Quality filtering, Final selection
    
    const expansionRequest: Dream100ExpansionRequest = {
      runId,
      seedKeywords,
      targetCount: settings.maxDream100 || 100,
      market: settings.market || 'US',
      qualityThreshold: 0.7,
      includeCompetitorAnalysis: settings.commercialFocus || false
    };
    
    const result = await expansionService.expandToDream100(
      expansionRequest,
      async (progress) => {
        const overallProgress = progress.progressPercent || 0;
        
        await job.updateProgress({
          stage: 'expansion',
          stepName: progress.currentStep,
          current: progress.keywordsProcessed,
          total: settings.maxDream100 || 100,
          percentage: Math.min(overallProgress, 100),
          message: progress.currentStep,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          metadata: {
            currentStep: currentStep + 1,
            totalSteps,
            seedCount: seedKeywords.length,
            runId,
          },
        } satisfies WorkerJobProgress);
        
        // Update database progress
        await supabase
          .from('runs')
          .update({
            progress: {
              current_stage: 'expansion',
              stages_completed: [],
              keywords_discovered: progress.keywordsProcessed,
              percent_complete: Math.min(overallProgress, 100),
              estimated_time_remaining: progress.estimatedTimeRemaining,
            },
          })
          .eq('id', runId);
        
        // Handle step completion logic
        if (progress.stage === 'final_selection') {
          currentStep++;
          console.log(`Expansion step '${progress.currentStep}' completed (${currentStep}/${totalSteps})`);
        }
      }
    );

    // Calculate quality metrics
    const qualityMetrics = calculateQualityMetrics(result.dream100Keywords as any as Keyword[]);
    
    // Update final progress
    await job.updateProgress({
      stage: 'expansion',
      stepName: 'Completed',
      current: result.dream100Keywords.length,
      total: result.dream100Keywords.length,
      percentage: 100,
      message: `Dream 100 expansion completed with ${result.dream100Keywords.length} keywords`,
      metadata: {
        finalCount: result.dream100Keywords.length,
        qualityMetrics,
        runId,
      },
    } satisfies WorkerJobProgress);

    // Update run with completed expansion stage
    await supabase
      .from('runs')
      .update({
        progress: {
          current_stage: 'expansion',
          stages_completed: ['expansion'],
          keywords_discovered: result.dream100Keywords.length,
          percent_complete: 20, // Expansion is ~20% of total pipeline
        },
        total_keywords: result.dream100Keywords.length,
      })
      .eq('id', runId);

    const processingTime = Date.now() - startTime;
    console.log(`Expansion job ${job.id} completed in ${processingTime}ms with ${result.dream100Keywords.length} keywords`);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      message: 'Expansion job completed successfully',
      category: 'job',
      level: 'info',
      data: {
        jobId: job.id,
        runId,
        keywordCount: result.dream100Keywords.length,
        processingTime,
      },
    });

    return {
      dreamKeywords: result.dream100Keywords as any as Keyword[],
      metrics: {
        seedCount: seedKeywords.length,
        candidatesGenerated: result.totalCandidatesGenerated || 0,
        candidatesFiltered: 0,
        finalCount: result.dream100Keywords.length,
        processingTime,
        apiCalls: result.processingStats?.apiCallCounts || { anthropic: 0, ahrefs: 0 },
        costs: {
          anthropic: result.costBreakdown?.anthropicCost || 0,
          ahrefs: result.costBreakdown?.ahrefsCost || 0,
          total: result.costBreakdown?.totalCost || 0
        },
      },
      qualityMetrics,
    };

  } catch (error) {
    console.error(`Expansion job ${job.id} failed:`, error);
    
    // Update run status to failed
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage: 'expansion',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      })
      .eq('id', runId);

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        jobType: 'expansion',
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
 * Calculate quality metrics for Dream 100 keywords
 */
function calculateQualityMetrics(keywords: Keyword[]): {
  avgVolume: number;
  avgDifficulty: number;
  avgRelevance: number;
  commercialPercentage: number;
} {
  if (keywords.length === 0) {
    return {
      avgVolume: 0,
      avgDifficulty: 0,
      avgRelevance: 0,
      commercialPercentage: 0,
    };
  }

  const totalVolume = keywords.reduce((sum, k) => sum + k.volume, 0);
  const totalDifficulty = keywords.reduce((sum, k) => sum + k.difficulty, 0);
  const totalRelevance = keywords.reduce((sum, k) => sum + k.relevance, 0);
  const commercialCount = keywords.filter(k => 
    k.intent === 'commercial' || k.intent === 'transactional'
  ).length;

  return {
    avgVolume: Math.round(totalVolume / keywords.length),
    avgDifficulty: Math.round((totalDifficulty / keywords.length) * 100) / 100,
    avgRelevance: Math.round((totalRelevance / keywords.length) * 100) / 100,
    commercialPercentage: Math.round((commercialCount / keywords.length) * 100),
  };
}

/**
 * Validate expansion job data
 */
export function validateExpansionJobData(data: any): data is ExpansionJobData {
  return (
    data &&
    typeof data.runId === 'string' &&
    Array.isArray(data.seedKeywords) &&
    data.seedKeywords.length > 0 &&
    data.seedKeywords.every((k: any) => typeof k === 'string') &&
    typeof data.settings === 'object'
  );
}

/**
 * Estimate expansion job duration
 */
export function estimateExpansionJobDuration(data: ExpansionJobData): number {
  const baseTimePerSeed = 30000; // 30 seconds per seed keyword
  const maxDream100 = data.settings.maxDream100 || 100;
  const complexityMultiplier = maxDream100 / 100;
  
  return data.seedKeywords.length * baseTimePerSeed * complexityMultiplier;
}

export default processExpansionJob;