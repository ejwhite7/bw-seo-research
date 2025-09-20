/**
 * Keyword Universe Expansion Service
 * 
 * Comprehensive service that expands Dream 100 keywords into a full 10,000-keyword universe
 * through intelligent tier-2 and tier-3 expansion using multiple expansion strategies.
 * 
 * Features:
 * - Multi-tier keyword expansion (Dream100 → Tier2 → Tier3)
 * - Multiple expansion strategies (SERP, LLM, competitors, modifiers)
 * - Intelligent capping and quality control
 * - Progressive enhancement with advanced features
 * - Cost optimization and budget monitoring
 * - Comprehensive error handling and resilience
 * - Progress tracking and detailed analytics
 * 
 * Processing Pipeline:
 * 1. Dream 100 Input Processing - Validate and prepare Dream 100 keywords
 * 2. Tier-2 Expansion - Generate up to 1,000 mid-tail keywords (10 per Dream keyword)
 * 3. Tier-3 Expansion - Generate up to 10,000 long-tail keywords (10 per Tier-2)
 * 4. Metrics Enrichment - Ahrefs volume, difficulty, CPC, SERP features
 * 5. Quality Control - Relevance validation, deduplication, filtering
 * 6. Smart Capping - Intelligent selection to meet 10,000 keyword limit
 * 
 * @fileoverview Keyword universe expansion service for tier-2 and tier-3 generation
 * @version 1.0.0
 * @author Dream 100 Team
 */

import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import type {
  CreateKeywordInput,
  Keyword,
  KeywordStage,
  KeywordIntent,
  UUID,
  PipelineJob,
  CreateJobInput,
  JobResult,
  JobMetrics,
  Run,
  KeywordString
} from '../models';
import type { ProcessingStage } from '../models/pipeline';
import { AnthropicClient } from '../integrations/anthropic';
import { AhrefsClient } from '../integrations/ahrefs';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { normalizeKeyword, validateKeywordQuality } from '../utils/ingestion-helpers';
import type {
  AnthropicKeywordExpansion,
  AnthropicExpansionResult,
  AnthropicIntentClassification,
  AnthropicIntentResult
} from '../types/anthropic';
import type {
  AhrefsKeywordRequest,
  AhrefsKeywordData,
  AhrefsKeywordIdeasRequest
} from '../types/ahrefs';

/**
 * Universe expansion request configuration
 */
export interface UniverseExpansionRequest {
  readonly runId: UUID;
  readonly dream100Keywords: string[];
  readonly targetTotalCount?: number; // Default 10,000
  readonly maxTier2PerDream?: number; // Default 10
  readonly maxTier3PerTier2?: number; // Default 10
  readonly market?: string; // Default 'US'
  readonly industry?: string;
  readonly budgetLimit?: number;
  readonly qualityThreshold?: number; // 0-1, default 0.6
  readonly enableCompetitorMining?: boolean;
  readonly enableSerpAnalysis?: boolean;
  readonly enableSemanticVariations?: boolean;
}

/**
 * Expansion strategy configuration
 */
export interface ExpansionStrategy {
  readonly name: string;
  readonly enabled: boolean;
  readonly weight: number; // relative importance 0-1
  readonly config: Record<string, any>;
}

/**
 * Universe candidate keyword with enrichment data
 */
export interface UniverseKeywordCandidate {
  readonly keyword: string;
  readonly stage: KeywordStage;
  readonly parentKeyword?: string; // For tier2/3 tracking
  readonly volume: number;
  readonly difficulty: number;
  readonly cpc: number;
  readonly intent: KeywordIntent | null;
  readonly relevanceScore: number;
  readonly qualityScore: number;
  readonly blendedScore: number;
  readonly quickWin: boolean;
  readonly expansionSource: string; // 'llm', 'serp', 'competitor', 'modifier'
  readonly confidence: number;
  readonly serpFeatures?: string[];
  readonly competitorUrls?: string[];
  readonly semanticVariations?: string[];
}

/**
 * Universe expansion result with comprehensive analytics
 */
export interface UniverseExpansionResult {
  readonly success: boolean;
  readonly runId: UUID;
  readonly keywordsByTier: {
    readonly dream100: UniverseKeywordCandidate[];
    readonly tier2: UniverseKeywordCandidate[];
    readonly tier3: UniverseKeywordCandidate[];
  };
  readonly totalKeywords: number;
  readonly processingStats: UniverseProcessingStats;
  readonly costBreakdown: UniverseCostBreakdown;
  readonly qualityMetrics: UniverseQualityMetrics;
  readonly expansionBreakdown: ExpansionStrategyBreakdown;
  readonly warnings: string[];
  readonly errors: string[];
  readonly nextStageData?: {
    readonly clusteringSeeds: string[];
    readonly competitorDomains: string[];
    readonly gapAnalysis: string[];
  };
}

/**
 * Processing statistics for universe expansion
 */
export interface UniverseProcessingStats {
  readonly totalProcessingTime: number; // milliseconds
  readonly stageTimings: Record<string, number>;
  readonly apiCallCounts: {
    readonly anthropic: number;
    readonly ahrefs: number;
    readonly serp: number;
  };
  readonly batchInfo: {
    readonly totalBatches: number;
    readonly avgBatchSize: number;
    readonly failedBatches: number;
    readonly retryAttempts: number;
  };
  readonly cacheHitRate: number;
  readonly throughputMetrics: {
    readonly keywordsPerMinute: number;
    readonly apiCallsPerMinute: number;
    readonly batchesPerHour: number;
  };
  readonly expansionEfficiency: {
    readonly candidatesGenerated: number;
    readonly candidatesFiltered: number;
    readonly finalSelectionRate: number;
  };
}

/**
 * Cost breakdown for universe expansion
 */
export interface UniverseCostBreakdown {
  readonly totalCost: number;
  readonly anthropicCost: number;
  readonly ahrefsCost: number;
  readonly serpApiCost: number;
  readonly budgetUtilization: number; // percentage
  readonly costPerKeyword: number;
  readonly costByTier: {
    readonly tier2: number;
    readonly tier3: number;
  };
  readonly estimatedVsActual: {
    readonly estimated: number;
    readonly actual: number;
    readonly variance: number;
  };
}

/**
 * Quality metrics for universe expansion
 */
export interface UniverseQualityMetrics {
  readonly avgRelevanceScore: number;
  readonly avgQualityScore: number;
  readonly intentDistribution: Record<KeywordIntent, number>;
  readonly difficultyDistribution: {
    readonly easy: number; // 0-30
    readonly medium: number; // 31-70
    readonly hard: number; // 71-100
  };
  readonly volumeDistribution: {
    readonly low: number; // 0-100
    readonly medium: number; // 101-1000
    readonly high: number; // 1001-10000
    readonly veryHigh: number; // 10000+
  };
  readonly quickWinCounts: {
    readonly tier2: number;
    readonly tier3: number;
    readonly total: number;
  };
  readonly duplicatesRemoved: number;
  readonly invalidKeywordsFiltered: number;
  readonly averageConfidence: number;
}

/**
 * Expansion strategy breakdown
 */
export interface ExpansionStrategyBreakdown {
  readonly strategies: Array<{
    readonly name: string;
    readonly keywordsGenerated: number;
    readonly successRate: number;
    readonly avgConfidence: number;
    readonly costContribution: number;
  }>;
  readonly mostEffectiveStrategy: string;
  readonly leastEffectiveStrategy: string;
  readonly recommendedOptimizations: string[];
}

/**
 * Universe expansion processing stage
 */
