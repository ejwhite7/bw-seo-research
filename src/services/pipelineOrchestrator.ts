/**
 * Pipeline Orchestrator
 * 
 * Coordinates the complete 5-stage keyword research pipeline using the job queue system.
 * Manages job dependencies, error handling, progress tracking, and workflow orchestration.
 * 
 * Features:
 * - Sequential job execution with dependency management
 * - Real-time progress tracking across all stages
 * - Comprehensive error handling and recovery
 * - Resource monitoring and optimization
 * - Cost tracking and budget enforcement
 * - Quality gates and validation checkpoints
 * - Workflow resumption after failures
 * - Performance metrics and analytics
 * 
 * @fileoverview Pipeline orchestration and workflow management
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { 
  UUID, 
  Keyword, 
  Cluster, 
  RoadmapItem, 
  JobProgress, 
  Run,
  ProcessingStage 
} from '../models';
import type { RunStatus, KeywordStage } from '../types/database';
import { JobQueueService, JobType, JobPriority } from './jobQueue';
import { supabase } from '../lib/supabase';

/**
 * Pipeline execution settings
 */
export interface PipelineSettings {
  // General settings
  market?: string;
  maxTotalKeywords?: number;
  
  // Dream 100 settings
  maxDream100?: number;
  commercialFocus?: boolean;
  
  // Universe settings
  maxTier2PerDream?: number;
  maxTier3PerTier2?: number;
  enableCompetitorAnalysis?: boolean;
  enableSerpScraping?: boolean;
  
  // Clustering settings
  similarityThreshold?: number;
  targetClusterCount?: number;
  enableIntentGrouping?: boolean;
  
  // Scoring settings
  quickWinThreshold?: number;
  enableNormalization?: boolean;
  customScoringWeights?: any;
  
  // Roadmap settings
  postsPerMonth?: number;
  teamMembers?: string[];
  contentStrategy?: 'pillar-supporting' | 'cluster-based' | 'intent-driven';
  startDate?: string;
  endDate?: string;
  
  // Quality and performance
  qualityThreshold?: number;
  budgetLimit?: number;
  enableQualityGates?: boolean;
}

/**
 * Pipeline execution status
 */
export interface PipelineExecution {
  runId: UUID;
  status: RunStatus;
  currentStage: ProcessingStage;
  completedStages: ProcessingStage[];
  jobIds: Record<JobType, string | null>;
  startedAt: Date;
  completedAt?: Date;
  progress: {
    overall: number;
    byStage: Record<ProcessingStage, number>;
  };
  metrics: {
    keywordsDiscovered: number;
    clustersCreated: number;
    postsGenerated: number;
    apiCosts: {
      anthropic: number;
      ahrefs: number;
      total: number;
    };
    processingTimes: Record<ProcessingStage, number>;
  };
  errors: Array<{
    stage: ProcessingStage;
    error: string;
    timestamp: Date;
    recoverable: boolean;
  }>;
}

/**
 * Quality gate validation result
 */
export interface QualityGateResult {
  stage: ProcessingStage;
  passed: boolean;
  score: number;
  issues: Array<{
    severity: 'warning' | 'error' | 'critical';
    message: string;
    metric: string;
    value: number;
    threshold: number;
  }>;
  recommendations: string[];
}

/**
 * Pipeline orchestrator class
 */
export class PipelineOrchestrator extends EventEmitter {
  private jobQueue: JobQueueService;
  private activeExecutions: Map<UUID, PipelineExecution> = new Map();
  private stageWeights: Record<ProcessingStage, number> = {
    'initialization': 0.05,
    'expansion': 0.40,
    'universe': 0.25,
    'clustering': 0.15,
    'scoring': 0.08,
    'roadmap': 0.05,
    'export': 0.02,
    'cleanup': 0.00
  };

  constructor(jobQueue: JobQueueService) {
    super();
    this.jobQueue = jobQueue;
    this.setupJobQueueListeners();
  }

  /**
   * Map JobType to ProcessingStage
   */
  private mapJobTypeToStage(type: JobType): ProcessingStage {
    const mapping: Record<JobType, ProcessingStage> = {
      'expansion': 'expansion',
      'universe': 'universe',
      'clustering': 'clustering', 
      'scoring': 'scoring',
      'roadmap': 'roadmap',
      'export': 'export',
      'cleanup': 'cleanup'
    };
    return mapping[type] || 'initialization';
  }

