/**
 * Dream 100 Expansion Service Demo
 * 
 * Comprehensive demonstration of the Dream 100 expansion service capabilities
 * including various configuration options, error handling, and result analysis.
 * 
 * Usage:
 * - Set environment variables: ANTHROPIC_API_KEY, AHREFS_API_KEY
 * - Run: npx tsx examples/dream100-expansion-demo.ts
 */

import {
  Dream100ExpansionService,
  Dream100ExpansionRequest,
  Dream100ExpansionResult,
  ExpansionStage,
  createDream100ExpansionService
} from '../src/services/expansion';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AHREFS_API_KEY = process.env.AHREFS_API_KEY;
const DEMO_RUN_ID = uuidv4();

if (!ANTHROPIC_API_KEY || !AHREFS_API_KEY) {
  console.error('❌ Missing required API keys. Please set ANTHROPIC_API_KEY and AHREFS_API_KEY environment variables.');
  process.exit(1);
}

/**
 * Demo scenarios with different configurations
 */
const demoScenarios: Array<{
  name: string;
  description: string;
  request: Dream100ExpansionRequest;
}> = [
  {
    name: 'Basic Marketing SaaS',
    description: 'Standard Dream 100 expansion for marketing technology keywords',
    request: {
      runId: DEMO_RUN_ID,
      seedKeywords: ['marketing automation', 'CRM software'],
      targetCount: 20,
      market: 'US',
      industry: 'marketing technology',
      intentFocus: 'commercial',
      difficultyPreference: 'medium',
      qualityThreshold: 0.7,
      budgetLimit: 25.0,
      includeCompetitorAnalysis: false
    }
  },
  {
    name: 'High-Volume E-commerce',
    description: 'Target high-volume, mixed-intent keywords for e-commerce',
    request: {
      runId: DEMO_RUN_ID,
      seedKeywords: ['online shopping', 'e-commerce platform'],
      targetCount: 50,
      market: 'US',
      industry: 'e-commerce',
      intentFocus: 'mixed',
      difficultyPreference: 'mixed',
      qualityThreshold: 0.6,
      budgetLimit: 50.0,
      includeCompetitorAnalysis: true
    }
  },
  {
    name: 'Quick Wins Content',
    description: 'Focus on easy-to-rank informational content keywords',
    request: {
      runId: DEMO_RUN_ID,
      seedKeywords: ['content marketing tips'],
      targetCount: 30,
      market: 'US',
      industry: 'marketing',
      intentFocus: 'informational',
      difficultyPreference: 'easy',
      qualityThreshold: 0.5,
      budgetLimit: 15.0,
      includeCompetitorAnalysis: false
    }
  },
  {
    name: 'Premium B2B Software',
    description: 'High-value commercial keywords for B2B software',
    request: {
      runId: DEMO_RUN_ID,
      seedKeywords: ['enterprise software', 'business intelligence'],
      targetCount: 15,
      market: 'US',
      industry: 'enterprise software',
      intentFocus: 'commercial',
      difficultyPreference: 'hard',
      qualityThreshold: 0.8,
      budgetLimit: 40.0,
      includeCompetitorAnalysis: true
    }
  }
];

/**
 * Progress callback for real-time updates
 */
function createProgressCallback(scenarioName: string) {
  return (progress: {
    stage: ExpansionStage;
    currentStep: string;
    progressPercent: number;
    keywordsProcessed: number;
    estimatedTimeRemaining: number;
    currentCost: number;
  }) => {
    const timeRemaining = Math.ceil(progress.estimatedTimeRemaining / 60); // Convert to minutes
    const costFormatted = progress.currentCost.toFixed(2);
    
    console.log(
      `📊 [${scenarioName}] ${progress.stage.toUpperCase()}: ${progress.currentStep} ` +
      `(${progress.progressPercent}% | ${progress.keywordsProcessed} keywords | ~${timeRemaining}min | $${costFormatted})`
    );
  };
}

/**
 * Analyze and display expansion results
 */
