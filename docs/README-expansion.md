# Dream 100 Expansion Service

Comprehensive keyword expansion service that generates 100 commercially relevant head terms from seed keywords using intelligent LLM expansion and Ahrefs metrics enrichment.

## Overview

The Dream 100 Expansion Service is a core component of the Keyword Tool that transforms 1-5 seed keywords into a curated list of 100 high-quality, commercially viable head terms. It uses a sophisticated 6-stage pipeline combining AI-powered expansion, real search data, and intelligent filtering.

## Features

### Multi-Stage Processing Pipeline
1. **LLM Seed Expansion** - Generate 200-300 candidate keywords using Anthropic Claude
2. **Ahrefs Metrics Enrichment** - Fetch volume, difficulty, CPC, and SERP data
3. **Intent Classification** - Identify commercial vs informational search intent
4. **Relevance Scoring** - Calculate semantic similarity to seed terms
5. **Commercial Filtering** - Focus on business-relevant keywords
6. **Final Selection** - Select top 100 keywords with optimal scoring

### Advanced Capabilities
- **Commercial Relevance Focus** - Prioritizes keywords with business value
- **Adaptive Batch Processing** - Handles large datasets efficiently
- **Smart Rate Limiting** - Respects API limits with exponential backoff
- **Cost Optimization** - Intelligent caching and request batching
- **Quality Assurance** - Multiple validation layers and scoring algorithms
- **Progress Tracking** - Real-time updates and detailed analytics
- **Error Resilience** - Graceful degradation and fallback mechanisms

## Installation

```bash
npm install
# Ensure you have the required dependencies:
# - @anthropic-ai/sdk
# - axios (for Ahrefs)
# - zod (for validation)
# - @sentry/nextjs (for monitoring)
```

## Quick Start

```typescript
import { createDream100ExpansionService } from './services/expansion';

// Initialize the service
const expansionService = createDream100ExpansionService(
  process.env.ANTHROPIC_API_KEY!,
  process.env.AHREFS_API_KEY!
);

// Basic expansion
const result = await expansionService.expandToDream100({
  runId: 'your-run-id',
  seedKeywords: ['content marketing', 'SEO tools'],
  targetCount: 50,
  market: 'US',
  industry: 'marketing technology'
});

console.log(`Generated ${result.dream100Keywords.length} keywords`);
console.log(`Total cost: $${result.costBreakdown.totalCost}`);
```

## Configuration Options

### Dream100ExpansionRequest Interface

```typescript
interface Dream100ExpansionRequest {
  readonly runId: UUID;                    // Unique identifier for this run
  readonly seedKeywords: string[];         // 1-5 seed keywords (required)
  readonly targetCount?: number;           // Target keywords (default: 100, max: 100)
  readonly market?: string;                // Market code (default: 'US')
  readonly industry?: string;              // Industry context for better targeting
  readonly intentFocus?: IntentFocus;      // Focus on specific intent types
  readonly difficultyPreference?: string; // Preferred difficulty level
  readonly budgetLimit?: number;           // Maximum cost limit
  readonly qualityThreshold?: number;      // Minimum quality score (0-1, default: 0.7)
  readonly includeCompetitorAnalysis?: boolean; // Enable competitor analysis
}
```

### Intent Focus Options
- `'commercial'` - Business/purchase-focused keywords
- `'informational'` - Educational/research-focused keywords  
- `'transactional'` - Direct purchase intent keywords
- `'mixed'` - Balanced distribution (default)

### Difficulty Preferences
- `'easy'` - Lower competition keywords (KD 0-30)
- `'medium'` - Moderate competition keywords (KD 31-70)
- `'hard'` - High competition keywords (KD 71-100)
- `'mixed'` - Balanced distribution (default)

## Advanced Usage

### Progress Tracking

```typescript
const result = await expansionService.expandToDream100(
  request,
  (progress) => {
    console.log(`${progress.stage}: ${progress.progressPercent}%`);
    console.log(`Processed: ${progress.keywordsProcessed} keywords`);
    console.log(`Cost so far: $${progress.currentCost}`);
  }
);
```

### Cost Estimation

```typescript
const estimate = expansionService.estimateExpansionCost(
  seedCount: 2,
  targetCount: 100,
  includeCompetitorAnalysis: true
);

console.log(`Estimated cost: $${estimate.estimatedCost}`);
console.log(`Confidence: ${estimate.confidence * 100}%`);
```

### Error Handling

