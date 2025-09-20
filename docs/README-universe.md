# Universe Expansion Service

## Overview

The Universe Expansion Service is a comprehensive keyword expansion system that transforms Dream 100 keywords into a full 10,000-keyword universe through intelligent tier-2 and tier-3 expansion. This service implements multiple expansion strategies, advanced quality control, and progressive enhancement features to generate high-quality keyword datasets for SEO and content marketing campaigns.

## Architecture

### Processing Pipeline

The service implements a 9-stage processing pipeline:

1. **Initialization** - Input validation and setup
2. **Dream 100 Processing** - Validate and prepare seed keywords
3. **Tier-2 Expansion** - Generate mid-tail keywords (10 per Dream keyword)
4. **Tier-2 Enrichment** - Ahrefs metrics enrichment for tier-2
5. **Tier-3 Expansion** - Generate long-tail keywords (10 per tier-2)
6. **Tier-3 Enrichment** - Ahrefs metrics enrichment for tier-3
7. **Quality Control** - Relevance validation and filtering
8. **Smart Capping** - Intelligent selection to meet target limits
9. **Result Preparation** - Final packaging and analytics

### Key Features

- **Multi-Source Expansion**: LLM generation, SERP analysis, competitor mining, modifier application
- **Progressive Enhancement**: Question generation, comparison keywords, use-case variations
- **Intelligent Quality Control**: Relevance scoring, deduplication, parent-child relationship preservation
- **Stage-Specific Scoring**: Different weight configurations for tier-2 vs tier-3 keywords
- **Cost Optimization**: Batch processing, caching, rate limiting
- **Comprehensive Analytics**: Processing stats, quality metrics, expansion breakdowns

## Usage

### Basic Usage

```typescript
import { UniverseExpansionService } from '../services/universe';

const service = new UniverseExpansionService(
  'your-anthropic-api-key',
  'your-ahrefs-api-key'
);

const request = {
  runId: 'your-run-id',
  dream100Keywords: ['marketing automation', 'email marketing', 'lead generation'],
  targetTotalCount: 10000,
  market: 'US',
  industry: 'B2B SaaS'
};

const result = await service.expandToUniverse(request);

console.log(`Generated ${result.totalKeywords} keywords:`);
console.log(`- Dream 100: ${result.keywordsByTier.dream100.length}`);
console.log(`- Tier-2: ${result.keywordsByTier.tier2.length}`);
console.log(`- Tier-3: ${result.keywordsByTier.tier3.length}`);
```

### With Progress Tracking

```typescript
const progressCallback = (progress) => {
  console.log(`${progress.stage}: ${progress.progressPercent}% complete`);
  console.log(`Processed: ${progress.keywordsProcessed} keywords`);
  console.log(`Current cost: $${progress.currentCost.toFixed(2)}`);
  console.log(`ETA: ${Math.ceil(progress.estimatedTimeRemaining / 60)} minutes`);
};

const result = await service.expandToUniverse(request, progressCallback);
```

### Advanced Configuration

```typescript
const advancedRequest = {
  runId: 'advanced-run-123',
  dream100Keywords: ['marketing automation', 'email marketing'],
  targetTotalCount: 5000,
  maxTier2PerDream: 15,
  maxTier3PerTier2: 12,
  market: 'US',
  industry: 'B2B SaaS',
  budgetLimit: 100.00,
  qualityThreshold: 0.7,
  enableCompetitorMining: true,
  enableSerpAnalysis: true,
  enableSemanticVariations: true
};

const result = await service.expandToUniverse(advancedRequest);
```

## Configuration Options