  /**
   * Setup job queue event listeners
   */
  private setupJobQueueListeners(): void {
    this.jobQueue.on('jobCompleted', this.handleJobCompleted.bind(this));
    this.jobQueue.on('jobFailed', this.handleJobFailed.bind(this));
    this.jobQueue.on('jobProgress', this.handleJobProgress.bind(this));
    this.jobQueue.on('jobStalled', this.handleJobStalled.bind(this));
  }

  /**
   * Start a complete pipeline execution
   */
  async startPipeline(
    runId: UUID,
    seedKeywords: string[],
    settings: PipelineSettings = {},
    userId?: string
  ): Promise<PipelineExecution> {
    try {
      console.log(`Starting pipeline for run ${runId} with ${seedKeywords.length} seed keywords`);

      // Validate inputs
      this.validatePipelineInputs(seedKeywords, settings);

      // Create pipeline execution record
      const execution: PipelineExecution = {
        runId,
        status: 'processing',
        currentStage: 'expansion',
        completedStages: [],
        jobIds: {
          expansion: null,
          universe: null,
          clustering: null,
          scoring: null,
          roadmap: null,
          export: null,
          cleanup: null,
        },
        startedAt: new Date(),
        progress: {
          overall: 0,
          byStage: {
            initialization: 0,
            expansion: 0,
            universe: 0,
            clustering: 0,
            scoring: 0,
            roadmap: 0,
            export: 0,
            cleanup: 0,
          },
        },
        metrics: {
          keywordsDiscovered: 0,
          clustersCreated: 0,
          postsGenerated: 0,
          apiCosts: {
            anthropic: 0,
            ahrefs: 0,
            total: 0,
          },
          processingTimes: {
            initialization: 0,
            expansion: 0,
            universe: 0,
            clustering: 0,
            scoring: 0,
            roadmap: 0,
            export: 0,
            cleanup: 0,
          },
        },
        errors: [],
      };

      this.activeExecutions.set(runId, execution);

      // Update run status in database
      await this.updateRunInDatabase(execution);

      // Check budget limit before starting
      if (settings.budgetLimit) {
        await this.validateBudgetLimit(runId, settings.budgetLimit);
      }

      // Start the expansion job
      const expansionJobId = await this.jobQueue.addJob(
        'expansion',
        {
          stage: 'expansion',
          input: {
            runId,
            seedKeywords,
            settings: Object.fromEntries(
              Object.entries({
                maxDream100: settings.maxDream100,
                market: settings.market,
                commercialFocus: settings.commercialFocus,
                qualityThreshold: settings.qualityThreshold,
              }).filter(([_, value]) => value !== undefined)
            ) as Record<string, string | number | boolean>,
            userId,
          },
          config: {
            stage: 'expansion',
            parameters: {},
            timeoutMinutes: 30,
            retryStrategy: { 
              maxRetries: 3, 
              backoffStrategy: 'exponential',
              initialDelayMs: 1000,
              maxDelayMs: 30000,
              retryableErrors: ['TIMEOUT', 'NETWORK_ERROR']
            },
            resourceLimits: { 
              maxMemory: 2048, 
              maxCpu: 4, 
              maxDuration: 60,
              maxApiCalls: 1000,
              maxStorage: 1024
            }
          },
          dependencies: [],
          resources: {
            memory: 1024,
            cpu: 2,
            apiQuota: { anthropic: 10000 },
            storage: 512,
            estimatedDuration: 15
          }
        } as any,
        {
          priority: JobPriority.HIGH,
          attempts: 3,
          backoff: 'exponential',
        }
      );

      execution.jobIds.expansion = expansionJobId;
      this.activeExecutions.set(runId, execution);

      console.log(`Pipeline started for run ${runId}, expansion job ${expansionJobId} queued`);
      this.emit('pipelineStarted', execution);

      return execution;

    } catch (error) {
      console.error(`Failed to start pipeline for run ${runId}:`, error);
      Sentry.captureException(error, {
        tags: { operation: 'startPipeline', runId },
        extra: { seedKeywords, settings },
      });

      // Update run status to failed
      await supabase
        .from('runs')
        .update({
          status: 'failed',
          error_logs: {
            stage: 'initialization',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          },
        })
        .eq('id', runId);

      throw error;
    }
  }

