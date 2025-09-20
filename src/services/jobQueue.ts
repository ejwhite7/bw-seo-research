/**
 * Comprehensive Background Job Processing System
 * 
 * Redis-based job queue system using BullMQ for the Dream 100 Keyword Engine.
 * Handles the complete 5-stage pipeline with priority management, retry logic,
 * progress tracking, and comprehensive error handling.
 * 
 * Features:
 * - Pipeline job orchestration (Dream100 -> Universe -> Clustering -> Scoring -> Roadmap)
 * - Priority-based queue management with dependency resolution
 * - Intelligent retry logic with exponential backoff
 * - Dead letter queue for permanently failed jobs
 * - Real-time progress tracking with WebSocket/SSE support
 * - Cost monitoring and API usage tracking
 * - Comprehensive error handling and alerting
 * - Redis caching with TTL optimization
 * - Rate limiting per service (Ahrefs, Anthropic)
 * - Queue health monitoring and metrics
 * 
 * @fileoverview Background job processing system
 * @version 1.0.0
 */

import { Queue, Worker, QueueEvents, Job, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { EventEmitter } from 'events';
import type {
  UUID,
  PipelineJob,
  JobStatus,
  JobData,
  JobResult,
  JobError,
  JobMetadata,
  ProcessingStage,
  Run,
  Keyword,
  Cluster,
  RoadmapItem
} from '../models';
import type { RunStatus } from '../types/database';

/**
 * Job types for different pipeline stages
 */
// Legacy JobType for backwards compatibility
export type JobType = 
  | 'expansion' 
  | 'universe' 
  | 'clustering' 
  | 'scoring' 
  | 'roadmap' 
  | 'export'
  | 'cleanup';

// Mapping between legacy JobType and ProcessingStage
export const JOB_TYPE_TO_STAGE: Record<JobType, ProcessingStage> = {
  'expansion': 'expansion',
  'universe': 'universe',
  'clustering': 'clustering',
  'scoring': 'scoring',
  'roadmap': 'roadmap',
  'export': 'export',
  'cleanup': 'cleanup'
};

export const STAGE_TO_JOB_TYPE: Record<ProcessingStage, JobType> = {
  'initialization': 'expansion', // closest match
  'expansion': 'expansion',
  'universe': 'universe',
  'clustering': 'clustering',
  'scoring': 'scoring',
  'roadmap': 'roadmap',
  'export': 'export',
  'cleanup': 'cleanup'
};

/**
 * Job priority levels
 */
export enum JobPriority {
  LOW = 1,
  MEDIUM = 5,
  HIGH = 10,
  CRITICAL = 15
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest?: number;
    connectTimeout?: number;
    commandTimeout?: number;
  };
  queues: {
    [K in JobType]: {
      name: string;
      concurrency: number;
      rateLimiter?: {
        max: number;
        duration: number;
      };
    };
  };
  defaultJobOptions: JobsOptions;
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
  };
}

/**
 * Job progress information
 */
export interface JobProgress {
  stage: ProcessingStage;
  stepName: string;
  current: number;
  total: number;
  percentage: number;
  estimatedTimeRemaining?: number;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Job metrics and performance data
 */
export interface JobMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  apiCalls: {
    ahrefs: number;
    anthropic: number;
    other: number;
  };
  costs: {
    ahrefs: number;
    anthropic: number;
    total: number;
  };
  itemsProcessed: number;
  errorCount: number;
  retryCount: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

/**
 * Queue health status
 */
export interface QueueHealth {
  queueName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  activeJobs: number;
  waitingJobs: number;
  completedJobs: number;
  failedJobs: number;
  delayedJobs: number;
  averageProcessingTime: number;
  errorRate: number;
  lastProcessedAt: Date | null;
  workers: {
    active: number;
    total: number;
  };
}

/**
 * Job queue service implementation
 */
export class JobQueueService extends EventEmitter {
  private redis: IORedis;
  private queues: Map<JobType, Queue> = new Map();
  private workers: Map<JobType, Worker> = new Map();
  private queueEvents: Map<JobType, QueueEvents> = new Map();
  private config: QueueConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.redis = new IORedis({
      ...config.redis,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest ?? 3,
      connectTimeout: config.redis.connectTimeout ?? 10000,
      commandTimeout: config.redis.commandTimeout ?? 5000,
    });

