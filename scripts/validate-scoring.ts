#!/usr/bin/env npx ts-node

/**
 * Scoring Service Validation Script
 * 
 * Validates the scoring service integration and performance
 * with comprehensive testing of all features.
 */

import { 
  scoreKeyword, 
  scoreKeywordBatch, 
  detectQuickWins,
  getScoringPresets,
  ScoringEngine
} from '../src/services/scoring';
import { getDefaultScoringWeights } from '../src/models/scoring';
import type { KeywordStage, KeywordIntent } from '../src/types/database';

interface ValidationResult {
  test: string;
  passed: boolean;
  message: string;
  duration?: number;
}

class ScoringValidator {
  private results: ValidationResult[] = [];

  async runAll(): Promise<void> {
    console.log('🚀 Starting Scoring Service Validation...\n');
    
    await this.testSingleKeywordScoring();
    await this.testBatchScoring();
    await this.testQuickWinDetection();
    await this.testIndustryPresets();
    await this.testStageSpecificWeights();
    await this.testPerformance();
    await this.testErrorHandling();
    
    this.printResults();
  }

  private async testSingleKeywordScoring(): Promise<void> {
    try {
      const startTime = performance.now();
      
      const result = await scoreKeyword(
        'best project management software',
        'dream100',
        15000,
        45,
        'commercial',
        0.85,
        0.2
      );
      
      const duration = performance.now() - startTime;
      
      const passed = 
        result.blendedScore > 0 && 
        result.blendedScore <= 1 &&
        result.stage === 'dream100' &&
        result.componentScores.volume > 0 &&
        result.componentScores.ease === 0.55 && // (100-45)/100
        result.componentScores.intent === 0.8; // Commercial intent
        
      this.results.push({
        test: 'Single Keyword Scoring',
        passed,
        message: passed ? 
          `✅ Score: ${result.blendedScore.toFixed(3)}, Quick Win: ${result.quickWin}` :
          `❌ Invalid scoring result: ${JSON.stringify(result, null, 2)}`,
        duration
      });
    } catch (error) {
      this.results.push({
        test: 'Single Keyword Scoring',
        passed: false,
        message: `❌ Error: ${error.message}`
      });
    }
  }

  private async testBatchScoring(): Promise<void> {
    try {
      const keywords = [
        {
          keyword: 'project management tools',
          stage: 'dream100' as KeywordStage,
          volume: 12000,
          difficulty: 50,
          intent: 'commercial' as KeywordIntent,
          relevance: 0.9,
          trend: 0.1
        },
        {
          keyword: 'free project management',
          stage: 'tier2' as KeywordStage,
          volume: 8000,
          difficulty: 35,
          intent: 'commercial' as KeywordIntent,
          relevance: 0.8,
          trend: 0.15
        },
        {
          keyword: 'how to manage projects',
          stage: 'tier3' as KeywordStage,
          volume: 3000,
          difficulty: 25,
          intent: 'informational' as KeywordIntent,
          relevance: 0.75,
          trend: 0.05
        }
      ];

      const startTime = performance.now();
      const results = await scoreKeywordBatch(keywords);
      const duration = performance.now() - startTime;

      const passed = 
        results.length === 3 &&
        results[0].blendedScore >= results[1].blendedScore &&
        results[1].blendedScore >= results[2].blendedScore &&
        results.every(r => r.blendedScore > 0 && r.blendedScore <= 1);

      const quickWins = results.filter(r => r.quickWin).length;
      
      this.results.push({
        test: 'Batch Scoring',
        passed,
        message: passed ? 
          `✅ Processed ${results.length} keywords, ${quickWins} quick wins` :
          `❌ Batch scoring failed validation`,
        duration
      });
    } catch (error) {
      this.results.push({
        test: 'Batch Scoring',
        passed: false,
        message: `❌ Error: ${error.message}`
      });
    }
  }