  /**
   * Handle job completion and orchestrate next stage
   */
  private async handleJobCompleted(data: { type: JobType; jobId: string; result: any }): Promise<void> {
    const { type, jobId, result } = data;
    console.log(`Job ${jobId} of type ${type} completed successfully`);

    // Find the execution for this job
    const execution = this.findExecutionByJobId(jobId);
    if (!execution) {
      console.warn(`No execution found for completed job ${jobId}`);
      return;
    }

    try {
      // Update execution with completion
      const stage = this.mapJobTypeToStage(type);
      execution.completedStages.push(stage);
      execution.progress.byStage[stage] = 100;
      this.updateOverallProgress(execution);

      // Update metrics from job result
      this.updateExecutionMetrics(execution, type, result);

      // Run quality gate if enabled
      if (execution.runId && this.shouldRunQualityGate(type)) {
        const qualityResult = await this.runQualityGate(execution, type, result);
        if (!qualityResult.passed) {
          await this.handleQualityGateFailure(execution, qualityResult);
          return;
        }
      }

      // Orchestrate next stage
      await this.orchestrateNextStage(execution, type, result);

      this.emit('stageCompleted', { execution, stage: type, result });

    } catch (error) {
      console.error(`Failed to handle job completion for ${jobId}:`, error);
      await this.handlePipelineError(execution, this.mapJobTypeToStage(type), error);
    }
  }

