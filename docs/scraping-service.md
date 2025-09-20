# Ethical Competitor Research and Web Scraping Service

## Overview

The Competitor Research Service is a comprehensive, security-focused, and ethically-compliant web scraping solution designed for competitor analysis and content discovery. It integrates with the Dream 100 Keyword Engine to provide deep competitive insights while respecting website resources and following industry best practices.

## Key Features

### 🛡️ Security & Compliance
- **Strict robots.txt adherence** with intelligent parsing and caching
- **Content sanitization** to prevent XSS and injection attacks
- **Rate limiting with jitter** to avoid overwhelming target servers
- **Input validation** and size limits for all extracted content
- **Audit logging** for compliance and monitoring

### 🚀 Performance & Reliability
- **Circuit breaker pattern** for graceful failure handling
- **Exponential backoff** with retry logic
- **Distributed rate limiting** using Redis for multi-instance deployments
- **Intelligent caching** for robots.txt and extracted content
- **Progress tracking** and real-time status updates

### 🎯 Competitive Intelligence
- **Automated competitor discovery** from SERP data via Ahrefs
- **Content theme analysis** and topic clustering
- **Gap analysis** for content opportunities
- **Domain strength scoring** and competitive landscape mapping
- **Editorial roadmap integration** for actionable insights

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Ahrefs API     │    │  Web Scraper     │    │  Content        │
│  - SERP Data    │───▶│  - robots.txt    │───▶│  Sanitizer      │
│  - Competitor   │    │  - Rate Limiting │    │  - XSS Prevention│
│    Keywords     │    │  - Circuit Break │    │  - Size Limits  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                Competitor Research Service                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Competitor      │  │ Content         │  │ Competitive     │ │
│  │ Discovery       │  │ Extraction      │  │ Analysis        │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Database       │    │  Redis Cache     │    │  Sentry         │
│  - Competitors  │    │  - Rate Limits   │    │  - Monitoring   │
│  - Scrape Data  │    │  - robots.txt    │    │  - Error Track  │
│  - Audit Logs   │    │  - Content Cache │    │  - Performance  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Core Components

### 1. RobotsTxtParser

Securely fetches and parses robots.txt files with comprehensive validation.

```typescript
// Fetch and parse robots.txt with security checks
const robotsInfo = await RobotsTxtParser.fetchAndParse(
  'competitor.com',
  'Dream100Bot/1.0 (SEO Research; +https://olli.social/bot)'
);

// Check if a path is allowed
const canScrape = RobotsTxtParser.isPathAllowed(robotsInfo, '/blog/');
```

**Security Features:**
- Size limits (100KB max) to prevent abuse
- Timeout protection (10 seconds max)
- User-agent specific rule parsing
- Wildcard pattern matching
- 24-hour intelligent caching

### 2. ContentSanitizer

Provides multi-layer content sanitization to prevent security vulnerabilities.

```typescript
// Sanitize potentially dangerous content
const sanitized = ContentSanitizer.sanitizeContent({
  title: 'Safe Title <script>alert("xss")</script>',
  content: '<p>Good content</p><iframe src="evil.com"></iframe>',
  url: 'javascript:alert(1)'
});

// Result:
// {
//   title: 'Safe Title',
//   content: 'Good content',
//   url: ''
// }
```

**Protection Against:**
- Script injection (XSS)
- HTML injection
- JavaScript/VBScript URLs
- Malicious iframes and embeds
- Oversized content attacks

### 3. DomainRateLimiter

Implements respectful, domain-specific rate limiting with exponential backoff.

```typescript
const rateLimiter = new DomainRateLimiter({
  baseDelay: 1500,    // 1.5 seconds minimum between requests
  maxDelay: 10000,    // 10 seconds maximum delay
  maxRequestsPerMinute: 20  // Maximum requests per domain per minute
});

// Wait for domain clearance
await rateLimiter.waitForDomain('competitor.com');

// Set backoff for problematic domains
rateLimiter.setBackoff('blocked-domain.com', 300000); // 5 minutes
```

**Features:**
- Per-domain request tracking
- Automatic backoff for blocked domains
- Jitter to prevent thundering herd
- Real-time status monitoring

## Usage Examples

### Basic Competitor Discovery

```typescript
import { CompetitorResearchService } from '../services/scraping';

// Initialize the service
const service = new CompetitorResearchService(databaseService, {
  ahrefsApiKey: process.env.AHREFS_API_KEY,
  redis: redisClient
});

// Discover competitors from keywords
const keywords = [
  'seo tools',
  'keyword research',
  'content marketing'
] as KeywordString[];

const competitors = await service.discoverCompetitors(
  runId,
  keywords,
  {
    topN: 15,
    minDomainAuthority: 30,
    excludeDomains: ['oursite.com'],
    country: 'US'
  }
);

console.log(`Discovered ${competitors.length} competitors`);
```

### Ethical Content Scraping