### UniverseExpansionRequest

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `runId` | string | required | Unique identifier for the expansion run |
| `dream100Keywords` | string[] | required | Array of 1-100 Dream keywords |
| `targetTotalCount` | number | 10000 | Target total keyword count (max 10,000) |
| `maxTier2PerDream` | number | 10 | Max tier-2 keywords per Dream keyword |
| `maxTier3PerTier2` | number | 10 | Max tier-3 keywords per tier-2 keyword |
| `market` | string | 'US' | Target market (ISO 3166-1 alpha-2) |
| `industry` | string | optional | Industry context for expansion |
| `budgetLimit` | number | optional | Maximum cost limit in USD |
| `qualityThreshold` | number | 0.6 | Minimum quality score (0-1) |
| `enableCompetitorMining` | boolean | true | Enable competitor keyword mining |
| `enableSerpAnalysis` | boolean | true | Enable SERP overlap analysis |
| `enableSemanticVariations` | boolean | true | Enable LLM semantic variations |

## Expansion Strategies

### Tier-2 Strategies

1. **LLM Semantic** (40% weight)
   - Uses Anthropic Claude for semantic variations
   - Focuses on commercial intent keywords
   - High-quality, contextually relevant expansions

2. **SERP Overlap** (30% weight)
   - Analyzes SERP overlap using Ahrefs data
   - Finds keywords ranking for similar queries
   - Data-driven expansion approach

3. **Modifier Application** (20% weight)
   - Applies common modifiers: best, top, review, vs, alternative
   - Creates commercial and informational variations
   - Fast, reliable expansion method

4. **Competitor Mining** (10% weight)
   - Extracts keywords from competitor content
   - Identifies gap opportunities
   - Market-intelligence driven

### Tier-3 Strategies

1. **Question Generation** (40% weight)
   - Creates question-based long-tail keywords
   - Uses question words: what, how, why, when, where
   - Targets informational search intent

2. **Long-tail Variations** (30% weight)
   - Extends keywords with descriptive terms
   - Focuses on specificity and use-cases
   - Creates 4-8 word keyword phrases

3. **Comparison Keywords** (20% weight)
   - Generates comparison-based keywords
   - Uses patterns: vs, compared to, alternative to
   - Targets commercial comparison searches

4. **Use Case Keywords** (10% weight)
   - Creates context-specific variations
   - Patterns: for beginners, for business, examples
   - Targets specific audience segments

## Quality Control

### Filtering Criteria

#### Tier-2 Quality Control
- Minimum quality score: `qualityThreshold` (default 0.6)
- Minimum search volume: 10
- Maximum difficulty: 95
- Relevance to Dream 100 seeds

#### Tier-3 Quality Control
- Minimum quality score: `qualityThreshold * 0.8`
- Minimum search volume: 5 (lower for long-tail)
- Maximum difficulty: 90
- Parent-child relationship preservation

### Deduplication
- Cross-tier deduplication (tier-2 vs Dream 100, tier-3 vs all others)
- Normalized keyword comparison (case-insensitive, whitespace normalized)
- Quality-based selection for duplicates

### Smart Capping
- Maintains tier distribution ratios (10% tier-2, 90% tier-3)
- Prioritizes keywords by blended score
- Preserves Dream 100 keywords (never capped)
- Intelligent selection algorithm

## Scoring System

### Tier-2 Scoring Weights
- Volume: 35%
- Ease: 25% (100 - difficulty)
- Relevance: 20%
- Intent: 15%
- Trend: 5%

### Tier-3 Scoring Weights
- Ease: 35%
- Relevance: 30%
- Volume: 20%
- Intent: 10%
- Trend: 5%

### Intent Scoring
- Transactional: 1.0
- Commercial: 0.8
- Informational: 0.6
- Navigational: 0.4

### Quick Win Detection
**Tier-2 Criteria:**
- Ease score ≥ 0.7
- Volume ≥ 100
- Blended score ≥ 0.6

**Tier-3 Criteria:**
- Ease score ≥ 0.8
- Volume ≥ 50
- Blended score ≥ 0.6

## API Integration

### Anthropic Integration
- **Purpose**: LLM-powered keyword expansion and semantic variations
- **Rate Limiting**: 10 requests/minute with exponential backoff
- **Caching**: 24-hour TTL for expansion results
- **Cost**: ~$0.15 per LLM call
- **Fallback**: Modifier-based expansion if API fails

