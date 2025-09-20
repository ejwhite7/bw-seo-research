/**
 * Pipeline Data Models
 * 
 * Processing pipeline structures, job queues, and workflow
 * orchestration for the 5-stage keyword research process.
 */

import { z } from 'zod';
import type { UUID, Timestamp, JSONValue } from './index';
import type { ProcessingStage } from './run';
import { ProcessingStageSchema } from './run';

// Re-export ProcessingStage for easier access
export type { ProcessingStage };
import type { KeywordStage } from '../types/database';

/**
 * Pipeline job definition
 */
export interface PipelineJob {
  readonly id: UUID;
  readonly runId: UUID;
  readonly stage: ProcessingStage;
  readonly status: JobStatus;
  readonly priority: number; // 1-10, higher = more urgent
  readonly data: JobData;
  readonly result: JobResult | null;
  readonly error: JobError | null;
  readonly metadata: JobMetadata;
  readonly createdAt: Timestamp;
  readonly startedAt: Timestamp | null;
  readonly completedAt: Timestamp | null;
  readonly retryCount: number;
  readonly maxRetries: number;
}

/**
 * Job status enumeration
 */
export type JobStatus = 
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retrying'
  | 'paused';

/**
 * Job input data structure
 */
export interface JobData {
  readonly stage: ProcessingStage;
  readonly input: JSONValue;
  readonly config: StageConfig;
  readonly dependencies: UUID[]; // job IDs this job depends on
  readonly resources: ResourceRequirements;
}

/**
 * Job progress tracking
 */
export interface JobProgress {
  readonly jobId: UUID;
  readonly runId?: UUID;
  readonly stage: ProcessingStage;
  readonly status: JobStatus;
  readonly progress: number; // 0-100
  readonly percentage: number; // 0-100 (alias for progress)
  readonly message: string;
  readonly currentStep: string;
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly itemsProcessed?: number;
  readonly totalItems?: number;
  readonly estimatedTimeRemaining: number; // minutes
  readonly startedAt?: Timestamp | null;
  readonly estimatedCompletionAt?: Timestamp | null;
  readonly error?: string;
  readonly artifacts: JobArtifact[];
  readonly metrics: JobMetrics;
  readonly metadata?: Record<string, unknown>; // Additional progress metadata
  readonly lastUpdated: Timestamp;
}

/**
 * Stage-specific configuration
 */
export interface StageConfig {
  readonly stage: ProcessingStage;
  readonly parameters: Record<string, JSONValue>;
  readonly timeoutMinutes: number;
  readonly retryStrategy: RetryStrategy;
  readonly resourceLimits: ResourceLimits;
}

/**
 * Resource requirements for job execution
 */
export interface ResourceRequirements {
  readonly memory: number; // MB
  readonly cpu: number; // cores
  readonly apiQuota: {
    readonly ahrefs?: number; // requests
    readonly anthropic?: number; // tokens
  };
  readonly storage: number; // MB
  readonly estimatedDuration: number; // minutes
}

/**
 * Resource limits for job execution
 */
export interface ResourceLimits {
  readonly maxMemory: number; // MB
  readonly maxCpu: number; // cores
  readonly maxDuration: number; // minutes
  readonly maxApiCalls: number;
  readonly maxStorage: number; // MB
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  readonly maxRetries: number;
  readonly backoffStrategy: 'linear' | 'exponential' | 'fixed';
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly retryableErrors: string[]; // error codes that should trigger retry
}

/**
 * Job execution result
 */
export interface JobResult {
  readonly success: boolean;
  readonly output: JSONValue;
  readonly metrics: JobMetrics;
  readonly artifacts: JobArtifact[];
  readonly warnings: string[];
  readonly nextJobs?: CreateJobInput[]; // jobs to create after this one
}

/**
 * Job execution error
 */
export interface JobError {
  readonly code: string;
  readonly message: string;
  readonly details: JSONValue;
  readonly isRetryable: boolean;
  readonly suggestion?: string;
  readonly stackTrace?: string;
}

