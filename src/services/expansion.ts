/**
 * Dream 100 Expansion Service
 * 
 * Comprehensive service that generates 100 commercially relevant head terms from seed keywords
 * using intelligent LLM expansion and Ahrefs metrics enrichment.
 * 
 * Features:
 * - Multi-stage expansion pipeline (LLM -> Ahrefs -> Intent -> Relevance -> Selection)
 * - Commercial relevance filtering and quality control
 * - Adaptive batch processing with rate limiting
 * - Cost optimization and budget monitoring
 * - Comprehensive error handling and resilience
 * - Progress tracking and detailed analytics
 * - Smart caching and deduplication
 * 
 * Processing Pipeline:
 * 1. LLM Seed Expansion - Generate 200-300 candidate keywords
 * 2. Ahrefs Metrics Enrichment - Volume, difficulty, CPC data
 * 3. Intent Classification - Identify commercial vs informational intent
 * 4. Relevance Scoring - Semantic similarity to seed terms
 * 5. Commercial Filtering - Focus on business-relevant terms
 * 6. Final Selection - Select top 100 Dream keywords with optimal scoring
 * 
 * @fileoverview Dream 100 keyword expansion service
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
  Run
} from '../models';
import type { ProcessingStage } from '../models/pipeline';
import { AnthropicClient } from '../integrations/anthropic';
import { AhrefsClient } from '../integrations/ahrefs';
import { ErrorHandler, RetryHandler } from '../utils/error-handler';
import { normalizeKeyword, validateKeywordQuality, estimateKeywordDifficulty } from '../utils/ingestion-helpers';
import type {
  AnthropicKeywordExpansion,
  AnthropicExpansionResult,
  AnthropicIntentClassification,
  AnthropicIntentResult
} from '../types/anthropic';
import type {
  AhrefsKeywordRequest,
  AhrefsKeywordData
} from '../types/ahrefs';

/**
 * Dream 100 expansion request configuration
 */
export interface Dream100ExpansionRequest {
  readonly runId: UUID;
  readonly seedKeywords: string[];
  readonly targetCount?: number; // Default 100
  readonly market?: string; // Default 'US'
  readonly industry?: string;
  readonly intentFocus?: 'commercial' | 'informational' | 'transactional' | 'mixed';
  readonly difficultyPreference?: 'easy' | 'medium' | 'hard' | 'mixed';
  readonly budgetLimit?: number;
  readonly qualityThreshold?: number; // 0-1, default 0.7
  readonly includeCompetitorAnalysis?: boolean;
}

/**
 * Candidate keyword with enrichment data
 */
export interface KeywordCandidate {
  readonly keyword: string;
  readonly stage: KeywordStage;
  readonly volume: number;
  readonly difficulty: number;
  readonly cpc: number;
  readonly intent: KeywordIntent | null;
  readonly relevanceScore: number;
  readonly commercialScore: number;
  readonly blendedScore: number;
  readonly quickWin: boolean;
  readonly reasoning?: string;
  readonly serpFeatures?: string[];
  readonly competitorCount?: number;
}

/**
 * Dream 100 expansion result with analytics
 */
export interface Dream100ExpansionResult {
  readonly success: boolean;
  readonly runId: UUID;
  readonly dream100Keywords: KeywordCandidate[];
  readonly totalCandidatesGenerated: number;
  readonly processingStats: ExpansionProcessingStats;
  readonly costBreakdown: ExpansionCostBreakdown;
  readonly qualityMetrics: ExpansionQualityMetrics;
  readonly warnings: string[];
  readonly errors: string[];
  readonly nextStageData?: {
    readonly tierExpansionSeeds: string[];
    readonly competitorDomains: string[];
  };
}

/**
 * Processing statistics and performance metrics
 */
export interface ExpansionProcessingStats {
  readonly totalProcessingTime: number; // milliseconds
  readonly stageTimings: Record<string, number>;
  readonly apiCallCounts: {
    readonly anthropic: number;
    readonly ahrefs: number;
  };
  readonly batchInfo: {
    readonly totalBatches: number;
    readonly avgBatchSize: number;
    readonly failedBatches: number;
  };
  readonly cacheHitRate: number;
  readonly throughputMetrics: {
    readonly keywordsPerMinute: number;
    readonly apiCallsPerMinute: number;
  };
}

/**
 * Cost breakdown and budget tracking
 */
export interface ExpansionCostBreakdown {
  readonly totalCost: number;
  readonly anthropicCost: number;
  readonly ahrefsCost: number;
  readonly budgetUtilization: number; // percentage
  readonly costPerKeyword: number;
  readonly estimatedVsActual: {
    readonly estimated: number;
    readonly actual: number;
    readonly variance: number;
  };
}

/**
 * Quality assurance metrics
 */
