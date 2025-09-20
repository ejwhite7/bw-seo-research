/**
 * Clustering Worker
 * 
 * Background worker for processing semantic clustering jobs.
 * Handles keyword clustering using embeddings and similarity analysis.
 * 
 * Features:
 * - Semantic clustering with OpenAI embeddings
 * - Hierarchical clustering with optimal cluster count detection
 * - Intent-based clustering refinement
 * - Progress tracking with embedding generation
 * - Quality validation and cluster optimization
 * - Memory-efficient processing for large datasets
 * 
 * @fileoverview Semantic clustering background worker
 * @version 1.0.0
 */

import { Job } from 'bullmq';
import * as Sentry from '@sentry/nextjs';
import type { UUID, Keyword, Cluster } from '../models';

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
import { ClusteringService } from '../services/clustering';
import { supabase } from '../lib/supabase';

/**
 * Clustering job data structure
 */
export interface ClusteringJobData {
  runId: UUID;
  keywords: Keyword[];
  settings: {
    similarityThreshold?: number;
    minClusterSize?: number;
    maxClusterSize?: number;
    targetClusterCount?: number;
    enableIntentGrouping?: boolean;
    embeddingModel?: string;
    clusteringMethod?: 'hierarchical' | 'kmeans' | 'dbscan';
  };
  userId?: string;
}

/**
 * Clustering job result structure
 */
export interface ClusteringJobResult {
  clusters: Cluster[];
  unclusteredKeywords: Keyword[];
  metrics: {
    totalKeywords: number;
    clustersCreated: number;
    unclusteredCount: number;
    avgClusterSize: number;
    avgSilhouetteScore: number;
    embeddingGenerationTime: number;
    clusteringTime: number;
    totalProcessingTime: number;
    memoryUsage: {
      peak: number;
      final: number;
    };
  };
  qualityMetrics: {
    clusterCoherence: number;
    intentAlignment: number;
    sizeDistribution: {
      small: number; // < 5 keywords
      medium: number; // 5-15 keywords
      large: number; // > 15 keywords
    };
  };
}

/**
 * Process clustering job
 */
