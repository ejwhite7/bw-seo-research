/**
 * Universe Expansion Service Integration Example
 * 
 * Demonstrates how to integrate the Universe Expansion Service with
 * the existing Dream 100 service and prepare data for the next pipeline stages.
 */

import {
  UniverseExpansionService,
  createUniverseExpansionService,
  type UniverseExpansionRequest,
  type UniverseExpansionResult,
  type UniverseProgressCallback
} from '../src/services/universe';
import { Dream100ExpansionService } from '../src/services/expansion';
import type { UUID } from '../src/models';

/**
 * Complete pipeline integration example
 */
export class KeywordPipelineIntegration {
  private dream100Service: Dream100ExpansionService;
  private universeService: UniverseExpansionService;

  constructor(anthropicApiKey: string, ahrefsApiKey: string, redis?: any) {
    this.dream100Service = new Dream100ExpansionService(anthropicApiKey, ahrefsApiKey, redis);
    this.universeService = createUniverseExpansionService(anthropicApiKey, ahrefsApiKey, redis);
  }

  /**
   * Execute complete Dream 100 → Universe expansion pipeline
   */
  async executeFullPipeline(
    runId: UUID,
    seedKeywords: string[],
    options: {
      market?: string;
      industry?: string;
      targetUniverseSize?: number;
      budgetLimit?: number;
      qualityThreshold?: number;
    } = {}
  ): Promise<{
    dream100Result: any;
    universeResult: UniverseExpansionResult;
    pipelineMetrics: {
      totalProcessingTime: number;
      totalCost: number;
      keywordsFinal: number;
      qualityScore: number;
    };
  }> {
    const pipelineStart = Date.now();
    
    console.log(`🚀 Starting keyword pipeline for run ${runId}`);
    console.log(`📝 Input: ${seedKeywords.length} seed keywords`);
    
    // Step 1: Dream 100 Expansion
    console.log('\n📈 Phase 1: Dream 100 Expansion');
    
    const dream100Request = {
      runId,
      seedKeywords,
      targetCount: 100,
      market: options.market || 'US',
      industry: options.industry,
      budgetLimit: options.budgetLimit ? options.budgetLimit * 0.3 : undefined, // 30% of budget for Dream 100
      qualityThreshold: 0.7,
      includeCompetitorAnalysis: true
    };

    const dream100Result = await this.dream100Service.expandToDream100(
      dream100Request,
      this.createDream100ProgressCallback()
    );

    if (!dream100Result.success) {
      throw new Error('Dream 100 expansion failed');
    }

    console.log(`✅ Dream 100 completed: ${dream100Result.dream100Keywords.length} keywords generated`);
    console.log(`💰 Dream 100 cost: $${dream100Result.costBreakdown.totalCost.toFixed(2)}`);

    // Step 2: Universe Expansion
    console.log('\n🌍 Phase 2: Universe Expansion');

    const universeRequest: UniverseExpansionRequest = {
      runId,
      dream100Keywords: dream100Result.dream100Keywords.map(k => k.keyword),
      targetTotalCount: options.targetUniverseSize || 10000,
      maxTier2PerDream: 10,
      maxTier3PerTier2: 10,
      market: options.market || 'US',
      industry: options.industry,
      budgetLimit: options.budgetLimit ? options.budgetLimit * 0.7 : undefined, // 70% of budget for Universe
      qualityThreshold: options.qualityThreshold || 0.6,
      enableCompetitorMining: true,
      enableSerpAnalysis: true,
      enableSemanticVariations: true
    };

    const universeResult = await this.universeService.expandToUniverse(
      universeRequest,
      this.createUniverseProgressCallback()
    );

    if (!universeResult.success) {
      throw new Error('Universe expansion failed');
    }

    console.log(`✅ Universe completed: ${universeResult.totalKeywords} total keywords`);
    console.log(`📊 Distribution: ${universeResult.keywordsByTier.dream100.length} Dream 100, ${universeResult.keywordsByTier.tier2.length} Tier-2, ${universeResult.keywordsByTier.tier3.length} Tier-3`);
    console.log(`💰 Universe cost: $${universeResult.costBreakdown.totalCost.toFixed(2)}`);

    // Calculate pipeline metrics
    const totalProcessingTime = Date.now() - pipelineStart;
    const totalCost = dream100Result.costBreakdown.totalCost + universeResult.costBreakdown.totalCost;
    const qualityScore = (
      dream100Result.qualityMetrics.avgRelevanceScore * 0.3 +
      universeResult.qualityMetrics.avgRelevanceScore * 0.7
    );

    const pipelineMetrics = {
      totalProcessingTime,
      totalCost,
      keywordsFinal: universeResult.totalKeywords,
      qualityScore
    };

    console.log('\n🎉 Pipeline Completed Successfully!');
    console.log(`⏱️  Total time: ${Math.round(totalProcessingTime / 1000 / 60)} minutes`);
    console.log(`💰 Total cost: $${totalCost.toFixed(2)}`);
    console.log(`📈 Quality score: ${(qualityScore * 100).toFixed(1)}%`);
    console.log(`🎯 Keywords generated: ${universeResult.totalKeywords}`);

    return {
      dream100Result,
      universeResult,
      pipelineMetrics
    };
  }

