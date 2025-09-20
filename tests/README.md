# Dream 100 Keyword Engine Test Suite

Comprehensive test automation for the Dream 100 Keyword Engine, ensuring reliable operation across all components and workflows.

## 🚀 Quick Start

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:component     # React component tests
npm run test:e2e          # End-to-end tests
npm run test:performance  # Performance tests

# Run tests with coverage
npm run test:coverage

# Run all tests (CI mode)
npm run test:ci
```

## 📋 Test Suite Overview

### Test Types

| Test Type | Purpose | Location | Duration |
|-----------|---------|----------|----------|
| **Unit Tests** | Individual function/method testing | `tests/unit/` | ~30s |
| **Integration Tests** | Service integration & API testing | `tests/integration/` | ~2min |
| **Component Tests** | React component behavior | `tests/components/` | ~1min |
| **End-to-End Tests** | Full user workflow testing | `tests/e2e/` | ~5min |
| **Performance Tests** | Load & performance validation | `tests/performance/` | ~10min |

### Coverage Targets

- **Overall Coverage**: 80%+ 
- **Core Services**: 85%+
- **API Endpoints**: 90%+
- **Critical Components**: 85%+

## 🏗️ Test Architecture

### Framework Stack

- **Jest**: Unit & integration testing
- **React Testing Library**: Component testing
- **Playwright**: End-to-end testing
- **MSW**: API mocking
- **Custom Test Runner**: Orchestration & reporting

### Mock Strategy

```
External APIs → MSW Mocks → Service Layer → Business Logic
Database → In-Memory/Test DB → Data Layer → Application
UI Events → Testing Library → Components → User Interactions
```

## 📁 Directory Structure

```
tests/
├── __mocks__/              # External service mocks
│   ├── anthropic.ts        # Anthropic API mock
│   ├── axios.ts            # HTTP client mock
│   └── redis.ts            # Redis cache mock
├── setup/                  # Test environment setup
│   ├── env.ts              # Environment configuration
│   ├── global.ts           # Global setup
│   └── teardown.ts         # Cleanup procedures
├── unit/                   # Unit tests
│   ├── scoring.test.ts     # Scoring algorithm tests
│   ├── clustering.test.ts  # Clustering logic tests
│   └── expansion.test.ts   # Keyword expansion tests
├── integration/            # Integration tests
│   ├── pipeline.test.ts    # Full pipeline tests
│   ├── api.test.ts         # API endpoint tests
│   └── database.test.ts    # Database operation tests
├── components/             # React component tests
│   ├── Dashboard.test.tsx  # Main dashboard tests
│   ├── KeywordTable.test.tsx
│   └── ClusterView.test.tsx
├── e2e/                    # End-to-end tests
│   ├── complete-workflow.e2e.ts
│   ├── user-journeys.e2e.ts
│   └── cross-browser.e2e.ts
├── performance/            # Performance tests
│   ├── load.test.ts        # Load testing
│   ├── stress.test.ts      # Stress testing
│   └── memory.test.ts      # Memory leak testing
├── test-config.ts          # Test configuration
├── run-tests.ts            # Test orchestrator
└── README.md               # This file
```

## 🧪 Test Categories

### Unit Tests

Test individual functions and classes in isolation.

```bash
npm run test:unit
```

**Key Test Areas:**
- Scoring algorithms (Dream 100, Tier 2/3 weights)
- Keyword normalization and validation
- Clustering algorithms and similarity calculations
- Data transformation utilities
- Business logic functions

**Example:**
```typescript
describe('ScoringService', () => {
  it('should calculate correct blended score for dream100 keywords', () => {
    const keyword = { volume: 12000, difficulty: 45, intent: 'commercial' };
    const score = scoringService.calculateBlendedScore(keyword);
    expect(score.blendedScore).toBeCloseTo(0.75, 2);
  });
});
```

### Integration Tests

Test component interactions and external service integrations.

```bash
npm run test:integration
```

**Key Test Areas:**
- Complete pipeline execution (seed → Dream 100 → clusters → roadmap)
- API endpoint functionality and error handling
- Database operations and transactions
- External API integrations (Ahrefs, Anthropic)
- Job queue processing
- Cache operations

**Example:**
```typescript
describe('Pipeline Integration', () => {
  it('should execute complete pipeline successfully', async () => {
    const result = await pipeline.execute(['digital marketing']);
    expect(result.totalKeywords).toBeGreaterThan(0);
    expect(result.status).toBe('completed');
  });
});
```

### Component Tests

Test React components and user interactions.

```bash
npm run test:component
```

**Key Test Areas:**
- Dashboard functionality and state management
- Keyword table filtering and sorting
- Cluster visualization and interactions
- Form validation and submissions
- Export functionality
- Error states and loading indicators

**Example:**
```typescript
describe('Dashboard Component', () => {
  it('should filter keywords by stage', async () => {
    render(<Dashboard keywords={mockKeywords} />);
    await user.selectOptions(screen.getByTestId('stage-filter'), 'dream100');
    expect(screen.getAllByTestId(/^keyword-/)).toHaveLength(10);
  });
});
```

### End-to-End Tests

Test complete user workflows across the full application.

```bash
npm run test:e2e
```

**Key Test Areas:**
- Complete keyword research workflow
- User authentication and authorization
- Cross-browser compatibility
- Mobile responsiveness
- Accessibility compliance
- Performance under real conditions

**Example:**
```typescript
test('should complete full workflow from seed to export', async ({ page }) => {
  await page.goto('/dashboard');
  await page.fill('[data-testid="seed-keywords"]', 'digital marketing');
  await page.click('[data-testid="create-run"]');
  // ... workflow steps
  await expect(page.locator('[data-testid="export-success"]')).toBeVisible();
});
```

### Performance Tests

Validate system performance under various load conditions.

```bash
npm run test:performance
```

**Key Test Areas:**
- Keyword processing performance (10k keywords in <20s P95)
- Concurrent user load testing
- Memory usage and leak detection
- Database query optimization
- API response times
- Clustering algorithm scalability

**Example:**
```typescript
describe('Performance Tests', () => {
  it('should process 1000 keywords within 5 seconds', async () => {
    const startTime = Date.now();
    await keywordService.processKeywords(mockKeywords);
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000);
  });
});
```

## 🎯 Test Data Management

### Test Fixtures

Pre-defined test data for consistent testing:

```typescript
// Generate test keywords
const keywords = TestUtils.generateKeywords(100, 'dream100');

