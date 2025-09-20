# Vercel Deployment Guide - Dream 100 Keyword Engine

This guide covers the complete setup and deployment of the Dream 100 Keyword Engine to Vercel with production-ready configuration.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Environment Configuration](#environment-configuration)
- [Deployment Process](#deployment-process)
- [Post-Deployment](#post-deployment)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)
- [Performance Optimization](#performance-optimization)

## Prerequisites

### Required Accounts & Services

1. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository** - Code must be in a GitHub repository
3. **Supabase Project** - Database and authentication
4. **External API Keys**:
   - Ahrefs API key (for SEO data)
   - Anthropic API key (for AI features)
5. **Optional Services**:
   - Sentry account (error tracking)
   - Slack webhook (notifications)
   - PostHog account (analytics)

### Local Development Tools

```bash
# Install Vercel CLI
npm install -g vercel

# Verify installation
vercel --version
```

## Initial Setup

### 1. Connect GitHub Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import from GitHub and select your repository
4. Configure project settings:
   - **Project Name**: `dream100-keyword-engine`
   - **Framework**: Next.js (auto-detected)
   - **Root Directory**: `./` (if in root)

### 2. Configure Build Settings

```bash
# Build Command (usually auto-detected)
npm run build

# Output Directory
.next

# Install Command
npm ci

# Development Command
npm run dev
```

### 3. Environment Variables Setup

In Vercel Dashboard → Project → Settings → Environment Variables, add:

#### Required Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Security Keys
DATABASE_ENCRYPTION_KEY=your-32char-encryption-key
JWT_SECRET=your-jwt-secret
NEXTAUTH_SECRET=your-nextauth-secret

# External API Keys
AHREFS_API_KEY=your-ahrefs-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# Redis Configuration
REDIS_URL=redis://username:password@host:port
# OR individual settings:
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

#### Optional Variables

```bash
# Monitoring
SENTRY_DSN=your-sentry-dsn
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=dream100-keyword-engine

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key

# Notifications
SLACK_WEBHOOK_URL=your-slack-webhook-url

# Cron Security
CRON_SECRET=your-cron-secret
```

### 4. Domain Configuration

#### Production Domain
```bash
# Add custom domain in Vercel Dashboard
# Settings → Domains → Add Domain
dream100.ollisocial.com
```

#### Staging Domain
```bash
# Staging uses Vercel's generated URLs
staging-dream100-keyword-engine.vercel.app
```

## Environment Configuration

### Production Environment (.env.production)

Use the provided `.env.production` template:

```bash
# Copy template and fill in real values
cp .env.production .env.production.local

# Edit with your production values
nano .env.production.local
```

### Staging Environment (.env.staging)

Use the provided `.env.staging` template:

```bash
# Copy template and fill in staging values
cp .env.staging .env.staging.local

# Edit with your staging values
nano .env.staging.local
```

### Environment-Specific Settings

| Setting | Production | Staging | Description |
|---------|------------|---------|-------------|
| Node Environment | `production` | `staging` | Runtime environment |
| Cache TTL | Long (hours/days) | Short (minutes) | Cache expiration |
| Rate Limits | Strict | Relaxed | API rate limiting |
| Logging | Error/Warn only | Debug enabled | Log verbosity |
| Error Tracking | Full reporting | Full reporting | Sentry integration |
| Analytics | Enabled | Enabled | Usage analytics |

## Deployment Process

### Automated Deployment (Recommended)

#### 1. GitHub Integration

Vercel automatically deploys when code is pushed:

- **Production**: Pushes to `main` branch
- **Preview**: Pushes to feature branches

#### 2. Using the Deployment Script

```bash
# Deploy to production
./scripts/deploy-vercel.sh production

# Deploy to staging
./scripts/deploy-vercel.sh staging

# Deploy as preview
./scripts/deploy-vercel.sh preview
```

### Manual Deployment

#### 1. Production Deployment

```bash
# Deploy to production
vercel --prod --project dream100-keyword-engine

# Or with specific configuration
vercel --prod --project dream100-keyword-engine --meta branch=main
```

#### 2. Preview/Staging Deployment

```bash
# Deploy to preview
vercel --project dream100-keyword-engine

# Deploy specific branch
vercel --project dream100-keyword-engine --meta branch=feature/new-ui
```

### Build Process

#### Build Optimization

The build process includes:

1. **TypeScript Compilation** - Type checking and compilation
2. **ESLint** - Code quality checks
3. **Bundle Optimization** - Code splitting and minification
4. **Asset Optimization** - Image and static asset optimization
5. **Source Maps** - Generated for debugging (production)
6. **Sentry Integration** - Error tracking setup

#### Build Commands

```bash
# Local build (matches Vercel)
npm run build

# Build with bundle analysis
ANALYZE=true npm run build

# Type check only
npm run type-check

# Lint check
npm run lint
```

## Post-Deployment

### 1. Health Check Verification

```bash
# Check health endpoint
curl https://dream100.ollisocial.com/api/health

# Detailed health check
curl https://dream100.ollisocial.com/api/health?detailed=true

# Simple uptime check
curl -I https://dream100.ollisocial.com/health
```

### 2. Functionality Testing

#### Core Features Test
```bash
# Test API endpoints
curl -X POST https://dream100.ollisocial.com/api/dream100 \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["keyword research"]}'

# Test export functionality
curl https://dream100.ollisocial.com/api/export/test
```

#### Performance Testing
```bash
# Test page load times
curl -w "@curl-format.txt" -o /dev/null -s https://dream100.ollisocial.com/

# Test API response times
time curl https://dream100.ollisocial.com/api/health
```

### 3. Cron Job Verification

```bash
# Test cache warming
curl https://dream100.ollisocial.com/api/cron/cache-warm

# Test cleanup
curl https://dream100.ollisocial.com/api/cron/cleanup

# Test health monitoring
curl https://dream100.ollisocial.com/api/cron/health-check
```

## Monitoring & Maintenance

### 1. Vercel Analytics

- **Speed Insights**: Automatic performance monitoring
- **Web Vitals**: Core web vitals tracking
- **Function Logs**: Serverless function monitoring

### 2. Custom Monitoring

#### Health Monitoring
```bash
# Set up external monitoring (e.g., UptimeRobot)
GET https://dream100.ollisocial.com/health
Expected: 200 OK
Interval: 5 minutes
```

#### Performance Monitoring
```bash
# Monitor key metrics
- Response time < 2s
- Uptime > 99.5%
- Error rate < 1%
- Memory usage < 80%
```

### 3. Error Tracking

#### Sentry Integration
```javascript
// Errors are automatically tracked
// View in Sentry dashboard:
// https://sentry.io/organizations/your-org/issues/
```

#### Log Monitoring
```bash
# View Vercel function logs
vercel logs --project dream100-keyword-engine

# Filter by function
vercel logs --project dream100-keyword-engine --since 1h
```

### 4. Cost Monitoring

#### Vercel Usage
- **Functions**: Monitor execution time and invocations
- **Bandwidth**: Track data transfer
- **Build Time**: Monitor build duration

#### External API Costs
- **Anthropic**: Token usage monitoring
- **Ahrefs**: API call tracking
- **Supabase**: Database usage monitoring

## Troubleshooting

### Common Issues

#### 1. Build Failures

```bash
# Issue: TypeScript errors
# Solution: Fix type errors locally first
npm run type-check

# Issue: ESLint errors
# Solution: Fix linting issues
npm run lint -- --fix

# Issue: Out of memory during build
# Solution: Increase Node memory
export NODE_OPTIONS="--max-old-space-size=4096"
```

#### 2. Runtime Errors

```bash
# Issue: Environment variables not loaded
# Check: Vercel environment variables are set correctly
# Solution: Redeploy after setting variables

# Issue: Database connection failures
# Check: Supabase URL and keys are correct
# Check: Database is accessible from Vercel

# Issue: External API failures
# Check: API keys are valid and have sufficient quota
# Check: API endpoints are accessible
```

#### 3. Performance Issues

```bash
# Issue: Slow response times
# Check: Database query performance
# Check: External API response times
# Check: Caching configuration

# Issue: High memory usage
# Check: Memory leaks in code
# Check: Large object caching
# Solution: Optimize data structures and caching
```

#### 4. Cron Job Issues

```bash
# Issue: Cron jobs not executing
# Check: Vercel cron configuration in vercel.json
# Check: Cron secret authentication

# Issue: Cron jobs timing out
# Solution: Optimize cron job performance
# Solution: Increase function timeout in vercel.json
```

### Debug Tools

#### Local Debugging
```bash
# Run production build locally
npm run build && npm run start

# Debug with Vercel CLI
vercel dev --debug

# Analyze bundle size
ANALYZE=true npm run build
```

#### Production Debugging
```bash
# View real-time logs
vercel logs --follow --project dream100-keyword-engine

# Download deployment
vercel pull --environment=production

# Check environment variables
vercel env ls --project dream100-keyword-engine
```

## Performance Optimization

### 1. Build Optimization

#### Bundle Size Reduction
```javascript
// Use dynamic imports for large components
const HeavyComponent = dynamic(() => import('./HeavyComponent'));

// Tree-shake unused exports
export { specificFunction } from './utils';

// Optimize images
import Image from 'next/image';
```

#### Caching Strategy
```javascript
// API route caching
export const revalidate = 3600; // 1 hour

// Static generation
export const generateStaticParams = async () => {
  // Pre-generate popular pages
};
```

### 2. Runtime Optimization

#### Database Optimization
```sql
-- Add indexes for frequent queries
CREATE INDEX idx_keywords_volume ON keywords(search_volume);
CREATE INDEX idx_runs_created_at ON runs(created_at);
```

#### Redis Optimization
```javascript
// Connection pooling
const redis = new Redis({
  host: process.env.REDIS_HOST,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000
});
```

### 3. CDN and Edge Optimization

#### Static Asset Optimization
- **Images**: WebP/AVIF format with Next.js Image component
- **Fonts**: Self-hosted with font-display: swap
- **JavaScript**: Code splitting and lazy loading
- **CSS**: Critical CSS inlining

#### Edge Functions
```javascript
// Use edge runtime for fast responses
export const runtime = 'edge';

export async function GET(request) {
  // Lightweight processing at the edge
}
```

### 4. Monitoring Performance

#### Core Web Vitals
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1
- **FCP** (First Contentful Paint): < 1.8s
- **TTFB** (Time to First Byte): < 600ms

#### Custom Metrics
```javascript
// Track custom performance metrics
performance.mark('api-start');
// ... API call
performance.mark('api-end');
performance.measure('api-duration', 'api-start', 'api-end');
```

## Security Considerations

### 1. Environment Variables

- Store sensitive data in Vercel environment variables
- Never commit API keys to version control
- Use different keys for production and staging
- Rotate API keys regularly

### 2. API Security

```javascript
// Rate limiting
import { rateLimit } from '@/utils/rate-limit';

// Input validation
import { z } from 'zod';
const schema = z.object({
  keywords: z.array(z.string().min(1).max(100))
});

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://dream100.ollisocial.com']
};
```

### 3. Content Security Policy

Configured in `next.config.ts`:

```javascript
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.vercel-insights.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.anthropic.com https://apiv2.ahrefs.com;
`;
```

## Backup and Recovery

### 1. Database Backups

```bash
# Supabase automatic backups (Pro plan)
# Manual backup export
supabase db dump --db-url your-db-url > backup-$(date +%Y%m%d).sql
```

### 2. Configuration Backup

```bash
# Export Vercel project configuration
vercel pull --environment=production
vercel pull --environment=staging

# Backup environment variables
vercel env ls > env-backup-$(date +%Y%m%d).txt
```

### 3. Recovery Procedures

1. **Database Recovery**: Restore from Supabase backup
2. **Configuration Recovery**: Re-import environment variables
3. **Code Recovery**: Rollback to previous deployment
4. **DNS Recovery**: Update DNS records if needed

## Conclusion

This deployment guide provides comprehensive instructions for deploying the Dream 100 Keyword Engine to Vercel with production-ready configuration. Follow the steps carefully and monitor the application post-deployment to ensure optimal performance and reliability.

For additional support:
- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Project Repository**: [GitHub Issues](https://github.com/your-org/keyword-tool/issues)