  /**
   * Orchestrate the next stage in the pipeline
   */
  private async orchestrateNextStage(
    execution: PipelineExecution,
    completedStage: JobType,
    result: any
  ): Promise<void> {
    const runId = execution.runId;
    const settings = await this.getRunSettings(runId);

    let nextJobId: string | null = null;

    switch (completedStage) {
      case 'expansion':
        // Start universe expansion with Dream 100 keywords
        execution.currentStage = 'universe';
        nextJobId = await this.jobQueue.addJob(
          'universe',
          {
            stage: 'universe',
            input: {
              runId,
              dreamKeywords: result.dreamKeywords,
              settings: Object.fromEntries(
                Object.entries({
                  maxTier2PerDream: settings.maxTier2PerDream,
                  maxTier3PerTier2: settings.maxTier3PerTier2,
                  maxTotalKeywords: settings.maxTotalKeywords,
                  enableCompetitorAnalysis: settings.enableCompetitorAnalysis,
                  enableSerpScraping: settings.enableSerpScraping,
                  market: settings.market,
                  qualityThreshold: settings.qualityThreshold,
                }).filter(([_, value]) => value !== undefined)
              ) as Record<string, string | number | boolean>,
            },
            config: {
              stage: 'universe',
              parameters: {},
              timeoutMinutes: 45,
              retryStrategy: { 
                maxRetries: 3, 
                backoffStrategy: 'exponential',
                initialDelayMs: 1000,
                maxDelayMs: 30000,
                retryableErrors: ['TIMEOUT', 'NETWORK_ERROR']
              },
              resourceLimits: { 
                maxMemory: 2048, 
                maxCpu: 4, 
                maxDuration: 90,
                maxApiCalls: 5000,
                maxStorage: 2048
              }
            },
            dependencies: [],
            resources: {
              memory: 1536,
              cpu: 3,
              apiQuota: { anthropic: 20000, ahrefs: 5000 },
              storage: 1024,
              estimatedDuration: 30
            }
          } as any,
          { priority: JobPriority.HIGH, attempts: 3 }
        );
        execution.jobIds.universe = nextJobId;
        break;

      case 'universe':
        // Start clustering with all keywords
        execution.currentStage = 'clustering';
        nextJobId = await this.jobQueue.addJob(
          'clustering',
          {
            stage: 'clustering',
            input: {
              runId,
              keywords: result.allKeywords,
              settings: Object.fromEntries(
                Object.entries({
                  similarityThreshold: settings.similarityThreshold,
                  targetClusterCount: settings.targetClusterCount,
                  enableIntentGrouping: settings.enableIntentGrouping,
                }).filter(([_, value]) => value !== undefined)
              ) as Record<string, number | boolean>,
            },
            config: {
              stage: 'clustering',
              parameters: {},
              timeoutMinutes: 30,
              retryStrategy: { 
                maxRetries: 2, 
                backoffStrategy: 'exponential',
                initialDelayMs: 1000,
                maxDelayMs: 15000,
                retryableErrors: ['TIMEOUT']
              },
              resourceLimits: { 
                maxMemory: 4096, 
                maxCpu: 6, 
                maxDuration: 45,
                maxApiCalls: 0,
                maxStorage: 1024
              }
            },
            dependencies: [],
            resources: {
              memory: 2048,
              cpu: 4,
              apiQuota: {},
              storage: 512,
              estimatedDuration: 20
            }
          } as any,
          { priority: JobPriority.MEDIUM, attempts: 2 }
        );
        execution.jobIds.clustering = nextJobId;
        break;

      case 'clustering':
        // Start scoring with clustered keywords
        execution.currentStage = 'scoring';
        const allKeywords = await this.getKeywordsForRun(runId);
        nextJobId = await this.jobQueue.addJob(
          'scoring',
          {
            stage: 'scoring',
            input: {
              runId,
              keywords: allKeywords as any[],
              settings: {
                quickWinThreshold: settings.quickWinThreshold,
                enableNormalization: settings.enableNormalization,
                customScoringWeights: settings.customScoringWeights,
              },
            },
            config: {
              stage: 'scoring',
              parameters: {},
              timeoutMinutes: 20,
              retryStrategy: { 
                maxRetries: 2, 
                backoffStrategy: 'exponential',
                initialDelayMs: 1000,
                maxDelayMs: 10000,
                retryableErrors: ['TIMEOUT']
              },
              resourceLimits: { 
                maxMemory: 2048, 
                maxCpu: 4, 
                maxDuration: 30,
                maxApiCalls: 0,
                maxStorage: 512
              }
            },
            dependencies: [],
            resources: {
              memory: 1024,
              cpu: 2,
              apiQuota: {},
              storage: 256,
              estimatedDuration: 15
            }
          } as any,
          { priority: JobPriority.MEDIUM, attempts: 2 }
        );
        execution.jobIds.scoring = nextJobId;
        break;

      case 'scoring':
        // Start roadmap generation with clusters
        execution.currentStage = 'roadmap';
        nextJobId = await this.jobQueue.addJob(
          'roadmap',
          {
            stage: 'roadmap',
            input: {
              runId,
              clusters: result.clusters || await this.getClustersForRun(runId),
              settings: {
                postsPerMonth: settings.postsPerMonth,
                teamMembers: settings.teamMembers,
                contentStrategy: settings.contentStrategy,
                startDate: settings.startDate,
                endDate: settings.endDate,
              } as any,
            },
            config: {
              stage: 'roadmap',
              parameters: {},
              timeoutMinutes: 15,
              retryStrategy: { 
                maxRetries: 2, 
                backoffStrategy: 'linear',
                initialDelayMs: 1000,
                maxDelayMs: 5000,
                retryableErrors: ['TIMEOUT']
              },
              resourceLimits: { 
                maxMemory: 1024, 
                maxCpu: 2, 
                maxDuration: 20,
                maxApiCalls: 100,
                maxStorage: 256
              }
            },
            dependencies: [],
            resources: {
              memory: 512,
              cpu: 1,
              apiQuota: { anthropic: 5000 },
              storage: 128,
              estimatedDuration: 10
            }
          } as any,
          { priority: JobPriority.MEDIUM, attempts: 2 }
        );
        execution.jobIds.roadmap = nextJobId;
        break;

      case 'roadmap':
        // Pipeline completed successfully
        execution.status = 'completed';
        execution.completedAt = new Date();
        execution.progress.overall = 100;
        
        console.log(`Pipeline completed successfully for run ${runId}`);
        this.emit('pipelineCompleted', execution);

        // Schedule cleanup job
        await this.scheduleCleanupJob(runId);

        // Remove from active executions
        this.activeExecutions.delete(runId);
        break;
    }

    // Update execution
    if (nextJobId) {
      console.log(`Started ${execution.currentStage} stage with job ${nextJobId} for run ${runId}`);
    }
    
    await this.updateRunInDatabase(execution);
  }

