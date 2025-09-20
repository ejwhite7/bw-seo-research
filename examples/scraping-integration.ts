/**
 * Competitor Research Service Integration Example
 * 
 * This example demonstrates how to integrate the ethical competitor research
 * and web scraping service into the Dream 100 Keyword Engine pipeline.
 * 
 * Features demonstrated:
 * - End-to-end competitor discovery and scraping
 * - Security and compliance best practices
 * - Error handling and monitoring
 * - Integration with existing pipeline components
 */

import { CompetitorResearchService } from '../src/services/scraping';
import { DatabaseService } from '../src/lib/database-service';
import { createOptimizedScrapeConfig, getEnvironmentConfig } from '../src/config/scraping';
import {
  Competitor,
  CreateCompetitorInput,
  ScrapeConfig,
  CompetitiveLandscape,
  generateScrapeConfig
} from '../src/models/competitor';
import { UUID, KeywordString, DomainString } from '../src/models/index';
import * as Sentry from '@sentry/nextjs';

/**
 * Example 1: Basic Competitor Discovery and Scraping
 */
export async function basicCompetitorResearch() {
  console.log('\n🔍 Starting Basic Competitor Research...');
  
  // Initialize services
  const databaseService = new DatabaseService();
  const competitorService = new CompetitorResearchService(databaseService, {
    ahrefsApiKey: process.env.AHREFS_API_KEY!,
    redis: undefined, // Use local rate limiting for this example
    scrapeConfig: {
      respectRobotsTxt: true,
      crawlDelay: 2,
      maxPages: 50,
      rateLimitPerMinute: 15
    }
  });
  
  const runId = 'example-run-123' as UUID;
  const seedKeywords = [
    'keyword research tools',
    'seo analytics',
    'content marketing software',
    'competitor analysis'
  ] as KeywordString[];
  
  try {
    // Step 1: Discover competitors from SERP data
    console.log('📊 Discovering competitors from SERP data...');
    const discoveredCompetitors = await competitorService.discoverCompetitors(
      runId,
      seedKeywords,
      {
        topN: 10,
        minDomainAuthority: 40,
        excludeDomains: [
          'our-site.com',
          'example.com'
        ] as DomainString[],
        country: 'US'
      }
    );
    
    console.log(`✅ Discovered ${discoveredCompetitors.length} competitors`);
    discoveredCompetitors.forEach((comp, index) => {
      console.log(`   ${index + 1}. ${comp.domain} (priority: ${comp.priority})`);
    });
    
    // Step 2: Create competitor records in database
    console.log('\n💾 Creating competitor records...');
    const competitorIds = await Promise.all(
      discoveredCompetitors.map(async comp => {
        const competitor = await databaseService.createCompetitor(comp);
        return competitor.id;
      })
    );
    
    // Step 3: Retrieve competitors for scraping
    const competitors = await Promise.all(
      competitorIds.map(id => databaseService.getCompetitorById(id))
    );
    
    // Step 4: Configure scraping settings
    const scrapeConfig = createOptimizedScrapeConfig(
      'default.com' as DomainString,
      {
        maxPages: 25,
        crawlDelay: 2.5,
        rateLimitPerMinute: 12,
        allowedPaths: ['/blog/', '/resources/', '/guides/'],
        excludedPaths: ['/admin/', '/login/', '/cart/']
      }
    );
    
    // Step 5: Scrape competitors with progress tracking
    console.log('\n🕷️  Starting ethical web scraping...');
    const scrapeResults = await competitorService.scrapeCompetitors(
      competitors,
      scrapeConfig,
      (completed, total, current) => {
        const percent = Math.round((completed / total) * 100);
        console.log(`   Progress: ${percent}% (${completed}/${total}) - ${current || 'Processing...'}`);
      }
    );
    
    // Step 6: Analyze results
    console.log('\n📈 Scraping Results:');
    const successful = scrapeResults.filter(r => r.success);
    const failed = scrapeResults.filter(r => !r.success);
    
    console.log(`   ✅ Successful: ${successful.length}`);
    console.log(`   ❌ Failed: ${failed.length}`);
    console.log(`   📄 Total pages scraped: ${successful.reduce((sum, r) => sum + r.pagesScraped, 0)}`);
    console.log(`   🏷️  Total titles extracted: ${successful.reduce((sum, r) => sum + r.titlesExtracted, 0)}`);
    
    // Show detailed results
    successful.forEach(result => {
      console.log(`   • ${result.domain}: ${result.titlesExtracted} titles, ${result.pagesScraped} pages`);
    });
    
    if (failed.length > 0) {
      console.log('\n⚠️  Failed scraping attempts:');
      failed.forEach(result => {
        console.log(`   • ${result.domain}: ${result.errors[0]?.error || 'Unknown error'}`);
      });
    }
    
    return { successful, failed };
    
  } catch (error) {
    console.error('❌ Competitor research failed:', error);
    Sentry.captureException(error, {
      tags: { example: 'basic-competitor-research' },
      extra: { runId, keywords: seedKeywords }
    });
    throw error;
  }
}

