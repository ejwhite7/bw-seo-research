#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Dream 100 Keyword Engine
 * 
 * Orchestrates execution of all test types with proper reporting,
 * performance monitoring, and result aggregation.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  errors: string[];
}

interface TestRunOptions {
  suites: string[];
  parallel: boolean;
  coverage: boolean;
  watch: boolean;
  verbose: boolean;
  bail: boolean;
  pattern?: string;
  timeout?: number;
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  constructor(private options: TestRunOptions) {}

  async run(): Promise<void> {
    console.log('🚀 Starting Dream 100 Keyword Engine Test Suite\n');
    this.startTime = Date.now();

    try {
      // Setup test environment
      await this.setupEnvironment();

      // Run test suites
      if (this.options.parallel) {
        await this.runParallel();
      } else {
        await this.runSequential();
      }

      // Generate reports
      await this.generateReports();

      // Cleanup
      await this.cleanup();

      // Exit with appropriate code
      const hasFailures = this.results.some(result => result.failed > 0);
      process.exit(hasFailures ? 1 : 0);

    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    }
  }

  private async setupEnvironment(): Promise<void> {
    console.log('🔧 Setting up test environment...');

    // Ensure test directories exist
    const dirs = [
      'test-results',
      'test-results/coverage',
      'test-results/reports',
      'test-results/artifacts'
    ];

    dirs.forEach(dir => {
      const fullPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });

    // Check dependencies
    await this.checkDependencies();

    // Setup test database if needed
    if (process.env.SETUP_TEST_DB === 'true') {
      await this.setupTestDatabase();
    }

    console.log('✅ Test environment ready\n');
  }

  private async checkDependencies(): Promise<void> {
    const requiredBins = ['node', 'npm'];
    
    for (const bin of requiredBins) {
      try {
        await this.execCommand(`which ${bin}`);
      } catch (error) {
        throw new Error(`Required binary not found: ${bin}`);
      }
    }
  }

  private async setupTestDatabase(): Promise<void> {
    console.log('📊 Setting up test database...');
    
    try {
      // Run database migrations or setup
      await this.execCommand('npm run db:test:setup');
      console.log('✅ Test database ready');
    } catch (error) {
      console.warn('⚠️  Test database setup failed, continuing with mocks');
    }
  }

  private async runParallel(): Promise<void> {
    console.log('🔄 Running test suites in parallel...\n');

    const promises = this.options.suites.map(suite => this.runTestSuite(suite));
    await Promise.all(promises);
  }

  private async runSequential(): Promise<void> {
    console.log('📋 Running test suites sequentially...\n');

    for (const suite of this.options.suites) {
      await this.runTestSuite(suite);
      
      if (this.options.bail && this.hasFailures()) {
        console.log('🛑 Stopping due to test failures (--bail enabled)');
        break;
      }
    }
  }

  private async runTestSuite(suite: string): Promise<void> {
    console.log(`📝 Running ${suite} tests...`);
    const startTime = Date.now();

    try {
      const result = await this.executeTestSuite(suite);
      const duration = Date.now() - startTime;

      this.results.push({
        suite,
        duration,
        ...result
      });

      this.logSuiteResult(suite, result, duration);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        suite,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration,
        errors: [error.message]
      });