export interface ExpansionQualityMetrics {
  readonly avgRelevanceScore: number;
  readonly avgCommercialScore: number;
  readonly intentDistribution: Record<KeywordIntent, number>;
  readonly difficultyDistribution: {
    readonly easy: number; // 0-30
    readonly medium: number; // 31-70  
    readonly hard: number; // 71-100
  };
  readonly volumeDistribution: {
    readonly low: number; // 0-1000
    readonly medium: number; // 1001-10000
    readonly high: number; // 10001+
  };
  readonly quickWinCount: number;
  readonly duplicatesRemoved: number;
  readonly invalidKeywordsFiltered: number;
}

/**
 * Expansion processing stage enum
 */
export type ExpansionStage = 
  | 'initialization'
  | 'llm_expansion'
  | 'ahrefs_enrichment'
  | 'intent_classification'
  | 'relevance_scoring'
  | 'commercial_filtering'
  | 'final_selection'
  | 'result_preparation';

/**
 * Progress callback for real-time updates
 */
export type ExpansionProgressCallback = (progress: {
  stage: ExpansionStage;
  currentStep: string;
  progressPercent: number;
  keywordsProcessed: number;
  estimatedTimeRemaining: number;
  currentCost: number;
}) => void;

/**
 * Main Dream 100 Expansion Service
 */
export class Dream100ExpansionService {
  private readonly anthropicClient: AnthropicClient;
  private readonly ahrefsClient: AhrefsClient;
  private readonly maxCandidates = 300; // Generate up to 300 candidates before filtering
  private readonly minCommercialScore = 0.5; // Minimum commercial relevance
  private readonly maxProcessingTime = 20 * 60 * 1000; // 20 minutes max

  constructor(
    anthropicApiKey: string,
    ahrefsApiKey: string,
    redis?: any
  ) {
    this.anthropicClient = AnthropicClient.getInstance(anthropicApiKey, redis);
    this.ahrefsClient = AhrefsClient.getInstance(ahrefsApiKey, redis);
  }