### Ahrefs Integration
- **Purpose**: Search volume, difficulty, CPC, and SERP data
- **Rate Limiting**: 20 requests/minute with batch processing
- **Caching**: 30-day TTL for keyword metrics
- **Cost**: ~$0.20 per 100-keyword batch
- **Fallback**: Estimated metrics based on keyword patterns

### Batch Processing
- **Ahrefs Batches**: 100 keywords per request
- **Processing Strategy**: Sequential batches with 1-second delays
- **Error Handling**: Continue processing on batch failures
- **Progress Tracking**: Real-time progress updates

## Performance Metrics

### Target Performance
- **Processing Time**: ≤20 minutes for 10,000 keywords (P95)
- **API Error Rate**: <1%
- **Quality Score**: >0.6 average across all tiers
- **Cost Efficiency**: <$2 per 1,000 keywords discovered
- **Success Rate**: >99% completion rate

### Monitoring Metrics
- Keywords processed per minute
- API calls per minute
- Cost per keyword
- Cache hit rate
- Error rates by stage
- Quality score distribution

## Error Handling

### Retry Strategy
- **Max Retries**: 3 attempts for API failures
- **Backoff**: Exponential backoff (5s, 15s, 45s)
- **Retryable Errors**: Rate limits, timeouts, server errors
- **Non-retryable**: Authentication, validation errors

### Graceful Degradation
- **LLM Failures**: Fall back to modifier-based expansion
- **Ahrefs Failures**: Use estimated metrics
- **Partial Failures**: Continue with available data
- **Quality Issues**: Apply stricter filtering

### Circuit Breaker
- **Failure Threshold**: 3 consecutive failures
- **Recovery Timeout**: 30 seconds
- **Monitoring Period**: 3 minutes
- **Expected Failure Rate**: <5%

## Cost Management

### Cost Estimation
```typescript
const estimate = service.estimateExpansionCost(
  dream100Count: 50,
  targetTotal: 5000,
  enableAllFeatures: true
);

console.log(`Estimated cost: $${estimate.estimatedCost}`);
console.log('Breakdown:', estimate.breakdown);
console.log(`Confidence: ${estimate.confidence * 100}%`);
```

### Budget Controls
- Pre-expansion cost estimation
- Real-time cost tracking during processing
- Budget limit enforcement
- Cost per keyword monitoring
- Provider-specific cost breakdown

### Cost Optimization
- Aggressive caching (30-day TTL for Ahrefs, 24-hour for Anthropic)
- Batch processing to minimize API calls
- Smart fallbacks to reduce expensive API usage
- Quality-based early termination

## Integration Examples

### Job Queue Integration

```typescript
import { processUniverseExpansionJob } from '../services/universe';

const job: PipelineJob = {
  id: 'universe-job-123',
  runId: 'run-456',
  stage: 'tier2_expansion',
  data: {
    input: {
      runId: 'run-456',
      dream100Keywords: ['marketing automation'],
      targetTotalCount: 1000
    },
    config: { /* stage config */ },
    resources: { /* resource requirements */ }
  }
  // ... other job properties
};

const result = await processUniverseExpansionJob(job, service);

if (result.success) {
  console.log('Universe expansion completed:', result.output);
  console.log('Metrics:', result.metrics);
} else {
  console.error('Universe expansion failed');
}
```

### Pipeline Integration

```typescript
// Following Dream 100 expansion in pipeline
const dream100Result = await dream100Service.expandToDream100(dream100Request);

const universeRequest = {
  runId: dream100Request.runId,
  dream100Keywords: dream100Result.dream100Keywords.map(k => k.keyword),
  targetTotalCount: 10000,
  market: dream100Request.market,
  industry: dream100Request.industry
};

const universeResult = await universeService.expandToUniverse(universeRequest);

// Pass to next stage (clustering)
const clusteringSeeds = universeResult.nextStageData?.clusteringSeeds || [];
```

## Health Monitoring

### Service Health Check

```typescript
const health = service.getServiceHealth();

console.log('Service Status:', health.status);
console.log('Integrations:', health.integrations);
console.log('Last Expansion:', health.lastExpansion);
```