/**
 * Example 2: Advanced Competitive Analysis
 */
export async function advancedCompetitiveAnalysis() {
  console.log('\n🧠 Starting Advanced Competitive Analysis...');
  
  const databaseService = new DatabaseService();
  const competitorService = new CompetitorResearchService(databaseService, {
    ahrefsApiKey: process.env.AHREFS_API_KEY!,
    scrapeConfig: createOptimizedScrapeConfig('advanced-analysis.com' as DomainString)
  });
  
  const runId = 'advanced-analysis-456' as UUID;
  const ourKeywords = [
    'enterprise seo tools',
    'keyword tracking software',
    'seo audit platform',
    'content optimization'
  ] as KeywordString[];
  
  try {
    // Generate comprehensive competitive landscape
    console.log('🗺️  Generating competitive landscape...');
    const landscape = await competitorService.generateCompetitiveLandscape(
      runId,
      ourKeywords
    );
    
    console.log('\n📊 Competitive Landscape Analysis:');
    console.log(`   🏢 Total competitors: ${landscape.totalCompetitors}`);
    console.log(`   📈 Market saturation: ${landscape.industryInsights.marketSaturation}`);
    console.log(`   🎯 Average competition level: ${(landscape.industryInsights.avgCompetitionLevel * 100).toFixed(1)}%`);
    
    // Display top competitors
    console.log('\n🥇 Top Competitors:');
    landscape.topCompetitors.slice(0, 5).forEach((comp, index) => {
      console.log(`   ${index + 1}. ${comp.domain}`);
      console.log(`      Strength: ${(comp.strength * 100).toFixed(1)}%`);
      console.log(`      Keyword overlap: ${(comp.keywordOverlap * 100).toFixed(1)}%`);
      console.log(`      Opportunities: ${comp.opportunities}`);
    });
    
    // Display industry insights
    console.log('\n💡 Industry Insights:');
    console.log('   Common topics:', landscape.industryInsights.commonTopics.slice(0, 8).join(', '));
    console.log('   Content formats:', landscape.industryInsights.contentFormats.join(', '));
    
    // Display recommendations
    console.log('\n🎯 Strategic Recommendations:');
    landscape.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
    
    return landscape;
    
  } catch (error) {
    console.error('❌ Advanced analysis failed:', error);
    Sentry.captureException(error, {
      tags: { example: 'advanced-competitive-analysis' },
      extra: { runId, ourKeywords }
    });
    throw error;
  }
}

/**
 * Example 3: Security-Focused Scraping with Monitoring
 */