// Generate test runs
const runs = TestUtils.generateRuns(5);

// Generate test clusters
const clusters = TestUtils.generateClusters(10);
```

### Mock Services

Comprehensive mocking for external dependencies:

```typescript
// Mock Anthropic API
mockHelpers.generateKeywordExpansion('digital marketing', 10);

// Mock Ahrefs API  
axiosHelpers.generateAhrefsKeywordResponse(['seo', 'marketing']);

// Mock Redis cache
redisHelpers.populateCache(redis, testData);
```

### Database Isolation

Each test suite runs with isolated data:

- Unit tests: No database, pure mocks
- Integration tests: Test database with transactions
- E2E tests: Fresh database state per test
- Performance tests: Dedicated performance database

## 📊 Test Reporting

### Coverage Reports

```bash
npm run test:coverage
```

**Generated Reports:**
- `test-results/coverage/index.html` - Interactive HTML report
- `test-results/coverage/lcov.info` - LCOV format for CI
- `test-results/coverage/coverage-final.json` - JSON summary

### Test Results

```bash
npm run test:verbose
```

**Report Outputs:**
- `test-results/summary.json` - Machine-readable summary
- `test-results/report.md` - Human-readable report
- `test-results/junit.xml` - CI/CD integration format

### Performance Metrics

```bash
npm run test:performance
```

**Metrics Tracked:**
- Response times (average, P95, P99)
- Memory usage and leak detection
- Concurrent load handling
- Database query performance
- Algorithm complexity validation

## 🔧 Configuration

### Environment Variables

```bash
# Test environment
NODE_ENV=test
TEST_DATABASE_URL=postgresql://localhost:5432/keyword_tool_test
TEST_REDIS_URL=redis://localhost:6379/1