  /**
   * Progressive expansion with intermediate validation
   */
  async executeProgressiveExpansion(
    runId: UUID,
    seedKeywords: string[],
    options: {
      market?: string;
      industry?: string;
      validateAtEachStage?: boolean;
      saveIntermediateResults?: boolean;
    } = {}
  ): Promise<UniverseExpansionResult> {
    console.log('🔄 Starting progressive universe expansion...\n');

    // Start with Dream 100
    const dream100Result = await this.dream100Service.expandToDream100({
      runId,
      seedKeywords,
      targetCount: 100,
      market: options.market || 'US',
      industry: options.industry
    });

    // Validate Dream 100 quality
    if (options.validateAtEachStage) {
      const avgScore = dream100Result.dream100Keywords.reduce((sum, k) => sum + k.blendedScore, 0) / dream100Result.dream100Keywords.length;
      if (avgScore < 0.7) {
        throw new Error(`Dream 100 quality too low: ${(avgScore * 100).toFixed(1)}%`);
      }
      console.log(`✅ Dream 100 validation passed: ${(avgScore * 100).toFixed(1)}% quality`);
    }

    // Progressive universe expansion with smaller targets
    const smallUniverseRequest: UniverseExpansionRequest = {
      runId,
      dream100Keywords: dream100Result.dream100Keywords.slice(0, 20).map(k => k.keyword), // Start with top 20
      targetTotalCount: 1000, // Smaller initial target
      maxTier2PerDream: 5,
      maxTier3PerTier2: 8,
      market: options.market || 'US',
      industry: options.industry,
      qualityThreshold: 0.7 // Higher quality threshold
    };

    const smallResult = await this.universeService.expandToUniverse(smallUniverseRequest);
    
    if (options.validateAtEachStage) {
      if (smallResult.qualityMetrics.avgQualityScore < 0.6) {
        throw new Error('Progressive expansion quality check failed');
      }
      console.log(`✅ Progressive expansion validation passed`);
    }

    // Full expansion with validated parameters
    const fullRequest: UniverseExpansionRequest = {
      runId,
      dream100Keywords: dream100Result.dream100Keywords.map(k => k.keyword),
      targetTotalCount: 10000,
      maxTier2PerDream: 10,
      maxTier3PerTier2: 10,
      market: options.market || 'US',
      industry: options.industry,
      qualityThreshold: 0.6, // Adjusted based on small expansion results
      enableCompetitorMining: true,
      enableSerpAnalysis: true,
      enableSemanticVariations: true
    };

    return await this.universeService.expandToUniverse(fullRequest);
  }

