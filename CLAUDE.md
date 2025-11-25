# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

Dream 100 Keyword Engine - AI-powered keyword research and editorial roadmap platform.

**Core Workflow**: Input → Dream 100 → Universe → Clusters → Roadmap → CSV Export

## Tech Stack

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript 5, Tailwind CSS 4
- **AI**: Anthropic Claude 3.5 Sonnet for expansion and title generation
- **Clustering**: OpenAI embeddings for semantic grouping
- **Data**: Ahrefs API for keyword metrics (optional)
- **Database**: Supabase (optional)
- **Caching**: Redis (optional)

## Key Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run type-check   # TypeScript validation
npm run lint         # ESLint
npm test             # Run tests
```

## Architecture

### API Routes (`src/app/api/`)

| Route | Purpose |
|-------|---------|
| `/api/expansion/dream100` | Generate Dream 100 keywords |
| `/api/expansion/universe` | Expand to Tier 2/3 keywords |
| `/api/clustering/semantic` | Cluster keywords by topic |
| `/api/providers/status` | Check configured providers |
| `/api/health` | Health check |

### Services (`src/services/`)

| Service | Purpose |
|---------|---------|
| `expansion.ts` | Dream 100 generation with Anthropic |
| `universe.ts` | Tier 2/3 expansion |
| `clustering.ts` | Semantic clustering |

### Integrations (`src/integrations/`)

| Integration | Purpose |
|-------------|---------|
| `anthropic.ts` | Claude AI client |
| `ahrefs.ts` | Keyword metrics |
| `keyword-provider.ts` | Unified keyword data interface |

## Data Models

- **Keyword**: stage (dream100|tier2|tier3), volume, difficulty, intent, scores
- **Cluster**: label, keywords, intentMix, priority
- **RoadmapItem**: cluster, keywords, title, dueDate, DRI

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - Claude AI access

Optional:
- `ANTHROPIC_MODEL` - Model name (default: claude-3-5-sonnet-20241022)
- `OPENAI_API_KEY` - For clustering embeddings
- `AHREFS_API_KEY` - For keyword metrics
- `REDIS_URL` - For caching

## Important Notes

1. **Mock Mode**: Without Ahrefs, keywords get placeholder metrics (volume: 0)
2. **Clustering**: Requires OpenAI for real embeddings, falls back to mock clusters
3. **Timeouts**: Anthropic requests have 10-minute timeout for large expansions
4. **Exports**: CSV exports use comma-delimited keywords in list fields