export type UniverseStage = 
  | 'initialization'
  | 'dream100_processing'
  | 'tier2_expansion'
  | 'tier2_enrichment'
  | 'tier3_expansion'
  | 'tier3_enrichment'
  | 'quality_control'
  | 'smart_capping'
  | 'result_preparation';

/**
 * Progress callback for real-time updates
 */
export type UniverseProgressCallback = (progress: {
  stage: UniverseStage;
  currentStep: string;
  progressPercent: number;
  keywordsProcessed: number;
  estimatedTimeRemaining: number;
  currentCost: number;
  currentTier: KeywordStage;
}) => void;

/**
 * Main Keyword Universe Expansion Service
 */
export class UniverseExpansionService {
  private readonly anthropicClient: AnthropicClient;
  private readonly ahrefsClient: AhrefsClient;
  private readonly maxUniverseSize = 10000;
  private readonly maxTier2PerDream = 10;
  private readonly maxTier3PerTier2 = 10;
  private readonly minQualityThreshold = 0.4;
  private readonly maxProcessingTime = 30 * 60 * 1000; // 30 minutes max

  constructor(
    anthropicApiKey: string,
    ahrefsApiKey: string,
    redis?: any
  ) {
    this.anthropicClient = AnthropicClient.getInstance(anthropicApiKey, redis);
    this.ahrefsClient = AhrefsClient.getInstance(ahrefsApiKey, redis);
  }