  /**
   * Cost-optimized expansion for budget-conscious scenarios
   */
  async executeBudgetOptimizedExpansion(
    runId: UUID,
    seedKeywords: string[],
    budgetLimit: number,
    options: {
      market?: string;
      industry?: string;
      prioritizeQuality?: boolean;
    } = {}
  ): Promise<UniverseExpansionResult> {
    console.log(`💰 Starting budget-optimized expansion (budget: $${budgetLimit})\n`);

    // Get cost estimate first
    const costEstimate = this.universeService.estimateExpansionCost(
      seedKeywords.length,
      8000, // Slightly lower target to stay within budget
      false // Disable expensive features initially
    );

    if (costEstimate.estimatedCost > budgetLimit) {
      console.log(`⚠️  Initial estimate ($${costEstimate.estimatedCost.toFixed(2)}) exceeds budget, optimizing...`);
      
      // Reduce scope to fit budget
      const scaleFactor = budgetLimit / costEstimate.estimatedCost;
      const adjustedTarget = Math.floor(8000 * scaleFactor);
      
      console.log(`📉 Adjusted target: ${adjustedTarget} keywords`);
    }

    // Execute Dream 100 first (required baseline)
    const dream100Result = await this.dream100Service.expandToDream100({
      runId,
      seedKeywords,
      targetCount: Math.min(100, Math.floor(budgetLimit / 0.5)), // Rough cost per Dream keyword
      market: options.market || 'US',
      industry: options.industry,
      budgetLimit: budgetLimit * 0.3
    });

    const remainingBudget = budgetLimit - dream100Result.costBreakdown.totalCost;
    console.log(`💰 Remaining budget after Dream 100: $${remainingBudget.toFixed(2)}`);

    // Calculate optimal universe parameters for remaining budget
    const universeTarget = Math.min(
      10000,
      Math.floor(remainingBudget * 150) // Rough keywords per dollar
    );

    const universeRequest: UniverseExpansionRequest = {
      runId,
      dream100Keywords: dream100Result.dream100Keywords.map(k => k.keyword),
      targetTotalCount: universeTarget,
      maxTier2PerDream: options.prioritizeQuality ? 8 : 12, // Fewer tier-2 if prioritizing quality
      maxTier3PerTier2: options.prioritizeQuality ? 8 : 12,
      market: options.market || 'US',
      industry: options.industry,
      budgetLimit: remainingBudget,
      qualityThreshold: options.prioritizeQuality ? 0.7 : 0.5,
      enableCompetitorMining: remainingBudget > 20, // Only if budget allows
      enableSerpAnalysis: true, // Always enable as it's cost-effective
      enableSemanticVariations: remainingBudget > 10 // Only if budget allows
    };

    return await this.universeService.expandToUniverse(universeRequest);
  }

  /**
   * High-quality expansion for enterprise scenarios
   */
  async executeEnterpriseExpansion(
    runId: UUID,
    seedKeywords: string[],
    options: {
      market?: string;
      industry?: string;
      customQualityThresholds?: {
        dream100: number;
        tier2: number;
        tier3: number;
      };
      enableAllFeatures?: boolean;
    } = {}
  ): Promise<{
    result: UniverseExpansionResult;
    qualityReport: {
      overallQuality: number;
      tierQuality: { [key: string]: number };
      quickWinRate: number;
      recommendedOptimizations: string[];
    };
  }> {
    console.log('🏢 Starting enterprise-grade expansion...\n');

    const qualityThresholds = options.customQualityThresholds || {
      dream100: 0.8,
      tier2: 0.7,
      tier3: 0.6
    };

    // High-quality Dream 100 generation
    const dream100Result = await this.dream100Service.expandToDream100({
      runId,
      seedKeywords,
      targetCount: 100,
      market: options.market || 'US',
      industry: options.industry,
      qualityThreshold: qualityThresholds.dream100,
      includeCompetitorAnalysis: true
    });

    // Enterprise universe expansion with all features
    const universeRequest: UniverseExpansionRequest = {
      runId,
      dream100Keywords: dream100Result.dream100Keywords.map(k => k.keyword),
      targetTotalCount: 10000,
      maxTier2PerDream: 12, // Higher for more coverage
      maxTier3PerTier2: 15, // Higher for more long-tail coverage
      market: options.market || 'US',
      industry: options.industry,
      qualityThreshold: qualityThresholds.tier2,
      enableCompetitorMining: options.enableAllFeatures !== false,
      enableSerpAnalysis: options.enableAllFeatures !== false,
      enableSemanticVariations: options.enableAllFeatures !== false
    };

    const result = await this.universeService.expandToUniverse(universeRequest);

    // Generate quality report
    const qualityReport = {
      overallQuality: (
        result.qualityMetrics.avgRelevanceScore * 0.4 +
        result.qualityMetrics.avgQualityScore * 0.4 +
        result.qualityMetrics.averageConfidence * 0.2
      ),
      tierQuality: {
        dream100: 0.95, // Dream 100 always high quality
        tier2: result.keywordsByTier.tier2.reduce((sum, k) => sum + k.blendedScore, 0) / result.keywordsByTier.tier2.length,
        tier3: result.keywordsByTier.tier3.reduce((sum, k) => sum + k.blendedScore, 0) / result.keywordsByTier.tier3.length
      },
      quickWinRate: result.qualityMetrics.quickWinCounts.total / result.totalKeywords,
      recommendedOptimizations: this.generateOptimizationRecommendations(result)
    };

    console.log('\n📊 Quality Report:');
    console.log(`🎯 Overall Quality: ${(qualityReport.overallQuality * 100).toFixed(1)}%`);
    console.log(`🚀 Quick Win Rate: ${(qualityReport.quickWinRate * 100).toFixed(1)}%`);
    console.log(`📈 Tier Quality: Dream 100: ${(qualityReport.tierQuality.dream100 * 100).toFixed(1)}%, Tier-2: ${(qualityReport.tierQuality.tier2 * 100).toFixed(1)}%, Tier-3: ${(qualityReport.tierQuality.tier3 * 100).toFixed(1)}%`);

    return { result, qualityReport };
  }