```typescript
// Create scraping configuration
const scrapeConfig = generateScrapeConfig('competitor.com', {
  respectRobotsTxt: true,
  crawlDelay: 2,           // 2 seconds between requests
  maxPages: 100,
  userAgent: 'Dream100Bot/1.0 (SEO Research; +https://olli.social/bot)',
  rateLimitPerMinute: 15
});

// Scrape competitors with progress tracking
const results = await service.scrapeCompetitors(
  competitors,
  scrapeConfig,
  (completed, total, current) => {
    console.log(`Progress: ${completed}/${total} - Currently scraping: ${current}`);
  }
);

// Process results
results.forEach(result => {
  if (result.success) {
    console.log(`✓ ${result.domain}: ${result.titlesExtracted} titles extracted`);
  } else {
    console.log(`✗ ${result.domain}: ${result.errors[0]?.error}`);
  }
});
```

### Competitive Analysis

```typescript
// Generate competitive landscape analysis
const landscape = await service.generateCompetitiveLandscape(
  runId,
  ourKeywords
);

console.log('Competitive Insights:');
console.log(`- Total competitors analyzed: ${landscape.totalCompetitors}`);
console.log(`- Market saturation: ${landscape.industryInsights.marketSaturation}`);
console.log(`- Common topics:`, landscape.industryInsights.commonTopics);
console.log(`- Recommendations:`, landscape.recommendations);
```

## Configuration

### Environment Variables

```bash
# Required
AHREFS_API_KEY=your_ahrefs_api_key_here

# Optional
REDIS_URL=redis://localhost:6379
SCRAPE_USER_AGENT="Dream100Bot/1.0 (SEO Research; +https://olli.social/bot)"
SCRAPE_RATE_LIMIT_PER_MINUTE=20
SCRAPE_DEFAULT_DELAY_MS=1500
SCRAPE_MAX_PAGES_PER_DOMAIN=100
SCRAPE_TIMEOUT_MS=30000
```

### Scrape Configuration Options

```typescript
interface ScrapeConfig {
  respectRobotsTxt: boolean;      // Always true for ethical scraping
  crawlDelay: number;             // Seconds between requests (minimum 0.5)
  maxPages: number;               // Maximum pages per domain (1-10,000)
  maxDepth: number;               // Maximum crawl depth (1-10)
  allowedPaths: string[];         // Paths to include
  excludedPaths: string[];        // Paths to exclude
  userAgent: string;              // Identifies the bot
  timeout: number;                // Request timeout in seconds
  retryAttempts: number;          // Number of retry attempts (0-5)
  rateLimitPerMinute: number;     // Requests per minute (1-120)
}
```

## Security Best Practices

### 1. Input Validation

- All domain names are validated against strict regex patterns
- URL schemes are restricted to HTTP/HTTPS only
- Content size limits prevent memory exhaustion attacks
- Special characters are sanitized or rejected

### 2. Rate Limiting

- Minimum 500ms delay between requests to the same domain
- Maximum 120 requests per minute per domain
- Exponential backoff for failed requests
- Circuit breaker to prevent cascade failures

### 3. Content Security

- All HTML is stripped from extracted content
- JavaScript and VBScript URLs are rejected
- Iframe and embed tags are completely removed
- Content length is strictly limited

### 4. Network Security

- All requests use secure headers
- Timeout protection prevents hanging connections
- Certificate validation is enforced
- Redirects are limited to prevent abuse

## Error Handling

### Error Types

```typescript
// Standard scraping errors
type ScrapeStatus = 
  | 'pending'        // Waiting to be processed
  | 'processing'     // Currently being scraped
  | 'completed'      // Successfully completed
  | 'failed'         // Generic failure
  | 'blocked'        // Blocked by anti-bot measures
  | 'robots_blocked' // Blocked by robots.txt
  | 'rate_limited'   // Hit rate limits
  | 'timeout'        // Request timed out
  | 'skipped';       // Skipped due to configuration
```

### Error Recovery

- Automatic retry with exponential backoff
- Circuit breaker prevents cascade failures
- Graceful degradation when APIs are unavailable
- Comprehensive logging for troubleshooting

### Monitoring

All errors and performance metrics are tracked via Sentry:

```typescript
// Automatic error tracking
Sentry.addBreadcrumb({
  message: 'Starting competitor scraping',
  level: 'info',
  category: 'scraping-start',
  data: { competitorCount: competitors.length }
});

// Performance monitoring
Sentry.captureException(error, {
  tags: { domain, operation: 'scrape' },
  extra: { scrapeConfig, competitorId }
});
```

## Performance Optimization

### Caching Strategy

- **robots.txt**: 24-hour cache with domain-specific keys
- **Ahrefs data**: 7-day cache for keyword metrics
- **Content extraction**: No caching (content changes frequently)
- **Competitor rankings**: 7-day cache for SERP positions

### Batch Processing