/**
 * Job execution metrics
 */
export interface JobMetrics {
  readonly executionTime: number; // milliseconds
  readonly memoryUsed: number; // MB
  readonly cpuTime: number; // milliseconds
  readonly apiCalls: {
    readonly ahrefs?: number;
    readonly anthropic?: number;
    readonly scraper?: number;
  };
  readonly dataProcessed: {
    readonly input: number; // records
    readonly output: number; // records
    readonly errors: number;
  };
  readonly costs: {
    readonly total: number;
    readonly ahrefs?: number;
    readonly anthropic?: number;
    readonly compute?: number;
  };
}

/**
 * Worker progress update (simplified for real-time updates)
 */
export interface WorkerProgress {
  stage: string;
  stepName: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
  estimatedTimeRemaining?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Job metadata and context
 */
export interface JobMetadata {
  readonly userId: UUID;
  readonly workerId?: string;
  readonly environment: 'development' | 'staging' | 'production';
  readonly version: string;
  readonly tags: string[];
  readonly parentJobId?: UUID;
  readonly correlationId?: UUID;
  readonly traceId?: string;
}

/**
 * Job artifact (files, reports, etc.)
 */
export interface JobArtifact {
  readonly id: UUID;
  readonly type: 'file' | 'report' | 'data' | 'log';
  readonly name: string;
  readonly path: string;
  readonly size: number; // bytes
  readonly contentType: string;
  readonly checksum: string;
  readonly expiresAt?: Timestamp;
}

/**
 * Pipeline workflow definition
 */
export interface PipelineWorkflow {
  readonly id: UUID;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly stages: WorkflowStage[];
  readonly dependencies: WorkflowDependency[];
  readonly configuration: WorkflowConfig;
  readonly isActive: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/**
 * Workflow stage definition
 */
export interface WorkflowStage {
  readonly id: string;
  readonly name: string;
  readonly stage: ProcessingStage;
  readonly config: StageConfig;
  readonly parallelism: number; // max concurrent jobs
  readonly required: boolean;
  readonly condition?: string; // conditional execution logic
}

/**
 * Workflow dependency between stages
 */
export interface WorkflowDependency {
  readonly fromStage: string;
  readonly toStage: string;
  readonly condition?: string; // optional condition for dependency
  readonly waitForAll: boolean; // wait for all jobs in from stage
}

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  readonly maxConcurrentJobs: number;
  readonly timeoutMinutes: number;
  readonly retryFailedStages: boolean;
  readonly failureStrategy: 'stop' | 'continue' | 'skip_dependent';
  readonly notifications: {
    readonly onSuccess: boolean;
    readonly onFailure: boolean;
    readonly onTimeout: boolean;
  };
  readonly cleanup: {
    readonly deleteArtifacts: boolean;
    readonly retentionDays: number;
  };
}

/**
 * Pipeline execution context
 */
export interface PipelineExecution {
  readonly id: UUID;
  readonly runId: UUID;
  readonly workflowId: UUID;
  readonly status: ExecutionStatus;
  readonly progress: ExecutionProgress;
  readonly jobs: PipelineJob[];
  readonly startedAt: Timestamp;
  readonly completedAt: Timestamp | null;
  readonly totalDuration: number | null; // minutes
  readonly error: ExecutionError | null;
}

/**
 * Execution status enumeration
 */
export type ExecutionStatus = 
  | 'initializing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/**
 * Execution progress tracking
 */
export interface ExecutionProgress {
  readonly currentStage: ProcessingStage | null;
  readonly stagesCompleted: ProcessingStage[];
  readonly jobsTotal: number;
  readonly jobsCompleted: number;
  readonly jobsFailed: number;
  readonly percentComplete: number;
  readonly estimatedTimeRemaining: number; // minutes
  readonly throughput: {
    readonly jobsPerMinute: number;
    readonly recordsPerMinute: number;
  };
}

// JobProgress interface merged with the main definition above

/**
 * Execution error information
 */
export interface ExecutionError {
  readonly stage: ProcessingStage;
  readonly jobId: UUID;
  readonly error: JobError;
  readonly canRetry: boolean;
  readonly affectedJobs: UUID[];
}

/**
 * Job creation input
 */
export interface CreateJobInput {
  readonly runId: UUID;
  readonly stage: ProcessingStage;
  readonly priority?: number;
  readonly data: Omit<JobData, 'dependencies'>;
  readonly dependencies?: UUID[];
  readonly metadata?: Partial<JobMetadata>;
}

/**
 * Job queue configuration
 */
export interface JobQueueConfig {
  readonly name: string;
  readonly concurrency: number;
  readonly rateLimiting: {
    readonly maxJobsPerMinute: number;
    readonly burstCapacity: number;
  };
  readonly deadLetterQueue: {
    readonly enabled: boolean;
    readonly maxRetries: number;
  };
  readonly monitoring: {
    readonly metricsEnabled: boolean;
    readonly alertThresholds: {
      readonly queueDepth: number;
      readonly avgProcessingTime: number; // minutes
      readonly errorRate: number; // percentage
    };
  };
}

/**
 * Worker node information
 */
export interface WorkerNode {
  readonly id: string;
  readonly name: string;
  readonly status: 'online' | 'offline' | 'busy' | 'maintenance';
  readonly capabilities: string[]; // stages this worker can handle
  readonly resources: {
    readonly memory: { used: number; total: number }; // MB
    readonly cpu: { used: number; total: number }; // percentage
    readonly storage: { used: number; total: number }; // MB
  };
  readonly performance: {
    readonly jobsProcessed: number;
    readonly avgProcessingTime: number; // minutes
    readonly successRate: number; // percentage
    readonly lastJobCompletedAt: Timestamp | null;
  };
  readonly lastHeartbeat: Timestamp;
}

/**
 * Pipeline analytics and monitoring
 */
export interface PipelineAnalytics {
  readonly period: {
    readonly start: Timestamp;
    readonly end: Timestamp;
  };
  readonly overview: {
    readonly totalExecutions: number;
    readonly successfulExecutions: number;
    readonly failedExecutions: number;
    readonly avgExecutionTime: number; // minutes
    readonly totalJobsProcessed: number;
  };
  readonly stagePerformance: Array<{
    readonly stage: ProcessingStage;
    readonly avgDuration: number; // minutes
    readonly successRate: number; // percentage
    readonly errorRate: number; // percentage
    readonly throughput: number; // jobs per hour
  }>;
  readonly resourceUtilization: {
    readonly avgMemoryUsage: number; // percentage
    readonly avgCpuUsage: number; // percentage
    readonly peakConcurrentJobs: number;
  };
  readonly costs: {
    readonly total: number;
    readonly byProvider: Record<string, number>;
    readonly avgCostPerRun: number;
  };
  readonly trends: {
    readonly executionTimes: Array<{ date: string; avgTime: number }>;
    readonly successRates: Array<{ date: string; rate: number }>;
    readonly costs: Array<{ date: string; cost: number }>;
  };
}

/**
 * Validation schemas using Zod
 */
export const JobStatusSchema = z.enum([
  'queued', 'processing', 'completed', 'failed', 'cancelled', 'retrying', 'paused'
]);

// ProcessingStageSchema imported from run.ts to avoid duplication

export const ResourceRequirementsSchema = z.object({
  memory: z.number().int().min(128).max(16384).default(512),
  cpu: z.number().min(0.1).max(8).default(1),
  apiQuota: z.object({
    ahrefs: z.number().int().min(0).optional(),
    anthropic: z.number().int().min(0).optional()
  }).optional(),
  storage: z.number().int().min(10).max(10240).default(100),
  estimatedDuration: z.number().min(1).max(1440).default(5)
});

export const RetryStrategySchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  backoffStrategy: z.enum(['linear', 'exponential', 'fixed']).default('exponential'),
  initialDelayMs: z.number().int().min(1000).max(300000).default(5000),
  maxDelayMs: z.number().int().min(5000).max(1800000).default(300000),
  retryableErrors: z.array(z.string()).default(['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR'])
});

