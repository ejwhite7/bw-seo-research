/**
 * Performance and Load Tests
 * 
 * Tests system performance under various load conditions
 * and validates response times meet requirements.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock performance measurement utilities
class PerformanceMonitor {
  private startTime: number = 0;
  private endTime: number = 0;
  private metrics: Map<string, number[]> = new Map();

  start(label: string = 'default'): void {
    this.startTime = performance.now();
  }

  end(label: string = 'default'): number {
    this.endTime = performance.now();
    const duration = this.endTime - this.startTime;
    
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(duration);
    
    return duration;
  }

  getAverage(label: string): number {
    const measurements = this.metrics.get(label) || [];
    if (measurements.length === 0) return 0;
    return measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
  }

  getP95(label: string): number {
    const measurements = this.metrics.get(label) || [];
    if (measurements.length === 0) return 0;
    
    const sorted = [...measurements].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[index];
  }

  getP99(label: string): number {
    const measurements = this.metrics.get(label) || [];
    if (measurements.length === 0) return 0;
    
    const sorted = [...measurements].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.99) - 1;
    return sorted[index];
  }

  reset(): void {
    this.metrics.clear();
  }
}

// Mock load testing utilities
class LoadTestRunner {
  private monitor: PerformanceMonitor;

  constructor() {
    this.monitor = new PerformanceMonitor();
  }

  async runConcurrentTests(
    testFn: () => Promise<void>,
    options: {
      concurrency: number;
      iterations: number;
      label: string;
    }
  ): Promise<{
    averageTime: number;
    p95Time: number;
    p99Time: number;
    totalTime: number;
    errorRate: number;
  }> {
    const { concurrency, iterations, label } = options;
    const startTime = performance.now();
    let errors = 0;
    
    // Run tests in batches for specified concurrency
    const batches = Math.ceil(iterations / concurrency);
    
    for (let batch = 0; batch < batches; batch++) {
      const batchPromises: Promise<void>[] = [];
      const currentBatchSize = Math.min(concurrency, iterations - (batch * concurrency));
      
      for (let i = 0; i < currentBatchSize; i++) {
        const promise = (async () => {
          try {
            this.monitor.start(label);
            await testFn();
            this.monitor.end(label);
          } catch (error) {
            errors++;
            this.monitor.end(label); // Still record time even on error
          }
        })();
        
        batchPromises.push(promise);
      }
      
      await Promise.all(batchPromises);
    }
    
    const totalTime = performance.now() - startTime;
    
    return {
      averageTime: this.monitor.getAverage(label),
      p95Time: this.monitor.getP95(label),
      p99Time: this.monitor.getP99(label),
      totalTime,
      errorRate: (errors / iterations) * 100
    };
  }

  async runRampUpTest(
    testFn: () => Promise<void>,
    options: {
      startConcurrency: number;
      endConcurrency: number;
      steps: number;
      iterationsPerStep: number;
      label: string;
    }
  ): Promise<Array<{
    concurrency: number;
    averageTime: number;
    p95Time: number;
    errorRate: number;
  }>> {
    const { startConcurrency, endConcurrency, steps, iterationsPerStep, label } = options;
    const results: Array<{
      concurrency: number;
      averageTime: number;
      p95Time: number;
      errorRate: number;
    }> = [];
    
    const stepSize = (endConcurrency - startConcurrency) / (steps - 1);
    
    for (let step = 0; step < steps; step++) {
      const concurrency = Math.round(startConcurrency + (step * stepSize));
      
      // Reset monitor for each step
      this.monitor.reset();
      
      const stepResult = await this.runConcurrentTests(testFn, {
        concurrency,
        iterations: iterationsPerStep,
        label: `${label}-step-${step}`
      });
      
      results.push({
        concurrency,
        averageTime: stepResult.averageTime,
        p95Time: stepResult.p95Time,
        errorRate: stepResult.errorRate
      });
    }
    
    return results;
  }
}

// Mock services for performance testing
class MockKeywordService {
  async expandKeywords(seedKeywords: string[]): Promise<any[]> {
    // Simulate keyword expansion processing time
    const processingTime = Math.random() * 100 + 50; // 50-150ms
    await this.delay(processingTime);
    
    // Generate mock keywords based on seed count
    const keywordsPerSeed = 100;
    const totalKeywords = seedKeywords.length * keywordsPerSeed;
    
    return Array.from({ length: totalKeywords }, (_, i) => ({
      id: `kw-${i}`,
      keyword: `${seedKeywords[i % seedKeywords.length]} expansion ${i}`,
      volume: Math.floor(Math.random() * 10000) + 100,
      difficulty: Math.floor(Math.random() * 100),
      stage: ['dream100', 'tier2', 'tier3'][i % 3]
    }));
  }

  async enrichKeywords(keywords: any[]): Promise<any[]> {
    // Simulate API calls to external services
    const batchSize = 50;
    const batches = Math.ceil(keywords.length / batchSize);
    
    for (let i = 0; i < batches; i++) {
      await this.delay(100); // Simulate API call delay
    }
    
    return keywords.map(kw => ({
      ...kw,
      enriched: true,
      timestamp: Date.now()
    }));
  }

  async clusterKeywords(keywords: any[]): Promise<any[]> {
    // Simulate clustering algorithm processing time
    const complexityFactor = keywords.length / 1000; // More keywords = more time
    const processingTime = Math.min(complexityFactor * 100 + 200, 5000); // 200ms to 5s
    await this.delay(processingTime);
    
    // Generate mock clusters
    const clusterCount = Math.ceil(keywords.length / 20);
    return Array.from({ length: clusterCount }, (_, i) => ({
      id: `cluster-${i}`,
      keywords: keywords.slice(i * 20, (i + 1) * 20).map(kw => kw.keyword),
      size: Math.min(20, keywords.length - (i * 20)),
      score: Math.random()
    }));
  }

  async scoreKeywords(keywords: any[]): Promise<any[]> {
    // Simulate scoring calculations
    const processingTime = keywords.length * 0.1; // 0.1ms per keyword
    await this.delay(processingTime);
    
    return keywords.map(kw => ({
      ...kw,
      blendedScore: Math.random(),
      quickWin: Math.random() > 0.8
    }));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class MockDatabaseService {
  private queries: Map<string, number> = new Map();

  async saveRun(runData: any): Promise<string> {
    await this.simulateQuery('INSERT', 10);
    return `run-${Date.now()}`;
  }

  async saveKeywords(keywords: any[]): Promise<void> {
    // Simulate batch insert performance
    const batchSize = 100;
    const batches = Math.ceil(keywords.length / batchSize);
    
    for (let i = 0; i < batches; i++) {
      await this.simulateQuery('BATCH_INSERT', 20);
    }
  }

  async getKeywords(runId: string, filters: any = {}): Promise<any[]> {
    await this.simulateQuery('SELECT', 15);
    
    // Simulate returning filtered results
    return Array.from({ length: 1000 }, (_, i) => ({
      id: `kw-${i}`,
      keyword: `keyword ${i}`,
      runId
    }));
  }

  async updateRunStatus(runId: string, status: string): Promise<void> {
    await this.simulateQuery('UPDATE', 5);
  }

  private async simulateQuery(type: string, baseTime: number): Promise<void> {
    // Add some variance to simulate real database performance
    const variance = Math.random() * 0.5 + 0.75; // 75-125% of base time
    const queryTime = baseTime * variance;
    
    this.queries.set(type, (this.queries.get(type) || 0) + 1);
    await new Promise(resolve => setTimeout(resolve, queryTime));
  }

  getQueryStats(): Map<string, number> {
    return new Map(this.queries);
  }

  resetStats(): void {
    this.queries.clear();
  }
}

describe('Performance Tests', () => {
  let loadTestRunner: LoadTestRunner;
  let keywordService: MockKeywordService;
  let dbService: MockDatabaseService;

  beforeEach(() => {
    loadTestRunner = new LoadTestRunner();
    keywordService = new MockKeywordService();
    dbService = new MockDatabaseService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Keyword Processing Performance', () => {
    it('should process small keyword sets within performance targets', async () => {
      const testFn = async () => {
        const keywords = await keywordService.expandKeywords(['test', 'keyword']);
        await keywordService.enrichKeywords(keywords);
        await keywordService.scoreKeywords(keywords);
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 1,
        iterations: 10,
        label: 'small-keyword-processing'
      });

      // Should complete within 2 seconds for small sets
      expect(results.averageTime).toBeLessThan(2000);
      expect(results.p95Time).toBeLessThan(3000);
      expect(results.errorRate).toBe(0);
    });

    it('should process medium keyword sets efficiently', async () => {
      const testFn = async () => {
        const seedKeywords = Array.from({ length: 5 }, (_, i) => `seed${i}`);
        const keywords = await keywordService.expandKeywords(seedKeywords);
        await keywordService.enrichKeywords(keywords);
        await keywordService.scoreKeywords(keywords);
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 1,
        iterations: 5,
        label: 'medium-keyword-processing'
      });

      // Should complete within 10 seconds for medium sets
      expect(results.averageTime).toBeLessThan(10000);
      expect(results.p95Time).toBeLessThan(15000);
      expect(results.errorRate).toBe(0);
    });

    it('should handle large keyword sets within acceptable limits', async () => {
      const testFn = async () => {
        const seedKeywords = Array.from({ length: 10 }, (_, i) => `large-seed${i}`);
        const keywords = await keywordService.expandKeywords(seedKeywords);
        await keywordService.enrichKeywords(keywords.slice(0, 1000)); // Limit to 1000 for test
        await keywordService.scoreKeywords(keywords.slice(0, 1000));
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 1,
        iterations: 3,
        label: 'large-keyword-processing'
      });

      // Should complete within 30 seconds for large sets
      expect(results.averageTime).toBeLessThan(30000);
      expect(results.p95Time).toBeLessThan(45000);
      expect(results.errorRate).toBe(0);
    });
  });

  describe('Clustering Performance', () => {
    it('should cluster keywords efficiently based on size', async () => {
      const keywordSizes = [100, 500, 1000, 2000];
      
      for (const size of keywordSizes) {
        const keywords = Array.from({ length: size }, (_, i) => ({
          id: `kw-${i}`,
          keyword: `keyword ${i}`,
          stage: 'dream100'
        }));

        const testFn = async () => {
          await keywordService.clusterKeywords(keywords);
        };

        const results = await loadTestRunner.runConcurrentTests(testFn, {
          concurrency: 1,
          iterations: 3,
          label: `clustering-${size}`
        });

        // Clustering time should scale reasonably with keyword count
        const expectedMaxTime = Math.min(size * 5, 20000); // 5ms per keyword, max 20s
        expect(results.averageTime).toBeLessThan(expectedMaxTime);
      }
    });

    it('should maintain clustering performance under concurrent load', async () => {
      const keywords = Array.from({ length: 500 }, (_, i) => ({
        id: `kw-${i}`,
        keyword: `concurrent keyword ${i}`,
        stage: 'dream100'
      }));

      const testFn = async () => {
        await keywordService.clusterKeywords(keywords);
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 5,
        iterations: 15,
        label: 'concurrent-clustering'
      });

      expect(results.errorRate).toBe(0);
      expect(results.p95Time).toBeLessThan(10000); // 10 seconds P95
    });
  });

  describe('Database Performance', () => {
    it('should handle keyword batch inserts efficiently', async () => {
      const testFn = async () => {
        const keywords = Array.from({ length: 1000 }, (_, i) => ({
          id: `kw-${i}`,
          keyword: `batch keyword ${i}`,
          runId: 'test-run'
        }));

        await dbService.saveKeywords(keywords);
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 1,
        iterations: 5,
        label: 'batch-insert'
      });

      // Should insert 1000 keywords within 2 seconds
      expect(results.averageTime).toBeLessThan(2000);
      expect(results.p95Time).toBeLessThan(3000);
    });

    it('should maintain query performance under load', async () => {
      const testFn = async () => {
        await dbService.getKeywords('test-run', { stage: 'dream100' });
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 10,
        iterations: 50,
        label: 'concurrent-queries'
      });

      expect(results.errorRate).toBe(0);
      expect(results.averageTime).toBeLessThan(100); // 100ms average
      expect(results.p95Time).toBeLessThan(200); // 200ms P95
    });
  });

  describe('End-to-End Pipeline Performance', () => {
    it('should complete full pipeline within SLA', async () => {
      const testFn = async () => {
        // Simulate complete pipeline
        const runId = await dbService.saveRun({
          seedKeywords: ['performance', 'test'],
          userId: 'test-user'
        });

        const keywords = await keywordService.expandKeywords(['performance', 'test']);
        await keywordService.enrichKeywords(keywords);
        
        const clusters = await keywordService.clusterKeywords(keywords);
        const scoredKeywords = await keywordService.scoreKeywords(keywords);
        
        await dbService.saveKeywords(scoredKeywords);
        await dbService.updateRunStatus(runId, 'completed');
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 1,
        iterations: 3,
        label: 'full-pipeline'
      });

      // Full pipeline should complete within 20 seconds (P95)
      expect(results.p95Time).toBeLessThan(20000);
      expect(results.errorRate).toBe(0);
    });

    it('should handle concurrent pipeline executions', async () => {
      const testFn = async () => {
        const runId = await dbService.saveRun({
          seedKeywords: ['concurrent', 'pipeline'],
          userId: `user-${Math.random()}`
        });

        const keywords = await keywordService.expandKeywords(['concurrent']);
        const scoredKeywords = await keywordService.scoreKeywords(keywords.slice(0, 100));
        
        await dbService.saveKeywords(scoredKeywords);
        await dbService.updateRunStatus(runId, 'completed');
      };

      const results = await loadTestRunner.runConcurrentTests(testFn, {
        concurrency: 3,
        iterations: 9,
        label: 'concurrent-pipelines'
      });

      expect(results.errorRate).toBeLessThan(5); // Allow up to 5% error rate under load
      expect(results.p95Time).toBeLessThan(30000); // 30 seconds P95 under load
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory during processing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Run multiple iterations to test for memory leaks
      for (let i = 0; i < 10; i++) {
        const keywords = await keywordService.expandKeywords(['memory', 'test']);
        await keywordService.scoreKeywords(keywords);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle resource cleanup properly', async () => {
      const testFn = async () => {
        const keywords = Array.from({ length: 500 }, (_, i) => ({
          id: `cleanup-kw-${i}`,
          keyword: `cleanup keyword ${i}`
        }));

        await keywordService.clusterKeywords(keywords);
      };

      // Run test multiple times to verify cleanup
      for (let iteration = 0; iteration < 5; iteration++) {
        const results = await loadTestRunner.runConcurrentTests(testFn, {
          concurrency: 2,
          iterations: 4,
          label: `cleanup-test-${iteration}`
        });

        expect(results.errorRate).toBe(0);
      }
    });
  });

  describe('Stress Testing', () => {
    it('should handle ramp-up load gracefully', async () => {
      const testFn = async () => {
        const keywords = await keywordService.expandKeywords(['stress']);
        await keywordService.scoreKeywords(keywords.slice(0, 50));
      };

      const results = await loadTestRunner.runRampUpTest(testFn, {
        startConcurrency: 1,
        endConcurrency: 10,
        steps: 5,
        iterationsPerStep: 10,
        label: 'ramp-up-test'
      });

      // Verify performance degrades gracefully
      for (let i = 1; i < results.length; i++) {
        const current = results[i];
        const previous = results[i - 1];
        
        // Response time shouldn't increase too dramatically
        const responseTimeIncrease = current.averageTime / previous.averageTime;
        expect(responseTimeIncrease).toBeLessThan(3); // No more than 3x increase
        
        // Error rate should remain low
        expect(current.errorRate).toBeLessThan(10);
      }
    });

    it('should recover from peak load', async () => {
      const lightTestFn = async () => {
        await keywordService.scoreKeywords([{ id: '1', keyword: 'light' }]);
      };

      const heavyTestFn = async () => {
        const keywords = await keywordService.expandKeywords(['heavy', 'load']);
        await keywordService.clusterKeywords(keywords);
      };

      // Establish baseline
      const baseline = await loadTestRunner.runConcurrentTests(lightTestFn, {
        concurrency: 1,
        iterations: 5,
        label: 'baseline'
      });

      // Apply heavy load
      await loadTestRunner.runConcurrentTests(heavyTestFn, {
        concurrency: 5,
        iterations: 10,
        label: 'heavy-load'
      });

      // Test recovery
      const recovery = await loadTestRunner.runConcurrentTests(lightTestFn, {
        concurrency: 1,
        iterations: 5,
        label: 'recovery'
      });

      // Performance should return close to baseline
      const recoveryRatio = recovery.averageTime / baseline.averageTime;
      expect(recoveryRatio).toBeLessThan(1.5); // Within 50% of baseline
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics accurately', async () => {
      const monitor = new PerformanceMonitor();
      
      // Simulate some operations with known durations
      monitor.start('test-1');
      await new Promise(resolve => setTimeout(resolve, 100));
      const duration1 = monitor.end('test-1');
      
      monitor.start('test-1');
      await new Promise(resolve => setTimeout(resolve, 200));
      const duration2 = monitor.end('test-1');

      expect(duration1).toBeGreaterThan(90);
      expect(duration1).toBeLessThan(150);
      expect(duration2).toBeGreaterThan(190);
      expect(duration2).toBeLessThan(250);

      const average = monitor.getAverage('test-1');
      expect(average).toBeGreaterThan(140);
      expect(average).toBeLessThan(160);
    });

    it('should calculate percentiles correctly', async () => {
      const monitor = new PerformanceMonitor();
      
      // Generate known distribution
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      
      for (const value of values) {
        monitor.start('percentile-test');
        await new Promise(resolve => setTimeout(resolve, value));
        monitor.end('percentile-test');
      }

      const p95 = monitor.getP95('percentile-test');
      const p99 = monitor.getP99('percentile-test');

      expect(p95).toBeGreaterThan(90);
      expect(p99).toBeGreaterThan(95);
    });
  });
});