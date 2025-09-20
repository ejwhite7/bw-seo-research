# Dream 100 Keyword Engine - Database Documentation

This document provides comprehensive information about the Supabase database schema, setup, and usage for the Dream 100 Keyword Engine.

## Quick Start

1. **Install Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Run the setup script:**
   ```bash
   ./scripts/setup-supabase.sh
   ```

## Database Schema Overview

### Core Tables

#### 1. **runs** - Processing Run Metadata
Stores information about each keyword research run.

Key fields:
- `seed_keywords`: Input keywords (array)
- `status`: Current run status (pending|processing|completed|failed|cancelled)
- `settings`: Configuration options and weights (JSONB)
- `api_usage`: Track API costs and usage (JSONB)
- `progress`: Real-time progress tracking (JSONB)

#### 2. **keywords** - All Keywords with Metrics
Stores 10,000+ keywords with stage classification and metrics.

Key fields:
- `stage`: dream100|tier2|tier3
- `volume`, `difficulty`: Ahrefs metrics
- `intent`: transactional|commercial|informational|navigational
- `blended_score`: Calculated weighted score (0-1)
- `quick_win`: Boolean flag for low-difficulty, high-value keywords
- `embedding`: Vector embedding for semantic clustering

#### 3. **clusters** - Semantic Groups
Groups keywords into topical clusters for content planning.

Key fields:
- `label`: Human-readable cluster name
- `score`: Cluster priority score
- `intent_mix`: Distribution of intent types (JSONB)
- `representative_keywords`: Top keywords representing cluster
- `embedding`: Cluster centroid embedding

#### 4. **roadmap_items** - Editorial Calendar
Converts clusters into actionable content assignments.

Key fields:
- `post_id`: Unique identifier for content piece
- `stage`: pillar|supporting
- `primary_keyword`, `secondary_keywords`: Target keywords
- `suggested_title`: AI-generated content title
- `dri`: Directly responsible individual
- `due_date`: Publication deadline

#### 5. **competitors** - Domain Research
Tracks competitor domains and scraped content titles.

Key fields:
- `domain`: Competitor website
- `titles`: Scraped blog post titles (array)
- `urls`: Corresponding URLs (array)
- `scrape_status`: Current scraping status

#### 6. **settings** - User Configuration
Stores user preferences and encrypted API keys.

Key fields:
- `ahrefs_api_key_encrypted`: Encrypted Ahrefs key
- `anthropic_api_key_encrypted`: Encrypted Anthropic key
- `default_weights`: Scoring formula weights (JSONB)
- `other_preferences`: Additional user settings (JSONB)

### Security & Performance Features

#### Row Level Security (RLS)
- All tables have RLS enabled
- Users can only access their own data
- Service role bypasses RLS for system operations

#### API Key Encryption
- All API keys encrypted at rest using `pgcrypto`
- Versioned encryption for key rotation
- Secure decrypt functions for server-side access

#### Performance Optimizations
- Vector indexes for embedding similarity search
- Composite indexes for common query patterns  
- Materialized views for analytics and dashboard data
- Full-text search with ranking for keyword/cluster lookup
- Concurrent index creation for zero-downtime deployments

#### Audit Logging
- Comprehensive audit trail for all sensitive operations
- IP address and user agent tracking
- Automatic data masking for sensitive fields
- Configurable retention policies

## Database Functions

### Core Functions

#### `calculate_blended_score()`
Calculates weighted keyword scores based on stage-specific formulas:
- **Dream 100**: 0.40×Volume + 0.30×Intent + 0.15×Relevance + 0.10×Trend + 0.05×Ease
- **Tier-2**: 0.35×Volume + 0.25×Ease + 0.20×Relevance + 0.15×Intent + 0.05×Trend  
- **Tier-3**: 0.35×Ease + 0.30×Relevance + 0.20×Volume + 0.10×Intent + 0.05×Trend

#### `is_quick_win()`
Identifies keywords with high opportunity score:
- Ease (1-KD normalized) ≥ 0.7
- Volume ≥ median volume in cluster

#### `search_keywords_ranked()` / `search_clusters_ranked()`
Full-text search with relevance scoring using PostgreSQL's text search capabilities.

### Security Functions

#### `encrypt_api_key_versioned()` / `decrypt_api_key_versioned()`
Secure API key storage with versioning support for key rotation.

#### `check_rate_limit()`
Token bucket rate limiting per user/endpoint to prevent API abuse.

### Performance Functions

#### `bulk_insert_keywords()` / `bulk_insert_clusters()`
High-performance bulk insert operations for processing 10,000+ records.

#### `refresh_cluster_analytics()` / `refresh_run_summaries()`
Refresh materialized views for dashboard and analytics data.

## Usage Examples

### TypeScript Integration