export const StageConfigSchema = z.object({
  stage: ProcessingStageSchema,
  parameters: z.record(z.string(), z.unknown()).default({}),
  timeoutMinutes: z.number().int().min(1).max(60).default(10),
  retryStrategy: RetryStrategySchema,
  resourceLimits: z.object({
    maxMemory: z.number().int().min(256).max(32768).default(2048),
    maxCpu: z.number().min(0.5).max(16).default(4),
    maxDuration: z.number().int().min(5).max(120).default(30),
    maxApiCalls: z.number().int().min(10).max(10000).default(1000),
    maxStorage: z.number().int().min(50).max(20480).default(1024)
  })
});

export const CreateJobInputSchema = z.object({
  runId: z.string().uuid(),
  stage: ProcessingStageSchema,
  priority: z.number().int().min(1).max(10).default(5),
  data: z.object({
    stage: ProcessingStageSchema,
    input: z.unknown(),
    config: StageConfigSchema,
    resources: ResourceRequirementsSchema
  }),
  dependencies: z.array(z.string().uuid()).default([]),
  metadata: z.object({
    userId: z.string().uuid(),
    environment: z.enum(['development', 'staging', 'production']).default('production'),
    version: z.string().default('1.0.0'),
    tags: z.array(z.string()).default([]),
    parentJobId: z.string().uuid().optional(),
    correlationId: z.string().uuid().optional(),
    traceId: z.string().optional()
  }).partial().optional()
});