  private async testQuickWinDetection(): Promise<void> {
    try {
      // Create a keyword that should be a quick win
      const easyKeyword = {
        keyword: 'easy ranking keyword',
        stage: 'tier2' as KeywordStage,
        volume: 5000,
        difficulty: 15, // Very easy
        intent: 'commercial' as KeywordIntent,
        relevance: 0.8,
        trend: 0.1
      };

      // Create a keyword that should NOT be a quick win  
      const hardKeyword = {
        keyword: 'difficult competitive keyword',
        stage: 'dream100' as KeywordStage,
        volume: 50000,
        difficulty: 85, // Very difficult
        intent: 'transactional' as KeywordIntent,
        relevance: 0.9,
        trend: 0.3
      };

      const results = await scoreKeywordBatch([easyKeyword, hardKeyword]);
      const quickWins = detectQuickWins(results);

      const passed = 
        results[0].quickWin === true && // Easy keyword should be quick win
        results[1].quickWin === false && // Hard keyword should not be quick win
        quickWins.length === 1 &&
        quickWins[0].keyword === 'easy ranking keyword';

      this.results.push({
        test: 'Quick Win Detection',
        passed,
        message: passed ?
          `✅ Correctly identified ${quickWins.length} quick win` :
          `❌ Quick win detection failed: Easy=${results[0].quickWin}, Hard=${results[1].quickWin}`
      });
    } catch (error) {
      this.results.push({
        test: 'Quick Win Detection',
        passed: false,
        message: `❌ Error: ${error.message}`
      });
    }
  }

  private async testIndustryPresets(): Promise<void> {
    try {
      const presets = getScoringPresets();
      
      const hasRequiredPresets = 
        presets.hasOwnProperty('ecommerce') &&
        presets.hasOwnProperty('saas') &&
        presets.hasOwnProperty('content');

      let weightsValid = true;
      let presetDetails = [];

      for (const [industry, weights] of Object.entries(presets)) {
        for (const [stage, stageWeights] of Object.entries(weights)) {
          const sum = Object.values(stageWeights).reduce((s: number, w: number) => s + w, 0);
          if (Math.abs(sum - 1) > 0.01) {
            weightsValid = false;
          }
        }
        
        // E-commerce should prioritize volume more than SaaS
        if (industry === 'ecommerce') {
          presetDetails.push(`E-comm Dream100 volume: ${weights.dream100.volume}`);
        }
      }

      const passed = hasRequiredPresets && weightsValid;

      this.results.push({
        test: 'Industry Presets',
        passed,
        message: passed ?
          `✅ All presets valid, ${presetDetails.join(', ')}` :
          `❌ Missing presets or invalid weights`
      });
    } catch (error) {
      this.results.push({
        test: 'Industry Presets',
        passed: false,
        message: `❌ Error: ${error.message}`
      });
    }
  }

  private async testStageSpecificWeights(): Promise<void> {
    try {
      const defaultWeights = getDefaultScoringWeights();
      
      // Test Dream 100 prioritizes volume and intent
      const dream100VolumeWeight = defaultWeights.dream100.volume; // Should be 0.40
      const dream100IntentWeight = defaultWeights.dream100.intent; // Should be 0.30
      
      // Test Tier-3 prioritizes ease and relevance
      const tier3EaseWeight = defaultWeights.tier3.ease; // Should be 0.35
      const tier3RelevanceWeight = defaultWeights.tier3.relevance; // Should be 0.30

      const weightsValid = 
        Math.abs(dream100VolumeWeight - 0.40) < 0.01 &&
        Math.abs(dream100IntentWeight - 0.30) < 0.01 &&
        Math.abs(tier3EaseWeight - 0.35) < 0.01 &&
        Math.abs(tier3RelevanceWeight - 0.30) < 0.01;

      // Test that weights sum to 1.0 for each stage
      const sumChecks = ['dream100', 'tier2', 'tier3'].every(stage => {
        const stageWeights = defaultWeights[stage as KeywordStage];
        const sum = Object.values(stageWeights).reduce((s, w) => s + w, 0);
        return Math.abs(sum - 1) < 0.01;
      });

      const passed = weightsValid && sumChecks;

      this.results.push({
        test: 'Stage-Specific Weights',
        passed,
        message: passed ?
          `✅ Dream100: V=${dream100VolumeWeight}, I=${dream100IntentWeight}; Tier3: E=${tier3EaseWeight}, R=${tier3RelevanceWeight}` :
          `❌ Stage weights don't match specification`
      });
    } catch (error) {
      this.results.push({
        test: 'Stage-Specific Weights',
        passed: false,
        message: `❌ Error: ${error.message}`
      });
    }
  }

