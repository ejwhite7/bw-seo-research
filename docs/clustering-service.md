# Semantic Clustering Service Documentation

## Overview

The Semantic Clustering Service is a sophisticated keyword grouping system that processes up to 10,000 keywords into meaningful semantic clusters using advanced machine learning techniques. It combines vector embeddings, hierarchical clustering algorithms, and intelligent quality management to create content-strategy-ready keyword groups.

## Architecture

### Core Components

1. **Vector Embedding System**
   - OpenAI text-embedding-ada-002 for dense vector representations
   - Batch processing with intelligent caching
   - Cost optimization through embedding reuse

2. **Hierarchical Clustering Engine**
   - Agglomerative clustering with configurable linkage methods
   - Cosine similarity distance metrics
   - Memory-efficient similarity matrix operations

3. **Quality Management**
   - Silhouette score calculations for cluster cohesion
   - Outlier detection and handling
   - Cluster validation with actionable recommendations

4. **LLM Enhancement**
   - Anthropic Claude integration for intelligent cluster labeling
   - Content opportunity identification
   - Editorial strategy recommendations

## Key Features

### Performance Optimizations

- **Batch Processing**: Configurable batch sizes for different operations
- **Memory Efficiency**: Streaming similarity calculations for large datasets
- **Caching**: Intelligent embedding caching with TTL
- **Concurrent Processing**: Parallel batch processing with rate limiting
- **Circuit Breaker**: Automatic failure recovery and degradation

### Quality Assurance

- **Similarity Thresholds**: Configurable semantic similarity requirements
- **Cluster Size Limits**: Minimum and maximum cluster size enforcement
- **Intent Consistency**: Intent distribution analysis within clusters
- **Validation**: Comprehensive cluster quality assessment

### Real-time Monitoring

- **Progress Tracking**: Detailed progress callbacks with ETA
- **Error Recovery**: Graceful handling of API failures
- **Performance Metrics**: Processing time and cost tracking
- **Health Monitoring**: Service status and circuit breaker states

## API Reference

### ClusteringService

Main service class for semantic keyword clustering.

#### Constructor

```typescript
constructor(
  openaiApiKey: string,
  anthropicApiKey: string,
  config?: Partial<BatchConfig>
)
```

#### Main Methods

##### clusterKeywords()

Groups keywords into semantic clusters.

```typescript
async clusterKeywords(
  keywords: Keyword[],
  params: ClusteringParams,
  onProgress?: (progress: ClusteringProgress) => void
): Promise<ClusteringResult>
```

**Parameters:**
- `keywords`: Array of keyword objects to cluster (max 10,000)
- `params`: Clustering configuration parameters
- `onProgress`: Optional progress callback function

**Returns:** `ClusteringResult` with clusters, outliers, metrics, and quality assessment

##### validateClusters()

Validates cluster quality and identifies issues.

```typescript
async validateClusters(
  clusters: ClusterWithKeywords[]
): Promise<ClusterValidation[]>
```

##### getStatus()

Returns current service status and metrics.

```typescript
getStatus(): {
  isProcessing: boolean;
  currentProgress: ClusteringProgress | null;
  cacheSize: number;
  metrics: object;
}
```

##### estimateProcessing()

Estimates processing time and cost for a given keyword count.

```typescript
estimateProcessing(keywordCount: number): {
  estimatedTime: number;
  estimatedCost: number;
  breakdown: object;
}
```

### Configuration Types

#### ClusteringParams

```typescript
interface ClusteringParams {
  method: 'semantic' | 'intent' | 'topic' | 'hybrid';
  minClusterSize: number;          // Minimum keywords per cluster
  maxClusterSize: number;          // Maximum keywords per cluster  
  similarityThreshold: number;     // 0.0-1.0 semantic similarity threshold
  intentWeight: number;            // 0.0-1.0 intent importance weight
  semanticWeight: number;          // 0.0-1.0 semantic importance weight
  maxClusters: number;             // Maximum clusters to create
  outlierThreshold: number;        // 0.0-1.0 outlier detection threshold
}
```

