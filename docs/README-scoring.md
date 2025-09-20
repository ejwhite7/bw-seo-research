# Stage-Specific Blended Scoring Engine

## Overview

The Scoring Engine implements a comprehensive keyword prioritization system with stage-specific formulas, quick win detection, and advanced optimization capabilities. It provides accurate, consistent scoring for Dream 100, Tier-2, and Tier-3 keywords with real-time analytics and quality validation.

## Core Features

### 🎯 Stage-Specific Scoring Formulas

**Dream 100 Keywords** (Focus on volume and commercial intent)
```
Score = 0.40×Volume + 0.30×Intent + 0.15×Relevance + 0.10×Trend + 0.05×Ease
```

**Tier-2 Keywords** (Balance volume and ease)
```
Score = 0.35×Volume + 0.25×Ease + 0.20×Relevance + 0.15×Intent + 0.05×Trend
```

**Tier-3 Keywords** (Prioritize ease and relevance)
```
Score = 0.35×Ease + 0.30×Relevance + 0.20×Volume + 0.10×Intent + 0.05×Trend
```

### ⚡ Quick Win Detection

Automatically identifies high-opportunity keywords based on:
- **Ease Score** ≥ 0.7 (low difficulty)
- **Volume** ≥ stage-specific minimums
- **Blended Score** ≥ thresholds
- **Cluster Median Check** (optional)
- **10% Rank Boost** for display priority

### 🔧 Advanced Normalization

**Volume Normalization**
- Logarithmic (recommended for volume distribution)
- Square root (moderate compression)  
- Linear (direct scaling)
- Percentile-based (relative ranking)

**Difficulty Transformation**
- Linear: `ease = 1 - (difficulty/100)`
- Exponential: `ease = (1 - difficulty/100)^0.5`
- Sigmoid: S-curve around difficulty 50

**Intent Scoring**
- Transactional: 1.0 (highest commercial value)
- Commercial: 0.9 (high purchase intent)
- Informational: 0.7 (educational content)
- Navigational: 0.5 (brand searches)

## API Reference

### Basic Usage

```typescript
import { scoreKeyword, scoreKeywordBatch, detectQuickWins } from '../services/scoring';

// Score a single keyword
const result = await scoreKeyword(
  'best project management software',
  'dream100',
  15000,      // volume
  45,         // difficulty  
  'commercial',
  0.85,       // relevance
  0.2         // trend
);

console.log(`Score: ${result.blendedScore}`);
console.log(`Quick Win: ${result.quickWin}`);
console.log(`Tier: ${result.tier}`);
```

### Batch Processing

```typescript
// Score multiple keywords efficiently
const keywords = [
  {
    keyword: 'project management tools',
    stage: 'dream100',
    volume: 12000,
    difficulty: 50,
    intent: 'commercial',
    relevance: 0.9,
    trend: 0.1
  },
  {
    keyword: 'free project management software',
    stage: 'tier2', 
    volume: 8000,
    difficulty: 35,
    intent: 'commercial',
    relevance: 0.8,
    trend: 0.15
  }
];

const results = await scoreKeywordBatch(keywords, customWeights, {
  quickWinThreshold: 0.7,
  enableSeasonalAdjustments: true
});
```

### Advanced Configuration

```typescript
import { ScoringEngine, getScoringPresets } from '../services/scoring';

const engine = new ScoringEngine();

// Use industry-specific presets
const ecommerceWeights = getScoringPresets()['ecommerce'];

// Custom scoring with seasonal adjustments
const config = {
  keywords: keywordInputs,
  weights: ecommerceWeights,
  normalizationMethod: 'percentile',
  quickWinThreshold: 0.75,
  applySeasonalAdjustments: true,
  seasonalFactors: [{
    startDate: '11-01',
    endDate: '12-31', 
    keywords: ['black friday', 'holiday'],
    multiplier: 1.4,
    reason: 'Holiday season boost'
  }]
};

const results = await engine.batchScore(config);
```

## Component Breakdown

### Score Components (0-1 scale)

| Component | Description | Calculation |
|-----------|-------------|-------------|
| **Volume** | Search demand potential | `log10(volume+1)/6` (default) |
| **Ease** | Ranking difficulty (inverted) | `(100-difficulty)/100` |
| **Intent** | Commercial value | Transactional(1.0) → Navigational(0.5) |
| **Relevance** | Topic alignment | User-provided (0-1) |
| **Trend** | Growth trajectory | `(trend+1)/2` with sensitivity |

### Weighted Scores

Each component score is multiplied by stage-specific weights:

```typescript
weightedScores = {
  volume: componentScores.volume * stageWeights.volume,
  intent: componentScores.intent * stageWeights.intent,
  relevance: componentScores.relevance * stageWeights.relevance,
  trend: componentScores.trend * stageWeights.trend,
  ease: componentScores.ease * stageWeights.ease
}

blendedScore = sum(weightedScores) // Final score (0-1)
```

## Quality Assurance

### Validation Checks

The engine automatically validates scoring quality:

```typescript
const validation = await engine.validateScoringQuality(results);

console.log(`Valid: ${validation.isValid}`);
console.log(`Warnings: ${validation.warnings.length}`);
console.log(`Quick Win Ratio: ${validation.metrics.quickWinRatio}`);
```

**Automatic Warnings:**
- Unusual score distributions (>50% high scores)
- Very low/high quick win ratios (<5% or >40%)
- Unbalanced component contributions (10:1 ratio+)
- Excessive outlier scores (>10% near 0 or 1)

### Performance Monitoring

```typescript
// Get scoring analytics
const analytics = engine.getAnalytics();

analytics.forEach(run => {
  console.log(`Run: ${run.runId}`);
  console.log(`Keywords: ${run.totalKeywords}`);
  console.log(`Time: ${run.scoringTime}ms`);
  console.log(`Quick Wins: ${run.quickWinAnalysis.total}`);
});
```

## Optimization Features

### Weight Optimization

```typescript
// Optimize weights based on performance targets
const targetMetrics = {
  avgQuickWinRatio: 0.25,    // Target 25% quick wins
  avgDifficulty: 45,         // Target avg difficulty
  trafficPotential: 500000   // Target total volume
};

const constraints = {
  maxDifficulty: 65,
  minVolume: 1000,
  requiredIntents: ['commercial', 'transactional']
};

const optimizedWeights = await engine.optimizeWeights(
  currentResults,
  targetMetrics, 
  constraints
);
```

### Industry Presets

Pre-configured weights optimized for different business models:

```typescript
const presets = getScoringPresets();

// E-commerce (high volume/intent focus)
presets.ecommerce.dream100 // { volume: 0.45, intent: 0.35, ... }

// SaaS (balanced approach)
presets.saas.dream100      // { volume: 0.35, intent: 0.30, ... }

// Content (relevance-focused)  
presets.content.dream100   // { volume: 0.40, intent: 0.25, ... }
```

## Integration Examples

### Pipeline Integration

```typescript
// In expansion service
import { scoreKeywordBatch } from './scoring';

export class ExpansionService {
  async processKeywordExpansion(dreamKeywords: Keyword[]): Promise<ScoringResult[]> {
    const scoringInputs = dreamKeywords.map(k => ({
      keyword: k.keyword,
      stage: k.stage,
      volume: k.volume,
      difficulty: k.difficulty,
      intent: k.intent,
      relevance: k.relevance,
      trend: k.trend || 0
    }));
    
    const results = await scoreKeywordBatch(scoringInputs);
    
    // Update keywords with scores
    return results.map(result => ({
      ...result,
      quickWin: result.quickWin,
      tier: result.tier,
      recommendations: result.recommendations
    }));
  }
}
```

### Database Integration

```typescript
// Save scored keywords to database
export async function saveKeywordScores(
  results: ScoringResult[],
  runId: string
): Promise<void> {
  const keywordUpdates = results.map(result => ({
    keyword: result.keyword,
    blended_score: result.blendedScore,
    quick_win: result.quickWin,
    component_scores: result.componentScores,
    weighted_scores: result.weightedScores,
    tier: result.tier,
    recommendations: result.recommendations
  }));
  
  await supabase
    .from('keywords')
    .upsert(keywordUpdates, { 
      onConflict: 'run_id,keyword',
      ignoreDuplicates: false 
    });
}
```

### Frontend Integration

```typescript
// React component for displaying scores
export function KeywordScoreCard({ result }: { result: ScoringResult }) {
  const scoreColor = result.tier === 'high' ? 'green' : 
                    result.tier === 'medium' ? 'yellow' : 'red';
  
  return (
    <div className={`score-card border-${scoreColor}`}>
      <h3>{result.keyword}</h3>
      <div className="score-display">
        <span className={`score score-${scoreColor}`}>
          {Math.round(result.blendedScore * 100)}%
        </span>
        {result.quickWin && <span className="quick-win-badge">⚡ Quick Win</span>}
      </div>
      
      <div className="component-breakdown">
        <div>Volume: {Math.round(result.componentScores.volume * 100)}%</div>
        <div>Ease: {Math.round(result.componentScores.ease * 100)}%</div>
        <div>Intent: {Math.round(result.componentScores.intent * 100)}%</div>
        <div>Relevance: {Math.round(result.componentScores.relevance * 100)}%</div>
      </div>
      
      <div className="recommendations">
        {result.recommendations.map((rec, i) => (
          <div key={i} className="recommendation">{rec}</div>
        ))}
      </div>
    </div>
  );
}
```

## Performance Characteristics

### Benchmarks

| Operation | Volume | Time (P95) | Memory |
|-----------|--------|------------|--------|
| Single Score | 1 keyword | <1ms | ~1KB |
| Small Batch | 100 keywords | <50ms | ~50KB |
| Medium Batch | 1,000 keywords | <500ms | ~500KB |
| Large Batch | 10,000 keywords | <5s | ~5MB |

### Optimization Features