      console.log(`❌ ${suite} suite failed: ${error.message}`);
    }
  }

  private async executeTestSuite(suite: string): Promise<Omit<TestResult, 'suite' | 'duration'>> {
    switch (suite) {
      case 'unit':
        return this.runUnitTests();
      case 'integration':
        return this.runIntegrationTests();
      case 'e2e':
        return this.runE2ETests();
      case 'performance':
        return this.runPerformanceTests();
      case 'component':
        return this.runComponentTests();
      default:
        throw new Error(`Unknown test suite: ${suite}`);
    }
  }

  private async runUnitTests(): Promise<Omit<TestResult, 'suite' | 'duration'>> {
    const cmd = this.buildJestCommand('tests/unit/**/*.test.ts');
    const result = await this.execCommand(cmd);
    return this.parseJestOutput(result);
  }

  private async runIntegrationTests(): Promise<Omit<TestResult, 'suite' | 'duration'>> {
    const cmd = this.buildJestCommand('tests/integration/**/*.test.ts');
    const result = await this.execCommand(cmd);
    return this.parseJestOutput(result);
  }

  private async runComponentTests(): Promise<Omit<TestResult, 'suite' | 'duration'>> {
    const cmd = this.buildJestCommand('tests/components/**/*.test.tsx');
    const result = await this.execCommand(cmd);
    return this.parseJestOutput(result);
  }

  private async runE2ETests(): Promise<Omit<TestResult, 'suite' | 'duration'>> {
    const cmd = this.buildPlaywrightCommand();
    const result = await this.execCommand(cmd);
    return this.parsePlaywrightOutput(result);
  }

  private async runPerformanceTests(): Promise<Omit<TestResult, 'suite' | 'duration'>> {
    const cmd = this.buildJestCommand('tests/performance/**/*.test.ts');
    const result = await this.execCommand(cmd);
    return this.parseJestOutput(result);
  }

  private buildJestCommand(pattern: string): string {
    const cmd = ['npx jest'];
    
    cmd.push(`--testPathPattern="${pattern}"`);
    cmd.push('--passWithNoTests');
    
    if (this.options.coverage) {
      cmd.push('--coverage');
      cmd.push('--coverageDirectory=test-results/coverage');
    }
    
    if (this.options.verbose) {
      cmd.push('--verbose');
    }
    
    if (this.options.watch) {
      cmd.push('--watch');
    }
    
    if (this.options.timeout) {
      cmd.push(`--testTimeout=${this.options.timeout}`);
    }
    
    // Output results in JSON format for parsing
    cmd.push('--json');
    cmd.push('--outputFile=test-results/jest-results.json');
    
    return cmd.join(' ');
  }

  private buildPlaywrightCommand(): string {
    const cmd = ['npx playwright test'];
    
    cmd.push('tests/e2e');
    
    if (this.options.verbose) {
      cmd.push('--reporter=list');
    } else {
      cmd.push('--reporter=line');
    }
    
    // Generate reports
    cmd.push('--reporter=html:test-results/playwright-report');
    cmd.push('--reporter=json:test-results/playwright-results.json');
    
    return cmd.join(' ');
  }

  private async execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (this.options.verbose) {
          process.stdout.write(data);
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (this.options.verbose) {
          process.stderr.write(data);
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute command: ${error.message}`));
      });
    });
  }

  private parseJestOutput(output: string): Omit<TestResult, 'suite' | 'duration'> {
    try {
      // Try to read JSON results file
      const resultsPath = path.join(process.cwd(), 'test-results/jest-results.json');
      if (fs.existsSync(resultsPath)) {
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        
        return {
          passed: results.numPassedTests || 0,
          failed: results.numFailedTests || 0,
          skipped: results.numPendingTests || 0,
          coverage: this.extractCoverage(results),
          errors: this.extractErrors(results)
        };
      }
    } catch (error) {
      console.warn('Failed to parse Jest JSON output, falling back to text parsing');
    }

    // Fallback to text parsing
    return this.parseJestTextOutput(output);
  }

  private parseJestTextOutput(output: string): Omit<TestResult, 'suite' | 'duration'> {
    const lines = output.split('\n');
    
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const line of lines) {
      if (line.includes('✓') || line.includes('PASS')) {
        passed++;
      } else if (line.includes('✗') || line.includes('FAIL')) {
        failed++;
        errors.push(line.trim());
      } else if (line.includes('○') || line.includes('SKIP')) {
        skipped++;
      }
    }

    return { passed, failed, skipped, errors };
  }

  private parsePlaywrightOutput(output: string): Omit<TestResult, 'suite' | 'duration'> {
    try {
      const resultsPath = path.join(process.cwd(), 'test-results/playwright-results.json');
      if (fs.existsSync(resultsPath)) {
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        
        const stats = results.stats || {};
        return {
          passed: stats.expected || 0,
          failed: stats.unexpected || 0,
          skipped: stats.skipped || 0,
          errors: this.extractPlaywrightErrors(results)
        };
      }
    } catch (error) {
      console.warn('Failed to parse Playwright JSON output');
    }

    // Fallback to text parsing
    return this.parsePlaywrightTextOutput(output);
  }

  private parsePlaywrightTextOutput(output: string): Omit<TestResult, 'suite' | 'duration'> {
    const lines = output.split('\n');
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const line of lines) {
      if (line.includes('✓') || line.includes('passed')) {
        passed++;
      } else if (line.includes('✗') || line.includes('failed')) {
        failed++;
      } else if (line.includes('○') || line.includes('skipped')) {
        skipped++;
      }
    }

    return { passed, failed, skipped, errors: [] };
  }

  private extractCoverage(results: any): TestResult['coverage'] {
    const coverage = results.coverageMap?.getCoverageSummary?.();
    if (!coverage) return undefined;

    return {
      statements: coverage.statements?.pct || 0,
      branches: coverage.branches?.pct || 0,
      functions: coverage.functions?.pct || 0,
      lines: coverage.lines?.pct || 0
    };
  }

  private extractErrors(results: any): string[] {
    const errors: string[] = [];
    
    if (results.testResults) {
      for (const testResult of results.testResults) {
        if (testResult.assertionResults) {
          for (const assertion of testResult.assertionResults) {
            if (assertion.status === 'failed' && assertion.failureMessages) {
              errors.push(...assertion.failureMessages);
            }
          }
        }
      }
    }

    return errors;
  }

  private extractPlaywrightErrors(results: any): string[] {
    const errors: string[] = [];
    
    if (results.suites) {
      for (const suite of results.suites) {
        if (suite.specs) {
          for (const spec of suite.specs) {
            if (spec.tests) {
              for (const test of spec.tests) {
                if (test.results) {
                  for (const result of test.results) {
                    if (result.status === 'failed' && result.error) {
                      errors.push(result.error.message || 'Unknown error');
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return errors;
  }

  private logSuiteResult(suite: string, result: any, duration: number): void {
    const total = result.passed + result.failed + result.skipped;
    const success = result.failed === 0;
    const icon = success ? '✅' : '❌';
    
    console.log(`${icon} ${suite}: ${result.passed}/${total} passed (${(duration / 1000).toFixed(1)}s)`);
    
    if (result.coverage) {
      console.log(`   Coverage: ${result.coverage.statements}% statements, ${result.coverage.branches}% branches`);
    }
    
    if (result.failed > 0) {
      console.log(`   Failures: ${result.failed}`);
    }
    
    console.log('');
  }

  private async generateReports(): Promise<void> {
    console.log('📊 Generating test reports...\n');

    const totalDuration = Date.now() - this.startTime;
    const summary = this.generateSummary(totalDuration);

    // Write summary report
    const summaryPath = path.join(process.cwd(), 'test-results/summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Write human-readable report
    const reportPath = path.join(process.cwd(), 'test-results/report.md');
    fs.writeFileSync(reportPath, this.generateMarkdownReport(summary));

    // Log summary to console
    this.logFinalSummary(summary);
  }

  private generateSummary(totalDuration: number) {
    const totalTests = this.results.reduce((sum, r) => sum + r.passed + r.failed + r.skipped, 0);
    const totalPassed = this.results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = this.results.reduce((sum, r) => sum + r.failed, 0);
    const totalSkipped = this.results.reduce((sum, r) => sum + r.skipped, 0);

    const overallCoverage = this.calculateOverallCoverage();

    return {
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      suites: this.results.length,
      tests: {
        total: totalTests,
        passed: totalPassed,
        failed: totalFailed,
        skipped: totalSkipped,
        success: totalFailed === 0
      },
      coverage: overallCoverage,
      results: this.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        ci: process.env.CI === 'true'
      }
    };
  }

  private calculateOverallCoverage() {
    const coverageResults = this.results.filter(r => r.coverage);
    if (coverageResults.length === 0) return null;

    const avgCoverage = coverageResults.reduce((acc, r) => {
      acc.statements += r.coverage!.statements;
      acc.branches += r.coverage!.branches;
      acc.functions += r.coverage!.functions;
      acc.lines += r.coverage!.lines;
      return acc;
    }, { statements: 0, branches: 0, functions: 0, lines: 0 });

    const count = coverageResults.length;
    return {
      statements: Math.round(avgCoverage.statements / count),
      branches: Math.round(avgCoverage.branches / count),
      functions: Math.round(avgCoverage.functions / count),
      lines: Math.round(avgCoverage.lines / count)
    };
  }

  private generateMarkdownReport(summary: any): string {
    return `# Dream 100 Keyword Engine Test Report

**Generated:** ${summary.timestamp}
**Duration:** ${(summary.duration / 1000).toFixed(1)}s
**Environment:** ${summary.environment.platform} ${summary.environment.nodeVersion}

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${summary.tests.total} |
| Passed | ${summary.tests.passed} ✅ |
| Failed | ${summary.tests.failed} ${summary.tests.failed > 0 ? '❌' : ''} |
| Skipped | ${summary.tests.skipped} |
| Success Rate | ${((summary.tests.passed / summary.tests.total) * 100).toFixed(1)}% |

${summary.coverage ? `## Coverage

| Type | Percentage |
|------|------------|
| Statements | ${summary.coverage.statements}% |
| Branches | ${summary.coverage.branches}% |
| Functions | ${summary.coverage.functions}% |
| Lines | ${summary.coverage.lines}% |
` : ''}

## Test Suites

${summary.results.map((result: TestResult) => `
### ${result.suite.charAt(0).toUpperCase() + result.suite.slice(1)} Tests

- **Duration:** ${(result.duration / 1000).toFixed(1)}s
- **Passed:** ${result.passed}
- **Failed:** ${result.failed}
- **Skipped:** ${result.skipped}
${result.errors.length > 0 ? `
**Errors:**
${result.errors.map((error: string) => `- ${error}`).join('\n')}
` : ''}
`).join('')}

## Recommendations

${summary.tests.failed > 0 ? '- ❗ Fix failing tests before deployment' : '- ✅ All tests passing'}
${summary.coverage && summary.coverage.statements < 80 ? '- 📈 Increase test coverage (target: 80%+)' : ''}
${summary.duration > 300000 ? '- ⚡ Consider optimizing slow tests' : ''}

---
*Generated by Dream 100 Test Runner*
`;
  }

  private logFinalSummary(summary: any): void {
    const success = summary.tests.success;
    const icon = success ? '🎉' : '💥';
    
    console.log(`${icon} Test Results Summary`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Duration: ${(summary.duration / 1000).toFixed(1)}s`);
    console.log(`Total Tests: ${summary.tests.total}`);
    console.log(`Passed: ${summary.tests.passed} ✅`);
    console.log(`Failed: ${summary.tests.failed} ${summary.tests.failed > 0 ? '❌' : ''}`);
    console.log(`Skipped: ${summary.tests.skipped}`);
    console.log(`Success Rate: ${((summary.tests.passed / summary.tests.total) * 100).toFixed(1)}%`);
    
    if (summary.coverage) {
      console.log('\nCoverage:');
      console.log(`  Statements: ${summary.coverage.statements}%`);
      console.log(`  Branches: ${summary.coverage.branches}%`);
      console.log(`  Functions: ${summary.coverage.functions}%`);
      console.log(`  Lines: ${summary.coverage.lines}%`);
    }
    
    console.log('\nReport files:');
    console.log('  📄 test-results/report.md');
    console.log('  📊 test-results/summary.json');
    console.log('  📁 test-results/coverage/');
    
    if (!success) {
      console.log('\n❌ Some tests failed. Check the detailed report for more information.');
    }
  }

  private hasFailures(): boolean {
    return this.results.some(result => result.failed > 0);
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up...');
    
    // Cleanup test artifacts if not in CI
    if (process.env.CI !== 'true') {
      // Remove temporary files
      // Close database connections
      // Stop test servers
    }
    
    console.log('✅ Cleanup complete');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options: TestRunOptions = {
    suites: ['unit', 'integration', 'component'],
    parallel: false,
    coverage: false,
    watch: false,
    verbose: false,
    bail: false
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--all':
        options.suites = ['unit', 'integration', 'component', 'e2e', 'performance'];
        break;
      case '--unit':
        options.suites = ['unit'];
        break;
      case '--integration':
        options.suites = ['integration'];
        break;
      case '--component':
        options.suites = ['component'];
        break;
      case '--e2e':
        options.suites = ['e2e'];
        break;
      case '--performance':
        options.suites = ['performance'];
        break;
      case '--parallel':
        options.parallel = true;
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--bail':
        options.bail = true;
        break;
      case '--pattern':
        options.pattern = args[++i];
        break;
      case '--timeout':
        options.timeout = parseInt(args[++i]);
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
    }
  }

  const runner = new TestRunner(options);
  await runner.run();
}

function printHelp() {
  console.log(`
Dream 100 Keyword Engine Test Runner

Usage: npm run test [options]

Options:
  --all           Run all test suites
  --unit          Run unit tests only
  --integration   Run integration tests only  
  --component     Run component tests only
  --e2e           Run end-to-end tests only
  --performance   Run performance tests only
  --parallel      Run test suites in parallel
  --coverage      Generate coverage reports
  --watch         Watch for changes and re-run tests
  --verbose       Verbose output
  --bail          Stop on first failure
  --pattern <p>   Filter tests by pattern
  --timeout <ms>  Set test timeout
  --help          Show this help

Examples:
  npm run test                    # Run unit, integration, and component tests
  npm run test -- --all          # Run all test suites
  npm run test -- --unit --coverage  # Run unit tests with coverage
  npm run test -- --e2e --verbose   # Run e2e tests with verbose output
`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

export { TestRunner, TestRunOptions, TestResult };