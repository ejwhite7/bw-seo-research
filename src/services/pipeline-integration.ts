/**
 * Pipeline Integration Example
 * 
 * Demonstrates how the Dream 100 Expansion Service integrates with the existing
 * ingestion service and feeds into the broader keyword research pipeline.
 */

import type {
  Run,
  UUID,
  CreateKeywordInput,
  PipelineJob,
  CreateJobInput
} from '../models';
import { IngestionService } from './ingestion';
import {
  Dream100ExpansionService,
  Dream100ExpansionRequest,
  createDream100ExpansionService
} from './expansion';

/**
 * Pipeline orchestrator that connects ingestion -> expansion -> next stages
 */
export class KeywordResearchPipeline {
  private readonly ingestionService: IngestionService;
  private readonly expansionService: Dream100ExpansionService;

  constructor(
    anthropicApiKey: string,
    ahrefsApiKey: string,
    redis?: any
  ) {
    // Initialize services
    this.ingestionService = IngestionService.getInstance();
    this.expansionService = createDream100ExpansionService(
      anthropicApiKey,
      ahrefsApiKey,
      redis
    );
  }

  /**
   * Complete pipeline from user input to Dream 100 keywords
   */
  async executeInitialPipeline(
    userId: UUID,
    seedKeywords: string[],
    settings?: {
      targetCount?: number;
      market?: string;
      industry?: string;
      budgetLimit?: number;
    }
  ) {
    const {
      targetCount = 100,
      market = 'US',
      industry,
      budgetLimit
    } = settings || {};

    try {
      // Step 1: Ingestion and validation
      console.log('🔄 Step 1: Ingesting and validating input...');
      
      const ingestionResult = await this.ingestionService.processIngestion({
        userId,
        seedKeywords,
        market,
        validateOnly: false,
        budgetLimit
      });

      if (!ingestionResult.success) {
        throw new Error(`Ingestion failed: ${ingestionResult.errors.join(', ')}`);
      }

      const runId = ingestionResult.runId!;
      console.log(`✅ Ingestion complete. Run ID: ${runId}`);
      console.log(`💰 Estimated cost: $${ingestionResult.costEstimate.total.toFixed(3)}`);

      // Step 2: Dream 100 expansion
      console.log('\n🔄 Step 2: Expanding to Dream 100 keywords...');
      
      const expansionRequest: Dream100ExpansionRequest = {
        runId,
        seedKeywords: ingestionResult.validation.seedKeywords.normalized,
        targetCount,
        market: ingestionResult.validation.market.normalized,
        industry,
        intentFocus: 'mixed',
        difficultyPreference: 'mixed',
        budgetLimit,
        qualityThreshold: 0.7
      };

      const expansionResult = await this.expansionService.expandToDream100(
        expansionRequest,
        (progress) => {
          console.log(`   📊 ${progress.stage}: ${progress.progressPercent}% (${progress.keywordsProcessed} processed)`);
        }
      );

      if (!expansionResult.success) {
        throw new Error(`Expansion failed: ${expansionResult.errors.join(', ')}`);
      }

      console.log(`✅ Dream 100 expansion complete!`);
      console.log(`🎯 Generated ${expansionResult.dream100Keywords.length} keywords`);
      console.log(`💰 Total cost: $${expansionResult.costBreakdown.totalCost.toFixed(3)}`);
      console.log(`⭐ Avg quality score: ${(expansionResult.dream100Keywords.reduce((sum, k) => sum + k.blendedScore, 0) / expansionResult.dream100Keywords.length * 100).toFixed(1)}%`);

      // Step 3: Save keywords to database (example)
      console.log('\n🔄 Step 3: Saving keywords to database...');
      
      const keywordInputs: CreateKeywordInput[] = expansionResult.dream100Keywords.map(keyword => ({
        runId,
        keyword: keyword.keyword,
        stage: 'dream100',
        volume: keyword.volume,
        difficulty: keyword.difficulty,
        intent: keyword.intent || undefined,
        relevance: keyword.relevanceScore,
        canonicalKeyword: keyword.keyword,
        topSerpUrls: [] // Would be populated from SERP data
      }));

      // In real implementation, you'd save to database here
      console.log(`📝 Prepared ${keywordInputs.length} keywords for database storage`);

      // Step 4: Prepare next stage jobs
      console.log('\n🔄 Step 4: Preparing next pipeline stages...');
      
      const nextJobs = this.createNextStageJobs(runId, expansionResult);
      console.log(`🚀 Created ${nextJobs.length} jobs for next stages`);

      return {
        success: true,
        runId,
        dream100Keywords: expansionResult.dream100Keywords,
        totalCost: ingestionResult.costEstimate.total + expansionResult.costBreakdown.totalCost,
        nextJobs,
        processingTime: expansionResult.processingStats.totalProcessingTime,
        warnings: [...ingestionResult.warnings, ...expansionResult.warnings],
        errors: [...ingestionResult.errors, ...expansionResult.errors]
      };

    } catch (error) {
      console.error('❌ Pipeline failed:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Create jobs for subsequent pipeline stages
   */
  private createNextStageJobs(
    runId: UUID,
    expansionResult: any // Dream100ExpansionResult
  ): CreateJobInput[] {
    const jobs: CreateJobInput[] = [];

    // Job 1: Tier-2 expansion using top Dream 100 keywords as seeds
    if (expansionResult.nextStageData?.tierExpansionSeeds?.length > 0) {
      jobs.push({
        runId,
        stage: 'expansion',
        priority: 8,
        data: {
          stage: 'expansion',
          input: {
            seedKeywords: expansionResult.nextStageData.tierExpansionSeeds.slice(0, 20),
            targetPerSeed: 10,
            runId
          },
          config: {
            stage: 'expansion',
            parameters: {
              maxDepth: 2,
              qualityThreshold: 0.6
            },
            timeoutMinutes: 15,
            retryStrategy: {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              initialDelayMs: 2000,
              maxDelayMs: 60000,
              retryableErrors: ['RATE_LIMIT', 'TIMEOUT']
            },
            resourceLimits: {
              maxMemory: 2048,
              maxCpu: 4,
              maxDuration: 20,
              maxApiCalls: 500,
              maxStorage: 1024
            }
          },
          resources: {
            memory: 1024,
            cpu: 2,
            apiQuota: {
              ahrefs: 500,
              anthropic: 10000
            },
            storage: 512,
            estimatedDuration: 12
          }
        }
      });
    }

    // Job 2: Competitor discovery based on Dream 100 keywords
    jobs.push({
      runId,
      stage: 'universe',
      priority: 6,
      data: {
        stage: 'universe',
        input: {
          keywords: expansionResult.dream100Keywords.slice(0, 10).map((k: any) => k.keyword),
          market: 'US',
          maxCompetitors: 20
        },
        config: {
          stage: 'universe',
          parameters: {
            serpDepth: 10,
            minDomainAuthority: 30
          },
          timeoutMinutes: 10,
          retryStrategy: {
            maxRetries: 2,
            backoffStrategy: 'linear',
            initialDelayMs: 5000,
            maxDelayMs: 30000,
            retryableErrors: ['RATE_LIMIT', 'SERVER_ERROR']
          },
          resourceLimits: {
            maxMemory: 1024,
            maxCpu: 2,
            maxDuration: 15,
            maxApiCalls: 100,
            maxStorage: 512
          }
        },
        resources: {
          memory: 512,
          cpu: 1,
          apiQuota: {
            ahrefs: 1000
          },
          storage: 256,
          estimatedDuration: 8
        }
      }
    });

    // Job 3: Semantic clustering preparation
    jobs.push({
      runId,
      stage: 'clustering',
      priority: 4,
      dependencies: ['tier2_expansion'], // Wait for tier-2 expansion
      data: {
        stage: 'clustering',
        input: {
          keywords: expansionResult.dream100Keywords.map((k: any) => k.keyword),
          targetClusters: Math.ceil(expansionResult.dream100Keywords.length / 8),
          clusteringMethod: 'semantic'
        },
        config: {
          stage: 'clustering',
          parameters: {
            minClusterSize: 3,
            maxClusterSize: 15,
            similarityThreshold: 0.7
          },
          timeoutMinutes: 8,
          retryStrategy: {
            maxRetries: 2,
            backoffStrategy: 'exponential',
            initialDelayMs: 3000,
            maxDelayMs: 30000,
            retryableErrors: ['TIMEOUT', 'SERVER_ERROR']
          },
          resourceLimits: {
            maxMemory: 3072,
            maxCpu: 4,
            maxDuration: 12,
            maxApiCalls: 50,
            maxStorage: 1024
          }
        },
        resources: {
          memory: 2048,
          cpu: 2,
          apiQuota: {
            anthropic: 20000
          },
          storage: 512,
          estimatedDuration: 6
        }
      }
    });

    return jobs;
  }

  /**
   * Get pipeline status and progress
   */
  async getPipelineStatus(runId: UUID) {
    // In real implementation, this would query the job queue/database
    // to get current status of all pipeline stages
    
    return {
      runId,
      status: 'running', // running | completed | failed | paused
      currentStage: 'tier2_expansion',
      stagesCompleted: ['initialization', 'dream100_generation'],
      stagesPending: ['tier2_expansion', 'competitor_discovery', 'semantic_clustering'],
      progressPercent: 35,
      estimatedTimeRemaining: 15 * 60, // seconds
      totalCost: 2.45,
      keywordsGenerated: 100,
      errors: [],
      warnings: []
    };
  }

  /**
   * Cancel a running pipeline
   */
  async cancelPipeline(runId: UUID) {
    // Implementation would cancel all pending jobs for this run
    console.log(`🛑 Cancelling pipeline for run ${runId}`);
    
    // Return cancellation result
    return {
      success: true,
      runId,
      cancelledJobs: 3,
      refund: 0.50 // Any unused credits
    };
  }

  /**
   * Get service health across all pipeline components
   */
  getOverallHealth() {
    const ingestionHealth = { status: 'healthy' }; // this.ingestionService.getHealth()
    const expansionHealth = this.expansionService.getServiceHealth();
    
    const overallStatus = 
      ingestionHealth.status === 'healthy' && expansionHealth.status === 'healthy'
        ? 'healthy'
        : 'degraded';
    
    return {
      status: overallStatus,
      components: {
        ingestion: ingestionHealth.status,
        expansion: expansionHealth.status,
        anthropic: expansionHealth.integrations.anthropic,
        ahrefs: expansionHealth.integrations.ahrefs
      },
      lastHealthCheck: new Date().toISOString()
    };
  }
}

/**
 * Factory function for creating pipeline instances
 */
export const createKeywordResearchPipeline = (
  anthropicApiKey: string,
  ahrefsApiKey: string,
  redis?: any
): KeywordResearchPipeline => {
  return new KeywordResearchPipeline(anthropicApiKey, ahrefsApiKey, redis);
};

/**
 * Example usage in Next.js API route
 */
export const pipelineApiHandler = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, seedKeywords, settings } = req.body;

  if (!userId || !seedKeywords || seedKeywords.length === 0) {
    return res.status(400).json({ 
      error: 'Missing required fields: userId, seedKeywords' 
    });
  }

  try {
    const pipeline = createKeywordResearchPipeline(
      process.env.ANTHROPIC_API_KEY!,
      process.env.AHREFS_API_KEY!
    );

    const result = await pipeline.executeInitialPipeline(
      userId,
      seedKeywords,
      settings
    );

    res.status(200).json(result);

  } catch (error) {
    console.error('Pipeline API error:', error);
    res.status(500).json({ 
      error: 'Pipeline execution failed',
      message: (error as Error).message 
    });
  }
};