export const JobQueueConfigSchema = z.object({
  name: z.string().min(1).max(50),
  concurrency: z.number().int().min(1).max(100).default(10),
  rateLimiting: z.object({
    maxJobsPerMinute: z.number().int().min(1).max(1000).default(100),
    burstCapacity: z.number().int().min(1).max(500).default(50)
  }),
  deadLetterQueue: z.object({
    enabled: z.boolean().default(true),
    maxRetries: z.number().int().min(1).max(10).default(5)
  }),
  monitoring: z.object({
    metricsEnabled: z.boolean().default(true),
    alertThresholds: z.object({
      queueDepth: z.number().int().min(10).max(10000).default(1000),
      avgProcessingTime: z.number().min(1).max(60).default(15),
      errorRate: z.number().min(0).max(100).default(10)
    })
  })
});

/**
 * Type guards for runtime type checking
 */
export const isJobStatus = (value: unknown): value is JobStatus => {
  return typeof value === 'string' && [
    'queued', 'processing', 'completed', 'failed', 'cancelled', 'retrying', 'paused'
  ].includes(value);
};

export const isPipelineJob = (value: unknown): value is PipelineJob => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.runId === 'string' &&
    typeof obj.stage === 'string' &&
    isJobStatus(obj.status) &&
    typeof obj.priority === 'number' &&
    typeof obj.createdAt === 'string'
  );
};

export const isExecutionStatus = (value: unknown): value is ExecutionStatus => {
  return typeof value === 'string' && [
    'initializing', 'running', 'paused', 'completed', 'failed', 'cancelled', 'timeout'
  ].includes(value);
};

/**
 * Utility functions for pipeline operations
 */
export const calculateJobPriority = (
  stage: ProcessingStage,
  dependencies: UUID[],
  userPriority?: number
): number => {
  // Base priority by stage (critical path gets higher priority)
  const stagePriorities: Record<ProcessingStage, number> = {
    'initialization': 15,
    'expansion': 12,
    'universe': 9,
    'clustering': 5,
    'scoring': 3,
    'roadmap': 2,
    'export': 1,
    'cleanup': 1
  };
  
  let priority = stagePriorities[stage];
  
  // Reduce priority if it has many dependencies (not on critical path)
  if (dependencies.length > 3) {
    priority = Math.max(1, priority - 2);
  }
  
  // Apply user override if provided
  if (userPriority !== undefined) {
    priority = Math.max(1, Math.min(10, userPriority));
  }
  
  return priority;
};