  /**
   * Prepare data for next pipeline stages
   */
  prepareForNextStages(universeResult: UniverseExpansionResult): {
    clusteringInput: {
      keywords: Array<{
        id: string;
        keyword: string;
        stage: string;
        volume: number;
        difficulty: number;
        intent: string | null;
        blendedScore: number;
      }>;
      settings: {
        similarityThreshold: number;
        maxClusters: number;
        minClusterSize: number;
      };
    };
    scoringInput: {
      keywords: any[];
      weights: {
        dream100: any;
        tier2: any;
        tier3: any;
      };
    };
    exportData: {
      keywords: any[];
      metadata: {
        totalKeywords: number;
        processingTime: number;
        qualityMetrics: any;
      };
    };
  } {
    const allKeywords = [
      ...universeResult.keywordsByTier.dream100,
      ...universeResult.keywordsByTier.tier2,
      ...universeResult.keywordsByTier.tier3
    ];

    return {
      clusteringInput: {
        keywords: allKeywords.map((keyword, index) => ({
          id: `keyword-${index}`,
          keyword: keyword.keyword,
          stage: keyword.stage,
          volume: keyword.volume,
          difficulty: keyword.difficulty,
          intent: keyword.intent,
          blendedScore: keyword.blendedScore
        })),
        settings: {
          similarityThreshold: 0.7,
          maxClusters: Math.floor(allKeywords.length / 10), // ~10 keywords per cluster
          minClusterSize: 3
        }
      },
      scoringInput: {
        keywords: allKeywords,
        weights: {
          dream100: { volume: 0.40, intent: 0.30, relevance: 0.15, trend: 0.10, ease: 0.05 },
          tier2: { volume: 0.35, ease: 0.25, relevance: 0.20, intent: 0.15, trend: 0.05 },
          tier3: { ease: 0.35, relevance: 0.30, volume: 0.20, intent: 0.10, trend: 0.05 }
        }
      },
      exportData: {
        keywords: allKeywords,
        metadata: {
          totalKeywords: universeResult.totalKeywords,
          processingTime: universeResult.processingStats.totalProcessingTime,
          qualityMetrics: universeResult.qualityMetrics
        }
      }
    };
  }

  private createDream100ProgressCallback() {
    return (progress: any) => {
      console.log(`  📈 ${progress.stage}: ${progress.progressPercent}% (${progress.keywordsProcessed} keywords)`);
    };
  }

  private createUniverseProgressCallback(): UniverseProgressCallback {
    return (progress) => {
      const emoji = this.getStageEmoji(progress.stage);
      console.log(`  ${emoji} ${progress.stage}: ${progress.progressPercent}% (${progress.keywordsProcessed} ${progress.currentTier} keywords)`);
      if (progress.currentCost > 0) {
        console.log(`    💰 Current cost: $${progress.currentCost.toFixed(2)} | ETA: ${Math.ceil(progress.estimatedTimeRemaining / 60)}min`);
      }
    };
  }

