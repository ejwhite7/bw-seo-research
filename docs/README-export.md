# Export Service Documentation

The Export Service provides comprehensive CSV, Excel, and JSON export functionality for all data schemas in the Dream 100 Keyword Engine. It supports streaming for large datasets, progress tracking, filtering, and multiple export templates.

## Quick Start

```typescript
import { ExportService, defaultExportConfig } from './export';
import type { ExportConfig } from '../models/export';

// Initialize service
const exportService = new ExportService(defaultExportConfig);

// Create basic export
const exportConfig: ExportConfig = {
  runId: 'your-run-id',
  format: 'csv',
  template: 'editorial_roadmap',
  filters: {
    keywords: { quickWinsOnly: true },
    roadmap: { includeNotes: true },
    clusters: {}
  },
  options: {
    includeMetadata: true,
    includeAnalytics: false,
    sortBy: 'volume',
    sortDirection: 'desc',
    formatting: {
      dateFormat: 'US',
      numberFormat: 'US',
      currencySymbol: '$',
      booleanFormat: 'true_false'
    }
  },
  scheduling: null,
  destinations: []
};

const result = await exportService.createExport(exportConfig);
```

## Export Templates

### 1. Editorial Roadmap Export (`editorial_roadmap`)

**Columns**: `post_id`, `cluster_label`, `stage`, `primary_keyword`, `secondary_keywords`, `intent`, `volume`, `difficulty`, `blended_score`, `quick_win`, `suggested_title`, `DRI`, `due_date`, `notes`, `source_urls`, `run_id`, `estimated_traffic`, `content_type`, `priority`, `status`

**Use Case**: Content team roadmap planning and assignment tracking.

```typescript
const roadmapConfig: ExportConfig = {
  runId: 'your-run-id',
  format: 'csv',
  template: 'editorial_roadmap',
  filters: {
    roadmap: {
      stages: ['pillar', 'supporting'],
      dris: ['Sarah Chen', 'Mike Rodriguez'],
      dueDateFrom: '2024-03-01',
      dueDateTo: '2024-06-30',
      includeNotes: true
    }
  },
  options: {
    sortBy: 'due_date',
    sortDirection: 'asc',
    groupBy: 'dri'
  }
};
```

### 2. Keyword Universe Export (`keyword_universe`)

**Columns**: `keyword`, `tier`, `cluster_label`, `volume`, `difficulty`, `intent`, `relevance`, `trend`, `blended_score`, `quick_win`, `canonical_keyword`, `top_serp_urls`, `cpc`, `traffic_potential`, `parent_topic`, `serp_features`, `competition_level`, `content_opportunity`, `last_updated`

**Use Case**: SEO analysis and keyword research documentation.

```typescript
const keywordConfig: ExportConfig = {
  runId: 'your-run-id',
  format: 'excel',
  template: 'keyword_universe',
  filters: {
    keywords: {
      stages: ['dream100', 'tier2', 'tier3'],
      minVolume: 1000,
      maxDifficulty: 70,
      quickWinsOnly: false
    }
  },
  options: {
    sortBy: 'volume',
    sortDirection: 'desc',
    maxRows: 10000
  }
};
```

### 3. Cluster Analysis Export (`cluster_analysis`)

**Columns**: `cluster_id`, `cluster_label`, `size`, `score`, `primary_intent`, `intent_distribution`, `representative_keywords`, `avg_volume`, `avg_difficulty`, `total_volume`, `quick_win_count`, `content_pillar`, `recommended_content_type`, `priority_level`, `seasonal_trend`, `competitive_landscape`

**Use Case**: Content strategy and pillar page planning.

```typescript
const clusterConfig: ExportConfig = {
  runId: 'your-run-id',
  format: 'csv',
  template: 'cluster_analysis',
  filters: {
    clusters: {
      minSize: 5,
      minScore: 0.6,
      primaryIntents: ['informational', 'commercial']
    }
  },
  options: {
    sortBy: 'score',
    sortDirection: 'desc',
    includeAnalytics: true
  }
};
```