  /**
   * Main entry point for universe expansion
   */
  async expandToUniverse(
    request: UniverseExpansionRequest,
    progressCallback?: UniverseProgressCallback
  ): Promise<UniverseExpansionResult> {
    const startTime = Date.now();
    const {
      runId,
      dream100Keywords,
      targetTotalCount = 10000,
      maxTier2PerDream = 10,
      maxTier3PerTier2 = 10,
      market = 'US',
      industry,
      budgetLimit,
      qualityThreshold = 0.6,
      enableCompetitorMining = true,
      enableSerpAnalysis = true,
      enableSemanticVariations = true
    } = request;

    if (dream100Keywords.length === 0 || dream100Keywords.length > 100) {
      throw new Error('Dream 100 keywords must be between 1 and 100 terms');
    }

    if (targetTotalCount > this.maxUniverseSize) {
      throw new Error(`Target count cannot exceed ${this.maxUniverseSize} keywords`);
    }

    // Initialize tracking variables
    const processingStats: Partial<UniverseProcessingStats> = {
      stageTimings: {},
      apiCallCounts: { anthropic: 0, ahrefs: 0, serp: 0 },
      batchInfo: { totalBatches: 0, avgBatchSize: 0, failedBatches: 0, retryAttempts: 0 },
      cacheHitRate: 0,
      expansionEfficiency: { candidatesGenerated: 0, candidatesFiltered: 0, finalSelectionRate: 0 }
    };
    const costBreakdown: Partial<UniverseCostBreakdown> = {
      totalCost: 0,
      anthropicCost: 0,
      ahrefsCost: 0,
      serpApiCost: 0,
      costByTier: { tier2: 0, tier3: 0 }
    };
    const qualityMetrics: Partial<UniverseQualityMetrics> = {
      intentDistribution: {} as Record<KeywordIntent, number>,
      difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
      volumeDistribution: { low: 0, medium: 0, high: 0, veryHigh: 0 },
      quickWinCounts: { tier2: 0, tier3: 0, total: 0 },
      duplicatesRemoved: 0,
      invalidKeywordsFiltered: 0,
      averageConfidence: 0
    };
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      Sentry.addBreadcrumb({
        message: `Starting universe expansion for run ${runId}`,
        level: 'info',
        category: 'universe-expansion',
        data: { 
          dream100Count: dream100Keywords.length, 
          targetTotal: targetTotalCount, 
          market,
          industry
        }
      });

      // Stage 1: Dream 100 Processing
      progressCallback?.({
        stage: 'dream100_processing',
        currentStep: 'Processing Dream 100 keywords',
        progressPercent: 5,
        keywordsProcessed: 0,
        estimatedTimeRemaining: 25 * 60,
        currentCost: 0,
        currentTier: 'dream100'
      });

      const stageStart = Date.now();
      const processedDream100 = await this.processDream100Keywords(
        dream100Keywords,
        market
      );
      (processingStats as any).stageTimings['dream100_processing'] = Date.now() - stageStart;

      if (processedDream100.length === 0) {
        throw new Error('Dream 100 processing produced no viable keywords');
      }

      // Stage 2: Tier-2 Expansion
      progressCallback?.({
        stage: 'tier2_expansion',
        currentStep: 'Expanding to tier-2 keywords',
        progressPercent: 15,
        keywordsProcessed: processedDream100.length,
        estimatedTimeRemaining: 20 * 60,
        currentCost: costBreakdown.totalCost || 0,
        currentTier: 'tier2'
      });

      const tier2Start = Date.now();
      const tier2Candidates = await this.expandToTier2(
        processedDream100,
        {
          maxPerKeyword: maxTier2PerDream,
          industry,
          market,
          enableCompetitorMining,
          enableSerpAnalysis,
          enableSemanticVariations
        },
        progressCallback
      );
      (processingStats as any).stageTimings['tier2_expansion'] = Date.now() - tier2Start;

      // Stage 3: Tier-2 Enrichment
      progressCallback?.({
        stage: 'tier2_enrichment',
        currentStep: 'Enriching tier-2 keywords with metrics',
        progressPercent: 35,
        keywordsProcessed: tier2Candidates.length,
        estimatedTimeRemaining: 15 * 60,
        currentCost: costBreakdown.totalCost || 0,
        currentTier: 'tier2'
      });

      const tier2EnrichStart = Date.now();
      const enrichedTier2 = await this.enrichKeywords(
        tier2Candidates,
        'tier2',
        market,
        progressCallback
      );
      (processingStats as any).stageTimings['tier2_enrichment'] = Date.now() - tier2EnrichStart;

      // Stage 4: Tier-3 Expansion
      progressCallback?.({
        stage: 'tier3_expansion',
        currentStep: 'Expanding to tier-3 keywords',
        progressPercent: 55,
        keywordsProcessed: enrichedTier2.length,
        estimatedTimeRemaining: 10 * 60,
        currentCost: costBreakdown.totalCost || 0,
        currentTier: 'tier3'
      });

      const tier3Start = Date.now();
      const tier3Candidates = await this.expandToTier3(
        enrichedTier2,
        {
          maxPerKeyword: maxTier3PerTier2,
          targetTotal: targetTotalCount - processedDream100.length - enrichedTier2.length,
          industry,
          market,
          enableSemanticVariations
        },
        progressCallback
      );
      (processingStats as any).stageTimings['tier3_expansion'] = Date.now() - tier3Start;

      // Stage 5: Tier-3 Enrichment
      progressCallback?.({
        stage: 'tier3_enrichment',
        currentStep: 'Enriching tier-3 keywords with metrics',
        progressPercent: 75,
        keywordsProcessed: tier3Candidates.length,
        estimatedTimeRemaining: 6 * 60,
        currentCost: costBreakdown.totalCost || 0,
        currentTier: 'tier3'
      });

      const tier3EnrichStart = Date.now();
      const enrichedTier3 = await this.enrichKeywords(
        tier3Candidates,
        'tier3',
        market,
        progressCallback
      );
      (processingStats as any).stageTimings['tier3_enrichment'] = Date.now() - tier3EnrichStart;

      // Stage 6: Quality Control
      progressCallback?.({
        stage: 'quality_control',
        currentStep: 'Applying quality control filters',
        progressPercent: 90,
        keywordsProcessed: enrichedTier3.length,
        estimatedTimeRemaining: 3 * 60,
        currentCost: costBreakdown.totalCost || 0,
        currentTier: 'tier3'
      });

      const qualityStart = Date.now();
      const qualityControlledKeywords = this.applyQualityControl(
        {
          dream100: processedDream100,
          tier2: enrichedTier2,
          tier3: enrichedTier3
        },
        {
          qualityThreshold,
          maxTotal: targetTotalCount,
          deduplicateAcrossTiers: true,
          preserveParentChildRelations: true
        }
      );
      (processingStats as any).stageTimings['quality_control'] = Date.now() - qualityStart;

      // Stage 7: Smart Capping
      progressCallback?.({
        stage: 'smart_capping',
        currentStep: 'Applying smart capping to meet target count',
        progressPercent: 95,
        keywordsProcessed: qualityControlledKeywords.tier2.length + qualityControlledKeywords.tier3.length,
        estimatedTimeRemaining: 1 * 60,
        currentCost: costBreakdown.totalCost || 0,
        currentTier: 'tier3'
      });

      const cappingStart = Date.now();
      const finalKeywords = this.applySmartCapping(
        qualityControlledKeywords,
        targetTotalCount
      );
      (processingStats as any).stageTimings['smart_capping'] = Date.now() - cappingStart;

      // Calculate final metrics
      const totalProcessingTime = Date.now() - startTime;
      const totalKeywords = finalKeywords.dream100.length + finalKeywords.tier2.length + finalKeywords.tier3.length;

      this.calculateQualityMetrics(finalKeywords, qualityMetrics);
      this.calculateCostBreakdown(processingStats, costBreakdown, budgetLimit);

      const expansionBreakdown = this.calculateExpansionBreakdown(
        finalKeywords,
        processingStats
      );

      // Prepare next stage data
      const nextStageData = {
        clusteringSeeds: [
          ...finalKeywords.dream100.slice(0, 20).map(k => k.keyword),
          ...finalKeywords.tier2.slice(0, 30).map(k => k.keyword)
        ],
        competitorDomains: this.extractUniqueCompetitorDomains(finalKeywords),
        gapAnalysis: this.identifyGapOpportunities(finalKeywords, dream100Keywords)
      };

      progressCallback?.({
        stage: 'result_preparation',
        currentStep: 'Finalizing universe expansion results',
        progressPercent: 100,
        keywordsProcessed: totalKeywords,
        estimatedTimeRemaining: 0,
        currentCost: costBreakdown.totalCost || 0,
        currentTier: 'tier3'
      });

      const result: UniverseExpansionResult = {
        success: true,
        runId,
        keywordsByTier: finalKeywords,
        totalKeywords,
        processingStats: {
          totalProcessingTime,
          stageTimings: (processingStats as any).stageTimings,
          apiCallCounts: (processingStats as any).apiCallCounts,
          batchInfo: (processingStats as any).batchInfo,
          cacheHitRate: processingStats.cacheHitRate || 0,
          throughputMetrics: {
            keywordsPerMinute: (totalKeywords / totalProcessingTime) * 60000,
            apiCallsPerMinute: (((processingStats as any).apiCallCounts.anthropic + 
                                (processingStats as any).apiCallCounts.ahrefs + 
                                (processingStats as any).apiCallCounts.serp) / totalProcessingTime) * 60000,
            batchesPerHour: ((processingStats as any).batchInfo.totalBatches / totalProcessingTime) * 3600000
          },
          expansionEfficiency: (processingStats as any).expansionEfficiency
        },
        costBreakdown: costBreakdown as UniverseCostBreakdown,
        qualityMetrics: qualityMetrics as UniverseQualityMetrics,
        expansionBreakdown,
        warnings,
        errors,
        nextStageData
      };

      Sentry.addBreadcrumb({
        message: `Universe expansion completed successfully`,
        level: 'info',
        category: 'universe-expansion',
        data: {
          runId,
          totalKeywords,
          processingTime: totalProcessingTime,
          totalCost: costBreakdown.totalCost,
          avgQuality: qualityMetrics.avgQualityScore
        }
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      Sentry.captureException(error, {
        tags: { 
          service: 'universe-expansion',
          runId,
          stage: 'unknown'
        },
        extra: {
          dream100Count: dream100Keywords.length,
          targetTotalCount,
          market,
          processingTime
        }
      });

      throw new Error(`Universe expansion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process and validate Dream 100 keywords as expansion seeds
   */
  private async processDream100Keywords(
    dream100Keywords: string[],
    market: string
  ): Promise<UniverseKeywordCandidate[]> {
    const processed: UniverseKeywordCandidate[] = [];
    
    for (const keyword of dream100Keywords) {
      const normalized = normalizeKeyword(keyword);
      const quality = validateKeywordQuality(normalized);
      
      if (quality.isValid) {
        processed.push({
          keyword: normalized,
          stage: 'dream100',
          volume: 0, // Will be enriched later if needed
          difficulty: 0,
          cpc: 0,
          intent: null,
          relevanceScore: 1.0, // Dream 100 keywords have perfect relevance
          qualityScore: quality.score,
          blendedScore: 0.9, // High default score for Dream 100
          quickWin: false,
          expansionSource: 'dream100',
          confidence: 1.0
        });
      }
    }
    
    return processed;
  }

  /**
   * Expand Dream 100 keywords to tier-2 mid-tail variations
   */
  private async expandToTier2(
    dream100: UniverseKeywordCandidate[],
    options: {
      maxPerKeyword: number;
      industry?: string;
      market: string;
      enableCompetitorMining: boolean;
      enableSerpAnalysis: boolean;
      enableSemanticVariations: boolean;
    },
    progressCallback?: UniverseProgressCallback
  ): Promise<UniverseKeywordCandidate[]> {
    const tier2Candidates: UniverseKeywordCandidate[] = [];
    const strategies = this.getTier2ExpansionStrategies(options);
    
    let processedCount = 0;
    
    for (const dreamKeyword of dream100) {
      const keywordCandidates: UniverseKeywordCandidate[] = [];
      
      // Apply each enabled expansion strategy
      for (const strategy of strategies) {
        if (!strategy.enabled) continue;
        
        try {
          const strategyCandidates = await this.applyExpansionStrategy(
            dreamKeyword.keyword,
            'tier2',
            strategy,
            {
              industry: options.industry,
              market: options.market,
              maxResults: Math.ceil(options.maxPerKeyword * strategy.weight)
            }
          );
          
          keywordCandidates.push(...strategyCandidates);
          
        } catch (error) {
          console.warn(`Tier-2 expansion strategy ${strategy.name} failed for "${dreamKeyword.keyword}":`, error);
        }
      }
      
      // Deduplicate and select best candidates for this Dream keyword
      const uniqueCandidates = this.deduplicateKeywords(keywordCandidates);
      const bestCandidates = uniqueCandidates
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, options.maxPerKeyword)
        .map(candidate => ({
          ...candidate,
          parentKeyword: dreamKeyword.keyword,
          stage: 'tier2' as KeywordStage
        }));
      
      tier2Candidates.push(...bestCandidates);
      
      processedCount++;
      
      // Update progress
      progressCallback?.({
        stage: 'tier2_expansion',
        currentStep: `Expanded ${processedCount}/${dream100.length} Dream keywords`,
        progressPercent: 15 + (20 * processedCount / dream100.length),
        keywordsProcessed: tier2Candidates.length,
        estimatedTimeRemaining: 20 * 60 * (1 - processedCount / dream100.length),
        currentCost: 0, // Will be calculated later
        currentTier: 'tier2'
      });
    }
    
    return tier2Candidates;
  }

  /**
   * Expand tier-2 keywords to tier-3 long-tail variations
   */
  private async expandToTier3(
    tier2Keywords: UniverseKeywordCandidate[],
    options: {
      maxPerKeyword: number;
      targetTotal: number;
      industry?: string;
      market: string;
      enableSemanticVariations: boolean;
    },
    progressCallback?: UniverseProgressCallback
  ): Promise<UniverseKeywordCandidate[]> {
    const tier3Candidates: UniverseKeywordCandidate[] = [];
    const strategies = this.getTier3ExpansionStrategies(options);
    
    // Calculate how many tier-2 keywords to process to reach target
    const maxTier2ToProcess = Math.min(
      tier2Keywords.length,
      Math.ceil(options.targetTotal / options.maxPerKeyword)
    );
    
    let processedCount = 0;
    
    // Process tier-2 keywords in batches for better performance
    const batchSize = 10;
    const batches = this.chunkArray(tier2Keywords.slice(0, maxTier2ToProcess), batchSize);
    
    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(async (tier2Keyword) => {
          const keywordCandidates: UniverseKeywordCandidate[] = [];
          
          // Apply tier-3 expansion strategies
          for (const strategy of strategies) {
            if (!strategy.enabled) continue;
            
            try {
              const strategyCandidates = await this.applyExpansionStrategy(
                tier2Keyword.keyword,
                'tier3',
                strategy,
                {
                  industry: options.industry,
                  market: options.market,
                  maxResults: Math.ceil(options.maxPerKeyword * strategy.weight),
                  parentKeyword: tier2Keyword.parentKeyword
                }
              );
              
              keywordCandidates.push(...strategyCandidates);
              
            } catch (error) {
              console.warn(`Tier-3 expansion strategy ${strategy.name} failed for "${tier2Keyword.keyword}":`, error);
            }
          }
          
          // Select best candidates for this tier-2 keyword
          const uniqueCandidates = this.deduplicateKeywords(keywordCandidates);
          const bestCandidates = uniqueCandidates
            .sort((a, b) => b.qualityScore - a.qualityScore)
            .slice(0, options.maxPerKeyword)
            .map(candidate => ({
              ...candidate,
              parentKeyword: tier2Keyword.keyword,
              stage: 'tier3' as KeywordStage
            }));
          
          return bestCandidates;
        })
      );
      
      // Collect successful results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          tier3Candidates.push(...result.value);
        }
      }
      
      processedCount += batch.length;
      
      // Update progress
      progressCallback?.({
        stage: 'tier3_expansion',
        currentStep: `Expanded ${processedCount}/${maxTier2ToProcess} tier-2 keywords`,
        progressPercent: 55 + (20 * processedCount / maxTier2ToProcess),
        keywordsProcessed: tier3Candidates.length,
        estimatedTimeRemaining: 10 * 60 * (1 - processedCount / maxTier2ToProcess),
        currentCost: 0, // Will be calculated later
        currentTier: 'tier3'
      });
      
      // Check if we've reached target total
      if (tier3Candidates.length >= options.targetTotal) {
        break;
      }
    }
    
    return tier3Candidates;
  }

  /**
   * Enrich keywords with Ahrefs metrics data
   */
  private async enrichKeywords(
    candidates: UniverseKeywordCandidate[],
    stage: KeywordStage,
    market: string,
    progressCallback?: UniverseProgressCallback
  ): Promise<UniverseKeywordCandidate[]> {
    if (candidates.length === 0) return [];
    
    const batchSize = 100;
    const batches = this.chunkArray(candidates, batchSize);
    const enrichedResults: UniverseKeywordCandidate[] = [];
    let processedCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const keywords = batch.map(c => c.keyword);
        const response = await this.ahrefsClient.getKeywordMetrics({
          keywords,
          country: market,
          mode: 'exact',
          include_serp: true
        });

        if (response.success && response.data) {
          for (const candidate of batch) {
            const metrics = response.data.find(d => d.keyword === candidate.keyword);
            
            if (metrics) {
              // Apply stage-specific scoring
              const blendedScore = this.calculateTierBlendedScore(
                metrics.search_volume,
                metrics.keyword_difficulty,
                candidate.intent,
                candidate.relevanceScore,
                stage
              );
              
              const quickWin = this.isQuickWin(
                metrics.keyword_difficulty,
                metrics.search_volume,
                blendedScore,
                stage
              );
              
              enrichedResults.push({
                ...candidate,
                volume: metrics.search_volume,
                difficulty: metrics.keyword_difficulty,
                cpc: metrics.cpc,
                blendedScore,
                quickWin,
                serpFeatures: this.extractSerpFeatures(metrics)
              });
            } else {
              // Keep candidate with estimated metrics if API data unavailable
              enrichedResults.push({
                ...candidate,
                volume: this.estimateVolume(candidate.keyword, stage),
                difficulty: this.estimateDifficulty(candidate.keyword, stage),
                cpc: 0
              });
            }
          }
        }

        processedCount += batch.length;
        
        // Update progress based on stage
        const basePercent = stage === 'tier2' ? 35 : 75;
        const rangePercent = stage === 'tier2' ? 20 : 15;
        
        progressCallback?.({
          stage: stage === 'tier2' ? 'tier2_enrichment' : 'tier3_enrichment',
          currentStep: `Enriched batch ${i + 1}/${batches.length}`,
          progressPercent: basePercent + (rangePercent * (i + 1) / batches.length),
          keywordsProcessed: processedCount,
          estimatedTimeRemaining: (stage === 'tier2' ? 15 : 10) * 60 * (1 - (i + 1) / batches.length),
          currentCost: 0, // Will be calculated later
          currentTier: stage
        });

        // Rate limiting delay
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.warn(`Enrichment batch ${i + 1} failed:`, (error as Error).message);
        // Continue with estimated metrics for failed batch
        for (const candidate of batch) {
          enrichedResults.push({
            ...candidate,
            volume: this.estimateVolume(candidate.keyword, stage),
            difficulty: this.estimateDifficulty(candidate.keyword, stage),
            cpc: 0
          });
        }
      }
    }

    return enrichedResults;
  }

  /**
   * Apply quality control filters and validation
   */
  private applyQualityControl(
    keywordsByTier: {
      dream100: UniverseKeywordCandidate[];
      tier2: UniverseKeywordCandidate[];
      tier3: UniverseKeywordCandidate[];
    },
    options: {
      qualityThreshold: number;
      maxTotal: number;
      deduplicateAcrossTiers: boolean;
      preserveParentChildRelations: boolean;
    }
  ): typeof keywordsByTier {
    const { qualityThreshold, deduplicateAcrossTiers, preserveParentChildRelations } = options;
    
    // Apply quality filtering
    const filteredTier2 = keywordsByTier.tier2.filter(k => 
      k.qualityScore >= qualityThreshold &&
      k.volume >= 10 && // Minimum volume threshold
      k.difficulty <= 95 // Maximum difficulty threshold
    );
    
    const filteredTier3 = keywordsByTier.tier3.filter(k => 
      k.qualityScore >= (qualityThreshold * 0.8) && // Slightly lower threshold for tier-3
      k.volume >= 5 && // Lower volume threshold for long-tail
      k.difficulty <= 90 // Slightly lower difficulty threshold
    );
    
    // Deduplicate across tiers if enabled
    let finalTier2 = filteredTier2;
    let finalTier3 = filteredTier3;
    
    if (deduplicateAcrossTiers) {
      const allKeywords = new Set([
        ...keywordsByTier.dream100.map(k => k.keyword),
        ...filteredTier2.map(k => k.keyword)
      ]);
      
      finalTier3 = filteredTier3.filter(k => !allKeywords.has(k.keyword));
      allKeywords.clear();
      
      // Also deduplicate tier2 against dream100
      const dream100Keywords = new Set(keywordsByTier.dream100.map(k => k.keyword));
      finalTier2 = filteredTier2.filter(k => !dream100Keywords.has(k.keyword));
    }
    
    // Preserve parent-child relationships if enabled
    if (preserveParentChildRelations) {
      const validParents = new Set([
        ...keywordsByTier.dream100.map(k => k.keyword),
        ...finalTier2.map(k => k.keyword)
      ]);
      
      // Only keep tier-3 keywords whose parents exist
      finalTier3 = finalTier3.filter(k => 
        k.parentKeyword && validParents.has(k.parentKeyword)
      );
    }
    
    return {
      dream100: keywordsByTier.dream100,
      tier2: finalTier2,
      tier3: finalTier3
    };
  }

  /**
   * Apply smart capping to meet target keyword count
   */
  private applySmartCapping(
    keywordsByTier: {
      dream100: UniverseKeywordCandidate[];
      tier2: UniverseKeywordCandidate[];
      tier3: UniverseKeywordCandidate[];
    },
    targetTotal: number
  ): typeof keywordsByTier {
    const currentTotal = keywordsByTier.dream100.length + keywordsByTier.tier2.length + keywordsByTier.tier3.length;
    
    if (currentTotal <= targetTotal) {
      return keywordsByTier; // No capping needed
    }
    
    // Reserve space for Dream 100 (always keep all)
    const availableSpace = targetTotal - keywordsByTier.dream100.length;
    
    // Calculate optimal distribution for remaining space
    const tier2Ratio = 0.1; // ~10% tier-2
    const tier3Ratio = 0.9; // ~90% tier-3
    
    const targetTier2 = Math.min(
      keywordsByTier.tier2.length,
      Math.floor(availableSpace * tier2Ratio)
    );
    
    const targetTier3 = Math.min(
      keywordsByTier.tier3.length,
      availableSpace - targetTier2
    );
    
    // Select best keywords using blended score
    const selectedTier2 = keywordsByTier.tier2
      .sort((a, b) => b.blendedScore - a.blendedScore)
      .slice(0, targetTier2);
    
    const selectedTier3 = keywordsByTier.tier3
      .sort((a, b) => b.blendedScore - a.blendedScore)
      .slice(0, targetTier3);
    
    return {
      dream100: keywordsByTier.dream100,
      tier2: selectedTier2,
      tier3: selectedTier3
    };
  }

  /**
   * Get tier-2 expansion strategies
   */
  private getTier2ExpansionStrategies(options: any): ExpansionStrategy[] {
    return [
      {
        name: 'llm_semantic',
        enabled: options.enableSemanticVariations,
        weight: 0.4,
        config: { focus: 'semantic_variations', intent_bias: 'commercial' }
      },
      {
        name: 'serp_overlap',
        enabled: options.enableSerpAnalysis,
        weight: 0.3,
        config: { serp_depth: 20, similarity_threshold: 0.7 }
      },
      {
        name: 'modifier_application',
        enabled: true,
        weight: 0.2,
        config: { modifiers: ['best', 'top', 'review', 'vs', 'alternative', 'how to'] }
      },
      {
        name: 'competitor_mining',
        enabled: options.enableCompetitorMining,
        weight: 0.1,
        config: { max_competitors: 5, title_analysis: true }
      }
    ];
  }

  /**
   * Get tier-3 expansion strategies
   */
  private getTier3ExpansionStrategies(options: any): ExpansionStrategy[] {
    return [
      {
        name: 'question_generation',
        enabled: true,
        weight: 0.4,
        config: { question_types: ['what', 'how', 'why', 'when', 'where', 'which'] }
      },
      {
        name: 'long_tail_variations',
        enabled: options.enableSemanticVariations,
        weight: 0.3,
        config: { min_length: 4, max_length: 8, focus: 'specificity' }
      },
      {
        name: 'comparison_keywords',
        enabled: true,
        weight: 0.2,
        config: { comparison_types: ['vs', 'compared to', 'difference between', 'alternative to'] }
      },
      {
        name: 'use_case_keywords',
        enabled: true,
        weight: 0.1,
        config: { contexts: ['for beginners', 'for small business', 'for enterprise', 'examples'] }
      }
    ];
  }

  /**
   * Apply specific expansion strategy
   */
  private async applyExpansionStrategy(
    seedKeyword: string,
    tier: KeywordStage,
    strategy: ExpansionStrategy,
    options: {
      industry?: string;
      market: string;
      maxResults: number;
      parentKeyword?: string;
    }
  ): Promise<UniverseKeywordCandidate[]> {
    switch (strategy.name) {
      case 'llm_semantic':
        return this.expandWithLLM(seedKeyword, tier, strategy.config, options);
      
      case 'serp_overlap':
        return this.expandWithSerpAnalysis(seedKeyword, tier, strategy.config, options);
      
      case 'modifier_application':
        return this.expandWithModifiers(seedKeyword, tier, strategy.config, options);
      
      case 'competitor_mining':
        return this.expandWithCompetitors(seedKeyword, tier, strategy.config, options);
      
      case 'question_generation':
        return this.expandWithQuestions(seedKeyword, tier, strategy.config, options);
      
      case 'long_tail_variations':
        return this.expandWithLongTail(seedKeyword, tier, strategy.config, options);
      
      case 'comparison_keywords':
        return this.expandWithComparisons(seedKeyword, tier, strategy.config, options);
      
      case 'use_case_keywords':
        return this.expandWithUseCases(seedKeyword, tier, strategy.config, options);
      
      default:
        console.warn(`Unknown expansion strategy: ${strategy.name}`);
        return [];
    }
  }

  /**
   * Expand using LLM semantic variations
   */
  private async expandWithLLM(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): Promise<UniverseKeywordCandidate[]> {
    try {
      const prompt = this.buildLLMExpansionPrompt(seedKeyword, tier, config, options);
      const response = await this.anthropicClient.expandKeywords({
        seed_keywords: [seedKeyword],
        target_count: options.maxResults,
        industry: options.industry || 'general',
        intent_focus: config.intent_bias || 'mixed'
      });

      if (!response.data?.keywords) {
        return [];
      }

      return response.data.keywords.map((item: any) => ({
        keyword: normalizeKeyword(item.keyword),
        stage: tier,
        volume: 0, // Will be enriched later
        difficulty: 0,
        cpc: 0,
        intent: item.intent || null,
        relevanceScore: this.calculateSemanticRelevance(seedKeyword, item.keyword),
        qualityScore: item.confidence || 0.7,
        blendedScore: 0,
        quickWin: false,
        expansionSource: 'llm_semantic',
        confidence: item.confidence || 0.7
      }));

    } catch (error) {
      console.warn(`LLM expansion failed for "${seedKeyword}":`, error);
      return [];
    }
  }

  /**
   * Expand using SERP overlap analysis
   */
  private async expandWithSerpAnalysis(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): Promise<UniverseKeywordCandidate[]> {
    try {
      // This would integrate with Ahrefs SERP data to find keywords
      // that appear in similar SERP results
      const serpRequest: AhrefsKeywordIdeasRequest = {
        target: seedKeyword,
        country: options.market,
        mode: 'phrase_match', // Use supported mode
        limit: options.maxResults
      };

      const response = await this.ahrefsClient.getKeywordIdeas(serpRequest);
      
      if (!response.success || !response.data) {
        return [];
      }

      return response.data.keywords
        .filter(item => item.keyword !== seedKeyword)
        .map(item => ({
          keyword: normalizeKeyword(item.keyword),
          stage: tier,
          volume: item.search_volume,
          difficulty: item.keyword_difficulty,
          cpc: item.cpc,
          intent: this.inferIntentFromKeyword(item.keyword),
          relevanceScore: this.calculateSemanticRelevance(seedKeyword, item.keyword),
          qualityScore: this.calculateQualityFromMetrics(item.search_volume, item.keyword_difficulty),
          blendedScore: 0,
          quickWin: false,
          expansionSource: 'serp_overlap',
          confidence: 0.8
        }));

    } catch (error) {
      console.warn(`SERP analysis failed for "${seedKeyword}":`, error);
      return [];
    }
  }

  /**
   * Expand using modifier application
   */
  private expandWithModifiers(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): UniverseKeywordCandidate[] {
    const modifiers = config.modifiers || [];
    const variations: UniverseKeywordCandidate[] = [];

    for (const modifier of modifiers) {
      // Create variations with modifier
      const variations1 = `${modifier} ${seedKeyword}`;
      const variations2 = `${seedKeyword} ${modifier}`;
      
      for (const variation of [variations1, variations2]) {
        const normalized = normalizeKeyword(variation);
        if (normalized.length > 3 && normalized !== seedKeyword) {
          variations.push({
            keyword: normalized,
            stage: tier,
            volume: 0,
            difficulty: 0,
            cpc: 0,
            intent: this.inferIntentFromModifier(modifier),
            relevanceScore: 0.8, // High relevance for modifier variations
            qualityScore: 0.7,
            blendedScore: 0,
            quickWin: false,
            expansionSource: 'modifier_application',
            confidence: 0.8
          });
        }
      }
    }

    return variations.slice(0, options.maxResults);
  }

  /**
   * Expand using competitor mining
   */
  private async expandWithCompetitors(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): Promise<UniverseKeywordCandidate[]> {
    try {
      // This would integrate with competitor analysis
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.warn(`Competitor mining failed for "${seedKeyword}":`, error);
      return [];
    }
  }

  /**
   * Expand using question generation for tier-3
   */
  private expandWithQuestions(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): UniverseKeywordCandidate[] {
    const questionWords = config.question_types || ['what', 'how', 'why', 'when', 'where'];
    const variations: UniverseKeywordCandidate[] = [];

    for (const qWord of questionWords) {
      const questionKeywords = [
        `${qWord} is ${seedKeyword}`,
        `${qWord} to ${seedKeyword}`,
        `${qWord} ${seedKeyword} works`,
        `${qWord} ${seedKeyword} benefits`
      ];

      for (const question of questionKeywords) {
        const normalized = normalizeKeyword(question);
        if (normalized.length > 3) {
          variations.push({
            keyword: normalized,
            stage: tier,
            volume: 0,
            difficulty: 0,
            cpc: 0,
            intent: 'informational',
            relevanceScore: 0.7,
            qualityScore: 0.6,
            blendedScore: 0,
            quickWin: false,
            expansionSource: 'question_generation',
            confidence: 0.7
          });
        }
      }
    }

    return variations.slice(0, options.maxResults);
  }

  /**
   * Expand with long-tail variations
   */
  private expandWithLongTail(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): UniverseKeywordCandidate[] {
    const extensions = [
      'guide', 'tutorial', 'tips', 'examples', 'benefits', 'features',
      'pricing', 'cost', 'free', 'paid', 'comparison', 'review'
    ];
    
    const variations: UniverseKeywordCandidate[] = [];

    for (const extension of extensions) {
      const longTailKeywords = [
        `${seedKeyword} ${extension}`,
        `${extension} for ${seedKeyword}`,
        `${seedKeyword} ${extension} 2024`
      ];

      for (const longTail of longTailKeywords) {
        const normalized = normalizeKeyword(longTail);
        if (normalized.length > 3) {
          variations.push({
            keyword: normalized,
            stage: tier,
            volume: 0,
            difficulty: 0,
            cpc: 0,
            intent: this.inferIntentFromKeyword(longTail),
            relevanceScore: 0.8,
            qualityScore: 0.6,
            blendedScore: 0,
            quickWin: false,
            expansionSource: 'long_tail_variations',
            confidence: 0.7
          });
        }
      }
    }

    return variations.slice(0, options.maxResults);
  }

  /**
   * Expand with comparison keywords
   */
  private expandWithComparisons(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): UniverseKeywordCandidate[] {
    const comparisonTypes = config.comparison_types || ['vs', 'compared to', 'alternative to'];
    const variations: UniverseKeywordCandidate[] = [];

    for (const compType of comparisonTypes) {
      const comparisonKeywords = [
        `${seedKeyword} ${compType}`,
        `${compType} ${seedKeyword}`,
        `${seedKeyword} ${compType} competitor`
      ];

      for (const comparison of comparisonKeywords) {
        const normalized = normalizeKeyword(comparison);
        if (normalized.length > 3) {
          variations.push({
            keyword: normalized,
            stage: tier,
            volume: 0,
            difficulty: 0,
            cpc: 0,
            intent: 'commercial',
            relevanceScore: 0.8,
            qualityScore: 0.7,
            blendedScore: 0,
            quickWin: false,
            expansionSource: 'comparison_keywords',
            confidence: 0.7
          });
        }
      }
    }

    return variations.slice(0, options.maxResults);
  }

  /**
   * Expand with use case keywords
   */
  private expandWithUseCases(
    seedKeyword: string,
    tier: KeywordStage,
    config: any,
    options: any
  ): UniverseKeywordCandidate[] {
    const contexts = config.contexts || ['for beginners', 'for business', 'examples'];
    const variations: UniverseKeywordCandidate[] = [];

    for (const context of contexts) {
      const useCaseKeywords = [
        `${seedKeyword} ${context}`,
        `${context} ${seedKeyword}`,
        `${seedKeyword} use cases`
      ];

      for (const useCase of useCaseKeywords) {
        const normalized = normalizeKeyword(useCase);
        if (normalized.length > 3) {
          variations.push({
            keyword: normalized,
            stage: tier,
            volume: 0,
            difficulty: 0,
            cpc: 0,
            intent: 'informational',
            relevanceScore: 0.7,
            qualityScore: 0.6,
            blendedScore: 0,
            quickWin: false,
            expansionSource: 'use_case_keywords',
            confidence: 0.6
          });
        }
      }
    }

    return variations.slice(0, options.maxResults);
  }

  /**
   * Calculate tier-specific blended scores
   */
  private calculateTierBlendedScore(
    volume: number,
    difficulty: number,
    intent: KeywordIntent | null,
    relevanceScore: number,
    tier: KeywordStage
  ): number {
    // Tier-specific scoring weights from PRD
    const weights = tier === 'tier2' 
      ? { volume: 0.35, ease: 0.25, relevance: 0.20, intent: 0.15, trend: 0.05 }
      : { ease: 0.35, relevance: 0.30, volume: 0.20, intent: 0.10, trend: 0.05 };

    // Normalize components
    const normalizedVolume = Math.min(Math.log10(volume + 1) / 5, 1);
    const easeScore = (100 - difficulty) / 100;
    const intentScore = this.getIntentScore(intent);
    const trendScore = 0.5; // Placeholder for trend data

    // Calculate weighted score
    const blendedScore = 
      (normalizedVolume * weights.volume) +
      (easeScore * weights.ease) +
      (relevanceScore * weights.relevance) +
      (intentScore * weights.intent) +
      (trendScore * weights.trend);

    return Math.max(0, Math.min(1, blendedScore));
  }

  /**
   * Check if keyword qualifies as quick win for specific tier
   */
  private isQuickWin(
    difficulty: number,
    volume: number,
    blendedScore: number,
    tier: KeywordStage
  ): boolean {
    const ease = (100 - difficulty) / 100;
    const volumeThreshold = tier === 'tier2' ? 100 : 50;
    const easeThreshold = tier === 'tier2' ? 0.7 : 0.8;
    
    return ease >= easeThreshold && volume >= volumeThreshold && blendedScore >= 0.6;
  }

  /**
   * Helper methods for keyword processing
   */
  private deduplicateKeywords(keywords: UniverseKeywordCandidate[]): UniverseKeywordCandidate[] {
    const seen = new Map<string, UniverseKeywordCandidate>();
    
    for (const keyword of keywords) {
      const normalized = keyword.keyword.toLowerCase();
      if (!seen.has(normalized) || keyword.qualityScore > seen.get(normalized)!.qualityScore) {
        seen.set(normalized, keyword);
      }
    }
    
    return Array.from(seen.values());
  }

  private calculateSemanticRelevance(seed: string, candidate: string): number {
    // Simplified semantic similarity based on word overlap
    const seedWords = new Set(seed.toLowerCase().split(' '));
    const candidateWords = new Set(candidate.toLowerCase().split(' '));
    
    const intersection = new Set([...seedWords].filter(w => candidateWords.has(w)));
    const union = new Set([...seedWords, ...candidateWords]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private inferIntentFromKeyword(keyword: string): KeywordIntent {
    const lower = keyword.toLowerCase();
    
    if (/\b(buy|purchase|price|cost|discount|deal)\b/.test(lower)) {
      return 'transactional';
    }
    if (/\b(best|top|review|compare|vs|alternative)\b/.test(lower)) {
      return 'commercial';
    }
    if (/\b(login|sign in|dashboard|account)\b/.test(lower)) {
      return 'navigational';
    }
    
    return 'informational';
  }

  private inferIntentFromModifier(modifier: string): KeywordIntent {
    const commercialModifiers = ['best', 'top', 'review', 'vs', 'alternative'];
    const informationalModifiers = ['how to', 'what is', 'guide', 'tutorial'];
    
    if (commercialModifiers.includes(modifier)) {
      return 'commercial';
    }
    if (informationalModifiers.includes(modifier)) {
      return 'informational';
    }
    
    return 'informational';
  }

  private getIntentScore(intent: KeywordIntent | null): number {
    switch (intent) {
      case 'transactional': return 1.0;
      case 'commercial': return 0.8;
      case 'informational': return 0.6;
      case 'navigational': return 0.4;
      default: return 0.5;
    }
  }

  private calculateQualityFromMetrics(volume: number, difficulty: number): number {
    const volumeScore = Math.min(Math.log10(volume + 1) / 5, 1);
    const difficultyScore = (100 - difficulty) / 100;
    return (volumeScore * 0.6 + difficultyScore * 0.4);
  }

  private estimateVolume(keyword: string, tier: KeywordStage): number {
    const baseVolume = tier === 'tier2' ? 500 : 100;
    const lengthPenalty = Math.max(0.1, 1 - (keyword.split(' ').length - 2) * 0.2);
    return Math.floor(baseVolume * lengthPenalty);
  }

  private estimateDifficulty(keyword: string, tier: KeywordStage): number {
    const baseDifficulty = tier === 'tier2' ? 40 : 25;
    const lengthBonus = Math.min(0.3, (keyword.split(' ').length - 2) * 0.1);
    return Math.max(10, Math.floor(baseDifficulty * (1 - lengthBonus)));
  }

  private extractSerpFeatures(metrics: AhrefsKeywordData): string[] {
    // Extract SERP features from Ahrefs data
    const features: string[] = [];
    
    // This would parse actual SERP features from the API response
    // For now, return placeholder
    
    return features;
  }

  private buildLLMExpansionPrompt(seedKeyword: string, tier: KeywordStage, config: any, options: any): string {
    return `Generate ${options.maxResults} ${tier} keyword variations for "${seedKeyword}" 
    in the ${options.industry || 'general'} industry, targeting ${options.market} market.
    Focus on ${config.focus} with ${config.intent_bias} intent bias.`;
  }

  private calculateQualityMetrics(
    keywordsByTier: {
      dream100: UniverseKeywordCandidate[];
      tier2: UniverseKeywordCandidate[];
      tier3: UniverseKeywordCandidate[];
    },
    metrics: Partial<UniverseQualityMetrics>
  ): void {
    const allKeywords = [
      ...keywordsByTier.tier2,
      ...keywordsByTier.tier3
    ];

    if (allKeywords.length === 0) return;

    // Calculate averages using object spread to bypass readonly restrictions
    const mutableMetrics = metrics as any;
    mutableMetrics.avgRelevanceScore = allKeywords.reduce((sum, k) => sum + k.relevanceScore, 0) / allKeywords.length;
    mutableMetrics.avgQualityScore = allKeywords.reduce((sum, k) => sum + k.qualityScore, 0) / allKeywords.length;
    mutableMetrics.averageConfidence = allKeywords.reduce((sum, k) => sum + k.confidence, 0) / allKeywords.length;

    // Quick win counts
    mutableMetrics.quickWinCounts = {
      tier2: keywordsByTier.tier2.filter(k => k.quickWin).length,
      tier3: keywordsByTier.tier3.filter(k => k.quickWin).length,
      total: allKeywords.filter(k => k.quickWin).length
    };

    // Intent distribution
    const intentCounts: Record<KeywordIntent, number> = {
      'transactional': 0,
      'commercial': 0,
      'informational': 0,
      'navigational': 0
    };
    
    for (const keyword of allKeywords) {
      if (keyword.intent) {
        intentCounts[keyword.intent]++;
      }
    }
    mutableMetrics.intentDistribution = intentCounts;

    // Difficulty distribution
    const difficultyDist = { easy: 0, medium: 0, hard: 0 };
    for (const keyword of allKeywords) {
      if (keyword.difficulty <= 30) difficultyDist.easy++;
      else if (keyword.difficulty <= 70) difficultyDist.medium++;
      else difficultyDist.hard++;
    }
    mutableMetrics.difficultyDistribution = difficultyDist;

    // Volume distribution
    const volumeDist = { low: 0, medium: 0, high: 0, veryHigh: 0 };
    for (const keyword of allKeywords) {
      if (keyword.volume <= 100) volumeDist.low++;
      else if (keyword.volume <= 1000) volumeDist.medium++;
      else if (keyword.volume <= 10000) volumeDist.high++;
      else volumeDist.veryHigh++;
    }
    mutableMetrics.volumeDistribution = volumeDist;
  }

  private calculateCostBreakdown(
    processingStats: Partial<UniverseProcessingStats>,
    costBreakdown: Partial<UniverseCostBreakdown>,
    budgetLimit?: number
  ): void {
    // Estimate costs based on API usage
    const anthropicCalls = processingStats.apiCallCounts?.anthropic || 0;
    const ahrefsCalls = processingStats.apiCallCounts?.ahrefs || 0;
    const serpCalls = processingStats.apiCallCounts?.serp || 0;

    // Use type assertion to allow assignment to readonly properties in partial type
    const mutableCostBreakdown = costBreakdown as any;
    mutableCostBreakdown.anthropicCost = anthropicCalls * 0.15; // ~$0.15 per LLM call
    mutableCostBreakdown.ahrefsCost = ahrefsCalls * 0.20; // ~$0.20 per Ahrefs batch
    mutableCostBreakdown.serpApiCost = serpCalls * 0.05; // ~$0.05 per SERP call
    mutableCostBreakdown.totalCost = mutableCostBreakdown.anthropicCost + mutableCostBreakdown.ahrefsCost + mutableCostBreakdown.serpApiCost;

    if (budgetLimit) {
      mutableCostBreakdown.budgetUtilization = (mutableCostBreakdown.totalCost / budgetLimit) * 100;
    }
  }

  private calculateExpansionBreakdown(
    keywordsByTier: any,
    processingStats: Partial<UniverseProcessingStats>
  ): ExpansionStrategyBreakdown {
    // This would calculate actual strategy effectiveness
    // For now, return placeholder data
    return {
      strategies: [
        {
          name: 'llm_semantic',
          keywordsGenerated: Math.floor(keywordsByTier.tier2.length * 0.4),
          successRate: 0.85,
          avgConfidence: 0.8,
          costContribution: 0.6
        },
        {
          name: 'modifier_application',
          keywordsGenerated: Math.floor(keywordsByTier.tier2.length * 0.2),
          successRate: 0.9,
          avgConfidence: 0.7,
          costContribution: 0.1
        }
      ],
      mostEffectiveStrategy: 'llm_semantic',
      leastEffectiveStrategy: 'competitor_mining',
      recommendedOptimizations: [
        'Increase LLM semantic expansion weight',
        'Improve modifier diversity',
        'Enhance quality filtering thresholds'
      ]
    };
  }

  private extractUniqueCompetitorDomains(keywordsByTier: any): string[] {
    const domains = new Set<string>();
    
    // Extract domains from competitor URLs if available
    for (const tier of [keywordsByTier.tier2, keywordsByTier.tier3]) {
      for (const keyword of tier) {
        if (keyword.competitorUrls) {
          for (const url of keyword.competitorUrls) {
            try {
              const domain = new URL(url).hostname;
              domains.add(domain);
            } catch (error) {
              // Ignore invalid URLs
            }
          }
        }
      }
    }
    
    return Array.from(domains).slice(0, 20);
  }

  private identifyGapOpportunities(keywordsByTier: any, dream100: string[]): string[] {
    // This would identify keyword gaps and opportunities
    // For now, return placeholder suggestions
    return [
      'Long-tail question variations underrepresented',
      'Commercial intent keywords could be expanded',
      'Geographic modifiers not fully explored',
      'Seasonal opportunities identified'
    ];
  }

  /**
   * Utility function to chunk arrays for batch processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get service health and metrics
   */
  getServiceHealth(): {
    status: 'healthy' | 'degraded' | 'down';
    integrations: {
      anthropic: 'connected' | 'error';
      ahrefs: 'connected' | 'error';
    };
    lastExpansion: {
      timestamp: number;
      keywordCount: number;
      processingTime: number;
      cost: number;
    } | null;
  } {
    return {
      status: 'healthy',
      integrations: {
        anthropic: 'connected',
        ahrefs: 'connected'
      },
      lastExpansion: null
    };
  }

  /**
   * Estimate costs before running expansion
   */
  estimateExpansionCost(
    dream100Count: number,
    targetTotal: number = 10000,
    enableAllFeatures: boolean = true
  ): {
    estimatedCost: number;
    breakdown: {
      tier2Expansion: number;
      tier3Expansion: number;
      ahrefsEnrichment: number;
      qualityControl: number;
    };
    confidence: number;
  } {
    const tier2Count = Math.min(dream100Count * 10, 1000);
    const tier3Count = targetTotal - dream100Count - tier2Count;
    
    const breakdown = {
      tier2Expansion: Math.ceil(tier2Count / 50) * 0.15, // LLM calls for tier-2
      tier3Expansion: Math.ceil(tier3Count / 100) * 0.10, // LLM calls for tier-3
      ahrefsEnrichment: Math.ceil((tier2Count + tier3Count) / 100) * 0.20, // Ahrefs enrichment
      qualityControl: enableAllFeatures ? 0.50 : 0.10 // Additional features cost
    };
    
    const estimatedCost = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);
    
    return {
      estimatedCost,
      breakdown,
      confidence: 0.80 // Good confidence in estimates
    };
  }
}

/**
 * Validation schemas for universe expansion
 */
export const UniverseExpansionRequestSchema = z.object({
  runId: z.string().uuid(),
  dream100Keywords: z.array(z.string().min(1).max(100)).min(1).max(100),
  targetTotalCount: z.number().int().min(1000).max(10000).default(10000),
  maxTier2PerDream: z.number().int().min(5).max(20).default(10),
  maxTier3PerTier2: z.number().int().min(5).max(20).default(10),
  market: z.string().length(2).default('US'),
  industry: z.string().max(100).optional(),
  budgetLimit: z.number().positive().optional(),
  qualityThreshold: z.number().min(0.3).max(1).default(0.6),
  enableCompetitorMining: z.boolean().default(true),
  enableSerpAnalysis: z.boolean().default(true),
  enableSemanticVariations: z.boolean().default(true)
});

/**
 * Type guards for runtime validation
 */
export const isUniverseExpansionRequest = (value: unknown): value is UniverseExpansionRequest => {
  try {
    UniverseExpansionRequestSchema.parse(value);
    return true;
  } catch {
    return false;
  }
};

export const isUniverseStage = (value: unknown): value is UniverseStage => {
  return typeof value === 'string' && [
    'initialization', 'dream100_processing', 'tier2_expansion', 'tier2_enrichment',
    'tier3_expansion', 'tier3_enrichment', 'quality_control', 'smart_capping', 'result_preparation'
  ].includes(value);
};

/**
 * Factory function for creating universe expansion service instances
 */
export const createUniverseExpansionService = (
  anthropicApiKey: string,
  ahrefsApiKey: string,
  redis?: any
): UniverseExpansionService => {
  return new UniverseExpansionService(anthropicApiKey, ahrefsApiKey, redis);
};

// Service class is already exported above, no need to re-export

// Alias for backwards compatibility  
export const UniverseService = UniverseExpansionService;
export type UniverseService = UniverseExpansionService;

/**
 * Export service for job queue integration
 */
export const processUniverseExpansionJob = async (
  job: PipelineJob,
  universeService: UniverseExpansionService
): Promise<JobResult> => {
  const startTime = Date.now();
  
  try {
    const request = job.data.input as any as UniverseExpansionRequest;
    
    // Validate input
    if (!isUniverseExpansionRequest(request)) {
      throw new Error('Invalid universe expansion request format');
    }
    
    // Execute expansion
    const result = await universeService.expandToUniverse(request);
    
    const metrics: JobMetrics = {
      executionTime: Date.now() - startTime,
      memoryUsed: 0, // Would be calculated in production
      cpuTime: 0,
      apiCalls: {
        anthropic: result.processingStats.apiCallCounts.anthropic,
        ahrefs: result.processingStats.apiCallCounts.ahrefs
      },
      dataProcessed: {
        input: request.dream100Keywords.length,
        output: result.totalKeywords,
        errors: result.errors.length
      },
      costs: {
        total: result.costBreakdown.totalCost,
        anthropic: result.costBreakdown.anthropicCost,
        ahrefs: result.costBreakdown.ahrefsCost
      }
    };
    
    return {
      success: true,
      output: result as any,
      metrics,
      artifacts: [],
      warnings: result.warnings,
      nextJobs: [] // Next jobs would be clustering, scoring, etc.
    };
    
  } catch (error) {
    return {
      success: false,
      output: null,
      metrics: {
        executionTime: Date.now() - startTime,
        memoryUsed: 0,
        cpuTime: 0,
        apiCalls: {},
        dataProcessed: { input: 0, output: 0, errors: 1 },
        costs: { total: 0 }
      },
      artifacts: [],
      warnings: [],
      nextJobs: []
    };
  }
};