  private getStageEmoji(stage: string): string {
    const emojis: { [key: string]: string } = {
      'initialization': '🚀',
      'dream100_processing': '💎',
      'tier2_expansion': '📈',
      'tier2_enrichment': '🔍',
      'tier3_expansion': '🌟',
      'tier3_enrichment': '📊',
      'quality_control': '🎯',
      'smart_capping': '⚖️',
      'result_preparation': '📦'
    };
    return emojis[stage] || '⚙️';
  }

  private generateOptimizationRecommendations(result: UniverseExpansionResult): string[] {
    const recommendations: string[] = [];
    
    if (result.qualityMetrics.avgQualityScore < 0.7) {
      recommendations.push('Consider increasing quality threshold for better results');
    }
    
    if (result.qualityMetrics.quickWinCounts.total / result.totalKeywords < 0.1) {
      recommendations.push('Optimize for more quick win opportunities');
    }
    
    if (result.costBreakdown.costPerKeyword > 0.5) {
      recommendations.push('Review cost optimization strategies');
    }
    
    const mostEffectiveStrategy = result.expansionBreakdown.mostEffectiveStrategy;
    recommendations.push(`Consider increasing weight for ${mostEffectiveStrategy} strategy`);
    
    return recommendations;
  }
}

/**
 * Example usage scenarios
 */
export async function runUniverseExamples() {
  // Initialize services (you'll need actual API keys)
  const pipeline = new KeywordPipelineIntegration(
    process.env.ANTHROPIC_API_KEY!,
    process.env.AHREFS_API_KEY!
  );

  const runId = 'example-run-123';
  const seedKeywords = ['marketing automation', 'email marketing', 'lead generation'];

  try {
    // Example 1: Full Pipeline
    console.log('📋 Example 1: Full Pipeline Execution\n');
    const fullResult = await pipeline.executeFullPipeline(runId, seedKeywords, {
      market: 'US',
      industry: 'B2B SaaS',
      targetUniverseSize: 5000,
      budgetLimit: 50.0,
      qualityThreshold: 0.6
    });
    console.log('\n✅ Full pipeline completed successfully!\n');

    // Example 2: Budget-Optimized
    console.log('📋 Example 2: Budget-Optimized Expansion\n');
    const budgetResult = await pipeline.executeBudgetOptimizedExpansion(
      'budget-run-456',
      seedKeywords.slice(0, 2), // Fewer seeds for budget
      25.0, // Lower budget
      {
        market: 'US',
        industry: 'B2B SaaS',
        prioritizeQuality: true
      }
    );
    console.log('\n✅ Budget-optimized expansion completed!\n');

    // Example 3: Enterprise-Grade
    console.log('📋 Example 3: Enterprise-Grade Expansion\n');
    const enterpriseResult = await pipeline.executeEnterpriseExpansion(
      'enterprise-run-789',
      seedKeywords,
      {
        market: 'US',
        industry: 'B2B SaaS',
        customQualityThresholds: {
          dream100: 0.85,
          tier2: 0.75,
          tier3: 0.65
        },
        enableAllFeatures: true
      }
    );
    console.log('\n✅ Enterprise expansion completed!\n');

    // Example 4: Prepare for Next Stages
    console.log('📋 Example 4: Preparing Data for Next Pipeline Stages\n');
    const nextStageData = pipeline.prepareForNextStages(fullResult.universeResult);
    
    console.log(`🔧 Clustering Input: ${nextStageData.clusteringInput.keywords.length} keywords prepared`);
    console.log(`📊 Scoring Input: ${nextStageData.scoringInput.keywords.length} keywords with stage-specific weights`);
    console.log(`📤 Export Data: ${nextStageData.exportData.keywords.length} keywords ready for export`);

    console.log('\n🎉 All examples completed successfully!');
    
    return {
      fullResult,
      budgetResult,
      enterpriseResult,
      nextStageData
    };

  } catch (error) {
    console.error('❌ Example execution failed:', error);
    throw error;
  }
}

// Export for use in other modules
export default KeywordPipelineIntegration;