### 4. Quick Wins Export (`quick_wins`)

**Columns**: `keyword`, `volume`, `difficulty`, `ease_score`, `intent`, `cluster_label`, `estimated_traffic`, `competition_analysis`, `content_suggestion`, `priority_score`, `effort_estimate`, `time_to_rank`, `recommended_content_type`, `target_audience`

**Use Case**: Immediate content opportunities and low-hanging fruit identification.

```typescript
const quickWinsConfig: ExportConfig = {
  runId: 'your-run-id',
  format: 'csv',
  template: 'quick_wins',
  filters: {
    keywords: {
      quickWinsOnly: true,
      minVolume: 500,
      maxDifficulty: 40
    }
  },
  options: {
    sortBy: 'priority_score',
    sortDirection: 'desc',
    maxRows: 50
  }
};
```

### 5. Competitor Insights Export (`competitor_insights`)

**Columns**: `domain`, `discovery_keyword`, `total_titles`, `unique_titles`, `scrape_status`, `content_themes`, `avg_title_length`, `content_frequency`, `domain_authority`, `estimated_traffic`, `content_gaps`, `opportunities`, `scrape_date`, `last_updated`

**Use Case**: Competitive analysis and content gap identification.

## Predefined Templates

### Writers Template
Optimized for content creators with fields focused on execution:

```typescript
const result = await exportService.generateTemplateExport(runId, 'writers', 'csv');
```

**Includes**: `primary_keyword`, `suggested_title`, `content_type`, `due_date`, `estimated_hours`, `notes`, `priority`

### SEO Ops Template
Technical SEO focus with comprehensive metrics:

```typescript
const result = await exportService.generateTemplateExport(runId, 'seo_ops', 'excel');
```

**Includes**: `keyword`, `volume`, `difficulty`, `blended_score`, `quick_win`, `cluster_label`, `competition_level`, `serp_features`

### Stakeholders Template
High-level strategic overview:

```typescript
const result = await exportService.generateTemplateExport(runId, 'stakeholders', 'csv');
```

**Includes**: `cluster_label`, `primary_keyword`, `volume`, `estimated_traffic`, `priority`, `due_date`, `dri`

## Advanced Filtering

### Keyword Filters
```typescript
const filters: ExportFilters = {
  keywords: {
    stages: ['dream100', 'tier2'],           // Keyword tiers
    intents: ['informational', 'commercial'], // Search intents
    minVolume: 1000,                         // Minimum search volume
    maxVolume: 50000,                        // Maximum search volume
    minDifficulty: 0,                        // Minimum keyword difficulty
    maxDifficulty: 70,                       // Maximum keyword difficulty
    minScore: 0.5,                           // Minimum blended score
    maxScore: 1.0,                           // Maximum blended score
    quickWinsOnly: false,                    // Quick wins only
    clusters: ['cluster-id-1', 'cluster-id-2'] // Specific clusters
  }
};
```

### Roadmap Filters
```typescript
const filters: ExportFilters = {
  roadmap: {
    stages: ['pillar', 'supporting'],        // Content stages
    dris: ['John Doe', 'Jane Smith'],        // Directly responsible individuals
    dueDateFrom: '2024-03-01',               // Start date filter
    dueDateTo: '2024-06-30',                 // End date filter
    includeNotes: true                       // Include notes field
  }
};
```

### Cluster Filters
```typescript
const filters: ExportFilters = {
  clusters: {
    minSize: 5,                              // Minimum cluster size
    maxSize: 100,                            // Maximum cluster size
    minScore: 0.6,                           // Minimum cluster score
    primaryIntents: ['informational']         // Primary intent types
  }
};
```

## Export Options

### Sorting and Grouping
```typescript
const options: ExportOptions = {
  sortBy: 'volume',                          // Sort field
  sortDirection: 'desc',                     // Sort direction
  groupBy: 'cluster',                        // Group records by field
  maxRows: 1000                              // Limit number of rows
};
```