export async function processClusteringJob(
  job: Job<ClusteringJobData>
): Promise<ClusteringJobResult> {
  const startTime = Date.now();
  const { runId, keywords, settings, userId } = job.data;
  
  console.log(`Processing clustering job ${job.id} for run ${runId} with ${keywords.length} keywords`);
  
  try {
    // Initialize clustering service
    const clusteringService = new ClusteringService(
      process.env.OPENAI_API_KEY!,
      process.env.ANTHROPIC_API_KEY!
    );
    
    // Track memory usage
    const initialMemory = process.memoryUsage();
    let peakMemory = initialMemory;
    
    // Update initial progress
    await job.updateProgress({
      stage: 'clustering',
      stepName: 'Initializing',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Starting semantic clustering',
      metadata: {
        keywordCount: keywords.length,
        runId,
        targetClusters: settings.targetClusterCount || 'auto',
        method: settings.clusteringMethod || 'hierarchical',
      },
    } satisfies WorkerJobProgress);

    // Update run status
    await supabase
      .from('runs')
      .update({
        status: 'processing',
        progress: {
          current_stage: 'clustering',
          stages_completed: ['expansion', 'universe'],
          keywords_discovered: keywords.length,
          percent_complete: 60,
        },
      })
      .eq('id', runId);

    // Process clustering with progress tracking
    let currentStep = 0;
    const totalSteps = 4; // Embedding generation, Similarity calculation, Clustering, Validation
    const embeddingStartTime = Date.now();
    
    const result = await clusteringService.clusterKeywords(
      keywords,
      {
        method: 'semantic',
        similarityThreshold: settings.similarityThreshold || 0.7,
        minClusterSize: settings.minClusterSize || 3,
        maxClusterSize: settings.maxClusterSize || 50,
        maxClusters: settings.targetClusterCount || 100,
        intentWeight: 0.3,
        semanticWeight: 0.7,
        outlierThreshold: 0.5
      },
      async (progress) => {
        const overallProgress = Math.min(progress.percentComplete, 100);
        
        // Track memory usage
        const currentMemory = process.memoryUsage();
        if (currentMemory.heapUsed > peakMemory.heapUsed) {
          peakMemory = currentMemory;
        }
        
        await job.updateProgress({
          stage: 'clustering',
          stepName: progress.currentOperation,
          current: progress.processed,
          total: progress.total,
          percentage: overallProgress,
          message: progress.currentOperation,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          metadata: {
            currentStep: currentStep + 1,
            totalSteps,
            keywordCount: keywords.length,
            memoryUsage: Math.round(currentMemory.heapUsed / 1024 / 1024), // MB
            runId,
          },
        } satisfies WorkerJobProgress);
        
        // Update database progress
        await supabase
          .from('runs')
          .update({
            progress: {
              current_stage: 'clustering',
              stages_completed: ['expansion', 'universe'],
              keywords_discovered: keywords.length,
              clusters_created: 0, // Will be updated when clustering completes
              percent_complete: 60 + Math.min(overallProgress * 0.2, 20), // Clustering is ~20% of pipeline
              estimated_time_remaining: progress.estimatedTimeRemaining,
            },
          })
          .eq('id', runId);
        
        // Handle step completion logic
        if (progress.stage === 'embeddings' && progress.percentComplete === 100) {
          currentStep++;
          console.log(`Clustering step 'Embedding Generation' completed (${currentStep}/${totalSteps})`);
          const embeddingTime = Date.now() - embeddingStartTime;
          console.log(`Embedding generation completed in ${embeddingTime}ms`);
        }
      }
    );

    const embeddingGenerationTime = Date.now() - embeddingStartTime;
    const clusteringTime = Date.now() - startTime - embeddingGenerationTime;
    
    // Calculate quality metrics
    const qualityMetrics = calculateClusteringQualityMetrics(result.clusters);
    const finalMemory = process.memoryUsage();
    
    // Update final progress
    await job.updateProgress({
      stage: 'clustering',
      stepName: 'Completed',
      current: result.clusters.length,
      total: result.clusters.length,
      percentage: 100,
      message: `Clustering completed with ${result.clusters.length} clusters`,
      metadata: {
        clustersCreated: result.clusters.length,
        unclusteredCount: result.outliers?.length || 0,
        qualityMetrics,
        avgClusterSize: Math.round(keywords.length / result.clusters.length),
        runId,
      },
    } satisfies WorkerJobProgress);

    // Bulk insert clusters to database
    if (result.clusters.length > 0) {
      await supabase.rpc('bulk_insert_clusters', {
        clusters_data: result.clusters.map(cluster => ({
          id: cluster.id,
          run_id: runId,
          label: cluster.label,
          size: cluster.size,
          score: cluster.score,
          intent_mix: cluster.intentMix,
          representative_keywords: cluster.representativeKeywords,
          similarity_threshold: cluster.similarityThreshold,
          embedding: cluster.embedding,
        })),
      });
    }

    // Update run with completed clustering stage
    await supabase
      .from('runs')
      .update({
        progress: {
          current_stage: 'clustering',
          stages_completed: ['expansion', 'universe', 'clustering'],
          keywords_discovered: keywords.length,
          clusters_created: result.clusters.length,
          percent_complete: 80, // Clustering completion brings us to ~80%
        },
        total_clusters: result.clusters.length,
      })
      .eq('id', runId);

    const totalProcessingTime = Date.now() - startTime;
    console.log(`Clustering job ${job.id} completed in ${totalProcessingTime}ms with ${result.clusters.length} clusters`);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      message: 'Clustering job completed successfully',
      category: 'job',
      level: 'info',
      data: {
        jobId: job.id,
        runId,
        keywordCount: keywords.length,
        clustersCreated: result.clusters.length,
        processingTime: totalProcessingTime,
        avgClusterSize: Math.round(keywords.length / result.clusters.length),
      },
    });

    return {
      clusters: result.clusters,
      unclusteredKeywords: result.outliers || [],
      metrics: {
        totalKeywords: keywords.length,
        clustersCreated: result.clusters.length,
        unclusteredCount: result.outliers?.length || 0,
        avgClusterSize: result.clusters.length > 0 ? keywords.length / result.clusters.length : 0,
        avgSilhouetteScore: result.metrics?.avgSilhouetteScore || 0,
        embeddingGenerationTime,
        clusteringTime,
        totalProcessingTime,
        memoryUsage: {
          peak: Math.round(peakMemory.heapUsed / 1024 / 1024), // MB
          final: Math.round(finalMemory.heapUsed / 1024 / 1024), // MB
        },
      },
      qualityMetrics,
    };

  } catch (error) {
    console.error(`Clustering job ${job.id} failed:`, error);
    
    // Update run status to failed
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage: 'clustering',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      })
      .eq('id', runId);

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        jobType: 'clustering',
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
 * Calculate clustering quality metrics
 */