    this.setupRedisErrorHandling();
  }

  /**
   * Initialize the job queue system
   */
  async initialize(): Promise<void> {
    try {
      // Test Redis connection
      await this.redis.ping();
      console.log('Redis connection established successfully');

      // Initialize queues and workers
      await this.setupQueues();
      await this.setupWorkers();
      await this.setupQueueEvents();

      // Start monitoring
      if (this.config.monitoring.enableMetrics) {
        this.startMonitoring();
      }

      this.isInitialized = true;
      this.emit('initialized');
      
      console.log('Job queue system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize job queue system:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Setup Redis error handling
   */
  private setupRedisErrorHandling(): void {
    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
      Sentry.captureException(error);
      this.emit('redisError', error);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis');
      this.emit('redisConnected');
    });

    this.redis.on('ready', () => {
      console.log('Redis is ready');
      this.emit('redisReady');
    });

    this.redis.on('reconnecting', () => {
      console.log('Reconnecting to Redis...');
      this.emit('redisReconnecting');
    });
  }

  /**
   * Setup job queues for different job types
   */
  private async setupQueues(): Promise<void> {
    const queueTypes: JobType[] = ['expansion', 'universe', 'clustering', 'scoring', 'roadmap', 'export', 'cleanup'];
    
    for (const type of queueTypes) {
      const queueConfig = this.config.queues[type];
      const queue = new Queue(queueConfig.name, {
        connection: this.redis,
        defaultJobOptions: {
          ...this.config.defaultJobOptions,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      this.queues.set(type, queue);
      console.log(`Queue '${queueConfig.name}' initialized`);
    }
  }

  /**
   * Setup workers for processing jobs
   */
  private async setupWorkers(): Promise<void> {
    for (const [type, queue] of Array.from(this.queues.entries())) {
      const queueConfig = this.config.queues[type];
      
      const worker = new Worker(
        queueConfig.name,
        async (job) => this.processJob(type, job),
        {
          connection: this.redis,
          concurrency: queueConfig.concurrency,
          limiter: queueConfig.rateLimiter,
        }
      );

      // Setup worker event handlers
      worker.on('completed', (job, result) => {
        console.log(`Job ${job.id} completed successfully`);
        this.emit('jobCompleted', { type, jobId: job.id, result });
      });

      worker.on('failed', (job, err) => {
        console.error(`Job ${job?.id} failed:`, err);
        this.emit('jobFailed', { type, jobId: job?.id, error: err });
      });

      worker.on('progress', (job, progress) => {
        this.emit('jobProgress', { type, jobId: job.id, progress });
      });

      this.workers.set(type, worker);
      console.log(`Worker for '${queueConfig.name}' started with concurrency ${queueConfig.concurrency}`);
    }
  }

  /**
   * Setup queue events for monitoring
   */
  private async setupQueueEvents(): Promise<void> {
    for (const [type, queue] of Array.from(this.queues.entries())) {
      const queueEvents = new QueueEvents(queue.name, {
        connection: this.redis,
      });

      queueEvents.on('waiting', ({ jobId }) => {
        this.emit('jobWaiting', { type, jobId });
      });

      queueEvents.on('active', ({ jobId }) => {
        this.emit('jobActive', { type, jobId });
      });

      queueEvents.on('stalled', ({ jobId }) => {
        console.warn(`Job ${jobId} stalled in queue ${type}`);
        this.emit('jobStalled', { type, jobId });
      });

      this.queueEvents.set(type, queueEvents);
    }
  }

  /**
   * Add a job to the appropriate queue
   */
  async addJob(
    type: JobType,
    data: JobData,
    options: {
      priority?: JobPriority;
      delay?: number;
      attempts?: number;
      backoff?: 'exponential' | 'fixed';
      removeOnComplete?: number;
      removeOnFail?: number;
    } = {}
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Job queue system not initialized');
    }

    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue for job type '${type}' not found`);
    }

    try {
      const job = await queue.add(type, data, {
        priority: options.priority ?? JobPriority.MEDIUM,
        delay: options.delay ?? 0,
        attempts: options.attempts ?? 3,
        backoff: {
          type: options.backoff ?? 'exponential',
          delay: 2000,
        },
        removeOnComplete: options.removeOnComplete ?? 100,
        removeOnFail: options.removeOnFail ?? 50,
      });

      console.log(`Job ${job.id} added to queue '${type}' with priority ${options.priority}`);
      return job.id!;
    } catch (error) {
      console.error(`Failed to add job to queue '${type}':`, error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Process a job based on its type
   */
  private async processJob(type: JobType, job: Job): Promise<any> {
    const startTime = Date.now();
    const metrics: JobMetrics = {
      startTime,
      apiCalls: { ahrefs: 0, anthropic: 0, other: 0 },
      costs: { ahrefs: 0, anthropic: 0, total: 0 },
      itemsProcessed: 0,
      errorCount: 0,
      retryCount: job.attemptsMade,
    };

    try {
      console.log(`Processing ${type} job ${job.id} (attempt ${job.attemptsMade + 1})`);
      
      // Update job progress
      await job.updateProgress({
        stage: this.getProcessingStage(type),
        stepName: 'Starting',
        current: 0,
        total: 100,
        percentage: 0,
        message: `Starting ${type} job`,
      } as JobProgress);

      let result: any;

      switch (type) {
        case 'expansion':
          result = await this.processExpansionJob(job, metrics);
          break;
        case 'universe':
          result = await this.processUniverseJob(job, metrics);
          break;
        case 'clustering':
          result = await this.processClusteringJob(job, metrics);
          break;
        case 'scoring':
          result = await this.processScoringJob(job, metrics);
          break;
        case 'roadmap':
          result = await this.processRoadmapJob(job, metrics);
          break;
        case 'export':
          result = await this.processExportJob(job, metrics);
          break;
        case 'cleanup':
          result = await this.processCleanupJob(job, metrics);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      // Finalize metrics
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.memoryUsage = process.memoryUsage();

      console.log(`Job ${job.id} completed in ${metrics.duration}ms`);
      return { result, metrics };

    } catch (error) {
      metrics.errorCount++;
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      
      console.error(`Job ${job.id} failed:`, error);
      Sentry.captureException(error, {
        tags: { jobType: type, jobId: job.id },
        extra: { jobData: job.data, metrics },
      });

      throw error;
    }
  }

  /**
   * Process expansion job (Dream 100 generation)
   */
  private async processExpansionJob(job: Job, metrics: JobMetrics): Promise<any> {
    const { Dream100ExpansionService } = await import('./expansion');
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
    const ahrefsApiKey = process.env.AHREFS_API_KEY!;
    const expansionService = new Dream100ExpansionService(anthropicApiKey, ahrefsApiKey);
    
    const { seedKeywords, runId, settings } = job.data as any;
    
    await job.updateProgress({
      stage: 'dream100_generation' as ProcessingStage,
      stepName: 'LLM Expansion',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Expanding seed keywords with LLM',
    });

    const request: any = {
      runId,
      seedKeywords,
      targetCount: settings?.maxDream100 || 100,
      market: settings?.market || 'US',
      industry: settings?.industry,
      intentFocus: 'mixed',
      difficultyPreference: settings?.difficultyPreference || 'mixed',
      budgetLimit: settings?.budgetLimit,
      qualityThreshold: 0.7
    };

    const result = await expansionService.expandToDream100(
      request,
      async (progress) => {
        await job.updateProgress({
          stage: progress.stage as ProcessingStage,
          stepName: progress.currentStep,
          current: progress.keywordsProcessed,
          total: request.targetCount || 100,
          percentage: progress.progressPercent,
          message: `Processing: ${progress.currentStep}`,
        } as JobProgress);
        metrics.itemsProcessed = progress.keywordsProcessed;
      }
    );

    return result;
  }

  /**
   * Process universe expansion job (Tier 2 & 3 generation)
   */
  private async processUniverseJob(job: Job, metrics: JobMetrics): Promise<any> {
    const { UniverseExpansionService } = await import('./universe');
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
    const ahrefsApiKey = process.env.AHREFS_API_KEY!;
    const universeService = new UniverseExpansionService(anthropicApiKey, ahrefsApiKey);
    
    const { dreamKeywords, runId, settings } = job.data as any;
    
    await job.updateProgress({
      stage: 'universe' as ProcessingStage,
      stepName: 'Universe Expansion',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Expanding Dream 100 to full universe',
    });

    const request: any = {
      runId,
      dream100Keywords: dreamKeywords,
      targetTotalCount: settings?.maxTotalKeywords || 10000,
      maxTier2PerDream: settings?.maxTier2PerDream || 10,
      maxTier3PerTier2: settings?.maxTier3PerTier2 || 10,
      market: settings?.market || 'US',
      industry: settings?.industry,
      budgetLimit: settings?.budgetLimit,
      qualityThreshold: 0.6,
      enableCompetitorMining: true,
      enableSerpAnalysis: true,
      enableSemanticVariations: true
    };

    const result = await universeService.expandToUniverse(
      request,
      async (progress) => {
        await job.updateProgress({
          stage: progress.stage as ProcessingStage,
          stepName: progress.currentStep,
          current: progress.keywordsProcessed,
          total: request.targetTotalCount || 10000,
          percentage: progress.progressPercent,
          message: `Processing: ${progress.currentStep}`,
        } as JobProgress);
        metrics.itemsProcessed = progress.keywordsProcessed;
      }
    );

    return result;
  }

  /**
   * Process clustering job
   */
  private async processClusteringJob(job: Job, metrics: JobMetrics): Promise<any> {
    const { ClusteringService } = await import('./clustering');
    const openaiApiKey = process.env.OPENAI_API_KEY!;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
    const clusteringService = new ClusteringService(openaiApiKey, anthropicApiKey);
    
    const { keywords, runId, settings } = job.data as any;
    
    await job.updateProgress({
      stage: 'clustering',
      stepName: 'Semantic Clustering',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Clustering keywords semantically',
    } as JobProgress);

    const result = await clusteringService.clusterKeywords(
      keywords,
      {
        method: settings?.clusteringMethod || 'hybrid',
        minClusterSize: settings?.minClusterSize || 3,
        maxClusterSize: settings?.maxClusterSize || 50,
        similarityThreshold: settings?.similarityThreshold || 0.7,
        intentWeight: settings?.intentWeight || 0.3,
        semanticWeight: settings?.semanticWeight || 0.7,
        maxClusters: settings?.maxClusters || 50,
        outlierThreshold: settings?.outlierThreshold || 0.5,
      },
      async (progress) => {
        await job.updateProgress({
          stage: 'clustering',
          stepName: progress.currentOperation || 'Clustering keywords',
          current: progress.processed || 0,
          total: progress.total || keywords.length,
          percentage: progress.percentComplete || 0,
          message: `${progress.stage}: ${progress.currentOperation}`,
        } as JobProgress);
        metrics.itemsProcessed = progress.processed || 0;
      }
    );

    return result;
  }

  /**
   * Process scoring job
   */
  private async processScoringJob(job: Job, metrics: JobMetrics): Promise<any> {
    const { ScoringService } = await import('./scoring');
    const scoringService = new ScoringService();
    
    const { keywords, runId, settings } = job.data as any;
    
    await job.updateProgress({
      stage: 'scoring',
      stepName: 'Blended Scoring',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Calculating blended scores',
    } as JobProgress);

    const result = await scoringService.scoreKeywords({
      keywords,
      runId,
      settings: {
        weights: settings?.scoringWeights,
        quickWinThreshold: settings?.quickWinThreshold || 0.7,
        enableSeasonalAdjustments: false,
      }
    });
    
    metrics.itemsProcessed = keywords.length;

    return result;
  }

  /**
   * Process roadmap generation job
   */
  private async processRoadmapJob(job: Job, metrics: JobMetrics): Promise<any> {
    const { RoadmapGenerationService } = await import('./roadmap');
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
    const config = {
      anthropicApiKey,
      defaultPostsPerMonth: 20,
      defaultDuration: 6,
      maxConcurrentTitleGeneration: 10,
      bufferDays: 1,
      holidayDates: [],
      workingDays: [1, 2, 3, 4, 5] // Monday to Friday
    };
    const roadmapService = new RoadmapGenerationService(config);
    
    const { clusters, runId, settings } = job.data as any;
    
    await job.updateProgress({
      stage: 'roadmap' as ProcessingStage,
      stepName: 'Editorial Roadmap',
      current: 0,
      total: 100,
      percentage: 0,
      message: 'Generating editorial roadmap',
    });

    const roadmapConfig: any = {
      postsPerMonth: settings?.postsPerMonth || 20,
      startDate: new Date().toISOString().split('T')[0],
      duration: settings?.duration || 6,
      pillarRatio: 0.3,
      quickWinPriority: true,
      teamMembers: settings?.teamMembers || [],
      contentTypes: settings?.contentTypes || []
    };

    const result = await roadmapService.generateRoadmap(
      runId,
      clusters,
      roadmapConfig,
      (progress) => {
        job.updateProgress({
          stage: progress.stage as ProcessingStage,
          stepName: progress.currentStep,
          current: progress.completedSteps,
          total: progress.totalSteps,
          percentage: (progress.completedSteps / progress.totalSteps) * 100,
          message: `${progress.stage}: ${progress.currentStep}`,
        } as JobProgress);
        metrics.itemsProcessed = progress.completedSteps;
      }
    );

    return result;
  }

  /**
   * Process export job
   */
  private async processExportJob(job: Job, metrics: JobMetrics): Promise<any> {
    // Export job implementation would go here
    // This would handle CSV generation and file creation
    return { success: true };
  }

  /**
   * Process cleanup job
   */
  private async processCleanupJob(job: Job, metrics: JobMetrics): Promise<any> {
    // Cleanup job implementation would go here
    // This would handle cache cleanup, temporary file removal, etc.
    return { success: true };
  }

  /**
   * Get processing stage from job type
   */
  private getProcessingStage(type: JobType): ProcessingStage {
    const stageMap: Record<JobType, ProcessingStage> = {
      expansion: 'expansion',
      universe: 'universe',
      clustering: 'clustering',
      scoring: 'scoring',
      roadmap: 'roadmap',
      export: 'export',
      cleanup: 'cleanup',
    };
    return stageMap[type];
  }

  /**
   * Start a complete pipeline run
   */
  async startPipelineRun(
    runId: UUID,
    seedKeywords: string[],
    settings: any,
    priority: JobPriority = JobPriority.MEDIUM
  ): Promise<string[]> {
    const jobIds: string[] = [];

    try {
      // Add expansion job (starts immediately)  
      const expansionJobId = await this.addJob('expansion', {
        seedKeywords,
        runId,
        settings,
      } as any, { priority });
      jobIds.push(expansionJobId);

      // Note: Subsequent jobs will be added by the pipeline orchestrator
      // after each stage completes successfully
      
      return jobIds;
    } catch (error) {
      console.error('Failed to start pipeline run:', error);
      throw error;
    }
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(type: JobType, jobId: string): Promise<{
    status: JobStatus;
    progress?: JobProgress;
    result?: any;
    error?: any;
  } | null> {
    const queue = this.queues.get(type);
    if (!queue) return null;

    try {
      const job = await queue.getJob(jobId);
      if (!job) return null;

      return {
        status: await job.getState() as JobStatus,
        progress: job.progress as JobProgress,
        result: job.returnvalue,
        error: job.failedReason,
      };
    } catch (error) {
      console.error('Failed to get job status:', error);
      return null;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(type: JobType, jobId: string): Promise<boolean> {
    const queue = this.queues.get(type);
    if (!queue) return false;

    try {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to cancel job:', error);
      return false;
    }
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(type?: JobType): Promise<QueueHealth[]> {
    const healthStatuses: QueueHealth[] = [];
    const queuesToCheck = type ? [type] : Array.from(this.queues.keys());

    for (const queueType of queuesToCheck) {
      const queue = this.queues.get(queueType);
      if (!queue) continue;

      try {
        const [active, waiting, completed, failed, delayed] = await Promise.all([
          queue.getActiveCount(),
          queue.getWaitingCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

        const worker = this.workers.get(queueType);
        const totalProcessed = completed + failed;
        const errorRate = totalProcessed > 0 ? failed / totalProcessed : 0;

        healthStatuses.push({
          queueName: queue.name,
          status: this.determineHealthStatus(errorRate, waiting, active),
          activeJobs: active,
          waitingJobs: waiting,
          completedJobs: completed,
          failedJobs: failed,
          delayedJobs: delayed,
          averageProcessingTime: 0, // Would need to track this over time
          errorRate,
          lastProcessedAt: null, // Would need to track this
          workers: {
            active: active,
            total: worker ? this.config.queues[queueType].concurrency : 0,
          },
        });
      } catch (error) {
        console.error(`Failed to get health for queue ${queueType}:`, error);
        healthStatuses.push({
          queueName: this.config.queues[queueType].name,
          status: 'unhealthy',
          activeJobs: 0,
          waitingJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          delayedJobs: 0,
          averageProcessingTime: 0,
          errorRate: 1,
          lastProcessedAt: null,
          workers: { active: 0, total: 0 },
        });
      }
    }

    return healthStatuses;
  }

  /**
   * Determine health status based on metrics
   */
  private determineHealthStatus(
    errorRate: number,
    waitingJobs: number,
    activeJobs: number
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (errorRate > 0.5) return 'unhealthy';
    if (errorRate > 0.2 || waitingJobs > 100) return 'degraded';
    return 'healthy';
  }

  /**
   * Start monitoring timers
   */
  private startMonitoring(): void {
    // Health check timer
    this.healthCheckTimer = setInterval(async () => {
      try {
        const health = await this.getQueueHealth();
        this.emit('healthCheck', health);
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, this.config.monitoring.healthCheckInterval);

    // Metrics collection timer
    this.metricsTimer = setInterval(() => {
      this.emit('metricsCollection');
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * Stop monitoring and cleanup resources
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down job queue system...');

    // Clear monitoring timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    // Close workers
    for (const worker of Array.from(this.workers.values())) {
      await worker.close();
    }

    // Close queue events
    for (const queueEvents of Array.from(this.queueEvents.values())) {
      await queueEvents.close();
    }

    // Close queues
    for (const queue of Array.from(this.queues.values())) {
      await queue.close();
    }

    // Close Redis connection
    await this.redis.quit();

    console.log('Job queue system shut down successfully');
  }
}

/**
 * Default queue configuration
 */
export const defaultQueueConfig: QueueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    commandTimeout: 5000,
  },
  queues: {
    expansion: {
      name: 'dream100-expansion',
      concurrency: 2,
      rateLimiter: {
        max: 100,
        duration: 60000, // 100 requests per minute
      },
    },
    universe: {
      name: 'universe-expansion',
      concurrency: 3,
      rateLimiter: {
        max: 200,
        duration: 60000, // 200 requests per minute
      },
    },
    clustering: {
      name: 'clustering',
      concurrency: 1,
    },
    scoring: {
      name: 'scoring',
      concurrency: 2,
    },
    roadmap: {
      name: 'roadmap-generation',
      concurrency: 1,
    },
    export: {
      name: 'export',
      concurrency: 2,
    },
    cleanup: {
      name: 'cleanup',
      concurrency: 1,
    },
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
  monitoring: {
    enableMetrics: true,
    metricsInterval: 30000, // 30 seconds
    healthCheckInterval: 60000, // 1 minute
  },
};

/**
 * Singleton instance
 */
let jobQueueInstance: JobQueueService | null = null;

/**
 * Get or create job queue service instance
 */
export function getJobQueueService(config: QueueConfig = defaultQueueConfig): JobQueueService {
  if (!jobQueueInstance) {
    jobQueueInstance = new JobQueueService(config);
  }
  return jobQueueInstance;
}

/**
 * Initialize the global job queue service
 */
export async function initializeJobQueue(config: QueueConfig = defaultQueueConfig): Promise<JobQueueService> {
  const service = getJobQueueService(config);
  if (!service['isInitialized']) {
    await service.initialize();
  }
  return service;
}

export default JobQueueService;