#### BatchConfig

```typescript
interface BatchConfig {
  embeddingBatchSize: number;      // Keywords per embedding batch
  similarityBatchSize: number;     // Items per similarity calculation batch
  clusteringBatchSize: number;     // Keywords per clustering batch
  maxConcurrent: number;           // Maximum concurrent operations
  retryAttempts: number;           // API retry attempts
  timeout: number;                 // Operation timeout (ms)
}
```

### Default Configurations

#### Clustering Presets

```typescript
// High precision - fewer, more coherent clusters
precision: {
  method: 'semantic',
  minClusterSize: 5,
  maxClusterSize: 50,
  similarityThreshold: 0.80,
  intentWeight: 0.3,
  semanticWeight: 0.7,
  maxClusters: 50,
  outlierThreshold: 0.6
}

// Balanced - good mix of coherence and coverage
balanced: {
  method: 'hybrid',
  minClusterSize: 3,
  maxClusterSize: 100,
  similarityThreshold: 0.72,
  intentWeight: 0.3,
  semanticWeight: 0.7,
  maxClusters: 100,
  outlierThreshold: 0.5
}

// High coverage - more clusters, broader groupings
coverage: {
  method: 'semantic',
  minClusterSize: 3,
  maxClusterSize: 150,
  similarityThreshold: 0.65,
  intentWeight: 0.2,
  semanticWeight: 0.8,
  maxClusters: 150,
  outlierThreshold: 0.4
}
```

## Usage Examples

### Basic Clustering

```typescript
import { ClusteringService, getDefaultClusteringParams } from './services/clustering';

const clusteringService = new ClusteringService(
  process.env.OPENAI_API_KEY!,
  process.env.ANTHROPIC_API_KEY!
);

const keywords = [/* your keyword objects */];
const params = getDefaultClusteringParams().balanced;

const result = await clusteringService.clusterKeywords(keywords, params);

console.log(`Created ${result.clusters.length} clusters`);
console.log(`Quality score: ${result.quality.overallScore}`);
```

### With Progress Tracking

```typescript
const progressCallback = (progress) => {
  console.log(`${progress.stage}: ${progress.percentComplete}% - ${progress.currentOperation}`);
};

const result = await clusteringService.clusterKeywords(
  keywords,
  params,
  progressCallback
);
```

### Custom Configuration

```typescript
const customService = new ClusteringService(
  openaiKey,
  anthropicKey,
  {
    embeddingBatchSize: 50,  // Smaller batches for rate limiting
    maxConcurrent: 3,        // Limit concurrent operations
    retryAttempts: 5         // More retries for reliability
  }
);

const customParams = {
  method: 'semantic',
  minClusterSize: 5,
  maxClusterSize: 75,
  similarityThreshold: 0.75,  // Higher threshold for tighter clusters
  intentWeight: 0.2,
  semanticWeight: 0.8,        // Focus more on semantics
  maxClusters: 50,
  outlierThreshold: 0.6
};
```

### Cluster Validation

```typescript
const validations = await clusteringService.validateClusters(result.clusters);

for (const validation of validations) {
  if (!validation.isValid) {
    console.log(`Cluster ${validation.clusterId} issues:`);
    validation.issues.forEach(issue => {
      console.log(`- ${issue.severity}: ${issue.message}`);
      if (issue.suggestion) {
        console.log(`  Suggestion: ${issue.suggestion}`);
      }
    });
  }
}
```

## Processing Pipeline

### Stage 1: Initialization and Validation
- Input validation and parameter parsing
- Service state initialization
- Progress tracking setup

### Stage 2: Embedding Generation (5-25% progress)
- Batch keyword processing for embeddings
- OpenAI API integration with rate limiting
- Intelligent caching and error recovery
- Parallel batch processing

### Stage 3: Similarity Matrix Calculation (25-60% progress)
- Pairwise cosine similarity calculations
- Memory-efficient matrix operations
- Threshold-based filtering
- Batch processing optimization

