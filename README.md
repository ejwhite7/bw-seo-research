# Dream 100 Keyword Engine

AI-powered keyword research and editorial roadmap generation platform. Transform seed keywords into comprehensive content strategies with semantic clustering and automated editorial calendar generation.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat&logo=typescript)](https://typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

## Features

- **5-Step Workflow**: Input → Dream 100 → Universe Expansion → Clusters → Editorial Roadmap
- **AI-Powered Expansion**: Uses Claude 3.5 Sonnet to generate semantically related keywords
- **Semantic Clustering**: Groups keywords by topic using embeddings
- **Editorial Calendar**: Generates content schedules with AI-suggested titles
- **CSV Export**: Export data at any step for use in other tools
- **Flexible Deployment**: Works with minimal config (just Anthropic API key)

## Quick Start

### Prerequisites

- Node.js 18+
- Anthropic API key ([get one here](https://console.anthropic.com/))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/dream-100-keyword-engine.git
cd dream-100-keyword-engine

# Install dependencies
npm install

# Set up environment variables
# Create .env.local with at minimum:
# ANTHROPIC_API_KEY=your-api-key

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Configuration

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude AI |

### Recommended

| Variable | Description |
|----------|-------------|
| `DATAFORSEO_LOGIN` | DataForSEO email ([get credentials](https://dataforseo.com/)) |
| `DATAFORSEO_PASSWORD` | DataForSEO password |

DataForSEO provides keyword volume, difficulty, and CPC data at **~$0.002 per keyword** (pay-per-use). This is significantly more affordable than Ahrefs Enterprise ($14,990/year).

### Optional

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_MODEL` | Model to use (default: `claude-3-5-sonnet-20241022`) |
| `OPENAI_API_KEY` | For semantic clustering with embeddings |
| `AHREFS_API_KEY` | Alternative keyword data (requires Enterprise plan) |
| `REDIS_URL` | For API response caching |
| `SENTRY_DSN` | For error monitoring |

See [docs/env-example.md](docs/env-example.md) for full configuration options.

## How It Works

### 1. Seed Input
Enter 1-5 seed keywords (e.g., "social selling", "B2B marketing")

### 2. Dream 100 Generation
AI generates 100 high-value head terms related to your seeds, enriched with:
- Search volume and difficulty (if Ahrefs configured)
- Search intent classification
- Relevance scoring

### 3. Universe Expansion
Each Dream 100 keyword expands into:
- 10 Tier-2 mid-tail keywords (1,000 total)
- 10 Tier-3 long-tail keywords per Tier-2 (9,000 total)

### 4. Semantic Clustering
Keywords are grouped by topic using:
- Embedding-based similarity
- Intent distribution analysis
- Priority scoring

### 5. Editorial Roadmap
Generate a content calendar with:
- Pillar pages and supporting posts
- AI-suggested titles
- Publishing schedule
- CSV export for execution

## Deployment

### Vercel (Recommended)

1. Fork this repository
2. Import to Vercel
3. Add environment variables
4. Deploy

### Self-Hosted

```bash
npm run build
npm start
```

## Development

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run linter
npm run type-check   # TypeScript checking
npm test             # Run tests
```

## Project Structure

```
src/
├── app/                 # Next.js App Router
│   ├── api/            # API routes
│   │   ├── expansion/  # Dream 100 & Universe APIs
│   │   ├── clustering/ # Semantic clustering API
│   │   └── health/     # Health check
│   └── page.tsx        # Main UI
├── services/           # Business logic
│   ├── expansion.ts    # Dream 100 generation
│   ├── universe.ts     # Universe expansion
│   └── clustering.ts   # Semantic clustering
├── integrations/       # External API clients
│   ├── anthropic.ts    # Claude AI
│   ├── dataforseo.ts   # Keyword data (recommended)
│   ├── ahrefs.ts       # Keyword data (alternative)
│   └── scraper.ts      # Web scraping
└── models/             # TypeScript types
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request
