# Dream 100 Keyword Engine - Data Models

Comprehensive TypeScript interfaces and data models for the keyword research pipeline with full type safety, validation schemas, and utility functions.

## Overview

This models directory contains the complete type system for the Dream 100 Keyword Engine, providing:

- **Type Safety**: Full TypeScript strict mode compliance with branded types
- **Runtime Validation**: Zod schemas for all inputs and data transformations
- **Database Compatibility**: Types matching Supabase schema and external API contracts
- **Utility Functions**: Helper functions for data manipulation and validation
- **Export Support**: Complete CSV export schemas and transformation utilities

## Architecture

### Core Models

- **[keyword.ts](./keyword.ts)**: Individual keyword data with stage-specific metrics and scoring
- **[cluster.ts](./cluster.ts)**: Semantic keyword groupings with similarity thresholds and analytics
- **[run.ts](./run.ts)**: Processing run metadata, status tracking, and progress monitoring
- **[competitor.ts](./competitor.ts)**: Competitor domain tracking and content scraping results
- **[roadmap.ts](./roadmap.ts)**: Editorial calendar entries with assignments and content recommendations
- **[settings.ts](./settings.ts)**: User preferences, API configuration, and system settings

### System Models

- **[pipeline.ts](./pipeline.ts)**: Job queues, workflow orchestration, and processing stages
- **[scoring.ts](./scoring.ts)**: Stage-specific scoring weights and blended score calculations
- **[export.ts](./export.ts)**: CSV export schemas and data transformation utilities
- **[validation.ts](./validation.ts)**: Comprehensive validation schemas and data quality assurance
- **[utils.ts](./utils.ts)**: Common utility types, helper functions, and shared patterns

## Key Features

### 1. Brand Types for Domain Safety

```typescript
// Branded types prevent mixing different string types
export type KeywordString = string & { readonly __brand: 'keyword' };
export type DomainString = string & { readonly __brand: 'domain' };
export type URLString = string & { readonly __brand: 'url' };

// Safe constructors with validation
const keyword = createKeyword('social selling tips'); // KeywordString
const domain = createDomain('example.com'); // DomainString
```

### 2. Runtime Validation with Zod

```typescript
const CreateKeywordInputSchema = z.object({
  runId: z.string().uuid(),
  keyword: z.string().min(1).max(255).transform(val => val.trim().toLowerCase()),
  stage: z.enum(['dream100', 'tier2', 'tier3']),
  volume: z.number().int().min(0).max(10000000).optional(),
  difficulty: z.number().int().min(0).max(100).optional()
});

// Validate and transform input data
const result = CreateKeywordInputSchema.safeParse(inputData);
```

### 3. Comprehensive Type Guards

```typescript
export const isKeyword = (value: unknown): value is Keyword => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.keyword === 'string' &&
    isKeywordStage(obj.stage) &&
    typeof obj.volume === 'number'
    // ... additional checks
  );
};
```

### 4. Database-Compatible Types

```typescript
// Matches Supabase schema exactly
export interface Keyword {
  readonly id: UUID;
  readonly runId: UUID;
  readonly clusterId: UUID | null;
  readonly keyword: KeywordString;
  readonly stage: KeywordStage;
  readonly volume: number;
  readonly difficulty: number;
  // ... all database fields
}
```

### 5. Export Schema Definitions

```typescript
// Editorial Roadmap CSV schema
export interface EditorialRoadmapCSV {
  readonly post_id: string;
  readonly cluster_label: string;
  readonly stage: RoadmapStage;
  readonly primary_keyword: string;
  readonly secondary_keywords: string;
  // ... complete CSV structure
}

// Data transformation utilities
export const transformToEditorialRoadmapCSV = (
  roadmapItems: RoadmapItemWithCluster[],
  options: ExportOptions
): EditorialRoadmapCSV[] => {
  // Transform database records to CSV format
};
```

## Usage Examples

### Creating and Validating Keywords

```typescript
import { CreateKeywordInputSchema, createKeyword } from '@/models';

// Validate input data
const input = {
  runId: '123e4567-e89b-12d3-a456-426614174000',
  keyword: '  Social Selling Tips  ', // will be normalized
  stage: 'dream100',
  volume: 15000,
  difficulty: 45
};

const result = CreateKeywordInputSchema.safeParse(input);
if (result.success) {
  const validatedData = result.data;
  // validatedData.keyword is now 'social selling tips'
}
```

### Working with Clusters

```typescript
import { 
  ClusterWithKeywords, 
  calculateClusterScore, 
  generateClusterLabel 
} from '@/models';

// Calculate cluster metrics
const cluster: ClusterWithKeywords = {
  // ... cluster data with keywords
};

const score = calculateClusterScore(cluster.keywords);
const suggestedLabel = generateClusterLabel(
  cluster.keywords.map(k => k.keyword)
);
```

### Scoring Configuration

```typescript
import { 
  ScoringWeights, 
  calculateBlendedScore, 
  getDefaultScoringWeights 
} from '@/models';

// Use default weights or customize
const weights = getDefaultScoringWeights();
const customWeights: ScoringWeights = {
  dream100: {
    volume: 0.45,
    intent: 0.25,
    relevance: 0.15,
    trend: 0.10,
    ease: 0.05
  },
  // ... tier2 and tier3 weights
};

// Calculate scores
const scoringInput = {
  keyword: 'social selling',
  stage: 'dream100',
  volume: 12000,
  difficulty: 35,
  intent: 'commercial',
  relevance: 0.85,
  trend: 0.2
};

const result = calculateBlendedScore(scoringInput, customWeights);
```

### Pipeline Job Management

