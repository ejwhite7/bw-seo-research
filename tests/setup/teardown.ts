/**
 * Global Jest Teardown for Dream 100 Keyword Engine
 * 
 * Cleans up test environment, closes database connections,
 * and generates test reports after all tests complete.
 */

import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up Dream 100 Keyword Engine test environment...\n');

  // Clean up test database
  await cleanupTestDatabase();
  
  // Clean up test cache
  await cleanupTestCache();
  
  // Generate test reports
  await generateTestReports();
  
  // Clean up temporary files
  await cleanupTempFiles();

  console.log('✅ Test environment cleanup complete!\n');
}

/**
 * Clean up test database
 */
async function cleanupTestDatabase(): Promise<void> {
  try {
    console.log('🗄️  Cleaning up test database...');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Only clean up test data, not the entire database
    const testUserId = '12345678-1234-5678-9012-123456789012';
    
    // Clean up in reverse dependency order
    const cleanupTasks = [
      { table: 'roadmap_items', condition: 'run_id', value: 'test-run-id' },
      { table: 'clusters', condition: 'run_id', value: 'test-run-id' },
      { table: 'keywords', condition: 'run_id', value: 'test-run-id' },
      { table: 'runs', condition: 'user_id', value: testUserId },
      { table: 'settings', condition: 'user_id', value: testUserId }
    ];
    
    for (const task of cleanupTasks) {
      try {
        const { error } = await supabase
          .from(task.table)
          .delete()
          .eq(task.condition, task.value);
        
        if (!error) {
          console.log(`  ✓ Cleaned ${task.table} table`);
        }
      } catch (error) {
        console.log(`  ⚠️  Failed to clean ${task.table}:`, error.message);
      }
    }
    
    console.log('✅ Test database cleanup complete');
  } catch (error) {
    console.error('❌ Failed to cleanup test database:', error);
  }
}

/**
 * Clean up test cache
 */
async function cleanupTestCache(): Promise<void> {
  try {
    console.log('🔴 Cleaning up test cache...');
    
    const redis = new Redis(process.env.REDIS_URL!, {
      enableReadyCheck: false,
      lazyConnect: true
    });

    // Only flush test database, not entire Redis
    const testKeys = await redis.keys('test:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
      console.log(`  ✓ Removed ${testKeys.length} test cache keys`);
    }
    
    // Clean up any job queues created during testing
    const queueKeys = await redis.keys('bull:*test*');
    if (queueKeys.length > 0) {
      await redis.del(...queueKeys);
      console.log(`  ✓ Removed ${queueKeys.length} test queue keys`);
    }
    
    redis.disconnect();
    console.log('✅ Test cache cleanup complete');
  } catch (error) {
    console.warn('⚠️  Redis cleanup skipped (not available)');
  }
}

/**
 * Generate test reports and summaries
 */
async function generateTestReports(): Promise<void> {
  try {
    console.log('📊 Generating test reports...');
    
    const reportsDir = path.join(process.cwd(), 'test-results');
    
    // Ensure reports directory exists
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Generate test summary
    const testSummary = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'test',
      testSuite: 'Dream 100 Keyword Engine',
      node_version: process.version,
      platform: process.platform,
      memory_usage: process.memoryUsage(),
      test_duration: Date.now() - (global.testStartTime || Date.now()),
      coverage_reports: {
        html: path.join(reportsDir, 'coverage', 'index.html'),
        lcov: path.join(reportsDir, 'coverage', 'lcov.info'),
        json: path.join(reportsDir, 'coverage', 'coverage-final.json')
      },
      junit_report: path.join(reportsDir, 'junit.xml')
    };
    
    fs.writeFileSync(
      path.join(reportsDir, 'test-summary.json'),
      JSON.stringify(testSummary, null, 2)
    );
    
    // Generate human-readable summary
    const readableSummary = `
# Dream 100 Keyword Engine Test Summary

**Test Run:** ${testSummary.timestamp}
**Environment:** ${testSummary.environment}
**Duration:** ${Math.round(testSummary.test_duration / 1000)}s
**Node Version:** ${testSummary.node_version}
**Platform:** ${testSummary.platform}

## Memory Usage
- RSS: ${Math.round(testSummary.memory_usage.rss / 1024 / 1024)}MB
- Heap Used: ${Math.round(testSummary.memory_usage.heapUsed / 1024 / 1024)}MB
- Heap Total: ${Math.round(testSummary.memory_usage.heapTotal / 1024 / 1024)}MB

## Report Files
- Coverage Report: \`${path.relative(process.cwd(), testSummary.coverage_reports.html)}\`
- JUnit XML: \`${path.relative(process.cwd(), testSummary.junit_report)}\`
- Test Summary: \`test-results/test-summary.json\`

## Next Steps
1. Review coverage reports to ensure 80%+ coverage
2. Check failed tests in JUnit XML
3. Analyze performance metrics for optimization opportunities
4. Update test documentation if needed

---
Generated by Dream 100 Test Suite
`;
    
    fs.writeFileSync(
      path.join(reportsDir, 'README.md'),
      readableSummary
    );
    
    console.log('✅ Test reports generated');
  } catch (error) {
    console.error('❌ Failed to generate test reports:', error);
  }
}

/**
 * Clean up temporary files created during testing
 */
async function cleanupTempFiles(): Promise<void> {
  try {
    console.log('🗂️  Cleaning up temporary files...');
    
    const tempDirs = [
      path.join(process.cwd(), '.next', 'cache'),
      path.join(process.cwd(), 'node_modules', '.cache'),
      path.join(process.cwd(), 'tmp'),
      path.join(process.cwd(), 'tests', 'temp')
    ];
    
    for (const dir of tempDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`  ✓ Removed ${dir}`);
        }
      } catch (error) {
        console.log(`  ⚠️  Could not remove ${dir}:`, error.message);
      }
    }
    
    // Clean up any .test.* files in project root
    const rootFiles = fs.readdirSync(process.cwd());
    for (const file of rootFiles) {
      if (file.includes('.test.') && file !== 'jest.config.js') {
        try {
          fs.unlinkSync(path.join(process.cwd(), file));
          console.log(`  ✓ Removed ${file}`);
        } catch (error) {
          // Ignore cleanup errors for individual files
        }
      }
    }
    
    console.log('✅ Temporary file cleanup complete');
  } catch (error) {
    console.warn('⚠️  Some temporary files could not be cleaned up');
  }
}

/**
 * Generate performance metrics if available
 */
async function generatePerformanceMetrics(): Promise<void> {
  try {
    const performanceFile = path.join(process.cwd(), 'test-results', 'performance.json');
    
    if (global.performanceMetrics && global.performanceMetrics.length > 0) {
      const metrics = {
        timestamp: new Date().toISOString(),
        metrics: global.performanceMetrics,
        summary: {
          total_tests: global.performanceMetrics.length,
          avg_duration: global.performanceMetrics.reduce((sum, m) => sum + m.duration, 0) / global.performanceMetrics.length,
          slowest_test: Math.max(...global.performanceMetrics.map(m => m.duration)),
          fastest_test: Math.min(...global.performanceMetrics.map(m => m.duration))
        }
      };
      
      fs.writeFileSync(performanceFile, JSON.stringify(metrics, null, 2));
      console.log('✅ Performance metrics saved');
    }
  } catch (error) {
    console.log('⚠️  No performance metrics to save');
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⚠️  Test interrupted by user, cleaning up...');
  await globalTeardown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Test terminated, cleaning up...');
  await globalTeardown();
  process.exit(0);
});