### Stage 4: Hierarchical Clustering (60-85% progress)
- Agglomerative clustering algorithm
- Linkage method application (average, complete, single)
- Cluster merging with similarity thresholds
- Centroid calculation and updating

### Stage 5: Cluster Creation and Analytics (85-95% progress)
- Cluster object creation with metadata
- Analytics calculation (volume, difficulty, intent mix)
- Content opportunity identification
- Quality metrics computation

### Stage 6: Enhancement and Finalization (95-100% progress)
- LLM-powered cluster label enhancement
- Outlier handling and reassignment
- Final validation and quality assessment
- Result packaging and delivery

## Quality Metrics

### Cluster Quality Assessment

The service evaluates clustering quality using multiple metrics:

1. **Coherence** (0-1): Average within-cluster similarity
2. **Separation** (0-1): Distance between cluster centroids  
3. **Coverage** (0-1): Percentage of keywords successfully clustered
4. **Balance** (0-1): Evenness of cluster size distribution

Overall quality score is a weighted combination:
```
Quality = 0.3×Coherence + 0.25×Separation + 0.25×Coverage + 0.2×Balance
```

### Performance Benchmarks

- **10,000 keywords**: ~5-15 minutes processing time
- **Memory usage**: ~500MB peak for 10K keywords
- **API costs**: ~$2-5 per 10K keywords (embedding + enhancement)
- **Cache hit rate**: 85%+ for repeated keywords

### Validation Checks

- **Size validation**: Clusters too small/large
- **Coherence validation**: Low similarity thresholds
- **Intent consistency**: Mixed intents without clear primary
- **Duplicate detection**: Identical keywords in clusters

## Error Handling

### Graceful Degradation

The service handles failures gracefully:

1. **Embedding failures**: Retries with exponential backoff
2. **API rate limits**: Automatic waiting and retry
3. **Circuit breaker trips**: Temporary service unavailability
4. **LLM enhancement failures**: Falls back to algorithmic labels

### Error Recovery

- **Partial failures**: Continue processing available data
- **Network issues**: Automatic retry with jitter
- **Memory constraints**: Batch size reduction
- **Timeout handling**: Progressive timeout increases

## Monitoring and Debugging

### Logging

Comprehensive logging at multiple levels:
- `DEBUG`: Detailed algorithm steps and timings
- `INFO`: Major milestones and statistics  
- `WARN`: Recoverable issues and fallbacks
- `ERROR`: Unrecoverable failures with context

### Metrics Tracking

Key metrics automatically tracked:
- Processing time per stage
- API request counts and costs
- Cache hit/miss ratios
- Error rates by category
- Quality scores over time

### Health Checks

Service health monitoring:
```typescript
const status = clusteringService.getStatus();
console.log({
  isProcessing: status.isProcessing,
  cacheSize: status.cacheSize,
  metrics: status.metrics
});
```

## Cost Optimization

### Embedding Costs

- **Caching**: Reuse embeddings across runs
- **Batch processing**: Minimize API calls
- **Deduplication**: Remove duplicate keywords
- **Progressive loading**: Process subsets for testing

### LLM Enhancement Costs

- **Selective enhancement**: Only enhance high-value clusters
- **Batch requests**: Group multiple clusters per request
- **Fallback labels**: Use algorithmic labels when cost-prohibitive
- **Caching**: Cache enhanced labels

### Recommended Practices

1. **Development**: Use small keyword sets and high cache TTL
2. **Testing**: Disable LLM enhancement or use mock responses
3. **Production**: Monitor costs and adjust batch sizes
4. **Optimization**: Regular cache cleanup and embedding reuse

## Best Practices

### Parameter Tuning

- **Start with balanced preset** for most use cases
- **Adjust similarity threshold** based on domain specificity
- **Monitor outlier ratios** and adjust thresholds accordingly
- **Balance cluster count** with content team capacity