```typescript
import { 
  CreateJobInput, 
  PipelineJob, 
  calculateJobPriority,
  getResourceRequirements 
} from '@/models';

// Create a processing job
const jobInput: CreateJobInput = {
  runId: 'run-uuid',
  stage: 'metrics_enrichment',
  priority: calculateJobPriority('metrics_enrichment', []),
  data: {
    stage: 'metrics_enrichment',
    input: { keywords: [...] },
    config: { /* stage config */ },
    resources: getResourceRequirements('metrics_enrichment', 1000)
  }
};
```

### Export Generation

```typescript
import { 
  transformToEditorialRoadmapCSV,
  ExportConfig,
  generateExportFilename 
} from '@/models';

// Transform data for export
const csvData = transformToEditorialRoadmapCSV(
  roadmapItems,
  { includeMetadata: true, sortBy: 'score' }
);

// Generate export configuration
const exportConfig: ExportConfig = {
  runId: 'run-uuid',
  format: 'csv',
  template: 'editorial_roadmap',
  filters: {
    keywords: { quickWinsOnly: true },
    roadmap: { includeNotes: true },
    clusters: { minScore: 0.6 }
  },
  options: {
    includeMetadata: true,
    sortBy: 'score',
    maxRows: 5000
  },
  scheduling: null,
  destinations: []
};

const filename = generateExportFilename(
  'editorial_roadmap',
  'run-uuid',
  'csv'
);
```

## Data Quality and Validation

### Input Validation

```typescript
import { 
  validateModel,
  batchValidate,
  ValidationResult 
} from '@/models';

// Validate single item
const result: ValidationResult<Keyword> = validateModel(
  inputData,
  KeywordSchema
);

// Batch validation with custom rules
const batchResult = batchValidate(
  keywordArray,
  KeywordSchema,
  {
    schema: 'keyword',
    strictMode: true,
    stopOnFirstError: false,
    maxErrors: 100,
    customValidators: [CustomValidators.uniqueKeywords]
  }
);
```

### Data Quality Assessment

```typescript
import { assessDataQuality } from '@/models';

const qualityReport = assessDataQuality(keywordData);
// Returns completeness, accuracy, consistency scores
// Plus actionable recommendations for improvement
```

## Configuration and Settings

### User Preferences

```typescript
import { 
  Settings,
  UserPreferences,
  getDefaultUserPreferences,
  validateApiKey 
} from '@/models';

// Get default configuration
const defaultPrefs = getDefaultUserPreferences();

// Validate API keys
const ahrefsValidation = await validateApiKey('ahrefs', apiKey);
if (!ahrefsValidation.isValid) {
  console.error('Invalid Ahrefs API key:', ahrefsValidation.errorMessage);
}
```

## Testing and Development

### Type Guards in Tests

```typescript
import { isKeyword, isCluster, isPipelineJob } from '@/models';

// Use type guards in tests
test('validates keyword structure', () => {
  const data = createTestKeyword();
  expect(isKeyword(data)).toBe(true);
});
```

### Mock Data Generation

```typescript
// Utility functions help create test data
const testKeyword = {
  id: generateId(),
  runId: generateId(),
  keyword: createKeyword('test keyword'),
  stage: 'dream100' as KeywordStage,
  // ... other required fields
};
```

## Best Practices

### 1. Always Use Type Guards
```typescript
// Good: Safe type checking
if (isKeyword(data)) {
  // TypeScript knows data is Keyword
  console.log(data.volume);
}

// Bad: Unsafe casting
const keyword = data as Keyword;
```

### 2. Validate External Data
```typescript
// Good: Validate API responses
const result = AhrefsResponseSchema.safeParse(apiResponse);
if (result.success) {
  processValidData(result.data);
}

// Bad: Trust external data
processData(apiResponse); // Could crash on invalid data
```

### 3. Use Branded Types
```typescript
// Good: Type-safe domain modeling
function processKeyword(keyword: KeywordString) {
  // Can only pass validated KeywordString
}

// Bad: Generic strings everywhere
function processKeyword(keyword: string) {
  // Could pass any string
}
```

### 4. Leverage Utility Functions
```typescript
// Good: Use provided utilities
const score = calculateClusterScore(keywords);
const label = generateClusterLabel(keywordStrings);

// Bad: Duplicate logic
const score = keywords.reduce(/* custom logic */);
```

## Contributing

When adding new models or extending existing ones:

1. **Add TypeScript interfaces** with readonly properties
2. **Create Zod validation schemas** for runtime safety
3. **Write type guards** for runtime type checking
4. **Add utility functions** for common operations
5. **Update exports** in `index.ts`
6. **Document with JSDoc** for better IDE support
7. **Add examples** to this README

All models follow strict TypeScript patterns:
- Readonly properties for immutability
- Branded types for domain safety
- Comprehensive validation schemas
- Utility functions for common operations
- Complete JSDoc documentation

## Files Structure

```
src/models/
├── index.ts           # Main exports and branded types
├── keyword.ts         # Keyword data models
├── cluster.ts         # Clustering and semantic grouping
├── run.ts            # Processing run metadata
├── competitor.ts     # Competitor analysis
├── roadmap.ts        # Editorial planning
├── settings.ts       # User preferences and configuration
├── pipeline.ts       # Job processing and workflows
├── scoring.ts        # Keyword scoring algorithms
├── export.ts         # Data export and CSV schemas
├── validation.ts     # Validation frameworks
├── utils.ts          # Shared utilities
└── README.md         # This documentation
```

This comprehensive type system ensures type safety across the entire Dream 100 Keyword Engine while maintaining excellent developer experience and runtime reliability.