function analyzeResults(scenario: string, result: Dream100ExpansionResult): void {
  console.log(`\n🎯 Results Analysis for "${scenario}"`);
  console.log('═'.repeat(60));
  
  // Basic metrics
  console.log(`✅ Success: ${result.success}`);
  console.log(`🔢 Keywords Generated: ${result.dream100Keywords.length}/${result.totalCandidatesGenerated}`);
  console.log(`💰 Total Cost: $${result.costBreakdown.totalCost.toFixed(3)}`);
  console.log(`⏱️  Processing Time: ${(result.processingStats.totalProcessingTime / 1000).toFixed(1)}s`);
  
  // Quality metrics
  const qm = result.qualityMetrics;
  console.log(`\n📈 Quality Metrics:`);
  console.log(`   • Avg Relevance: ${(qm.avgRelevanceScore * 100).toFixed(1)}%`);
  console.log(`   • Avg Commercial: ${(qm.avgCommercialScore * 100).toFixed(1)}%`);
  console.log(`   • Quick Wins: ${qm.quickWinCount} (${((qm.quickWinCount / result.dream100Keywords.length) * 100).toFixed(1)}%)`);
  console.log(`   • Duplicates Removed: ${qm.duplicatesRemoved}`);
  console.log(`   • Invalid Filtered: ${qm.invalidKeywordsFiltered}`);
  
  // Intent distribution
  console.log(`\n🎯 Intent Distribution:`);
  Object.entries(qm.intentDistribution).forEach(([intent, count]) => {
    if (count > 0) {
      const percentage = ((count / result.dream100Keywords.length) * 100).toFixed(1);
      console.log(`   • ${intent}: ${count} (${percentage}%)`);
    }
  });
  
  // Difficulty distribution
  console.log(`\n⚖️  Difficulty Distribution:`);
  const dd = qm.difficultyDistribution;
  console.log(`   • Easy (0-30): ${dd.easy} (${((dd.easy / result.dream100Keywords.length) * 100).toFixed(1)}%)`);
  console.log(`   • Medium (31-70): ${dd.medium} (${((dd.medium / result.dream100Keywords.length) * 100).toFixed(1)}%)`);
  console.log(`   • Hard (71-100): ${dd.hard} (${((dd.hard / result.dream100Keywords.length) * 100).toFixed(1)}%)`);
  
  // Volume distribution
  console.log(`\n📊 Volume Distribution:`);
  const vd = qm.volumeDistribution;
  console.log(`   • Low (0-1K): ${vd.low} (${((vd.low / result.dream100Keywords.length) * 100).toFixed(1)}%)`);
  console.log(`   • Medium (1K-10K): ${vd.medium} (${((vd.medium / result.dream100Keywords.length) * 100).toFixed(1)}%)`);
  console.log(`   • High (10K+): ${vd.high} (${((vd.high / result.dream100Keywords.length) * 100).toFixed(1)}%)`);
  
  // Cost breakdown
  console.log(`\n💳 Cost Breakdown:`);
  console.log(`   • Anthropic (LLM): $${result.costBreakdown.anthropicCost.toFixed(3)}`);
  console.log(`   • Ahrefs (Data): $${result.costBreakdown.ahrefsCost.toFixed(3)}`);
  console.log(`   • Cost per Keyword: $${result.costBreakdown.costPerKeyword?.toFixed(4) || 'N/A'}`);
  if (result.costBreakdown.budgetUtilization) {
    console.log(`   • Budget Utilization: ${result.costBreakdown.budgetUtilization.toFixed(1)}%`);
  }
  
  // Performance metrics
  console.log(`\n⚡ Performance Metrics:`);
  console.log(`   • Keywords/min: ${result.processingStats.throughputMetrics.keywordsPerMinute.toFixed(1)}`);
  console.log(`   • API Calls: ${result.processingStats.apiCallCounts.anthropic + result.processingStats.apiCallCounts.ahrefs}`);
  console.log(`   • Cache Hit Rate: ${(result.processingStats.cacheHitRate * 100).toFixed(1)}%`);
  
  // Stage timings
  console.log(`\n🕐 Stage Timings:`);
  Object.entries(result.processingStats.stageTimings).forEach(([stage, time]) => {
    const seconds = (time / 1000).toFixed(1);
    const percentage = ((time / result.processingStats.totalProcessingTime) * 100).toFixed(1);
    console.log(`   • ${stage.replace(/_/g, ' ')}: ${seconds}s (${percentage}%)`);
  });
  
  // Top keywords
  console.log(`\n🏆 Top 10 Keywords by Blended Score:`);
  const topKeywords = result.dream100Keywords
    .sort((a, b) => b.blendedScore - a.blendedScore)
    .slice(0, 10);
  
  topKeywords.forEach((keyword, index) => {
    const quickWinIcon = keyword.quickWin ? '⚡' : '  ';
    console.log(
      `${quickWinIcon}${index + 1}. "${keyword.keyword}" ` +
      `(Score: ${(keyword.blendedScore * 100).toFixed(1)} | ` +
      `Vol: ${keyword.volume.toLocaleString()} | ` +
      `KD: ${keyword.difficulty} | ` +
      `Intent: ${keyword.intent})`
    );
  });
  
  // Warnings and errors
  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings:`);
    result.warnings.forEach(warning => console.log(`   • ${warning}`));
  }
  
  if (result.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    result.errors.forEach(error => console.log(`   • ${error}`));
  }
  
  console.log('\n' + '═'.repeat(60));
}

/**
 * Export results to CSV format
 */
function exportToCsv(scenario: string, result: Dream100ExpansionResult): string {
  const headers = [
    'keyword', 'volume', 'difficulty', 'cpc', 'intent', 'relevance_score',
    'commercial_score', 'blended_score', 'quick_win', 'stage'
  ];
  
  const rows = result.dream100Keywords.map(kw => [
    `"${kw.keyword}"`,
    kw.volume,
    kw.difficulty,
    kw.cpc?.toFixed(2) || '0.00',
    kw.intent,
    (kw.relevanceScore * 100).toFixed(1),
    (kw.commercialScore * 100).toFixed(1),
    (kw.blendedScore * 100).toFixed(1),
    kw.quickWin ? 'Yes' : 'No',
    kw.stage
  ]);
  
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  
  const filename = `dream100-${scenario.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`;
  
  // In a real implementation, you'd write to file
  console.log(`\n💾 CSV Export prepared: ${filename} (${csvContent.split('\n').length - 1} rows)`);
  
  return csvContent;
}

/**
 * Compare results across scenarios
 */
function compareScenarios(results: Array<{ scenario: string; result: Dream100ExpansionResult }>) {
  console.log('\n🔍 Scenario Comparison');
  console.log('═'.repeat(80));
  
  console.log('\n📊 Performance Comparison:');
  console.log('Scenario'.padEnd(25) + 'Keywords'.padEnd(12) + 'Cost'.padEnd(10) + 'Time(s)'.padEnd(10) + 'Avg Score');
  console.log('─'.repeat(75));
  
  results.forEach(({ scenario, result }) => {
    const avgScore = result.dream100Keywords.reduce((sum, kw) => sum + kw.blendedScore, 0) / result.dream100Keywords.length;
    const timeSeconds = (result.processingStats.totalProcessingTime / 1000).toFixed(1);
    
    console.log(
      scenario.padEnd(25) +
      result.dream100Keywords.length.toString().padEnd(12) +
      `$${result.costBreakdown.totalCost.toFixed(2)}`.padEnd(10) +
      timeSeconds.padEnd(10) +
      (avgScore * 100).toFixed(1) + '%'
    );
  });
  
  console.log('\n🎯 Intent Focus Analysis:');
  results.forEach(({ scenario, result }) => {
    const intentCounts = result.qualityMetrics.intentDistribution;
    const total = Object.values(intentCounts).reduce((sum, count) => sum + count, 0);
    
    console.log(`\n${scenario}:`);
    Object.entries(intentCounts).forEach(([intent, count]) => {
      if (count > 0) {
        const percentage = ((count / total) * 100).toFixed(1);
        console.log(`  • ${intent}: ${percentage}%`);
      }
    });
  });
  
  console.log('\n💰 Cost Efficiency Analysis:');
  results.forEach(({ scenario, result }) => {
    const costPerKeyword = result.costBreakdown.totalCost / result.dream100Keywords.length;
    const avgScore = result.dream100Keywords.reduce((sum, kw) => sum + kw.blendedScore, 0) / result.dream100Keywords.length;
    const efficiency = (avgScore * 100) / costPerKeyword; // Score per dollar
    
    console.log(
      `${scenario}: $${costPerKeyword.toFixed(4)}/keyword, ${efficiency.toFixed(1)} score points per $1`
    );
  });
}

/**
 * Main demo function
 */
async function runDemo() {
  console.log('🚀 Dream 100 Expansion Service Demo');
  console.log('═'.repeat(50));
  
  // Initialize service
  const expansionService = createDream100ExpansionService(
    ANTHROPIC_API_KEY,
    AHREFS_API_KEY
  );
  
  console.log('✅ Expansion service initialized');
  console.log(`🆔 Demo Run ID: ${DEMO_RUN_ID}`);
  
  // Check service health
  const health = expansionService.getServiceHealth();
  console.log(`🏥 Service Health: ${health.status}`);
  console.log(`   • Anthropic: ${health.integrations.anthropic}`);
  console.log(`   • Ahrefs: ${health.integrations.ahrefs}`);
  
  const results: Array<{ scenario: string; result: Dream100ExpansionResult }> = [];
  let totalCost = 0;
  
  // Run each scenario
  for (const { name, description, request } of demoScenarios) {
    console.log(`\n\n🎬 Starting Scenario: "${name}"`);
    console.log(`📝 Description: ${description}`);
    console.log(`🌱 Seed Keywords: ${request.seedKeywords.join(', ')}`);
    console.log(`🎯 Target: ${request.targetCount} keywords`);
    console.log(`💵 Budget: $${request.budgetLimit?.toFixed(2) || 'No limit'}`);
    
    // Cost estimation
    const estimate = expansionService.estimateExpansionCost(
      request.seedKeywords.length,
      request.targetCount,
      request.includeCompetitorAnalysis
    );
    
    console.log(`\n💡 Cost Estimate: $${estimate.estimatedCost.toFixed(3)} (${(estimate.confidence * 100).toFixed(1)}% confidence)`);
    console.log('   Breakdown:');
    Object.entries(estimate.breakdown).forEach(([component, cost]) => {
      if (cost !== undefined) {
        console.log(`   • ${component}: $${cost.toFixed(3)}`);
      }
    });
    
    try {
      const startTime = performance.now();
      
      // Execute expansion with progress tracking
      const result = await expansionService.expandToDream100(
        request,
        createProgressCallback(name)
      );
      
      const endTime = performance.now();
      const actualTime = (endTime - startTime) / 1000;
      
      console.log(`\n✅ Expansion completed in ${actualTime.toFixed(1)}s`);
      
      // Analyze results
      analyzeResults(name, result);
      
      // Export to CSV (demo)
      exportToCsv(name, result);
      
      results.push({ scenario: name, result });
      totalCost += result.costBreakdown.totalCost;
      
    } catch (error) {
      console.error(`\n❌ Scenario "${name}" failed:`, (error as Error).message);
      
      // Continue with other scenarios
      continue;
    }
    
    // Rate limiting delay between scenarios
    if (demoScenarios.indexOf({ name, description, request }) < demoScenarios.length - 1) {
      console.log('\n⏳ Waiting 30 seconds before next scenario...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  
  // Final comparison and summary
  if (results.length > 1) {
    compareScenarios(results);
  }
  
  console.log('\n\n🎉 Demo Complete!');
  console.log('═'.repeat(50));
  console.log(`📊 Scenarios Completed: ${results.length}/${demoScenarios.length}`);
  console.log(`💰 Total Cost: $${totalCost.toFixed(3)}`);
  console.log(`🔢 Total Keywords Generated: ${results.reduce((sum, r) => sum + r.result.dream100Keywords.length, 0)}`);
  
  if (results.length > 0) {
    const avgProcessingTime = results.reduce((sum, r) => sum + r.result.processingStats.totalProcessingTime, 0) / results.length;
    const avgQualityScore = results.reduce((sum, r) => {
      const scenarioAvg = r.result.dream100Keywords.reduce((kwSum, kw) => kwSum + kw.blendedScore, 0) / r.result.dream100Keywords.length;
      return sum + scenarioAvg;
    }, 0) / results.length;
    
    console.log(`⏱️  Avg Processing Time: ${(avgProcessingTime / 1000).toFixed(1)}s`);
    console.log(`🏆 Avg Quality Score: ${(avgQualityScore * 100).toFixed(1)}%`);
  }
  
  console.log('\n📚 Next Steps:');
  console.log('   • Review the generated keywords in your content strategy');
  console.log('   • Use the CSV exports for content calendar planning');
  console.log('   • Consider running tier-2 expansion on high-scoring Dream 100 keywords');
  console.log('   • Analyze competitor data if enabled in your scenarios');
  console.log('   • Monitor keyword performance over time');
  
  console.log('\n🔗 Integration Examples:');
  console.log('   • Import keywords into content management systems');
  console.log('   • Feed data into SEO tools like SEMrush or Ahrefs');
  console.log('   • Create automated content briefs based on intent classification');
  console.log('   • Set up monitoring for keyword ranking changes');
}

/**
 * Error handling wrapper
 */
async function main() {
  try {
    await runDemo();
  } catch (error) {
    console.error('\n💥 Demo failed with error:', (error as Error).message);
    console.error('Stack trace:', (error as Error).stack);
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  main();
}

export {
  demoScenarios,
  analyzeResults,
  exportToCsv,
  compareScenarios,
  runDemo
};
