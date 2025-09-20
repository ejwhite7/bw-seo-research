# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the "Dream 100 Keyword Engine" for Olli Social - a comprehensive keyword research and editorial roadmap generation tool. The system expands seed keywords into a Dream 100 list, researches competitors, generates a 10,000-keyword universe, clusters semantically, scores/prioritizes, and outputs an editorial roadmap for content teams.

**Primary Users**: SEO Managers, Content Marketers, and Product Managers in the United States (English-speaking market)

**Core Workflow**: Input → Dream 100 → Keyword Universe → Clusters → Editorial Roadmap → CSV Export

## Technology Stack & Integrations

### Required External APIs
- **Ahrefs API** (preferred): Volume, KD/difficulty, CPC, SERP overview, competitor positions
- **Anthropic API** (preferred): LLM expansions, intent classification, title generation

### Recommended Architecture
- **Frontend**: React with virtualized tables for handling 10k+ keywords
- **Backend**: Node.js or Python (FastAPI) with job queues
- **Database**: PostgreSQL for structured data + vector index for embeddings
- **Storage**: Object storage for exports and cached artifacts
- **Queue**: Redis or similar for background job processing

## Common Commands

### Development Setup
```bash
# Node.js setup
npm install
npm run dev

# Python setup  
pip install -r requirements.txt
python -m uvicorn main:app --reload

# Run tests
npm test
# or
pytest

# Build for production
npm run build

# Lint and type check
npm run lint
npm run typecheck
```

## Core System Architecture

### Processing Pipeline (5-stage workflow)
1. **Ingestion**: Input validation, API key management, settings
2. **Dream 100 Generation**: Expand seed keywords into 100 head terms
3. **Universe Expansion**: Generate tier-2 (10 per Dream) and tier-3 (10 per tier-2) keywords
4. **Clustering & Scoring**: Semantic clustering with embeddings, blended scoring
5. **Editorial Roadmap**: Schedule 10-30 posts/month with assignments and CSV export

### Data Models
- **Keyword**: stage (dream100|tier2|tier3), volume, difficulty, intent, relevance, score
- **Cluster**: label, members, score, intent_mix, size
- **Competitor**: domain, titles, urls
- **Run**: metadata, settings, api_usage, timestamps
- **RoadmapItem**: post_id, cluster, keywords, DRI, due_date, title

### Scoring Formula (stage-specific weights)
- **Dream 100**: 0.40×Volume + 0.30×Intent + 0.15×Relevance + 0.10×Trend + 0.05×Ease
- **Tier-2**: 0.35×Volume + 0.25×Ease + 0.20×Relevance + 0.15×Intent + 0.05×Trend  
- **Tier-3**: 0.35×Ease + 0.30×Relevance + 0.20×Volume + 0.10×Intent + 0.05×Trend

## Key Performance Requirements

- **Pipeline Performance**: 10k keywords processed in ≤20 minutes (P95)
- **Data Quality**: >85% topical relevance (human spot-check)
- **Cost Control**: <$2 per 1k keywords discovered
- **Uptime**: ≥99.5% availability with <1% API error rate
- **Capacity**: Hard cap at 10,000 keywords per run

## API Integration Guidelines

### Ahrefs Integration
- Store API keys encrypted at rest
- Implement token bucket rate limiting with exponential backoff
- Cache metrics for 30 days to reduce costs
- Batch requests where possible: (keyword, market) → (volume, KD, CPC, SERP data)

### Anthropic Integration  
- Use for Dream 100 expansion, intent classification, title generation
- Keep temperature low (0.1-0.3) for classification tasks
- Implement circuit breaker for graceful degradation
- Queue requests with retry logic

### Scraping Compliance
- Respect robots.txt and crawl-delay directives
- Use 0.5-1 req/sec/domain with jitter
- Identify as crawler in User-Agent
- Store only titles/URLs, no full content
- Implement CAPTCHA/block fallbacks

## File Organization

```
/
├── src/
│   ├── services/          # Core business logic
│   │   ├── ingestion.ts   # Input validation, settings
│   │   ├── expansion.ts   # Dream 100, tier expansion
│   │   ├── enrichment.ts  # Ahrefs metrics fetching
│   │   ├── scraping.ts    # Competitor title extraction
│   │   ├── clustering.ts  # Semantic clustering
│   │   ├── scoring.ts     # Multi-stage scoring
│   │   └── roadmap.ts     # Editorial calendar generation
│   ├── integrations/      # External API clients
│   │   ├── ahrefs.ts
│   │   ├── anthropic.ts
│   │   └── scraper.ts
│   ├── models/           # Data models and schemas
│   ├── utils/            # Shared utilities
│   └── workers/          # Background job processors
├── frontend/
│   ├── components/       # React components
│   │   ├── Input.tsx     # Seed keyword input
│   │   ├── Dream100.tsx  # Head terms review
│   │   ├── Universe.tsx  # 3-tier keyword tree
│   │   ├── Clusters.tsx  # Semantic cluster editor
│   │   └── Roadmap.tsx   # Editorial calendar
│   └── pages/           # Main application screens
├── tests/               # Unit and integration tests
├── config/              # Environment-specific settings
├── scripts/             # Build and deployment
└── docs/               # Additional documentation
```

## CSV Export Schemas

### Editorial Roadmap Columns
post_id, cluster_label, stage, primary_keyword, secondary_keywords, intent, volume, difficulty, blended_score, quick_win, suggested_title, DRI, due_date, notes, source_urls, run_id

### Keyword Universe Columns  
keyword, tier, cluster_label, volume, difficulty, intent, relevance, trend, blended_score, quick_win, canonical_keyword, top_serp_urls

## Development Best Practices

- **Caching**: Implement aggressive caching for API responses (30-day TTL)
- **Rate Limiting**: Use token bucket algorithm with jitter for external APIs
- **Error Handling**: Implement circuit breaker pattern for API failures
- **Security**: Encrypt API keys at rest, mask in logs and UI
- **Monitoring**: Track API usage, costs, pipeline performance, data quality
- **Testing**: Focus on integration tests for API workflows and scoring accuracy

## Quick Win Detection

Flag keywords where:
- Ease (1-KD normalized) ≥ 0.7 
- Volume ≥ median volume in cluster
- Show 10% rank boost in UI (configurable)

## Compliance & Privacy

- US data residency required
- No PII collection beyond account login
- 90-day default retention for runs and artifacts
- User-initiated deletion supported
- Audit logs for admin actions
- Adherence to Ahrefs and Anthropic ToS