function calculateClusteringQualityMetrics(clusters: Cluster[]): {
  clusterCoherence: number;
  intentAlignment: number;
  sizeDistribution: { small: number; medium: number; large: number };
} {
  if (clusters.length === 0) {
    return {
      clusterCoherence: 0,
      intentAlignment: 0,
      sizeDistribution: { small: 0, medium: 0, large: 0 },
    };
  }

  // Calculate cluster coherence (average score across all clusters)
  const avgScore = clusters.reduce((sum, c) => sum + c.score, 0) / clusters.length;
  const clusterCoherence = Math.round(avgScore * 100) / 100;

  // Calculate intent alignment (how well clusters align with intents)
  const intentAlignmentScores = clusters.map(cluster => {
    if (!cluster.intentMix) return 0;
    
    // Calculate how concentrated the intent distribution is
    const intents = Object.values(cluster.intentMix) as number[];
    const maxIntent = Math.max(...intents);
    const total = intents.reduce((sum, val) => sum + val, 0);
    
    return total > 0 ? maxIntent / total : 0;
  });
  
  const intentAlignment = intentAlignmentScores.length > 0 
    ? Math.round((intentAlignmentScores.reduce((sum, val) => sum + val, 0) / intentAlignmentScores.length) * 100) / 100
    : 0;

  // Calculate size distribution
  const small = clusters.filter(c => c.size < 5).length;
  const large = clusters.filter(c => c.size > 15).length;
  const medium = clusters.length - small - large;

  return {
    clusterCoherence,
    intentAlignment,
    sizeDistribution: { small, medium, large },
  };
}

/**
 * Validate clustering job data
 */
export function validateClusteringJobData(data: any): data is ClusteringJobData {
  return (
    data &&
    typeof data.runId === 'string' &&
    Array.isArray(data.keywords) &&
    data.keywords.length > 0 &&
    typeof data.settings === 'object'
  );
}

/**
 * Estimate clustering job duration
 */
export function estimateClusteringJobDuration(data: ClusteringJobData): number {
  const keywordCount = data.keywords.length;
  
  // Base time estimates
  const embeddingTimePerKeyword = 100; // 100ms per keyword for embedding
  const clusteringBaseTime = 30000; // 30 seconds base clustering time
  const complexityFactor = Math.log(keywordCount) / Math.log(2); // Logarithmic complexity
  
  const embeddingTime = keywordCount * embeddingTimePerKeyword;
  const clusteringTime = clusteringBaseTime * complexityFactor;
  
  return embeddingTime + clusteringTime;
}

/**
 * Calculate clustering memory requirements
 */
export function estimateClusteringMemoryUsage(data: ClusteringJobData): {
  estimatedMB: number;
  recommendedMaxConcurrency: number;
} {
  const keywordCount = data.keywords.length;
  const embeddingSize = 1536; // OpenAI embedding dimensions
  const floatSize = 4; // 4 bytes per float
  
  // Memory for embeddings matrix
  const embeddingMemoryMB = (keywordCount * embeddingSize * floatSize) / (1024 * 1024);
  
  // Memory for similarity matrix (sparse representation)
  const similarityMemoryMB = (keywordCount * keywordCount * 0.1 * floatSize) / (1024 * 1024);
  
  // Additional overhead for clustering algorithms
  const overheadMB = Math.max(100, keywordCount * 0.01);
  
  const totalMB = embeddingMemoryMB + similarityMemoryMB + overheadMB;
  
  // Recommend max concurrency based on memory usage
  const maxConcurrency = Math.max(1, Math.floor(2048 / totalMB)); // Assume 2GB available
  
  return {
    estimatedMB: Math.round(totalMB),
    recommendedMaxConcurrency: Math.min(maxConcurrency, 3),
  };
}

export default processClusteringJob;