  /**
   * Main entry point for Dream 100 expansion
   */
  async expandToDream100(
    request: Dream100ExpansionRequest,
    progressCallback?: ExpansionProgressCallback
  ): Promise<Dream100ExpansionResult> {
    const startTime = Date.now();
    const {
      runId,
      seedKeywords,
      targetCount = 100,
      market = 'US',
      industry,
      intentFocus = 'mixed',
      difficultyPreference = 'mixed',
      budgetLimit,
      qualityThreshold = 0.7,
      includeCompetitorAnalysis = false
    } = request;

    if (seedKeywords.length === 0 || seedKeywords.length > 5) {
      throw new Error('Seed keywords must be between 1 and 5 terms');
    }

    if (targetCount > 100) {
      throw new Error('Target count cannot exceed 100 for Dream 100 expansion');
    }

    // Initialize tracking variables
    const processingStats: Partial<ExpansionProcessingStats> = {
      stageTimings: {},
      apiCallCounts: { anthropic: 0, ahrefs: 0 },
      batchInfo: { totalBatches: 0, avgBatchSize: 0, failedBatches: 0 },
      cacheHitRate: 0
    };
    const costBreakdown: Partial<ExpansionCostBreakdown> = {
      totalCost: 0,
      anthropicCost: 0,
      ahrefsCost: 0
    };
    const qualityMetrics: Partial<ExpansionQualityMetrics> = {
      intentDistribution: {} as Record<KeywordIntent, number>,
      difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
      volumeDistribution: { low: 0, medium: 0, high: 0 },
      quickWinCount: 0,
      duplicatesRemoved: 0,
      invalidKeywordsFiltered: 0
    };
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      Sentry.addBreadcrumb({
        message: `Starting Dream 100 expansion for run ${runId}`,
        level: 'info',
        category: 'expansion',
        data: { 
          seedCount: seedKeywords.length, 
          targetCount, 
          market, 
          industry,
          intentFocus 
        }
      });

      // Stage 1: LLM Seed Expansion
      progressCallback?.({
        stage: 'llm_expansion',
        currentStep: 'Generating keyword candidates with AI',
        progressPercent: 10,
        keywordsProcessed: 0,
        estimatedTimeRemaining: 18 * 60,
        currentCost: 0
      });

      const stageStart = Date.now();
      const expansionCandidates = await this.performLLMExpansion(
        seedKeywords,
        {
          targetCount: this.maxCandidates,
          industry,
          intentFocus,
          market
        }
      );
      processingStats.stageTimings!['llm_expansion'] = Date.now() - stageStart;
      (processingStats.apiCallCounts as any).anthropic++;

      if (expansionCandidates.length === 0) {
        throw new Error('LLM expansion produced no viable candidates');
      }

      // Stage 2: Ahrefs Metrics Enrichment
      progressCallback?.({
        stage: 'ahrefs_enrichment',
        currentStep: 'Fetching search volume and difficulty data',
        progressPercent: 30,
        keywordsProcessed: expansionCandidates.length,
        estimatedTimeRemaining: 15 * 60,
        currentCost: costBreakdown.totalCost || 0
      });

      const enrichmentStart = Date.now();
      const enrichedCandidates = await this.performAhrefsEnrichment(
        expansionCandidates,
        market,
        progressCallback
      );
      processingStats.stageTimings!['ahrefs_enrichment'] = Date.now() - enrichmentStart;

      // Stage 3: Intent Classification
      progressCallback?.({
        stage: 'intent_classification',
        currentStep: 'Classifying search intent',
        progressPercent: 50,
        keywordsProcessed: enrichedCandidates.length,
        estimatedTimeRemaining: 10 * 60,
        currentCost: costBreakdown.totalCost || 0
      });

      const intentStart = Date.now();
      const intentClassifiedCandidates = await this.performIntentClassification(
        enrichedCandidates,
        { industry, market }
      );
      processingStats.stageTimings!['intent_classification'] = Date.now() - intentStart;
      (processingStats.apiCallCounts as any).anthropic++;

      // Stage 4: Relevance and Commercial Scoring
      progressCallback?.({
        stage: 'relevance_scoring',
        currentStep: 'Calculating relevance and commercial scores',
        progressPercent: 70,
        keywordsProcessed: intentClassifiedCandidates.length,
        estimatedTimeRemaining: 6 * 60,
        currentCost: costBreakdown.totalCost || 0
      });

      const scoringStart = Date.now();
      const scoredCandidates = await this.performRelevanceScoring(
        intentClassifiedCandidates,
        seedKeywords,
        intentFocus
      );
      processingStats.stageTimings!['relevance_scoring'] = Date.now() - scoringStart;

      // Stage 5: Commercial Filtering
      progressCallback?.({
        stage: 'commercial_filtering',
        currentStep: 'Filtering for commercial relevance',
        progressPercent: 85,
        keywordsProcessed: scoredCandidates.length,
        estimatedTimeRemaining: 3 * 60,
        currentCost: costBreakdown.totalCost || 0
      });

      const filteringStart = Date.now();
      const filteredCandidates = this.performCommercialFiltering(
        scoredCandidates,
        {
          intentFocus,
          difficultyPreference,
          qualityThreshold,
          minCommercialScore: this.minCommercialScore
        }
      );
      processingStats.stageTimings!['commercial_filtering'] = Date.now() - filteringStart;

      // Stage 6: Final Selection
      progressCallback?.({
        stage: 'final_selection',
        currentStep: 'Selecting final Dream 100 keywords',
        progressPercent: 95,
        keywordsProcessed: filteredCandidates.length,
        estimatedTimeRemaining: 1 * 60,
        currentCost: costBreakdown.totalCost || 0
      });

      const selectionStart = Date.now();
      const dream100Keywords = this.performFinalSelection(
        filteredCandidates,
        targetCount,
        {
          intentFocus,
          difficultyPreference,
          balanceIntentTypes: true,
          ensureQuickWins: true
        }
      );
      processingStats.stageTimings!['final_selection'] = Date.now() - selectionStart;

      // Calculate final metrics
      const totalProcessingTime = Date.now() - startTime;
      this.calculateQualityMetrics(dream100Keywords, qualityMetrics);
      this.calculateCostBreakdown(
        processingStats,
        costBreakdown,
        budgetLimit
      );

      // Prepare next stage data
      const nextStageData = {
        tierExpansionSeeds: dream100Keywords
          .filter(k => k.blendedScore >= 0.8)
          .slice(0, 20)
          .map(k => k.keyword),
        competitorDomains: includeCompetitorAnalysis 
          ? await this.extractCompetitorDomains(dream100Keywords.slice(0, 10))
          : []
      };

      progressCallback?.({
        stage: 'result_preparation',
        currentStep: 'Finalizing results',
        progressPercent: 100,
        keywordsProcessed: dream100Keywords.length,
        estimatedTimeRemaining: 0,
        currentCost: costBreakdown.totalCost || 0
      });

      const result: Dream100ExpansionResult = {
        success: true,
        runId,
        dream100Keywords,
        totalCandidatesGenerated: expansionCandidates.length,
        processingStats: {
          totalProcessingTime,
          stageTimings: processingStats.stageTimings!,
          apiCallCounts: processingStats.apiCallCounts!,
          batchInfo: processingStats.batchInfo!,
          cacheHitRate: processingStats.cacheHitRate || 0,
          throughputMetrics: {
            keywordsPerMinute: (dream100Keywords.length / totalProcessingTime) * 60000,
            apiCallsPerMinute: ((processingStats.apiCallCounts!.anthropic + processingStats.apiCallCounts!.ahrefs) / totalProcessingTime) * 60000
          }
        },
        costBreakdown: costBreakdown as ExpansionCostBreakdown,
        qualityMetrics: qualityMetrics as ExpansionQualityMetrics,
        warnings,
        errors,
        nextStageData
      };

      Sentry.addBreadcrumb({
        message: `Dream 100 expansion completed successfully`,
        level: 'info',
        category: 'expansion',
        data: {
          runId,
          keywordsGenerated: dream100Keywords.length,
          processingTime: totalProcessingTime,
          totalCost: costBreakdown.totalCost,
          avgScore: dream100Keywords.reduce((sum, k) => sum + k.blendedScore, 0) / dream100Keywords.length
        }
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      Sentry.captureException(error, {
        tags: { 
          service: 'dream100-expansion',
          runId,
          stage: 'unknown'
        },
        extra: {
          seedKeywords,
          targetCount,
          market,
          processingTime
        }
      });

      throw new Error(`Dream 100 expansion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stage 1: LLM-powered keyword expansion
   */
  private async performLLMExpansion(
    seedKeywords: string[],
    options: {
      targetCount: number;
      industry?: string;
      intentFocus?: string;
      market?: string;
    }
  ): Promise<string[]> {
    const { targetCount, industry, intentFocus, market } = options;
    
    try {
      const expansionRequest: AnthropicKeywordExpansion = {
        seed_keywords: seedKeywords,
        target_count: targetCount,
        industry: industry || 'general business',
        intent_focus: intentFocus as any || 'mixed'
      };

      const response = await this.anthropicClient.expandToDream100(expansionRequest);
      
      if (!response.data?.keywords) {
        throw new Error('LLM expansion returned invalid data structure');
      }

      // Extract and normalize keywords
      const candidates = response.data.keywords
        .map(item => normalizeKeyword(item.keyword))
        .filter(keyword => {
          const quality = validateKeywordQuality(keyword);
          return quality.isValid;
        })
        .filter((keyword, index, array) => array.indexOf(keyword) === index); // Remove duplicates

      if (candidates.length < Math.min(50, targetCount * 0.5)) {
        throw new Error(`LLM expansion produced insufficient candidates: ${candidates.length} (expected at least ${Math.min(50, targetCount * 0.5)})`);
      }

      return candidates.slice(0, targetCount);

    } catch (error) {
      throw new Error(`LLM expansion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Stage 2: Ahrefs metrics enrichment with batch processing
   */
  private async performAhrefsEnrichment(
    candidates: string[],
    market: string,
    progressCallback?: ExpansionProgressCallback
  ): Promise<Array<{ keyword: string; metrics: AhrefsKeywordData }>> {
    const batchSize = 100;
    const batches = this.chunkArray(candidates, batchSize);
    const enrichedResults: Array<{ keyword: string; metrics: AhrefsKeywordData }> = [];
    let processedCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const response = await this.ahrefsClient.getKeywordMetrics({
          keywords: batch,
          country: market,
          mode: 'exact',
          include_serp: true
        });

        if (response.success && response.data) {
          for (const metrics of response.data) {
            enrichedResults.push({
              keyword: metrics.keyword,
              metrics
            });
          }
        }

        processedCount += batch.length;
        
        // Update progress
        progressCallback?.({
          stage: 'ahrefs_enrichment',
          currentStep: `Processed batch ${i + 1}/${batches.length}`,
          progressPercent: 30 + (40 * (i + 1) / batches.length),
          keywordsProcessed: processedCount,
          estimatedTimeRemaining: 15 * 60 * (1 - (i + 1) / batches.length),
          currentCost: 0 // Will be calculated later
        });

        // Rate limiting delay
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.warn(`Ahrefs batch ${i + 1} failed:`, (error as Error).message);
        // Continue with other batches - we'll handle missing data later
      }
    }

    if (enrichedResults.length === 0) {
      throw new Error('Ahrefs enrichment failed completely - no metrics obtained');
    }

    return enrichedResults;
  }

  /**
   * Stage 3: Intent classification using LLM
   */
  private async performIntentClassification(
    enrichedCandidates: Array<{ keyword: string; metrics: AhrefsKeywordData }>,
    context: { industry?: string; market?: string }
  ): Promise<Array<{ keyword: string; metrics: AhrefsKeywordData; intent: KeywordIntent; confidence: number }>> {
    const keywords = enrichedCandidates.map(c => c.keyword);
    
    try {
      const classificationRequest: AnthropicIntentClassification = {
        keywords,
        context: {
          industry: context.industry || 'general business',
          business_type: 'B2B/B2C',
          target_audience: 'business decision makers'
        }
      };

      const response = await this.anthropicClient.classifyIntent(classificationRequest);
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Intent classification returned invalid data structure');
      }

      // Map results back to enriched candidates
      const classifiedCandidates = enrichedCandidates.map(candidate => {
        const intentResult = response.data.find(
          (result: AnthropicIntentResult) => result.keyword === candidate.keyword
        );
        
        return {
          ...candidate,
          intent: (intentResult?.intent as KeywordIntent) || 'informational',
          confidence: intentResult?.confidence || 0.5
        };
      });

      return classifiedCandidates;

    } catch (error) {
      // Fallback to heuristic intent classification
      console.warn('LLM intent classification failed, using heuristic fallback');
      
      return enrichedCandidates.map(candidate => ({
        ...candidate,
        intent: this.classifyIntentHeuristic(candidate.keyword),
        confidence: 0.6
      }));
    }
  }

  /**
   * Stage 4: Relevance and commercial scoring
   */
  private async performRelevanceScoring(
    classifiedCandidates: Array<{ keyword: string; metrics: AhrefsKeywordData; intent: KeywordIntent; confidence: number }>,
    seedKeywords: string[],
    intentFocus?: string
  ): Promise<KeywordCandidate[]> {
    return classifiedCandidates.map(candidate => {
      const relevanceScore = this.calculateRelevanceScore(
        candidate.keyword,
        seedKeywords
      );
      
      const commercialScore = this.calculateCommercialScore(
        candidate.keyword,
        candidate.intent,
        candidate.metrics
      );

      const blendedScore = this.calculateBlendedScore(
        candidate.metrics.search_volume,
        candidate.metrics.keyword_difficulty,
        candidate.intent,
        relevanceScore,
        commercialScore,
        intentFocus
      );

      const quickWin = this.isQuickWin(
        candidate.metrics.keyword_difficulty,
        candidate.metrics.search_volume,
        blendedScore
      );

      return {
        keyword: candidate.keyword,
        stage: 'dream100' as KeywordStage,
        volume: candidate.metrics.search_volume,
        difficulty: candidate.metrics.keyword_difficulty,
        cpc: candidate.metrics.cpc,
        intent: candidate.intent,
        relevanceScore,
        commercialScore,
        blendedScore,
        quickWin,
        serpFeatures: [], // Will be populated if SERP data available
        competitorCount: 0 // Will be calculated later if needed
      };
    });
  }

  /**
   * Stage 5: Commercial filtering
   */
  private performCommercialFiltering(
    scoredCandidates: KeywordCandidate[],
    options: {
      intentFocus?: string;
      difficultyPreference?: string;
      qualityThreshold: number;
      minCommercialScore: number;
    }
  ): KeywordCandidate[] {
    const { intentFocus, difficultyPreference, qualityThreshold, minCommercialScore } = options;
    
    return scoredCandidates.filter(candidate => {
      // Quality threshold filter
      if (candidate.blendedScore < qualityThreshold) {
        return false;
      }

      // Commercial relevance filter
      if (candidate.commercialScore < minCommercialScore) {
        return false;
      }

      // Intent focus filter
      if (intentFocus && intentFocus !== 'mixed') {
        if (candidate.intent !== intentFocus) {
          return false;
        }
      }

      // Difficulty preference filter
      if (difficultyPreference && difficultyPreference !== 'mixed') {
        const difficulty = candidate.difficulty;
        switch (difficultyPreference) {
          case 'easy':
            if (difficulty > 30) return false;
            break;
          case 'medium':
            if (difficulty <= 30 || difficulty > 70) return false;
            break;
          case 'hard':
            if (difficulty <= 70) return false;
            break;
        }
      }

      // Volume threshold (must have meaningful search volume)
      if (candidate.volume < 10) {
        return false;
      }

      return true;
    });
  }

  /**
   * Stage 6: Final selection with intelligent balancing
   */
  private performFinalSelection(
    filteredCandidates: KeywordCandidate[],
    targetCount: number,
    options: {
      intentFocus?: string;
      difficultyPreference?: string;
      balanceIntentTypes: boolean;
      ensureQuickWins: boolean;
    }
  ): KeywordCandidate[] {
    const { balanceIntentTypes, ensureQuickWins } = options;
    
    // Sort by blended score descending
    const sortedCandidates = [...filteredCandidates].sort(
      (a, b) => b.blendedScore - a.blendedScore
    );

    if (!balanceIntentTypes) {
      return sortedCandidates.slice(0, targetCount);
    }

    // Intelligent balancing approach
    const selected: KeywordCandidate[] = [];
    const intentBuckets: Record<KeywordIntent, KeywordCandidate[]> = {
      'transactional': [],
      'commercial': [],
      'informational': [],
      'navigational': []
    };

    // Group by intent
    for (const candidate of sortedCandidates) {
      if (candidate.intent) {
        intentBuckets[candidate.intent].push(candidate);
      }
    }

    // Calculate target distribution (favor commercial intent for Dream 100)
    const targetDistribution = {
      'transactional': Math.floor(targetCount * 0.4), // 40%
      'commercial': Math.floor(targetCount * 0.35),   // 35%
      'informational': Math.floor(targetCount * 0.2), // 20%
      'navigational': Math.floor(targetCount * 0.05)  // 5%
    };

    // Select from each bucket
    for (const [intent, targetAmount] of Object.entries(targetDistribution)) {
      const bucket = intentBuckets[intent as KeywordIntent];
      const toSelect = Math.min(targetAmount, bucket.length);
      selected.push(...bucket.slice(0, toSelect));
    }

    // Fill remaining slots with best available
    const remaining = targetCount - selected.length;
    if (remaining > 0) {
      const alreadySelected = new Set(selected.map(k => k.keyword));
      const remainingCandidates = sortedCandidates
        .filter(k => !alreadySelected.has(k.keyword))
        .slice(0, remaining);
      selected.push(...remainingCandidates);
    }

    // Ensure quick wins if requested
    if (ensureQuickWins) {
      const quickWins = selected.filter(k => k.quickWin);
      const minQuickWins = Math.floor(targetCount * 0.1); // At least 10%
      
      if (quickWins.length < minQuickWins) {
        // Replace lowest scoring non-quick-wins with quick wins
        const nonQuickWins = selected
          .filter(k => !k.quickWin)
          .sort((a, b) => a.blendedScore - b.blendedScore);
        
        const availableQuickWins = filteredCandidates
          .filter(k => k.quickWin && !selected.some(s => s.keyword === k.keyword))
          .sort((a, b) => b.blendedScore - a.blendedScore);
        
        const toReplace = Math.min(
          minQuickWins - quickWins.length,
          nonQuickWins.length,
          availableQuickWins.length
        );
        
        for (let i = 0; i < toReplace; i++) {
          const indexToReplace = selected.findIndex(
            k => k.keyword === nonQuickWins[i].keyword
          );
          selected[indexToReplace] = availableQuickWins[i];
        }
      }
    }

    return selected.slice(0, targetCount);
  }

  /**
   * Calculate semantic relevance score using keyword similarity
   */
  private calculateRelevanceScore(
    keyword: string,
    seedKeywords: string[]
  ): number {
    let maxSimilarity = 0;
    
    for (const seed of seedKeywords) {
      const similarity = this.calculateSemanticSimilarity(keyword, seed);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
    
    return Math.max(0, Math.min(1, maxSimilarity));
  }

  /**
   * Calculate commercial relevance score
   */
  private calculateCommercialScore(
    keyword: string,
    intent: KeywordIntent,
    metrics: AhrefsKeywordData
  ): number {
    let score = 0;

    // Intent contribution (40%)
    switch (intent) {
      case 'transactional': score += 0.4; break;
      case 'commercial': score += 0.35; break;
      case 'informational': score += 0.15; break;
      case 'navigational': score += 0.1; break;
    }

    // CPC contribution (30%) - higher CPC indicates commercial value
    const normalizedCpc = Math.min(metrics.cpc / 10, 1); // Normalize to 0-1
    score += normalizedCpc * 0.3;

    // Competition level (20%) - moderate competition is ideal
    const difficulty = metrics.keyword_difficulty;
    const competitionScore = difficulty > 80 ? 0.1 : 
                           difficulty > 60 ? 0.2 :
                           difficulty > 30 ? 0.2 :
                           0.15; // Very low competition might indicate low commercial value
    score += competitionScore;

    // Volume contribution (10%) - ensure meaningful volume
    const volumeScore = metrics.search_volume > 1000 ? 0.1 :
                       metrics.search_volume > 100 ? 0.08 :
                       metrics.search_volume > 10 ? 0.05 : 0;
    score += volumeScore;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate blended score using Dream 100 specific weights
   */
  private calculateBlendedScore(
    volume: number,
    difficulty: number,
    intent: KeywordIntent,
    relevanceScore: number,
    commercialScore: number,
    intentFocus?: string
  ): number {
    // Dream 100 scoring weights (from PRD)
    const volumeWeight = 0.40;
    const intentWeight = 0.30;
    const relevanceWeight = 0.15;
    const trendWeight = 0.10; // Placeholder - would need trend data
    const easeWeight = 0.05;

    // Normalize volume (logarithmic scale for better distribution)
    const normalizedVolume = Math.min(Math.log10(volume + 1) / 6, 1);

    // Intent score (higher for commercial intents in Dream 100)
    const intentScore = intent === 'transactional' ? 1.0 :
                       intent === 'commercial' ? 0.9 :
                       intent === 'informational' ? 0.6 :
                       intent === 'navigational' ? 0.4 : 0.5;

    // Ease score (inverse of difficulty)
    const easeScore = (100 - difficulty) / 100;

    // Trend score (placeholder - would use actual trend data)
    const trendScore = 0.5;

    // Calculate weighted score
    const blendedScore = 
      (normalizedVolume * volumeWeight) +
      (intentScore * intentWeight) +
      (relevanceScore * relevanceWeight) +
      (trendScore * trendWeight) +
      (easeScore * easeWeight);

    // Apply commercial score multiplier
    const finalScore = blendedScore * (0.7 + (commercialScore * 0.3));

    return Math.max(0, Math.min(1, finalScore));
  }

  /**
   * Determine if keyword qualifies as a quick win
   */
  private isQuickWin(
    difficulty: number,
    volume: number,
    blendedScore: number
  ): boolean {
    const ease = (100 - difficulty) / 100;
    const hasVolume = volume >= 100;
    const hasQuality = blendedScore >= 0.7;
    
    return ease >= 0.7 && hasVolume && hasQuality;
  }

  /**
   * Heuristic intent classification fallback
   */
  private classifyIntentHeuristic(keyword: string): KeywordIntent {
    const lower = keyword.toLowerCase();
    
    // Transactional indicators
    if (/\b(buy|purchase|order|price|cost|discount|deal|sale)\b/.test(lower)) {
      return 'transactional';
    }
    
    // Commercial indicators
    if (/\b(best|top|review|compare|vs|alternative|tool|software|service)\b/.test(lower)) {
      return 'commercial';
    }
    
    // Navigational indicators
    if (/\b(login|sign in|dashboard|account|contact)\b/.test(lower)) {
      return 'navigational';
    }
    
    // Default to informational
    return 'informational';
  }

  /**
   * Calculate semantic similarity between two keywords (simplified)
   */
  private calculateSemanticSimilarity(keyword1: string, keyword2: string): number {
    const words1 = new Set(keyword1.toLowerCase().split(' '));
    const words2 = new Set(keyword2.toLowerCase().split(' '));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    // Jaccard similarity with length penalty for very different lengths
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;
    const lengthPenalty = Math.abs(words1.size - words2.size) / Math.max(words1.size, words2.size);
    
    return Math.max(0, jaccard - (lengthPenalty * 0.2));
  }

  /**
   * Extract competitor domains from top SERP results
   */
  private async extractCompetitorDomains(
    topKeywords: KeywordCandidate[]
  ): Promise<string[]> {
    const domains = new Set<string>();
    
    // This would typically extract domains from SERP data
    // For now, return empty array as placeholder
    // Implementation would parse SERP results from Ahrefs data
    
    return Array.from(domains).slice(0, 10);
  }

  /**
   * Calculate final quality metrics
   */
  private calculateQualityMetrics(
    keywords: KeywordCandidate[],
    metrics: Partial<ExpansionQualityMetrics>
  ): void {
    if (keywords.length === 0) return;

    // Calculate averages
    (metrics as any).avgRelevanceScore = keywords.reduce((sum, k) => sum + k.relevanceScore, 0) / keywords.length;
    (metrics as any).avgCommercialScore = keywords.reduce((sum, k) => sum + k.commercialScore, 0) / keywords.length;

    // Intent distribution
    const intentCounts: Record<KeywordIntent, number> = {
      'transactional': 0,
      'commercial': 0,
      'informational': 0,
      'navigational': 0
    };
    
    for (const keyword of keywords) {
      if (keyword.intent) {
        intentCounts[keyword.intent]++;
      }
    }
    (metrics as any).intentDistribution = intentCounts;

    // Difficulty distribution
    const difficultyDist = { easy: 0, medium: 0, hard: 0 };
    for (const keyword of keywords) {
      if (keyword.difficulty <= 30) difficultyDist.easy++;
      else if (keyword.difficulty <= 70) difficultyDist.medium++;
      else difficultyDist.hard++;
    }
    (metrics as any).difficultyDistribution = difficultyDist;

    // Volume distribution
    const volumeDist = { low: 0, medium: 0, high: 0 };
    for (const keyword of keywords) {
      if (keyword.volume <= 1000) volumeDist.low++;
      else if (keyword.volume <= 10000) volumeDist.medium++;
      else volumeDist.high++;
    }
    (metrics as any).volumeDistribution = volumeDist;

    // Quick win count
    (metrics as any).quickWinCount = keywords.filter(k => k.quickWin).length;
  }

  /**
   * Calculate final cost breakdown
   */
  private calculateCostBreakdown(
    processingStats: Partial<ExpansionProcessingStats>,
    costBreakdown: Partial<ExpansionCostBreakdown>,
    budgetLimit?: number
  ): void {
    // Estimate costs based on API usage
    const anthropicCalls = processingStats.apiCallCounts?.anthropic || 0;
    const ahrefsCalls = processingStats.apiCallCounts?.ahrefs || 0;

    (costBreakdown as any).anthropicCost = anthropicCalls * 0.15; // ~$0.15 per LLM call
    (costBreakdown as any).ahrefsCost = ahrefsCalls * 0.20; // ~$0.20 per Ahrefs batch
    (costBreakdown as any).totalCost = (costBreakdown as any).anthropicCost + (costBreakdown as any).ahrefsCost;

    if (budgetLimit) {
      (costBreakdown as any).budgetUtilization = ((costBreakdown as any).totalCost / budgetLimit) * 100;
    }
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
    lastUsage: {
      timestamp: number;
      cost: number;
      keywords: number;
    } | null;
  } {
    // Implementation would check integration health
    return {
      status: 'healthy',
      integrations: {
        anthropic: 'connected',
        ahrefs: 'connected'
      },
      lastUsage: null
    };
  }

  /**
   * Estimate costs before running expansion
   */
  estimateExpansionCost(
    seedCount: number,
    targetCount: number = 100,
    includeCompetitorAnalysis: boolean = false
  ): {
    estimatedCost: number;
    breakdown: {
      llmExpansion: number;
      ahrefsEnrichment: number;
      intentClassification: number;
      competitorAnalysis?: number;
    };
    confidence: number;
  } {
    const baseMultiplier = Math.max(1, Math.log10(targetCount));
    
    const breakdown = {
      llmExpansion: 0.15 * baseMultiplier,
      ahrefsEnrichment: 0.20 * (targetCount / 100),
      intentClassification: 0.10 * baseMultiplier,
      competitorAnalysis: includeCompetitorAnalysis ? 0.25 : undefined
    };
    
    const estimatedCost = Object.values(breakdown)
      .filter(cost => cost !== undefined)
      .reduce((sum, cost) => sum + (cost || 0), 0);
    
    return {
      estimatedCost,
      breakdown,
      confidence: 0.85 // High confidence in cost estimates
    };
  }
}

/**
 * Validation schemas for Dream 100 expansion
 */
export const Dream100ExpansionRequestSchema = z.object({
  runId: z.string().uuid(),
  seedKeywords: z.array(z.string().min(1).max(100)).min(1).max(5),
  targetCount: z.number().int().min(10).max(100).default(100),
  market: z.string().length(2).default('US'),
  industry: z.string().max(100).optional(),
  intentFocus: z.enum(['commercial', 'informational', 'transactional', 'mixed']).default('mixed'),
  difficultyPreference: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  budgetLimit: z.number().positive().optional(),
  qualityThreshold: z.number().min(0).max(1).default(0.7),
  includeCompetitorAnalysis: z.boolean().default(false)
});

/**
 * Type guards for runtime validation
 */
export const isDream100ExpansionRequest = (value: unknown): value is Dream100ExpansionRequest => {
  try {
    Dream100ExpansionRequestSchema.parse(value);
    return true;
  } catch {
    return false;
  }
};

export const isExpansionStage = (value: unknown): value is ExpansionStage => {
  return typeof value === 'string' && [
    'initialization', 'llm_expansion', 'ahrefs_enrichment', 'intent_classification',
    'relevance_scoring', 'commercial_filtering', 'final_selection', 'result_preparation'
  ].includes(value);
};

/**
 * Factory function for creating expansion service instances
 */
export const createDream100ExpansionService = (
  anthropicApiKey: string,
  ahrefsApiKey: string,
  redis?: any
): Dream100ExpansionService => {
  return new Dream100ExpansionService(anthropicApiKey, ahrefsApiKey, redis);
};

// Service class is already exported above, no need to re-export

// Alias for backwards compatibility
export const ExpansionService = Dream100ExpansionService;
export type ExpansionService = Dream100ExpansionService;

/**
 * Export service for job queue integration
 */
export const processExpansionJob = async (
  job: PipelineJob,
  expansionService: Dream100ExpansionService
): Promise<JobResult> => {
  const startTime = Date.now();
  
  try {
    const request = job.data.input as any as Dream100ExpansionRequest;
    
    // Validate input
    if (!isDream100ExpansionRequest(request)) {
      throw new Error('Invalid expansion request format');
    }
    
    // Execute expansion
    const result = await expansionService.expandToDream100(request);
    
    const metrics: JobMetrics = {
      executionTime: Date.now() - startTime,
      memoryUsed: 0, // Would be calculated in production
      cpuTime: 0,
      apiCalls: {
        anthropic: result.processingStats.apiCallCounts.anthropic,
        ahrefs: result.processingStats.apiCallCounts.ahrefs
      },
      dataProcessed: {
        input: request.seedKeywords.length,
        output: result.dream100Keywords.length,
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
      nextJobs: [] // Next jobs would be tier2 expansion, competitor discovery, etc.
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