```typescript
try {
  const result = await expansionService.expandToDream100(request);
  
  if (!result.success) {
    console.error('Expansion failed:', result.errors);
    console.warn('Warnings:', result.warnings);
  }
  
} catch (error) {
  console.error('Service error:', error.message);
  
  // Handle specific error types
  if (error.message.includes('budget')) {
    console.log('Consider increasing budget limit');
  } else if (error.message.includes('rate limit')) {
    console.log('Retry after rate limit reset');
  }
}
```

## Result Analysis

### Dream100ExpansionResult Structure

```typescript
interface Dream100ExpansionResult {
  success: boolean;
  runId: UUID;
  dream100Keywords: KeywordCandidate[];      // Final selected keywords
  totalCandidatesGenerated: number;          // Total candidates before filtering
  processingStats: ExpansionProcessingStats; // Performance metrics
  costBreakdown: ExpansionCostBreakdown;     // Detailed cost analysis
  qualityMetrics: ExpansionQualityMetrics;   // Quality assessment
  warnings: string[];                        // Non-fatal issues
  errors: string[];                          // Error messages
  nextStageData?: {                         // Data for subsequent stages
    tierExpansionSeeds: string[];
    competitorDomains: string[];
  };
}
```

### Keyword Candidate Structure

```typescript
interface KeywordCandidate {
  keyword: string;           // The keyword term
  stage: KeywordStage;       // Always 'dream100'
  volume: number;            // Monthly search volume
  difficulty: number;        // Keyword difficulty (0-100)
  cpc: number;              // Cost per click
  intent: KeywordIntent;     // Classified search intent
  relevanceScore: number;    // Relevance to seed (0-1)
  commercialScore: number;   // Commercial value (0-1)
  blendedScore: number;      // Final weighted score (0-1)
  quickWin: boolean;         // Identified as quick win opportunity
}
```

### Quality Metrics

```typescript
interface ExpansionQualityMetrics {
  avgRelevanceScore: number;                    // Average relevance to seeds
  avgCommercialScore: number;                   // Average commercial value
  intentDistribution: Record<KeywordIntent, number>; // Intent type counts
  difficultyDistribution: {                     // Difficulty level distribution
    easy: number; medium: number; hard: number;
  };
  volumeDistribution: {                         // Volume level distribution
    low: number; medium: number; high: number;
  };
  quickWinCount: number;                        // Total quick win opportunities
  duplicatesRemoved: number;                    // Duplicates filtered out
  invalidKeywordsFiltered: number;              // Invalid keywords removed
}
```

## Scoring Algorithm

### Blended Score Calculation

The service uses the Dream 100 specific scoring weights from the PRD:

```typescript
// Dream 100 scoring weights
const volumeWeight = 0.40;     // Search volume importance
const intentWeight = 0.30;     // Commercial intent importance  
const relevanceWeight = 0.15;  // Relevance to seeds
const trendWeight = 0.10;      // Trend data (when available)
const easeWeight = 0.05;       // Ease of ranking (inverse difficulty)

// Final score includes commercial multiplier
finalScore = blendedScore * (0.7 + (commercialScore * 0.3));
```

### Quick Win Identification

Keywords are flagged as quick wins when they meet all criteria:
- **Ease Score** ≥ 0.7 (difficulty ≤ 30)
- **Volume** ≥ 100 monthly searches  
- **Blended Score** ≥ 0.7 (high overall quality)

### Commercial Score Components

1. **Intent Contribution (40%)**
   - Transactional: 1.0
   - Commercial: 0.9
   - Informational: 0.6
   - Navigational: 0.4

2. **CPC Contribution (30%)**
   - Higher CPC indicates commercial value
   - Normalized to 0-1 scale

3. **Competition Level (20%)**
   - Moderate competition preferred
   - Very low competition may indicate low commercial value

4. **Volume Contribution (10%)**
   - Ensures meaningful search volume
   - Minimum threshold applied

## Performance Optimization

### Caching Strategy
- **LLM Responses**: 24-hour TTL for expansion results
- **Ahrefs Metrics**: 7-day TTL for keyword data
- **Intent Classification**: 1-day TTL for classification results
- **Cache Keys**: SHA-256 hash of normalized inputs

### Rate Limiting
- **Anthropic**: Token bucket with 50 capacity, 10 refill/minute
- **Ahrefs**: Batch processing with 1-second delays
- **Circuit Breakers**: Automatic degradation on repeated failures
- **Exponential Backoff**: Progressive retry delays

### Batch Processing
- **Ahrefs Batches**: 100 keywords per request
- **Anthropic Batches**: 500 keywords per classification request
- **Parallel Processing**: Multiple batches processed concurrently
- **Error Isolation**: Failed batches don't affect others