export const estimateJobDuration = (
  stage: ProcessingStage,
  inputSize: number
): number => {
  // Base duration estimates in minutes
  const baseDurations: Record<ProcessingStage, number> = {
    'initialization': 1,
    'expansion': 5,
    'universe': 12,
    'clustering': 8,
    'scoring': 3,
    'roadmap': 2,
    'export': 1,
    'cleanup': 1
  };
  
  const baseDuration = baseDurations[stage];
  
  // Scale based on input size (rough estimate)
  const scaleFactor = Math.max(1, Math.log10(inputSize + 1) / 3);
  
  return Math.ceil(baseDuration * scaleFactor);
};

export const getResourceRequirements = (
  stage: ProcessingStage,
  inputSize: number
): ResourceRequirements => {
  const baseMemory = stage.includes('clustering') ? 1024 : 512;
  const baseCpu = stage.includes('scraping') ? 2 : 1;
  
  // Scale resources based on input size
  const scaleFactor = Math.max(1, Math.sqrt(inputSize / 1000));
  
  return {
    memory: Math.min(4096, Math.ceil(baseMemory * scaleFactor)),
    cpu: Math.min(4, baseCpu * Math.min(2, scaleFactor)),
    apiQuota: {
      ahrefs: stage.includes('metrics') || stage.includes('competitor') ? Math.ceil(inputSize * 0.1) : undefined,
      anthropic: stage.includes('generation') || stage.includes('clustering') ? Math.ceil(inputSize * 0.05) : undefined
    },
    storage: Math.min(2048, Math.ceil(100 * scaleFactor)),
    estimatedDuration: estimateJobDuration(stage, inputSize)
  };
};

export const createJobGraph = (
  stages: ProcessingStage[],
  runId: UUID
): Array<{ stage: ProcessingStage; dependencies: ProcessingStage[] }> => {
  const dependencies: Record<ProcessingStage, ProcessingStage[]> = {
    'initialization': [],
    'expansion': ['initialization'],
    'universe': ['expansion'],
    'clustering': ['universe'],
    'scoring': ['clustering'],
    'roadmap': ['scoring'],
    'export': ['roadmap'],
    'cleanup': ['export']
  };
  
  return stages.map(stage => ({
    stage,
    dependencies: dependencies[stage] || []
  }));
};

export const getJobStatusColor = (status: JobStatus): string => {
  switch (status) {
    case 'queued': return 'gray';
    case 'processing': return 'blue';
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'cancelled': return 'orange';
    case 'retrying': return 'yellow';
    case 'paused': return 'purple';
    default: return 'gray';
  }
};

export const getJobStatusDisplayName = (status: JobStatus): string => {
  const displayNames: Record<JobStatus, string> = {
    'queued': 'Queued',
    'processing': 'Processing',
    'completed': 'Completed',
    'failed': 'Failed',
    'cancelled': 'Cancelled',
    'retrying': 'Retrying',
    'paused': 'Paused'
  };
  
  return displayNames[status] || status;
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)}s`;
  } else if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
};

export const calculateThroughput = (
  completedJobs: number,
  timeElapsedMinutes: number
): number => {
  if (timeElapsedMinutes === 0) return 0;
  return completedJobs / timeElapsedMinutes;
};

export const predictCompletionTime = (
  remainingJobs: number,
  avgJobDuration: number,
  concurrency: number
): number => {
  if (remainingJobs === 0 || avgJobDuration === 0) return 0;
  return Math.ceil((remainingJobs * avgJobDuration) / concurrency);
};