### Formatting Options
```typescript
const options: ExportOptions = {
  formatting: {
    dateFormat: 'US',                        // US, EU, or ISO date format
    numberFormat: 'US',                      // US or EU number format
    currencySymbol: '$',                     // Currency symbol
    booleanFormat: 'true_false'              // true_false, yes_no, or 1_0
  }
};
```

### Custom Fields
```typescript
const options: ExportOptions = {
  customFields: [
    {
      name: 'traffic_score',
      type: 'number',
      source: 'calculated',
      formula: 'volume * 0.3',                // Simple formula
      defaultValue: '0',
      visible: true
    },
    {
      name: 'priority_flag',
      type: 'text',
      source: 'keyword',
      defaultValue: 'standard',
      visible: true
    }
  ]
};
```

## Progress Tracking

Monitor long-running exports:

```typescript
// Start export
const result = await exportService.createExport(config);

// Check progress
const progress = exportService.getExportProgress(result.id);
console.log(`Progress: ${progress?.progress}% - ${progress?.currentStage}`);

// Cancel if needed
const cancelled = await exportService.cancelExport(result.id);
```

## Export Formats

### CSV Format
```typescript
format: 'csv'
```
- Best for: Large datasets, Excel imports, data analysis
- Features: UTF-8 encoding, proper escaping, header row

### Excel Format
```typescript
format: 'excel'
```
- Best for: Business stakeholders, formatted reports
- Features: Multiple sheets, formatting, formulas

### JSON Format
```typescript
format: 'json'
```
- Best for: API integrations, data processing
- Features: Structured data, nested objects, arrays

## Error Handling

The export service provides comprehensive error handling:

```typescript
const result = await exportService.createExport(config);

if (result.status === 'failed') {
  console.error('Export failed:', result.error?.message);
  
  if (result.error?.retryable) {
    // Retry with modified configuration
    console.log('Suggestion:', result.error?.suggestion);
  }
}
```

### Common Error Codes
- `EXPORT_FAILED`: General export failure
- `VALIDATION_ERROR`: Invalid configuration
- `NOT_FOUND`: Run ID not found
- `SIZE_LIMIT_EXCEEDED`: Dataset too large
- `CONCURRENT_LIMIT`: Too many active exports

## Performance Considerations

### Large Datasets
- Use `maxRows` to limit export size
- Consider streaming exports for >10k records
- Enable compression for large files

### Memory Management
```typescript
const config: ExportServiceConfig = {
  maxConcurrentExports: 3,                   // Limit concurrent exports
  maxExportSize: 50 * 1024 * 1024,          // 50MB limit
  maxRecordsPerExport: 100000,               // 100k records max
  streamingThreshold: 10000,                 // Use streaming above 10k
  compressionEnabled: true                   // Compress large files
};
```

### Caching Strategy
- Results cached for `retentionDays`
- Progress tracking auto-cleaned after 5 minutes
- File downloads expire based on configuration

## Analytics and Insights

Export results include comprehensive analytics:

```typescript
if (result.status === 'completed') {
  const analytics = result.analytics;
  
  console.log('Data Quality:', analytics.dataQuality.completeness);
  console.log('Quick Wins:', analytics.summary.quickWinCount);
  console.log('Recommendations:', analytics.recommendations);
  
  // Distribution analysis
  console.log('By Stage:', analytics.distribution.recordsByStage);
  console.log('By Intent:', analytics.distribution.recordsByIntent);
}
```

## Integration Examples

### API Route Integration
```typescript
// In your Next.js API route
import { exportService } from '../../../services/export';

export async function POST(request: Request) {
  const config = await request.json();
  const result = await exportService.createExport(config);
  
  return Response.json(result);
}
```