  private async testPerformance(): Promise<void> {
    try {
      // Generate 1000 test keywords
      const keywords = Array.from({ length: 1000 }, (_, i) => ({
        keyword: `test keyword ${i}`,
        stage: (['dream100', 'tier2', 'tier3'] as KeywordStage[])[i % 3],
        volume: Math.floor(Math.random() * 50000) + 1000,
        difficulty: Math.floor(Math.random() * 80) + 10,
        intent: (['transactional', 'commercial', 'informational', 'navigational'] as KeywordIntent[])[i % 4],
        relevance: Math.random() * 0.5 + 0.5, // 0.5-1.0
        trend: (Math.random() - 0.5) * 0.8 // -0.4 to 0.4
      }));

      const startTime = performance.now();
      const results = await scoreKeywordBatch(keywords);
      const duration = performance.now() - startTime;

      // Performance target: < 5 seconds for 1000 keywords
      const performanceOk = duration < 5000;
      const resultsValid = results.length === 1000 && 
                          results.every(r => r.blendedScore >= 0 && r.blendedScore <= 1);

      const passed = performanceOk && resultsValid;

      this.results.push({
        test: 'Performance (1000 keywords)',
        passed,
        message: passed ?
          `✅ Processed 1000 keywords in ${Math.round(duration)}ms` :
          `❌ Performance issue: ${Math.round(duration)}ms (target: <5000ms)`,
        duration
      });
    } catch (error) {
      this.results.push({
        test: 'Performance (1000 keywords)',
        passed: false,
        message: `❌ Error: ${error.message}`
      });
    }
  }

  private async testErrorHandling(): Promise<void> {
    try {
      let errorsCaught = 0;
      
      // Test invalid stage
      try {
        await scoreKeyword('test', 'invalid_stage' as KeywordStage, 1000, 50, 'commercial', 0.8);
      } catch (error) {
        errorsCaught++;
      }

      // Test invalid difficulty
      try {
        await scoreKeyword('test', 'dream100', 1000, 150, 'commercial', 0.8); // >100 difficulty
      } catch (error) {
        errorsCaught++;
      }

      // Test invalid relevance
      try {
        await scoreKeyword('test', 'tier2', 1000, 50, 'commercial', 1.5); // >1.0 relevance
      } catch (error) {
        errorsCaught++;
      }

      const passed = errorsCaught === 3; // Should catch all 3 errors

      this.results.push({
        test: 'Error Handling',
        passed,
        message: passed ?
          `✅ Properly caught ${errorsCaught}/3 validation errors` :
          `❌ Only caught ${errorsCaught}/3 validation errors`
      });
    } catch (error) {
      this.results.push({
        test: 'Error Handling',
        passed: false,
        message: `❌ Unexpected error: ${error.message}`
      });
    }
  }

  private printResults(): void {
    console.log('\n📊 Validation Results:');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    this.results.forEach(result => {
      const duration = result.duration ? ` (${Math.round(result.duration)}ms)` : '';
      console.log(`${result.message}${duration}`);
    });
    
    console.log('='.repeat(50));
    console.log(`Overall: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Scoring service is ready for production.');
    } else {
      console.log('⚠️  Some tests failed. Please review and fix issues.');
      process.exit(1);
    }
  }
}

// Run validation
const validator = new ScoringValidator();
validator.runAll().catch(error => {
  console.error('❌ Validation script failed:', error);
  process.exit(1);
});