### Content Strategy Integration

- **Pillar clusters**: High-volume, high-coherence clusters
- **Supporting clusters**: Medium-volume, specific intent clusters  
- **Quick win identification**: Low-difficulty, medium-volume clusters
- **Long-tail strategy**: Small, specific clusters for niche content

### Performance Optimization

- **Batch size tuning**: Balance speed vs. memory usage
- **Concurrent processing**: Adjust based on API rate limits
- **Caching strategy**: Longer TTL for stable keyword sets
- **Progressive processing**: Start small, scale up

## Troubleshooting

### Common Issues

#### High Memory Usage
```
Cause: Large similarity matrices for big keyword sets
Solution: Reduce similarityBatchSize or implement streaming
```

#### Poor Cluster Quality
```  
Cause: Low similarity threshold or inappropriate parameters
Solution: Increase threshold, try different presets, validate input data
```

#### API Rate Limiting
```
Cause: Too many concurrent requests or small batch sizes
Solution: Increase batch sizes, reduce maxConcurrent, add delays
```

#### Long Processing Times
```
Cause: Large keyword sets with small batch sizes
Solution: Increase batch sizes, enable caching, use progressive processing
```

### Debugging Steps

1. **Check service status**: `getStatus()` for current state
2. **Validate inputs**: Ensure keyword data quality
3. **Monitor progress**: Use progress callbacks to identify bottlenecks
4. **Review logs**: Check for specific error messages
5. **Test with subsets**: Isolate issues with smaller datasets

## Advanced Usage

### Custom Similarity Metrics

```typescript
// Override similarity calculation for domain-specific needs
class CustomClusteringService extends ClusteringService {
  protected calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    // Custom similarity logic here
    return super.calculateCosineSimilarity(vectorA, vectorB);
  }
}
```

### Multi-stage Clustering

```typescript
// Hierarchical clustering with multiple similarity thresholds
const stage1 = await clusteringService.clusterKeywords(keywords, {
  ...params,
  similarityThreshold: 0.8,
  maxClusters: 200
});

const stage2Clusters = [];
for (const cluster of stage1.clusters) {
  if (cluster.size > 20) {
    const subClusters = await clusteringService.clusterKeywords(
      cluster.keywords,
      { ...params, maxClusters: 5 }
    );
    stage2Clusters.push(...subClusters.clusters);
  } else {
    stage2Clusters.push(cluster);
  }
}
```

### Integration with Content Workflows

```typescript
// Generate content calendar from clustering results
function generateContentCalendar(result: ClusteringResult) {
  return result.clusters
    .filter(cluster => cluster.analytics.quickWinCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20) // Top 20 clusters
    .map(cluster => ({
      contentPillar: cluster.label,
      primaryKeywords: cluster.analytics.topKeywords,
      estimatedTraffic: cluster.analytics.totalVolume,
      difficulty: cluster.analytics.avgDifficulty,
      opportunities: cluster.analytics.contentOpportunities,
      priority: cluster.score
    }));
}
```

## Migration Guide

### From Manual Clustering

1. **Export existing clusters**: Convert to keyword objects
2. **Validate cluster quality**: Run validation on existing clusters
3. **Compare results**: Run clustering on same keywords
4. **Gradual migration**: Start with new keyword sets

### Version Updates

When updating the clustering service:

1. **Backup existing clusters**: Export current clustering state
2. **Test with sample data**: Validate new version behavior
3. **Monitor quality metrics**: Compare before/after scores
4. **Update parameters**: Adjust for algorithm changes

## Support and Resources

### Documentation
- [API Reference](./api-reference.md)
- [Algorithm Details](./clustering-algorithms.md)  
- [Performance Guide](./performance-optimization.md)

### Community
- GitHub Issues for bug reports
- Discussions for feature requests
- Slack channel for real-time support

### Professional Support
- Implementation consulting
- Custom algorithm development
- Performance optimization services

---

*For additional support or questions, please refer to the project documentation or contact the development team.*