export async function securityFocusedScraping() {
  console.log('\n🔒 Starting Security-Focused Scraping...');
  
  const databaseService = new DatabaseService();
  const competitorService = new CompetitorResearchService(databaseService, {
    ahrefsApiKey: process.env.AHREFS_API_KEY!,
    scrapeConfig: {
      respectRobotsTxt: true,
      crawlDelay: 3, // Conservative 3-second delay
      maxPages: 20,  // Limited pages for security
      rateLimitPerMinute: 10, // Conservative rate limiting
      timeout: 20,
      retryAttempts: 2,
      userAgent: 'Dream100Bot/1.0 (Ethical SEO Research; Contact: security@olli.social)',
      allowedPaths: ['/blog/', '/articles/'], // Restricted paths only
      excludedPaths: ['/admin/', '/private/', '/api/', '/login/', '/signup/']
    }
  });
  
  // Mock competitor for security testing
  const testCompetitor: Competitor = {
    id: 'security-test-789' as UUID,
    runId: 'security-test-run' as UUID,
    domain: 'secure-competitor.example' as DomainString,
    titles: null,
    urls: null,
    discoveredFromKeyword: 'security test' as KeywordString,
    scrapeStatus: 'pending',
    scrapeError: null,
    scrapedAt: null,
    createdAt: new Date().toISOString() as any
  };
  
  try {
    // Pre-scraping security checks
    console.log('🔍 Performing pre-scraping security validation...');
    
    // 1. Validate scraping configuration
    const { validateScrapeConfig } = await import('../src/config/scraping');
    const validation = validateScrapeConfig(competitorService['config'] || {} as ScrapeConfig);
    
    if (!validation.isValid) {
      console.log('❌ Configuration validation failed:');
      validation.errors.forEach(error => console.log(`   • ${error}`));
      return;
    }
    
    if (validation.warnings.length > 0) {
      console.log('⚠️  Configuration warnings:');
      validation.warnings.forEach(warning => console.log(`   • ${warning}`));
    }
    
    console.log('✅ Configuration validation passed');
    
    // 2. Health check before scraping
    console.log('\n🏥 Performing service health check...');
    const health = await competitorService.healthCheck();
    
    if (!health.healthy) {
      console.log('❌ Service health check failed:');
      health.issues.forEach(issue => console.log(`   • ${issue}`));
      return;
    }
    
    console.log('✅ Service health check passed');
    console.log(`   Cache size: ${health.metrics.robotsCacheSize}`);
    console.log(`   Active domain limiters: ${health.metrics.domainLimitersActive}`);
    
    // 3. Scrape with enhanced monitoring
    console.log('\n🕷️  Starting monitored scraping...');
    
    const startTime = Date.now();
    const results = await competitorService.scrapeCompetitors(
      [testCompetitor],
      competitorService['config'] || createOptimizedScrapeConfig(testCompetitor.domain),
      (completed, total, current) => {
        console.log(`   🔄 Scraping progress: ${completed}/${total} - ${current}`);
        
        // Monitor for suspicious activity
        const elapsed = Date.now() - startTime;
        if (elapsed > 60000 && completed === 0) {
          console.log('⚠️  Scraping taking longer than expected - potential blocking detected');
        }
      }
    );
    
    // 4. Post-scraping security analysis
    console.log('\n🔍 Performing post-scraping security analysis...');
    
    results.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.domain}: Scraped securely`);
        console.log(`   Pages: ${result.pagesScraped}`);
        console.log(`   Titles: ${result.titlesExtracted}`);
        console.log(`   Errors: ${result.errors.length}`);
        console.log(`   robots.txt respected: ${result.robotsTxt.exists ? 'Yes' : 'N/A'}`);
        
        if (result.robotsTxt.crawlDelay) {
          console.log(`   Crawl delay honored: ${result.robotsTxt.crawlDelay}s`);
        }
      } else {
        console.log(`❌ ${result.domain}: Scraping failed (this may be expected for security)`);
        console.log(`   Error: ${result.errors[0]?.error}`);
      }
    });
    
    // 5. Security metrics
    console.log('\n📊 Security Metrics:');
    const totalAttempts = results.reduce((sum, r) => sum + (r.pagesScraped + r.errors.length), 0);
    const successRate = totalAttempts > 0 ? 
      results.reduce((sum, r) => sum + r.pagesScraped, 0) / totalAttempts : 0;
    
    console.log(`   Success rate: ${(successRate * 100).toFixed(1)}%`);
    console.log(`   Total requests: ${totalAttempts}`);
    console.log(`   Robots.txt blocks: ${results.filter(r => 
      r.errors.some(e => e.error.includes('robots'))).length}`);
    console.log(`   Rate limit hits: ${results.filter(r => 
      r.errors.some(e => e.error.includes('rate limit'))).length}`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Security-focused scraping failed:', error);
    
    // Enhanced error reporting for security incidents
    Sentry.captureException(error, {
      level: 'error',
      tags: {
        example: 'security-focused-scraping',
        securityIssue: true
      },
      extra: {
        competitorDomain: testCompetitor.domain,
        scrapeConfig: competitorService['config']
      }
    });
    
    throw error;
  }
}

/**
 * Example 4: Batch Processing with Queue Management
 */
export async function batchProcessingExample() {
  console.log('\n⚡ Starting Batch Processing Example...');
  
  const databaseService = new DatabaseService();
  const competitorService = new CompetitorResearchService(databaseService, {
    ahrefsApiKey: process.env.AHREFS_API_KEY!,
    redis: undefined // Use in-memory for this example
  });
  
  const runId = 'batch-processing-789' as UUID;
  
  // Create multiple competitor batches
  const competitorBatches = [
    {
      keywords: ['saas analytics', 'business intelligence'] as KeywordString[],
      config: createOptimizedScrapeConfig('analytics.com' as DomainString, {
        maxPages: 30,
        crawlDelay: 1.5
      })
    },
    {
      keywords: ['marketing automation', 'email marketing'] as KeywordString[],
      config: createOptimizedScrapeConfig('marketing.com' as DomainString, {
        maxPages: 40,
        crawlDelay: 2
      })
    },
    {
      keywords: ['project management', 'team collaboration'] as KeywordString[],
      config: createOptimizedScrapeConfig('productivity.com' as DomainString, {
        maxPages: 25,
        crawlDelay: 2.5
      })
    }
  ];
  
  try {
    const allResults: any[] = [];
    
    // Process batches sequentially to avoid overwhelming APIs
    for (let batchIndex = 0; batchIndex < competitorBatches.length; batchIndex++) {
      const batch = competitorBatches[batchIndex];
      
      console.log(`\n📦 Processing batch ${batchIndex + 1}/${competitorBatches.length}...`);
      console.log(`   Keywords: ${batch.keywords.join(', ')}`);
      
      // Discover competitors for this batch
      const competitors = await competitorService.discoverCompetitors(
        runId,
        batch.keywords,
        { topN: 5, country: 'US' }
      );
      
      console.log(`   📊 Found ${competitors.length} competitors`);
      
      // Create competitor batch for tracking
      const competitorBatch = await competitorService.createCompetitorBatch(
        runId,
        competitors,
        batch.config
      );
      
      console.log(`   📝 Created batch: ${competitorBatch.batchId}`);
      
      // Process the batch (in a real implementation, this might be queued)
      console.log(`   🚀 Processing batch...`);
      
      // Simulate batch processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      allResults.push({
        batchId: competitorBatch.batchId,
        keywords: batch.keywords,
        competitorCount: competitors.length,
        status: 'completed'
      });
    }
    
    console.log('\n✅ All batches processed successfully!');
    console.log('📊 Batch Summary:');
    
    allResults.forEach((result, index) => {
      console.log(`   Batch ${index + 1}: ${result.competitorCount} competitors, ${result.status}`);
    });
    
    const totalCompetitors = allResults.reduce((sum, r) => sum + r.competitorCount, 0);
    console.log(`\n🎯 Total competitors discovered: ${totalCompetitors}`);
    
    return allResults;
    
  } catch (error) {
    console.error('❌ Batch processing failed:', error);
    Sentry.captureException(error, {
      tags: { example: 'batch-processing' },
      extra: { runId, batchCount: competitorBatches.length }
    });
    throw error;
  }
}

/**
 * Example 5: Monitoring and Alerting Integration
 */
export async function monitoringIntegrationExample() {
  console.log('\n📊 Starting Monitoring Integration Example...');
  
  const databaseService = new DatabaseService();
  const competitorService = new CompetitorResearchService(databaseService, {
    ahrefsApiKey: process.env.AHREFS_API_KEY!
  });
  
  try {
    // Continuous monitoring loop (would run as a background service)
    const monitoringInterval = setInterval(async () => {
      console.log('🔍 Performing health check...');
      
      const health = await competitorService.healthCheck();
      
      // Log current status
      console.log(`   Service Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
      
      if (!health.healthy) {
        console.log('   Issues detected:');
        health.issues.forEach(issue => console.log(`   • ${issue}`));
        
        // In a real implementation, you would send alerts here
        console.log('🚨 ALERT: Service degradation detected!');
        
        // Send to monitoring service
        Sentry.captureMessage('Competitor research service degradation', {
          level: 'warning',
          tags: { service: 'competitor-research', alert: 'health-check' },
          extra: { health }
        });
      }
      
      // Log metrics
      console.log('   📊 Current Metrics:');
      console.log(`      Cache size: ${health.metrics.robotsCacheSize}`);
      console.log(`      Active limiters: ${health.metrics.domainLimitersActive}`);
      
      // Integration health
      console.log('   🔗 Integration Status:');
      console.log(`      Ahrefs: ${health.integrations.ahrefs.healthy ? '✅' : '❌'}`);
      console.log(`      Web Scraper: ${health.integrations.webScraper.healthy ? '✅' : '❌'}`);
      
    }, 30000); // Check every 30 seconds
    
    // Run monitoring for 2 minutes for demo
    setTimeout(() => {
      clearInterval(monitoringInterval);
      console.log('\n✅ Monitoring example completed');
    }, 120000);
    
    console.log('📡 Monitoring started (will run for 2 minutes)...');
    console.log('   Health checks every 30 seconds');
    console.log('   Alerts will be sent to Sentry for any issues');
    
    return { monitoringActive: true };
    
  } catch (error) {
    console.error('❌ Monitoring setup failed:', error);
    Sentry.captureException(error, {
      tags: { example: 'monitoring-integration' }
    });
    throw error;
  }
}

