# Ingestion Service Documentation

## Overview

The Ingestion Service is the entry point for the Dream 100 Keyword Engine pipeline. It handles seed keyword processing, validates API configurations, estimates costs, and creates new processing runs with comprehensive validation and error handling.

## Features

### Core Functionality
- **Seed Keyword Processing**: Validates, normalizes, and sanitizes 1-5 seed keywords
- **API Key Management**: Secure storage and validation of Ahrefs and Anthropic API keys
- **Cost Estimation**: Accurate cost prediction based on keyword counts and processing requirements
- **Run Configuration**: Merges user preferences with request settings
- **Duplicate Detection**: Prevents redundant processing by detecting similar keyword sets
- **Comprehensive Validation**: Multi-layer validation with detailed error reporting

### Security & Performance
- **Rate Limiting**: Token bucket algorithm with 10 requests per minute limit
- **API Key Encryption**: All API keys encrypted at rest using Supabase encryption
- **Input Sanitization**: Comprehensive keyword quality validation
- **Error Handling**: Structured error responses with retry guidance
- **Monitoring**: Full Sentry integration for error tracking and performance monitoring

## API Endpoints

### POST /api/ingestion/process

Process seed keywords and create a new run or validate inputs.

**Request Body:**
```typescript
{
  userId: string;           // UUID of the user
  seedKeywords: string[];   // 1-5 seed keywords
  market?: string;          // Market code (default: "US")
  budgetLimit?: number;     // Budget limit in USD (default: 100)
  validateOnly?: boolean;   // Only validate, don't create run
  settings?: {              // Optional run configuration
    maxKeywords?: number;
    maxDream100?: number;
    maxTier2PerDream?: number;
    maxTier3PerTier2?: number;
    enableCompetitorScraping?: boolean;
    similarityThreshold?: number;
    quickWinThreshold?: number;
    // ... other settings
  };
}
```

**Response:**
```typescript
{
  success: boolean;
  runId?: string;           // Only present if run was created
  validation: {
    isValid: boolean;
    seedKeywords: {
      valid: string[];
      invalid: Array<{ keyword: string; reason: string }>;
      normalized: string[];
      duplicatesRemoved: string[];
    };
    settings: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
    apiKeys: {
      ahrefs: ApiKeyValidation;
      anthropic: ApiKeyValidation;
    };
    market: {
      isValid: boolean;
      normalized: string;
      supported: boolean;
    };
  };
  costEstimate: {
    total: number;
    breakdown: {
      ahrefs: number;
      anthropic: number;
      infrastructure: number;
    };
    estimatedKeywords: number;
    budgetUtilization: number;
    withinBudget: boolean;
    projectedDuration: number;
  };
  configuration: {
    finalSettings: RunSettings;
    processingPlan: {
      dream100Count: number;
      tier2Count: number;
      tier3Count: number;
      totalExpected: number;
    };
    enabledFeatures: {
      competitorScraping: boolean;
      clustering: boolean;
      roadmapGeneration: boolean;
    };
  };
  warnings: IngestionWarning[];
  errors: IngestionError[];
}
```

### GET /api/ingestion/validate-keys?userId={uuid}

Validate API keys for a user without creating a run.

**Response:**
```typescript
{
  success: boolean;
  data: {
    isValid: boolean;
    apiKeys: {
      ahrefs: ApiKeyValidation;
      anthropic: ApiKeyValidation;
    };
    warnings: Array<{
      type: 'quota' | 'cost' | 'configuration';
      message: string;
      severity: 'low' | 'medium' | 'high';
    }>;
    recommendations: string[];
  };
}
```

### PUT /api/ingestion/settings

Update user settings including API keys and preferences.

**Request Body:**
```typescript
{
  userId: string;
  ahrefsApiKey?: string | null;    // Set to null to remove
  anthropicApiKey?: string | null; // Set to null to remove
  defaultWeights?: Partial<ScoringWeights>;
  preferences?: Partial<UserPreferences>;
}
```

## Service Usage

### Basic Usage

```typescript
import { processIngestion } from '../services/ingestion';

const request = {
  userId: 'user-uuid',
  seedKeywords: ['digital marketing', 'seo tools'],
  market: 'US',
  budgetLimit: 50
};

const result = await processIngestion(request);

if (result.success) {
  console.log('Run created:', result.runId);
  console.log('Estimated cost:', result.costEstimate.total);
} else {
  console.error('Validation failed:', result.errors);
}
```

### Validation Only

```typescript
const validationRequest = {
  userId: 'user-uuid',
  seedKeywords: ['test keyword'],
  validateOnly: true
};

const result = await processIngestion(validationRequest);
// result.runId will be undefined
// result.validation contains full validation details
```

### API Key Management

```typescript
import { updateUserSettings, validateApiKeys } from '../services/ingestion';

// Update API keys
await updateUserSettings('user-uuid', {
  ahrefsApiKey: 'new-ahrefs-key',
  anthropicApiKey: 'new-anthropic-key'
});

// Validate keys
const validation = await validateApiKeys('user-uuid');
console.log('Ahrefs valid:', validation.ahrefs.isValid);
console.log('Anthropic valid:', validation.anthropic.isValid);
```

## Validation Rules

### Seed Keywords
- **Count**: 1-5 keywords required
- **Length**: 2-100 characters each
- **Quality**: Must contain letters, not just numbers or symbols
- **Uniqueness**: Duplicates automatically removed
- **Word Limit**: Maximum 10 words per keyword

