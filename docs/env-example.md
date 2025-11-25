# Environment Configuration

Copy the content below into `.env.local` in your project root.

```bash
# =====================================================
# Dream 100 Keyword Engine - Environment Configuration
# =====================================================

# ---------------------
# REQUIRED: AI Provider Selection
# ---------------------
# Choose your LLM provider: anthropic, openai, or gemini
# Defaults to 'anthropic' if not specified
LLM_PROVIDER=anthropic

# ---------------------
# Anthropic Configuration (if LLM_PROVIDER=anthropic)
# ---------------------
# Anthropic API for LLM-powered keyword expansion and content generation
# Get yours at: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...

# Model to use (optional, defaults to claude-3-5-sonnet-20241022)
# Available models: claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-haiku-20240307
# ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# ---------------------
# OpenAI Configuration (if LLM_PROVIDER=openai)
# ---------------------
# OpenAI API for LLM-powered keyword expansion
# Get yours at: https://platform.openai.com/
# OPENAI_API_KEY=sk-...

# Model to use (optional, defaults to gpt-4-turbo-preview)
# Available models: gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo
# OPENAI_MODEL=gpt-4-turbo-preview

# ---------------------
# Google Gemini Configuration (if LLM_PROVIDER=gemini)
# ---------------------
# Google Gemini API for LLM-powered keyword expansion
# Get yours at: https://ai.google.dev/
# GEMINI_API_KEY=your-api-key

# Model to use (optional, defaults to gemini-1.5-pro)
# Available models: gemini-1.5-pro, gemini-1.5-flash, gemini-pro
# GEMINI_MODEL=gemini-1.5-pro

# ---------------------
# RECOMMENDED: Keyword Data Provider
# ---------------------
# DataForSEO is the recommended provider (~$0.002 per keyword)
# Much more affordable than Ahrefs Enterprise ($14,990/year)
# Get credentials at: https://dataforseo.com/
DATAFORSEO_LOGIN=your-email@example.com
DATAFORSEO_PASSWORD=your-password

# ---------------------
# OPTIONAL: Alternative Keyword Provider
# ---------------------
# Ahrefs API (requires Enterprise plan for Keywords Explorer)
# Only needed if you have an existing Ahrefs Enterprise subscription
# Get yours at: https://ahrefs.com/api
# AHREFS_API_KEY=...

# ---------------------
# NOTE: OpenAI Embeddings
# ---------------------
# The OPENAI_API_KEY above can also be used for semantic clustering
# If you're using OpenAI as your LLM provider, the same key is used for both

# ---------------------
# OPTIONAL: Database (Supabase)
# ---------------------
# For persisting projects and results
# Get yours at: https://supabase.com/
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...

# ---------------------
# OPTIONAL: Caching (Redis)
# ---------------------
# Improves performance by caching API responses
# Get free Redis at: https://upstash.com/ or https://redis.io/cloud
# REDIS_URL=redis://...

# ---------------------
# OPTIONAL: Error Tracking (Sentry)
# ---------------------
# For production error monitoring
# Get yours at: https://sentry.io/
# SENTRY_DSN=https://...

# ---------------------
# OPTIONAL: Web Scraping
# ---------------------
# For competitor keyword mining (optional feature)
# Get yours at: https://firecrawl.dev/
# FIRECRAWL_API_KEY=fc-...

# ---------------------
# Development Flags
# ---------------------
# MOCK_EXTERNAL_APIS=false  # Set to true to use mock data during development
```

## Provider Comparison

| Provider | Cost | Data Quality | Notes |
|----------|------|--------------|-------|
| **DataForSEO** | ~$0.002/keyword | High (Google Ads data) | **Recommended** - Pay-per-use, no minimum |
| Ahrefs | ~$14,990/year | High | Requires Enterprise plan for API keyword data |
| Mock Data | Free | Demo only | Used when no provider is configured |

## Getting Started

1. **Minimum setup** (AI-powered mode with mock keyword data):
   - `LLM_PROVIDER=anthropic` (or `openai` or `gemini`)
   - `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` or `GEMINI_API_KEY` depending on provider)

2. **Recommended setup** (Full functionality):
   - `LLM_PROVIDER=anthropic` (or your preferred provider)
   - Provider-specific API key (e.g., `ANTHROPIC_API_KEY`)
   - `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`

3. **Production setup**:
   - All of the above
   - `OPENAI_API_KEY` (for semantic clustering, if not using OpenAI as LLM provider)
   - `REDIS_URL` (for caching)
   - `SENTRY_DSN` (for error monitoring)

## LLM Provider Selection

Choose your LLM provider by setting the `LLM_PROVIDER` environment variable:

- **anthropic** (default): Claude models from Anthropic
  - Requires: `ANTHROPIC_API_KEY`
  - Optional: `ANTHROPIC_MODEL` (default: `claude-3-5-sonnet-20241022`)

- **openai**: GPT models from OpenAI
  - Requires: `OPENAI_API_KEY`
  - Optional: `OPENAI_MODEL` (default: `gpt-4-turbo-preview`)

- **gemini**: Gemini models from Google
  - Requires: `GEMINI_API_KEY`
  - Optional: `GEMINI_MODEL` (default: `gemini-pro`)