/**
 * Main example runner
 */
export async function runAllExamples() {
  console.log('🚀 Running Competitor Research Service Examples...');
  console.log('=' .repeat(60));
  
  try {
    // Check prerequisites
    if (!process.env.AHREFS_API_KEY) {
      throw new Error('AHREFS_API_KEY environment variable is required');
    }
    
    // Run examples sequentially
    const results = [];
    
    // Example 1: Basic workflow
    const basicResults = await basicCompetitorResearch();
    results.push({ example: 'basic', success: true, data: basicResults });
    
    // Add delay between examples to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Example 2: Advanced analysis
    const advancedResults = await advancedCompetitiveAnalysis();
    results.push({ example: 'advanced', success: true, data: advancedResults });
    
    // Add delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Example 3: Security focus
    const securityResults = await securityFocusedScraping();
    results.push({ example: 'security', success: true, data: securityResults });
    
    // Add delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Example 4: Batch processing
    const batchResults = await batchProcessingExample();
    results.push({ example: 'batch', success: true, data: batchResults });
    
    // Example 5: Monitoring (runs in background)
    const monitoringResults = await monitoringIntegrationExample();
    results.push({ example: 'monitoring', success: true, data: monitoringResults });
    
    console.log('\n🎉 All Examples Completed Successfully!');
    console.log('=' .repeat(60));
    console.log('\n📊 Summary:');
    results.forEach(result => {
      console.log(`   ✅ ${result.example.toUpperCase()}: Completed`);
    });
    
    console.log('\n💡 Next Steps:');
    console.log('   1. Review the extracted competitor data in your database');
    console.log('   2. Analyze the competitive landscape insights');
    console.log('   3. Integrate findings into your content strategy');
    console.log('   4. Set up monitoring and alerting for production use');
    console.log('   5. Configure domain-specific scraping rules as needed');
    
    return results;
    
  } catch (error) {
    console.error('❌ Examples failed:', error);
    
    Sentry.captureException(error, {
      level: 'error',
      tags: { example: 'all-examples', demo: true },
      extra: { timestamp: new Date().toISOString() }
    });
    
    throw error;
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples()
    .then(() => {
      console.log('\n✨ Demo completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Demo failed:', error);
      process.exit(1);
    });
}