### React Component Integration
```typescript
const ExportButton = ({ runId }: { runId: string }) => {
  const handleExport = async () => {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId,
        format: 'csv',
        template: 'editorial_roadmap'
      })
    });
    
    const result = await response.json();
    
    if (result.status === 'completed') {
      window.open(result.files[0].downloadUrl, '_blank');
    }
  };

  return <button onClick={handleExport}>Export Roadmap</button>;
};
```

## Configuration Options

### Service Configuration
```typescript
const customConfig: ExportServiceConfig = {
  maxConcurrentExports: 5,                   // Concurrent export limit
  maxExportSize: 100 * 1024 * 1024,         // 100MB size limit
  maxRecordsPerExport: 50000,                // 50k records limit
  streamingThreshold: 5000,                  // Stream above 5k records
  tempDirectory: '/tmp/exports',             // Temp file directory
  storageProvider: 's3',                     // s3, gcs, azure, local
  retentionDays: 7,                          // File retention period
  enableProgressTracking: true,              // Progress tracking
  compressionEnabled: true                   // File compression
};

const exportService = new ExportService(customConfig);
```

## Testing

Comprehensive test suite covers all functionality:

```bash
# Run export service tests
npm test -- --testPathPattern=export.test.ts

# Run with coverage
npm test -- --coverage --testPathPattern=export.test.ts
```

Test scenarios include:
- Configuration validation
- Data filtering and transformation
- Format generation (CSV, Excel, JSON)
- Template exports
- Progress tracking
- Error handling
- Performance limits
- Analytics calculation

## Best Practices

### 1. Filter Early
Apply filters to reduce dataset size before processing:

```typescript
const config: ExportConfig = {
  filters: {
    keywords: {
      quickWinsOnly: true,        // Reduce dataset
      minVolume: 1000,           // Filter low volume
      maxDifficulty: 50          // Focus on achievable keywords
    }
  }
};
```

### 2. Use Appropriate Templates
Choose templates based on audience:
- `writers` for content creators
- `seo_ops` for technical teams  
- `stakeholders` for executives
- Custom templates for specific needs

### 3. Monitor Performance
Track export metrics and optimize:

```typescript
// Monitor processing time
console.log('Processing time:', result.metadata.processingTime);

// Check file size
console.log('File size:', result.metadata.fileSize);

// Review recommendations
result.analytics.recommendations.forEach(rec => console.log(rec));
```

### 4. Handle Errors Gracefully
Implement retry logic and user feedback:

```typescript
const maxRetries = 3;
let retryCount = 0;

const attemptExport = async (): Promise<ExportResult> => {
  const result = await exportService.createExport(config);
  
  if (result.status === 'failed' && result.error?.retryable && retryCount < maxRetries) {
    retryCount++;
    console.log(`Retry attempt ${retryCount}/${maxRetries}`);
    return attemptExport();
  }
  
  return result;
};
```

### 5. Optimize for Large Datasets
Use streaming and chunking for large exports:

```typescript
// For datasets > 10k records, consider streaming
if (estimatedRecordCount > 10000) {
  const stream = await exportService.createStreamingExport(config);
  // Handle stream processing
}

// Or limit records per export
const config: ExportConfig = {
  options: {
    maxRows: 5000  // Chunk large datasets
  }
};
```

## Support and Troubleshooting

### Common Issues

1. **Memory errors with large datasets**
   - Solution: Reduce `maxRows`, enable streaming, or filter data

2. **Slow export processing**
   - Solution: Add database indexes, reduce concurrent exports, optimize queries

3. **File download failures**
   - Solution: Check storage configuration, verify permissions, increase retry limits

4. **Format compatibility issues**
   - Solution: Validate output format, check character encoding, test with target applications

### Debug Mode
Enable detailed logging for troubleshooting:

```typescript
const config: ExportServiceConfig = {
  ...defaultExportConfig,
  enableProgressTracking: true  // Detailed progress tracking
};

// Monitor progress for debugging
const progress = exportService.getExportProgress(exportId);
console.log('Current stage:', progress?.currentStage);
console.log('Records processed:', progress?.recordsProcessed);
```