### Health Response Format
```typescript
{
  status: 'healthy' | 'degraded' | 'down',
  integrations: {
    anthropic: 'connected' | 'error',
    ahrefs: 'connected' | 'error'
  },
  lastExpansion: {
    timestamp: number,
    keywordCount: number,
    processingTime: number,
    cost: number
  } | null
}
```

## Data Models

### UniverseKeywordCandidate

```typescript
interface UniverseKeywordCandidate {
  keyword: string;
  stage: 'dream100' | 'tier2' | 'tier3';
  parentKeyword?: string;
  volume: number;
  difficulty: number;
  cpc: number;
  intent: KeywordIntent | null;
  relevanceScore: number;
  qualityScore: number;
  blendedScore: number;
  quickWin: boolean;
  expansionSource: string;
  confidence: number;
  serpFeatures?: string[];
  competitorUrls?: string[];
}
```

### UniverseExpansionResult

```typescript
interface UniverseExpansionResult {
  success: boolean;
  runId: string;
  keywordsByTier: {
    dream100: UniverseKeywordCandidate[];
    tier2: UniverseKeywordCandidate[];
    tier3: UniverseKeywordCandidate[];
  };
  totalKeywords: number;
  processingStats: UniverseProcessingStats;
  costBreakdown: UniverseCostBreakdown;
  qualityMetrics: UniverseQualityMetrics;
  expansionBreakdown: ExpansionStrategyBreakdown;
  warnings: string[];
  errors: string[];
  nextStageData?: {
    clusteringSeeds: string[];
    competitorDomains: string[];
    gapAnalysis: string[];
  };
}
```

## Best Practices

### Input Preparation
- Validate Dream 100 keywords for quality and relevance
- Ensure keywords are properly normalized
- Set appropriate quality thresholds for your use case
- Consider industry-specific expansion strategies

### Performance Optimization
- Use Redis for caching when available
- Monitor API usage and costs during expansion
- Implement proper error handling for production use
- Set realistic timeout limits for large expansions

### Quality Assurance
- Review expansion results for relevance
- Adjust quality thresholds based on your needs
- Monitor quick win identification accuracy
- Validate parent-child relationships in results

### Cost Management
- Always get cost estimates before large expansions
- Set budget limits for production runs
- Monitor cost per keyword metrics
- Use caching effectively to reduce API costs

## Troubleshooting

### Common Issues

1. **High API Costs**
   - Check caching configuration
   - Verify batch processing is working
   - Monitor API call counts vs keyword counts
   - Consider adjusting expansion strategies

2. **Poor Quality Results**
   - Increase quality threshold
   - Review Dream 100 keyword quality
   - Check relevance scoring accuracy
   - Adjust expansion strategy weights

3. **Processing Timeouts**
   - Reduce target keyword count
   - Check API response times
   - Monitor batch processing efficiency
   - Consider increasing timeout limits

4. **API Rate Limits**
   - Verify rate limiting configuration
   - Check API key quotas
   - Monitor request timing
   - Implement proper backoff strategies

### Debug Information

Enable verbose logging to see detailed processing information:

```typescript
const request = {
  // ... your request
  debugMode: true // Enable detailed logging
};

const result = await service.expandToUniverse(request);

// Check warnings and errors for issues
console.log('Warnings:', result.warnings);
console.log('Errors:', result.errors);
console.log('Processing Stats:', result.processingStats);
```

## Future Enhancements

### Planned Features
- Advanced competitor analysis integration
- Seasonal keyword adjustments
- Geographic expansion variations
- Machine learning-based quality scoring
- Real-time trend integration
- Custom expansion strategy configuration

### Performance Improvements
- Parallel batch processing
- Adaptive quality thresholds
- Predictive caching
- Cost optimization algorithms
- Enhanced error recovery

## Support

For questions, issues, or feature requests:
1. Check the test suite for usage examples
2. Review error messages and warnings in results
3. Monitor service health and API quotas
4. Consult the main documentation for pipeline integration

The Universe Expansion Service is designed to be robust, scalable, and cost-effective for large-scale keyword research operations while maintaining high quality standards throughout the expansion process.