# API keys (test values)
ANTHROPIC_API_KEY=sk-ant-test-key
AHREFS_API_TOKEN=test-token

# Test settings
TEST_TIMEOUT=30000
TEST_RETRIES=2
COLLECT_COVERAGE=true
```

### Custom Test Configuration

```typescript
// tests/test-config.ts
export const TEST_CONFIG = {
  performance: {
    keywordProcessing: {
      smallSet: { maxTime: 2000, keywords: 200 },
      mediumSet: { maxTime: 10000, keywords: 1000 },
      largeSet: { maxTime: 20000, keywords: 10000 }
    }
  },
  dataLimits: {
    maxTestKeywords: 10000,
    maxTestClusters: 100,
    maxTestRuns: 50
  }
};
```

## 🚨 Troubleshooting

### Common Issues

**Tests timing out:**
```bash
# Increase timeout
npm run test -- --timeout=60000
```

**Database connection errors:**
```bash
# Setup test database
npm run db:test:setup
```

**Memory issues during tests:**
```bash
# Run with more memory
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

**Mock service failures:**
```bash
# Reset mocks
npm run test:unit -- --resetMocks
```

### Debug Mode

```bash
# Verbose output
npm run test:verbose

# Debug specific test
DEBUG=keyword-engine:* npm run test:unit

# Browser debugging (E2E)
npm run test:playwright:headed
```

### Performance Debugging

```bash
# Memory profiling
npm run test:performance -- --profile

# CPU profiling  
npm run test:performance -- --cpu-profile

# Network analysis
npm run test:e2e -- --trace
```

## 📝 Writing Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { YourService } from '../your-service';

describe('YourService', () => {
  let service: YourService;

  beforeEach(() => {
    service = new YourService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('yourMethod', () => {
    it('should handle valid input correctly', () => {
      const result = service.yourMethod('valid input');
      expect(result).toBe('expected output');
    });

    it('should throw error for invalid input', () => {
      expect(() => service.yourMethod(null)).toThrow('Invalid input');
    });
  });
});
```

### Component Test Template

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YourComponent } from '../YourComponent';

describe('YourComponent', () => {
  it('should render with default props', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interactions', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    
    render(<YourComponent onSubmit={onSubmit} />);
    
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

### E2E Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Your Feature', () => {
  test('should complete user workflow', async ({ page }) => {
    await page.goto('/your-page');
    
    await page.fill('[data-testid="input"]', 'test value');
    await page.click('[data-testid="submit"]');
    
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
  });
});
```

## 🔄 Continuous Integration

### GitHub Actions Integration

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
      - uses: codecov/codecov-action@v3
        with:
          file: ./test-results/coverage/lcov.info
```

### Quality Gates

**Pre-commit:**
- Lint checks pass
- Type checking passes
- Unit tests pass

**Pre-merge:**
- All test suites pass
- Coverage ≥ 80%
- No performance regressions

**Pre-deployment:**
- E2E tests pass
- Performance benchmarks met
- Security tests pass

## 📈 Metrics & Monitoring

### Key Performance Indicators

- **Test Coverage**: >80% overall, >85% for core services
- **Test Execution Time**: <10 minutes for full suite
- **Test Reliability**: <1% flaky test rate
- **Performance Regression**: <10% slowdown threshold

### Automated Monitoring

- Daily test runs against staging environment
- Performance benchmarking on main branch
- Coverage tracking and trend analysis
- Dependency vulnerability scanning

---

## 🤝 Contributing

When adding new tests:

1. **Choose the right test type** - Unit for logic, Integration for workflows, E2E for user journeys
2. **Follow naming conventions** - `feature.test.ts` for unit, `workflow.e2e.ts` for E2E
3. **Use appropriate mocks** - Prefer mocks over real services in unit tests
4. **Test edge cases** - Include error conditions and boundary values
5. **Maintain test data** - Use test fixtures and utilities for consistency
6. **Update documentation** - Document new test scenarios and requirements

For questions or issues with the test suite, please refer to the project's main documentation or create an issue in the repository.

---

**Test Automation Excellence**: Ensuring the Dream 100 Keyword Engine delivers reliable, high-quality keyword research through comprehensive testing.