```typescript
import { EnhancedDatabaseService } from '@/lib/database-service'

// Create a new run
const { data: run } = await EnhancedDatabaseService.createRun(
  userId,
  ['social selling'],
  {
    max_keywords: 10000,
    enable_competitor_scraping: true,
    scoring_weights: {
      dream100: { volume: 0.40, intent: 0.30, relevance: 0.15, trend: 0.10, ease: 0.05 }
    }
  }
)

// Search keywords with ranking
const { data: keywords } = await EnhancedDatabaseService.searchKeywords(
  runId,
  'linkedin sales'
)

// Generate CSV exports
const csvData = await EnhancedDatabaseService.generateEditorialRoadmapCSV(runId)
```

### SQL Examples

```sql
-- Get top quick wins by cluster
SELECT 
    c.label,
    k.keyword,
    k.volume,
    k.difficulty,
    k.blended_score
FROM keywords k
JOIN clusters c ON k.cluster_id = c.id
WHERE k.run_id = $1 AND k.quick_win = true
ORDER BY c.score DESC, k.blended_score DESC;

-- Cluster performance analytics
SELECT 
    label,
    actual_keyword_count,
    avg_volume,
    avg_difficulty,
    quick_win_count,
    quick_win_count::float / actual_keyword_count as quick_win_rate
FROM cluster_analytics
WHERE run_id = $1
ORDER BY score DESC;
```

## CSV Export Schemas

### Editorial Roadmap Export
```csv
post_id,cluster_label,stage,primary_keyword,secondary_keywords,intent,volume,difficulty,blended_score,quick_win,suggested_title,dri,due_date,notes,source_urls,run_id
```

### Keyword Universe Export  
```csv
keyword,tier,cluster_label,volume,difficulty,intent,relevance,trend,blended_score,quick_win,canonical_keyword,top_serp_urls
```

## Performance Targets

- **Pipeline Performance**: 10k keywords processed in ≤20 minutes (P95)
- **Query Performance**: Dashboard loads in <2 seconds
- **Search Performance**: Keyword search returns in <500ms
- **Export Performance**: CSV generation for 10k records in <30 seconds

## Monitoring & Maintenance

### Health Checks
```typescript
const health = await EnhancedDatabaseService.healthCheck()
console.log(`Database healthy: ${health.healthy}, Response time: ${health.response_time_ms}ms`)
```

### Data Cleanup
```typescript
// Automatic cleanup based on retention policies
const { deletedCount } = await EnhancedDatabaseService.cleanupOldData()
```

### Analytics
```typescript
// User performance analytics
const analytics = await EnhancedDatabaseService.getUserAnalytics(userId, 30)
console.log(`Success rate: ${analytics.data.success_rate}%`)
```

## Backup & Recovery

### Local Development
```bash
# Backup
supabase db dump > backup.sql

# Restore
supabase db reset
supabase sql -f backup.sql
```

### Production
- Automated daily backups via Supabase
- Point-in-time recovery available
- Cross-region replication for disaster recovery

## Security Considerations

1. **API Keys**: Always encrypted at rest, never logged in plaintext
2. **RLS Policies**: Ensure users can only access their own data
3. **Rate Limiting**: Prevent API abuse and cost overruns
4. **Audit Logging**: Track all sensitive operations with IP/user agent
5. **Data Retention**: Automatic cleanup based on configurable policies

## Migration Strategy

### Schema Changes
1. Create new migration file: `supabase migration new description`
2. Write forward migration SQL
3. Test locally: `supabase db reset && supabase migration up`
4. Deploy to staging/production: `supabase migration up`

### Data Migrations
```sql
-- Example: Add new column with default value
ALTER TABLE keywords ADD COLUMN search_volume_trend DECIMAL(3,2) DEFAULT 0.50;

-- Backfill data
UPDATE keywords SET search_volume_trend = LEAST(GREATEST(random(), 0.0), 1.0);
```

## Troubleshooting

### Common Issues

**Query Timeouts:**
- Check query plans with `EXPLAIN ANALYZE`
- Verify indexes are being used
- Consider query optimization or pagination

**High Memory Usage:**
- Monitor vector operations (embeddings)
- Batch large operations
- Use materialized views for complex analytics

**RLS Policy Issues:**
- Verify user authentication
- Check policy conditions
- Use service role for system operations

### Debug Queries

```sql
-- Check index usage
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM keywords 
WHERE run_id = $1 AND quick_win = true 
ORDER BY blended_score DESC;

-- Monitor query performance
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

## Development Workflow

1. **Local Setup**: Run `./scripts/setup-supabase.sh`
2. **Schema Changes**: Create migration files
3. **Testing**: Use test user and sample data
4. **Performance**: Monitor query execution times
5. **Security**: Verify RLS policies and encryption
6. **Deploy**: Apply migrations to staging/production

For more information, see the main project documentation and API reference.