- **Circuit Breaker**: Prevents cascade failures
- **Rate Limiting**: 1000 operations/minute
- **Batch Processing**: Optimized for large datasets  
- **Caching**: Component score memoization
- **Parallel Processing**: Multi-stage concurrent scoring

## Error Handling

```typescript
try {
  const results = await scoreKeywordBatch(keywords);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.details);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, retry in:', error.retryAfter);
  } else if (error instanceof CircuitBreakerError) {
    console.error('Service temporarily unavailable');
  } else {
    console.error('Scoring failed:', error.message);
  }
}
```

## Best Practices

### 1. Input Validation
```typescript
// Always validate inputs before scoring
const input = ScoringInputSchema.parse({
  keyword: 'project management',
  stage: 'dream100',
  volume: 10000,
  difficulty: 45,
  intent: 'commercial', 
  relevance: 0.8,
  trend: 0.1
});
```

### 2. Batch Processing
```typescript
// Use batch processing for multiple keywords
const results = await scoreKeywordBatch(keywords); // ✅ Efficient
// Avoid: await Promise.all(keywords.map(k => scoreKeyword(...))) // ❌ Less efficient
```

### 3. Quick Win Prioritization  
```typescript
// Filter and prioritize quick wins
const quickWins = detectQuickWins(results, 0.75);
const prioritizedKeywords = [
  ...quickWins.slice(0, 10),           // Top 10 quick wins first
  ...results.filter(r => !r.quickWin) // Then other keywords
];
```

### 4. Performance Monitoring
```typescript
// Track scoring performance
const startTime = performance.now();
const results = await scoreKeywordBatch(keywords);
const duration = performance.now() - startTime;

logger.info('Scoring completed', {
  keywordCount: keywords.length,
  duration: Math.round(duration),
  quickWins: results.filter(r => r.quickWin).length,
  avgScore: results.reduce((sum, r) => sum + r.blendedScore, 0) / results.length
});
```

### 5. Quality Assurance
```typescript
// Validate scoring quality after large batches
const validation = await engine.validateScoringQuality(results);
if (!validation.isValid) {
  logger.warn('Scoring quality issues detected', {
    warnings: validation.warnings,
    metrics: validation.metrics
  });
}
```

## Configuration

### Environment Variables
```bash
# Scoring engine configuration
SCORING_RATE_LIMIT_REQUESTS=1000
SCORING_RATE_LIMIT_WINDOW=60000
SCORING_CIRCUIT_BREAKER_THRESHOLD=5
SCORING_BATCH_SIZE=100
SCORING_ENABLE_ANALYTICS=true
```

### Custom Configuration
```typescript
// Override default configurations
const customEngine = new ScoringEngine({
  rateLimitConfig: {
    windowMs: 30000,
    maxRequests: 2000
  },
  circuitBreakerConfig: {
    threshold: 10,
    timeout: 60000
  },
  batchSize: 200,
  enableAnalytics: true
});
```

## Troubleshooting

### Common Issues

**Low Quick Win Detection**
```typescript
// Check ease component and thresholds
if (quickWinRatio < 0.1) {
  // Reduce difficulty threshold or increase ease weight
  const optimizedWeights = await engine.optimizeWeights(results, {
    avgQuickWinRatio: 0.2,
    avgDifficulty: 40,
    trafficPotential: currentTotal
  });
}
```

**Inconsistent Scoring**  
```typescript
// Validate normalization parameters
const validation = await engine.validateScoringQuality(results);
if (validation.warnings.includes('unbalanced')) {
  // Review component weight distribution
  console.log('Component contributions:', validation.metrics.avgComponentContribution);
}
```

**Performance Issues**
```typescript
// Monitor batch sizes and processing time
if (duration > 5000 && keywords.length > 1000) {
  // Process in smaller chunks
  const chunks = chunk(keywords, 500);
  const allResults = [];
  
  for (const chunk of chunks) {
    const chunkResults = await scoreKeywordBatch(chunk);
    allResults.push(...chunkResults);
  }
}
```

### Debug Mode

```typescript
// Enable detailed logging
process.env.NODE_ENV = 'development';
process.env.DEBUG_SCORING = 'true';

const results = await scoreKeywordBatch(keywords);
// Logs detailed component calculations and timing
```

## Contributing

When extending the scoring engine:

1. **Maintain Weight Validation**: Ensure all stage weights sum to 1.0
2. **Add Component Tests**: Test new scoring components thoroughly  
3. **Update Documentation**: Document new features and parameters
4. **Performance Testing**: Validate performance with large datasets
5. **Quality Validation**: Add appropriate quality checks

### Adding New Components

```typescript
// Example: Adding competitive strength component
interface EnhancedScoringInput extends ScoringInput {
  competitorStrength?: number; // 0-1
}

const componentScores = {
  ...baseComponentScores,
  competitive: normalizeCompetitiveStrength(input.competitorStrength)
};

// Update weights to include new component
const enhancedWeights = {
  ...stageWeights,
  competitive: 0.05 // Adjust other weights accordingly
};
```

---

This scoring engine provides a robust, scalable foundation for keyword prioritization with extensive customization options and quality assurance features.