- Process competitors in configurable batch sizes
- Parallel processing where safe and respectful
- Queue management for large-scale operations
- Progress tracking and status updates

### Resource Management

- Connection pooling for HTTP requests
- Memory limits for content extraction
- Automatic cleanup of expired cache entries
- Database connection optimization

## Compliance

### Legal Compliance

- **robots.txt**: Strict adherence to all directives
- **Terms of Service**: Respects website ToS and rate limits
- **Copyright**: Only extracts titles and metadata, not full content
- **Data Privacy**: No personal information is collected or stored

### Ethical Standards

- **Respectful crawling**: Conservative rate limits with jitter
- **Server resources**: Minimal impact on target websites
- **Transparency**: Clear user-agent identification
- **Opt-out support**: Honors robots.txt and blocking attempts

### Audit Trail

- Complete logging of all scraping activities
- Database records of all competitor interactions
- Error tracking and performance monitoring
- Compliance reporting and metrics

## API Reference

### CompetitorResearchService

#### `discoverCompetitors(runId, keywords, options)`

Discover competitor domains from keyword SERP data.

**Parameters:**
- `runId` (UUID): The run identifier
- `keywords` (KeywordString[]): Keywords to analyze
- `options` (object): Configuration options
  - `topN` (number): Maximum competitors to return (default: 20)
  - `minDomainAuthority` (number): Minimum DA score (default: 30)
  - `excludeDomains` (DomainString[]): Domains to exclude
  - `country` (string): Country code for SERP data (default: 'US')

**Returns:** `Promise<CreateCompetitorInput[]>`

#### `scrapeCompetitors(competitors, config, onProgress?)`

Scrape content from competitor domains with full compliance.

**Parameters:**
- `competitors` (Competitor[]): Competitors to scrape
- `config` (ScrapeConfig): Scraping configuration
- `onProgress` (function): Optional progress callback

**Returns:** `Promise<ScrapeResult[]>`

#### `generateCompetitiveLandscape(runId, ourKeywords)`

Generate comprehensive competitive analysis.

**Parameters:**
- `runId` (UUID): The run identifier
- `ourKeywords` (KeywordString[]): Our target keywords

**Returns:** `Promise<CompetitiveLandscape>`

#### `healthCheck()`

Perform service health check and return status.

**Returns:** `Promise<HealthStatus>`

## Troubleshooting

### Common Issues

#### 1. robots.txt Blocking

```
Error: Blocked by robots.txt
Status: robots_blocked
```

**Solution:** The domain has explicitly blocked our bot. This is expected behavior - respect the robots.txt directive.

#### 2. Rate Limiting

```
Error: Rate limit exceeded
Status: rate_limited
```

**Solution:** Reduce the `rateLimitPerMinute` setting or increase `crawlDelay` in your scrape configuration.

#### 3. CAPTCHA/Bot Detection

```
Error: Blocked by anti-bot measures
Status: blocked
```

**Solution:** The domain has detected automated traffic. Consider:
- Increasing delays between requests
- Using rotating user agents (within ethical bounds)
- Reducing batch sizes

#### 4. Network Timeouts

```
Error: Request timed out
Status: timeout
```

**Solution:** Increase timeout values or check network connectivity.

### Debug Mode

Enable debug logging for detailed troubleshooting:

```typescript
// Enable detailed logging
process.env.DEBUG = 'scraper:*';

// Check service health
const health = await service.healthCheck();
console.log('Service health:', health);

// Monitor rate limiter status
const rateLimitStatus = service.getDomainRateLimiterStatus();
console.log('Rate limiter status:', rateLimitStatus);
```

## Migration Guide

If migrating from an existing scraping solution:

### 1. Update Dependencies

```bash
npm install @sentry/nextjs ioredis cheerio
```

### 2. Environment Configuration

```bash
# Add new environment variables
AHREFS_API_KEY=your_key
REDIS_URL=redis://localhost:6379
```

### 3. Database Schema

Ensure your database includes the competitor-related tables:

```sql
-- Run database migrations
npm run db:migrate
```

### 4. Code Updates

```typescript
// Old approach
const scraper = new BasicScraper();

// New approach
const service = new CompetitorResearchService(databaseService, {
  ahrefsApiKey: process.env.AHREFS_API_KEY,
  redis: redisClient
});
```

## Contributing

### Development Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run tests
npm run test:scraping

# Run with debugging
DEBUG=scraper:* npm run dev
```

### Testing

```bash
# Run all scraping tests
npm run test src/services/__tests__/scraping.test.ts

# Run security tests specifically
npm run test -- --grep "Security"

# Run integration tests
npm run test:integration
```

### Code Style

- Follow existing TypeScript patterns
- Add comprehensive JSDoc comments
- Include security considerations in all new features
- Maintain test coverage above 90%

## License

This scraping service is designed for ethical competitive research and respects all applicable laws and website terms of service. Use responsibly.