  /**
   * Handle job failure with retry logic and error recovery
   */
  private async handleJobFailed(data: { type: JobType; jobId: string; error: any }): Promise<void> {
    const { type, jobId, error } = data;
    console.error(`Job ${jobId} of type ${type} failed:`, error);

    const execution = this.findExecutionByJobId(jobId);
    if (!execution) {
      console.warn(`No execution found for failed job ${jobId}`);
      return;
    }

    await this.handlePipelineError(execution, this.mapJobTypeToStage(type), error);
  }

  /**
   * Handle pipeline errors with recovery options
   */
  private async handlePipelineError(
    execution: PipelineExecution,
    stage: ProcessingStage,
    error: any
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorRecord = {
      stage,
      error: errorMessage,
      timestamp: new Date(),
      recoverable: this.isRecoverableError(error),
    };

    execution.errors.push(errorRecord);
    execution.status = 'failed';

    console.error(`Pipeline failed at stage ${stage} for run ${execution.runId}:`, error);

    // Log to Sentry
    Sentry.captureException(error, {
      tags: {
        operation: 'pipelineExecution',
        stage,
        runId: execution.runId,
      },
      extra: { execution },
    });

    // Update database
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error_logs: {
          stage,
          error: errorMessage,
          timestamp: new Date().toISOString(),
          recoverable: errorRecord.recoverable,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', execution.runId);

    this.emit('pipelineFailed', { execution, error: errorRecord });

    // Remove from active executions
    this.activeExecutions.delete(execution.runId);
  }

  /**
   * Handle job progress updates
   */
  private async handleJobProgress(data: { type: JobType; jobId: string; progress: JobProgress }): Promise<void> {
    const { type, jobId, progress } = data;
    
    const execution = this.findExecutionByJobId(jobId);
    if (!execution) return;

    // Update stage progress - use progress or percentage field
    const progressValue = progress.percentage ?? progress.progress;
    execution.progress.byStage[type as ProcessingStage] = progressValue;
    this.updateOverallProgress(execution);

    // Update metrics if available
    if (progress.metadata) {
      if (typeof progress.metadata.keywordsDiscovered === 'number') {
        execution.metrics.keywordsDiscovered = progress.metadata.keywordsDiscovered;
      }
      if (typeof progress.metadata.clustersCreated === 'number') {
        execution.metrics.clustersCreated = progress.metadata.clustersCreated;
      }
    }

    this.emit('progressUpdate', { execution, stage: type, progress });
    
    // Update database with throttling
    if (Math.floor(progressValue) % 10 === 0) {
      await this.updateRunInDatabase(execution);
    }
  }

  /**
   * Handle job stalling
   */
  private async handleJobStalled(data: { type: JobType; jobId: string }): Promise<void> {
    const { type, jobId } = data;
    console.warn(`Job ${jobId} of type ${type} has stalled`);

    const execution = this.findExecutionByJobId(jobId);
    if (execution) {
      this.emit('jobStalled', { execution, stage: type, jobId });
    }
  }

  /**
   * Validate pipeline inputs
   */
  private validatePipelineInputs(seedKeywords: string[], settings: PipelineSettings): void {
    if (!seedKeywords || seedKeywords.length === 0) {
      throw new Error('Seed keywords are required');
    }

    if (seedKeywords.length > 20) {
      throw new Error('Maximum 20 seed keywords allowed');
    }

    if (settings.budgetLimit && settings.budgetLimit < 10) {
      throw new Error('Budget limit must be at least $10');
    }

    if (settings.maxTotalKeywords && settings.maxTotalKeywords > 50000) {
      throw new Error('Maximum total keywords cannot exceed 50,000');
    }
  }

  /**
   * Run quality gate validation
   */
  private async runQualityGate(
    execution: PipelineExecution,
    stage: ProcessingStage,
    result: any
  ): Promise<QualityGateResult> {
    const issues: Array<{
      severity: 'warning' | 'error' | 'critical';
      message: string;
      metric: string;
      value: number;
      threshold: number;
    }> = [];

    let score = 1.0;
    const recommendations: string[] = [];

    switch (stage) {
      case 'expansion':
        // Validate Dream 100 quality
        if (result.dreamKeywords.length < 50) {
          issues.push({
            severity: 'warning',
            message: 'Low Dream 100 count may limit universe expansion',
            metric: 'dream100_count',
            value: result.dreamKeywords.length,
            threshold: 50,
          });
          score *= 0.9;
          recommendations.push('Consider adding more seed keywords or adjusting expansion parameters');
        }
        break;

      case 'clustering':
        // Validate cluster quality
        if (result.clusters.length < 5) {
          issues.push({
            severity: 'error',
            message: 'Too few clusters created for effective content planning',
            metric: 'cluster_count',
            value: result.clusters.length,
            threshold: 5,
          });
          score *= 0.7;
          recommendations.push('Adjust similarity threshold or ensure sufficient keyword variety');
        }
        break;
    }

    const passed = issues.filter(i => i.severity === 'critical').length === 0 && score >= 0.7;

    return {
      stage,
      passed,
      score,
      issues,
      recommendations,
    };
  }

  /**
   * Handle quality gate failure
   */
  private async handleQualityGateFailure(
    execution: PipelineExecution,
    qualityResult: QualityGateResult
  ): Promise<void> {
    console.warn(`Quality gate failed for stage ${qualityResult.stage}:`, qualityResult.issues);

    // For now, just log warnings and continue
    // In production, you might want to pause execution or notify users
    this.emit('qualityGateWarning', { execution, qualityResult });
  }

  /**
   * Update overall progress based on stage progress
   */
  private updateOverallProgress(execution: PipelineExecution): void {
    const stages: ProcessingStage[] = [
      'initialization',
      'expansion',
      'universe',
      'clustering',
      'scoring',
      'roadmap',
      'export',
      'cleanup'
    ];
    let totalProgress = 0;

    for (const stage of stages) {
      const stageWeight = this.stageWeights[stage] || 0;
      const stageProgress = execution.progress.byStage[stage as keyof typeof execution.progress.byStage] || 0;
      totalProgress += (stageProgress / 100) * stageWeight;
    }

    execution.progress.overall = Math.round(totalProgress * 100);
  }

  /**
   * Update execution metrics from job results
   */
  private updateExecutionMetrics(execution: PipelineExecution, stage: JobType, result: any): void {
    if (result.metrics) {
      // Update API costs
      if (result.metrics.costs) {
        execution.metrics.apiCosts.anthropic += result.metrics.costs.anthropic || 0;
        execution.metrics.apiCosts.ahrefs += result.metrics.costs.ahrefs || 0;
        execution.metrics.apiCosts.total += result.metrics.costs.total || 0;
      }

      // Update processing times
      if (result.metrics.processingTime) {
        execution.metrics.processingTimes[stage as ProcessingStage] = result.metrics.processingTime;
      }

      // Update specific metrics
      if (stage === 'expansion' && result.dreamKeywords) {
        execution.metrics.keywordsDiscovered = result.dreamKeywords.length;
      } else if (stage === 'universe' && result.allKeywords) {
        execution.metrics.keywordsDiscovered = result.allKeywords.length;
      } else if (stage === 'clustering' && result.clusters) {
        execution.metrics.clustersCreated = result.clusters.length;
      } else if (stage === 'roadmap' && result.roadmapItems) {
        execution.metrics.postsGenerated = result.roadmapItems.length;
      }
    }
  }

  /**
   * Find execution by job ID
   */
  private findExecutionByJobId(jobId: string): PipelineExecution | null {
    for (const execution of this.activeExecutions.values()) {
      for (const [type, id] of Object.entries(execution.jobIds)) {
        if (id === jobId) {
          return execution;
        }
      }
    }
    return null;
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverableError(error: any): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Network errors are usually recoverable
    if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
      return true;
    }
    
    // API rate limiting is recoverable
    if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      return true;
    }
    