### Market Codes
Supported markets: US, UK, CA, AU, DE, FR, ES, IT, BR, MX

### Budget Limits
- **Minimum**: $1
- **Maximum**: $1000
- **Default**: $100

### API Keys
- **Ahrefs**: Required for keyword metrics
- **Anthropic**: Required for AI-powered expansions
- **Validation**: Keys tested via health check endpoints
- **Security**: Encrypted at rest, never logged in plain text

## Error Handling

### Error Types

1. **Validation Errors** (400)
   - Invalid input format
   - Keyword quality issues
   - Missing required fields

2. **API Key Errors** (401)
   - Invalid or missing API keys
   - Key decryption failures
   - Integration health check failures

3. **Budget Errors** (402)
   - Estimated cost exceeds budget
   - Payment method issues

4. **Rate Limit Errors** (429)
   - Too many requests
   - API quota exhausted

5. **System Errors** (500)
   - Database connection issues
   - Integration service failures
   - Unexpected processing errors

### Retry Logic

Errors are classified as retryable or non-retryable:

- **Retryable**: Rate limits, temporary API issues, network errors
- **Non-retryable**: Validation errors, invalid API keys, budget exceeded

## Cost Estimation

The service provides detailed cost estimates based on:

### Keyword Processing
- **Dream 100**: 20 keywords per seed (estimated)
- **Tier 2**: 10 keywords per Dream 100 keyword
- **Tier 3**: 10 keywords per Tier 2 keyword
- **Total**: Capped at `maxKeywords` setting

### API Costs
- **Ahrefs**: ~$0.01 per keyword for metrics
- **Anthropic**: ~$0.0001 per token for expansions
- **Infrastructure**: ~$0.001 per keyword for processing

### Time Estimates
- **Base Rate**: ~50 keywords per minute
- **Competitor Scraping**: +50% processing time
- **Semantic Clustering**: +20% processing time

## Monitoring & Analytics

### Metrics Tracked
- Request volume and success rates
- Processing times and performance
- API usage and costs
- Error rates by type
- User behavior patterns

### Sentry Integration
- Automatic error capture with context
- Performance monitoring
- Custom breadcrumbs for debugging
- Alert configuration for critical errors

## Configuration

### Environment Variables
```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Monitoring
SENTRY_DSN=your-sentry-dsn

# Rate Limiting
INGESTION_RATE_LIMIT_CAPACITY=10
INGESTION_RATE_LIMIT_REFILL_RATE=2
INGESTION_RATE_LIMIT_REFILL_PERIOD=60000
```

### Default Settings
```typescript
const defaultRunSettings = {
  maxKeywords: 10000,
  maxDream100: 100,
  maxTier2PerDream: 10,
  maxTier3PerTier2: 10,
  enableCompetitorScraping: true,
  similarityThreshold: 0.7,
  quickWinThreshold: 0.7,
  targetMarket: 'US',
  language: 'en',
  contentFocus: 'blog'
};
```

## Testing

### Running Tests
```bash
# Run all ingestion tests
npm test -- src/services/__tests__/ingestion.test.ts

# Run with coverage
npm test -- --coverage src/services/__tests__/ingestion.test.ts

# Watch mode for development
npm test -- --watch src/services/__tests__/ingestion.test.ts
```

### Test Coverage
The test suite covers:
- ✅ Input validation and sanitization
- ✅ API key management and validation
- ✅ Cost estimation accuracy
- ✅ Settings management
- ✅ Duplicate detection
- ✅ Error handling and edge cases
- ✅ Integration workflows

## Troubleshooting

### Common Issues

**"API key validation failed"**
- Check API key format and validity
- Verify network connectivity to API providers
- Check API key quotas and billing status

**"Budget exceeded"**
- Increase budget limit in request
- Reduce keyword limits in settings
- Check cost estimation accuracy

**"Rate limit exceeded"**
- Wait 1 minute before retrying
- Implement exponential backoff in client
- Consider upgrading API limits

**"Duplicate keyword set detected"**
- Modify seed keywords slightly
- Use existing run if appropriate
- Clear duplicate detection cache if needed

### Debug Mode

Enable debug logging:
```bash
NODE_ENV=development DEBUG=ingestion:* npm start
```

### Health Check

Monitor service health:
```bash
curl http://localhost:3000/api/ingestion/health
```

## Contributing

### Adding New Validation Rules
1. Update schemas in `src/services/ingestion.ts`
2. Add corresponding tests
3. Update documentation
4. Test with various input combinations

### Extending Cost Estimation
1. Update `estimateCosts()` method
2. Add new cost factors to breakdown
3. Update tests and documentation
4. Validate against actual API costs

### Adding New Markets
1. Update `validateMarketCode()` in helpers
2. Add market-specific validation rules
3. Test with new market codes
4. Update supported markets list

## Performance Considerations

- **Caching**: Duplicate detection cache expires after 24 hours
- **Rate Limiting**: 10 requests per minute per service instance
- **Database**: Uses connection pooling and prepared statements
- **Memory**: Cache size limited to prevent memory leaks
- **API Calls**: Batched where possible to reduce latency

## Security Notes

- All API keys encrypted at rest using Supabase vault
- Input validation prevents injection attacks
- Rate limiting prevents abuse
- Sensitive data never logged or exposed in responses
- HTTPS required for all API endpoints