## Integration Examples

### Job Queue Integration

```typescript
import { processExpansionJob } from './services/expansion';

// Process as background job
const jobResult = await processExpansionJob(pipelineJob, expansionService);

if (jobResult.success) {
  console.log('Job completed:', jobResult.metrics);
  // Trigger next pipeline stage
} else {
  console.error('Job failed');
  // Handle retry logic
}
```

### Next.js API Route

```typescript
// pages/api/expand-dream100.ts
import { createDream100ExpansionService } from '../../../services/expansion';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const expansionService = createDream100ExpansionService(
      process.env.ANTHROPIC_API_KEY!,
      process.env.AHREFS_API_KEY!
    );

    const result = await expansionService.expandToDream100(req.body);
    
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### React Component Integration

```typescript
import { useState } from 'react';
import { Dream100ExpansionResult } from '../services/expansion';

function ExpansionComponent() {
  const [result, setResult] = useState<Dream100ExpansionResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const runExpansion = async (seedKeywords: string[]) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/expand-dream100', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: generateUUID(),
          seedKeywords,
          targetCount: 50
        })
      });
      
      const result = await response.json();
      setResult(result);
    } catch (error) {
      console.error('Expansion failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading && <div>Processing... {progress}%</div>}
      {result && (
        <div>
          <h3>Generated {result.dream100Keywords.length} keywords</h3>
          <p>Cost: ${result.costBreakdown.totalCost.toFixed(3)}</p>
          {/* Render keywords */}
        </div>
      )}
    </div>
  );
}
```

## Monitoring and Observability

### Sentry Integration

The service automatically tracks:
- **Performance Metrics**: Processing times, throughput rates
- **Error Rates**: API failures, validation errors
- **Cost Tracking**: API usage costs, budget utilization
- **Quality Metrics**: Score distributions, quick win rates

### Custom Metrics

```typescript
// Add custom tracking
Sentry.addBreadcrumb({
  message: 'Dream 100 expansion started',
  level: 'info',
  data: { seedCount: 2, targetCount: 100 }
});

Sentry.setTag('expansion.industry', 'marketing');
Sentry.setTag('expansion.market', 'US');
```

### Health Checks

```typescript
const health = expansionService.getServiceHealth();

if (health.status !== 'healthy') {
  console.warn('Service degraded:', health);
  // Implement fallback or alerting
}
```

## Testing

### Unit Tests

```bash
npm test -- src/services/__tests__/expansion.test.ts
```

### Integration Tests (requires API keys)

```bash
TEST_ANTHROPIC_API_KEY=your_key TEST_AHREFS_API_KEY=your_key npm test -- --testNamePattern="Live API"
```

### Demo Script

```bash
ANTHROPIC_API_KEY=your_key AHREFS_API_KEY=your_key npx tsx examples/dream100-expansion-demo.ts
```

## Cost Management

### Budget Controls
- Set `budgetLimit` in request to enforce spending caps
- Monitor `budgetUtilization` in results
- Use cost estimation before running expensive operations

### Cost Optimization Tips
1. **Cache Aggressively**: Enable Redis for shared caching
2. **Batch Efficiently**: Use optimal batch sizes for APIs
3. **Filter Early**: Apply quality thresholds to reduce processing
4. **Reuse Results**: Cache expansion results for similar seed sets
5. **Monitor Usage**: Track API consumption and set alerts

## Troubleshooting

### Common Issues

**"LLM expansion failed"**
- Check Anthropic API key validity
- Verify seed keywords are valid English terms
- Ensure sufficient API quota

**"Ahrefs enrichment failed completely"**
- Validate Ahrefs API key and quota
- Check network connectivity
- Verify market code is supported

**"Insufficient candidates generated"**
- Lower quality threshold
- Expand target count
- Use more diverse seed keywords

**"Budget limit exceeded"**
- Increase budget limit
- Reduce target count
- Use more specific seed keywords

### Debug Mode

```typescript
// Enable detailed logging
process.env.NODE_ENV = 'development';
process.env.DEBUG = 'expansion:*';

const result = await expansionService.expandToDream100(request);
```

## Migration Guide

If upgrading from a previous version:

1. Update import paths
2. Check interface changes
3. Update error handling
4. Review new configuration options
5. Test with small datasets first

## Contributing

1. Follow TypeScript strict mode
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Use existing error handling patterns
5. Maintain backward compatibility where possible

## License

Proprietary - Olli Social / Dream 100 Keyword Engine