    // Temporary service issues
    if (errorMessage.includes('service unavailable') || errorMessage.includes('502') || errorMessage.includes('503')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if quality gate should run for stage
   */
  private shouldRunQualityGate(stage: JobType): boolean {
    const qualityGateStages: JobType[] = ['expansion', 'clustering', 'scoring'];
    return qualityGateStages.includes(stage);
  }

  /**
   * Update run in database
   */
  private async updateRunInDatabase(execution: PipelineExecution): Promise<void> {
    try {
      await supabase
        .from('runs')
        .update({
          status: execution.status,
          progress: {
            current_stage: execution.currentStage,
            stages_completed: execution.completedStages,
            keywords_discovered: execution.metrics.keywordsDiscovered,
            clusters_created: execution.metrics.clustersCreated,
            percent_complete: execution.progress.overall,
          },
          api_usage: {
            anthropic: {
              cost: execution.metrics.apiCosts.anthropic,
            },
            ahrefs: {
              cost: execution.metrics.apiCosts.ahrefs,
            },
            total_cost: execution.metrics.apiCosts.total,
          },
          updated_at: new Date().toISOString(),
          ...(execution.completedAt && { completed_at: execution.completedAt.toISOString() }),
        })
        .eq('id', execution.runId);
    } catch (error) {
      console.error('Failed to update run in database:', error);
    }
  }

  /**
   * Get run settings from database
   */
  private async getRunSettings(runId: UUID): Promise<PipelineSettings> {
    try {
      const { data } = await supabase
        .from('runs')
        .select('settings')
        .eq('id', runId)
        .single();
      
      return (data?.settings as PipelineSettings) || {};
    } catch (error) {
      console.error('Failed to get run settings:', error);
      return {};
    }
  }

  /**
   * Get keywords for run from database
   */
  private async getKeywordsForRun(runId: UUID): Promise<Keyword[]> {
    try {
      const { data } = await supabase
        .from('keywords')
        .select('*')
        .eq('run_id', runId);
      
      return data || [];
    } catch (error) {
      console.error('Failed to get keywords for run:', error);
      return [];
    }
  }

  /**
   * Get clusters for run from database
   */
  private async getClustersForRun(runId: UUID): Promise<Cluster[]> {
    try {
      const { data } = await supabase
        .from('clusters')
        .select('*')
        .eq('run_id', runId);
      
      return data || [];
    } catch (error) {
      console.error('Failed to get clusters for run:', error);
      return [];
    }
  }

  /**
   * Validate budget limit
   */
  private async validateBudgetLimit(runId: UUID, budgetLimit: number): Promise<void> {
    try {
      const { data } = await supabase
        .from('runs')
        .select('api_usage')
        .eq('id', runId)
        .single();
      
      const currentCost = (data?.api_usage as any)?.total_cost || 0;
      
      if (currentCost >= budgetLimit) {
        throw new Error(`Budget limit of $${budgetLimit} has been reached`);
      }
    } catch (error) {
      console.error('Failed to validate budget limit:', error);
      throw error;
    }
  }

  /**
   * Schedule cleanup job
   */
  private async scheduleCleanupJob(runId: UUID): Promise<void> {
    try {
      await this.jobQueue.addJob(
        'cleanup',
        {
          stage: 'cleanup',
          input: { runId },
          config: {
            stage: 'cleanup',
            parameters: {},
            timeoutMinutes: 5,
            retryStrategy: { 
              maxRetries: 1, 
              backoffStrategy: 'linear',
              initialDelayMs: 1000,
              maxDelayMs: 5000,
              retryableErrors: []
            },
            resourceLimits: { 
              maxMemory: 512, 
              maxCpu: 1, 
              maxDuration: 5,
              maxApiCalls: 0,
              maxStorage: 0
            }
          },
          dependencies: [],
          resources: {
            memory: 256,
            cpu: 1,
            apiQuota: {},
            storage: 0,
            estimatedDuration: 2
          }
        } as any,
        {
          priority: JobPriority.LOW,
          delay: 3600000, // 1 hour delay
        }
      );
    } catch (error) {
      console.error('Failed to schedule cleanup job:', error);
    }
  }

  /**
   * Get pipeline execution status
   */
  getPipelineExecution(runId: UUID): PipelineExecution | null {
    return this.activeExecutions.get(runId) || null;
  }

  /**
   * Cancel pipeline execution
   */
  async cancelPipeline(runId: UUID): Promise<boolean> {
    const execution = this.activeExecutions.get(runId);
    if (!execution) return false;

    try {
      // Cancel active jobs
      for (const [type, jobId] of Object.entries(execution.jobIds)) {
        if (jobId) {
          await this.jobQueue.cancelJob(type as JobType, jobId);
        }
      }

      // Update execution status
      execution.status = 'cancelled';
      
      // Update database
      await supabase
        .from('runs')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);

      this.activeExecutions.delete(runId);
      this.emit('pipelineCancelled', execution);

      return true;
    } catch (error) {
      console.error('Failed to cancel pipeline:', error);
      return false;
    }
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): PipelineExecution[] {
    return Array.from(this.activeExecutions.values());
  }
}

export default PipelineOrchestrator;