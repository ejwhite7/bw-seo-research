# Dream 100 Keyword Engine - Monitoring System

Comprehensive monitoring, observability, and analytics system for the Dream 100 Keyword Engine.

## Overview

This monitoring system provides:

- **Error Tracking**: Comprehensive error capture with Sentry integration
- **Performance Monitoring**: Core Web Vitals, API latency, and resource utilization
- **Business Metrics**: User activity, feature usage, and conversion tracking
- **Alerting**: Intelligent alerting with multiple notification channels
- **Health Monitoring**: Service health checks and dependency monitoring
- **SLO Management**: Service Level Objectives and error budget tracking
- **Cost Tracking**: API cost monitoring and budget management
- **User Analytics**: User behavior and activity analysis
- **Observability**: Distributed tracing and structured logging
- **Dashboards**: Real-time monitoring dashboards

## Quick Start

### 1. Initialize Monitoring

```typescript
import { initializeMonitoring } from '@/lib/monitoring';

// Initialize with default configuration
const monitoring = initializeMonitoring();

// Or with custom configuration
const monitoring = initializeMonitoring({
  environment: 'production',
  enabled: true,
  sentry: {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1
  },
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: '#alerts'
      }
    }
  }
});
```

### 2. Frontend Integration

```typescript
import { initializeFrontendMonitoring, useUserActivityTracking } from '@/lib/monitoring/utils/frontend-helpers';

// Initialize in your app
function App() {
  useEffect(() => {
    initializeFrontendMonitoring('user-123');
  }, []);
  
  return <YourApp />;
}

// Track user interactions
function MyComponent() {
  const { trackClick, trackFeatureUsage } = useUserActivityTracking('user-123');
  
  const handleButtonClick = () => {
    trackClick('export-button', { format: 'csv' });
    trackFeatureUsage('export', { format: 'csv', recordCount: 1000 });
  };
  
  return <button onClick={handleButtonClick}>Export CSV</button>;
}
```

### 3. Backend Integration

```typescript
import { trackError, trackPerformance, trackCost } from '@/lib/monitoring';

// Track API performance
export async function handler(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const result = await processKeywords(req.body);
    
    // Track performance
    trackPerformance('keyword_processing', Date.now() - startTime, {
      keywordCount: result.keywords.length,
      stage: 'dream100'
    });
    
    // Track API costs
    trackCost('ahrefs', 'keyword_lookup', result.apiCost);
    
    return NextResponse.json(result);
  } catch (error) {
    // Track errors
    trackError(error, {
      endpoint: '/api/keywords/process',
      userId: req.headers.get('user-id')
    });
    
    throw error;
  }
}
```

## Core Components

### Error Tracker

Captures and categorizes errors with intelligent deduplication:

```typescript
// Capture errors
monitoring.errorTracker.captureError(error, context, user);
monitoring.errorTracker.captureMessage('Custom message', 'warning');

// Get error statistics
const errorStats = monitoring.errorTracker.getErrorStats();
console.log(errorStats.total, errorStats.bySeverity);
```

### Performance Monitor

Tracks application and infrastructure performance:

```typescript
// Record performance metrics
monitoring.performanceMonitor.recordMetric({
  operation: 'keyword_clustering',
  duration: 2500,
  timestamp: new Date(),
  success: true,
  metadata: { algorithm: 'kmeans', clusters: 15 }
});

// Track API calls
monitoring.performanceMonitor.recordAPIMetric({
  endpoint: '/api/ahrefs/keywords',
  method: 'POST',
  statusCode: 200,
  responseTime: 1200,
  timestamp: new Date()
});
```

### Business Metrics

Track business-critical metrics and user behavior:

```typescript
// Track keyword processing
monitoring.businessMetrics.trackKeywordProcessing(
  'dream100',
  100,
  5000,
  0.95,
  'run-123',
  'user-456',
  0.87
);

// Track feature usage
monitoring.businessMetrics.trackFeatureUsage(
  'keyword-export',
  'user-456',
  'session-789'
);

// Track conversions
monitoring.businessMetrics.trackConversion(
  'csv_export',
  1,
  'user-456',
  'session-789',
  { format: 'csv', records: 1000 }
);
```

### Alert Manager

Intelligent alerting with multiple notification channels:

```typescript
// Create alert rules
monitoring.alertManager.addRule({
  id: 'high-error-rate',
  name: 'High Error Rate',
  metric: 'error_rate',
  condition: 'gt',
  threshold: 0.1,
  severity: 'critical',
  enabled: true,
  cooldown: 15,
  channels: [
    { type: 'slack', config: {}, enabled: true },
    { type: 'email', config: {}, enabled: true }
  ]
});

// Trigger manual alerts
const alertId = monitoring.alertManager.triggerAlert({
  type: 'custom',
  severity: 'warning',
  message: 'Custom alert triggered',
  metadata: { source: 'manual' }
});

// Resolve alerts
monitoring.alertManager.resolveAlert(alertId, 'Issue resolved');
```

### Health Monitor

Monitor service health and dependencies:

```typescript
// Add custom health checks
monitoring.healthMonitor.addHealthCheck({
  name: 'custom-service',
  check: async () => {
    // Your health check logic
    const isHealthy = await checkServiceHealth();
    return {
      healthy: isHealthy,
      details: { status: 'operational' }
    };
  },
  timeout: 5000,
  interval: 30000,
  retries: 3
});

// Get health status
const health = monitoring.healthMonitor.getHealthStatus();
console.log(health.overall, health.services);
```

### SLO Manager

Track Service Level Objectives and error budgets:

```typescript
// Add SLO targets
monitoring.sloManager.addTarget({
  service: 'keyword-api',
  metric: 'availability',
  target: 99.9,
  window: '30d',
  errorBudget: 0.1,
  alertThreshold: 0.05
});

// Record SLO metrics
monitoring.sloManager.recordMetric('keyword-api', 'availability', 1);

// Get SLO status
const sloStatus = monitoring.sloManager.getSLOStatus();
console.log(sloStatus.map(s => ({ 
  service: s.target.service, 
  current: s.currentValue, 
  target: s.target.target 
})));
```

### Cost Tracker

Monitor API costs and budget usage:

```typescript
// Set budgets
monitoring.costTracker.setBudget('ahrefs', {
  service: 'ahrefs',
  dailyLimit: 50,
  monthlyLimit: 1000,
  currency: 'USD',
  alertThresholds: [0.75, 0.9]
});

// Record costs
monitoring.costTracker.recordCost(
  'ahrefs',
  'keyword_lookup',
  0.25,
  'USD',
  { keywords: 100, userId: 'user-123' }
);

// Get cost summary
const costs = monitoring.costTracker.getCostSummary();
console.log(costs.map(c => ({ 
  service: c.service, 
  daily: c.daily.cost, 
  monthly: c.monthly.cost 
})));
```

### User Activity Tracker

Track user behavior and engagement:

```typescript
// Start session
const sessionId = monitoring.userActivityTracker.startSession(
  'user-123', 
  undefined, 
  { source: 'web', device: 'desktop' }
);

// Track activities
monitoring.userActivityTracker.trackActivity(
  'user-123',
  sessionId,
  'keyword_search',
  'search',
  { query: 'SEO tools', results: 25 }
);

// End session
monitoring.userActivityTracker.endSession(sessionId);

// Get user insights
const insights = monitoring.userActivityTracker.getUserBehaviorInsights('user-123');
console.log(insights.engagementScore, insights.peakHours);
```

### Observability

Distributed tracing and structured logging:

```typescript
// Start trace
const { traceId, span } = monitoring.observability.startTrace(
  'keyword_processing_pipeline'
);

// Add spans
const { spanId } = monitoring.observability.startSpan(
  traceId,
  'dream100_generation',
  undefined,
  { algorithm: 'gpt-4' }
);

// Log events
monitoring.observability.addSpanLog(
  traceId,
  spanId,
  'info',
  'Generated 100 keywords',
  { count: 100, quality: 0.95 }
);

// Finish spans
monitoring.observability.finishSpan(traceId, spanId);
monitoring.observability.finishSpan(traceId, traceId);
```

### Dashboard

Real-time monitoring dashboards:

```typescript
// Get dashboard data
const dashboardData = await monitoring.dashboard.getDashboardData(
  'system-health',
  { from: '1h', to: 'now' }
);

// Subscribe to real-time updates
const unsubscribe = monitoring.dashboard.subscribeToUpdates(
  'system-health',
  (data) => {
    console.log('Dashboard updated:', data);
  }
);

// Cleanup
unsubscribe();
```

## API Endpoints

### Metrics API

```bash
# Send metrics
POST /api/monitoring/metrics
{
  "type": "web-vitals",
  "data": { "lcp": 1200, "path": "/dashboard" },
  "userId": "user-123"
}

# Get metrics
GET /api/monitoring/metrics?type=performance&timeRange=3600000
```

### Dashboard API

```bash
# Get dashboard
GET /api/monitoring/dashboard?dashboard=system-health&timeRange=1h

# List dashboards
POST /api/monitoring/dashboard
{ "action": "list" }
```

### Alerts API

```bash
# Get alerts
GET /api/monitoring/alerts?severity=critical&active=true

# Create alert rule
POST /api/monitoring/alerts
{
  "action": "create",
  "alertRule": {
    "name": "High Error Rate",
    "metric": "error_rate",
    "condition": "gt",
    "threshold": 0.1,
    "severity": "critical"
  }
}

# Resolve alert
POST /api/monitoring/alerts
{ "action": "resolve", "alertId": "alert-123" }
```

## Configuration

### Environment Variables

```bash
# Sentry
SENTRY_DSN=https://your-sentry-dsn

# Slack Alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
SLACK_CHANNEL=#alerts

# Email Alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=alerts@company.com
SMTP_PASSWORD=your-password
ALERT_EMAIL_FROM=alerts@company.com
ALERT_EMAIL_TO=team@company.com,oncall@company.com

# PagerDuty
PAGERDUTY_INTEGRATION_KEY=your-integration-key
```

### Custom Configuration

```typescript
const customConfig: Partial<MonitoringConfig> = {
  enabled: true,
  environment: 'production',
  
  sentry: {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    debug: false
  },
  
  performance: {
    enableWebVitals: true,
    enableResourceTiming: true,
    slowThreshold: 2000,
    verySlowThreshold: 5000
  },
  
  businessMetrics: {
    enableUserTracking: true,
    enableCostTracking: true,
    batchSize: 100,
    flushInterval: 10000
  },
  
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL!,
        channel: '#alerts'
      }
    }
  },
  
  retention: {
    metrics: 30,
    logs: 7,
    traces: 3,
    errors: 90
  }
};

const monitoring = initializeMonitoring(customConfig);
```

## Best Practices

### 1. Error Handling

- Use structured error messages
- Include relevant context
- Avoid sensitive data in error messages
- Implement proper error boundaries

### 2. Performance Monitoring

- Track critical user journeys
- Monitor Core Web Vitals
- Set appropriate performance budgets
- Use synthetic monitoring for key flows

### 3. Alerting

- Start with fewer, high-quality alerts
- Use appropriate severity levels
- Implement alert escalation
- Review and tune alert thresholds regularly

### 4. Business Metrics

- Track leading indicators
- Focus on user value metrics
- Monitor conversion funnels
- Segment metrics by user cohorts

### 5. Cost Management

- Set realistic budgets
- Monitor cost per user/action
- Implement cost alerts
- Optimize expensive operations

## Troubleshooting

### Common Issues

1. **Monitoring not initializing**
   - Check configuration validation
   - Verify environment variables
   - Review console errors

2. **Missing metrics**
   - Verify tracking calls
   - Check network requests
   - Review API endpoint logs

3. **Alerts not firing**
   - Check alert rule configuration
   - Verify notification channels
   - Review alert cooldown settings

4. **High monitoring overhead**
   - Reduce sampling rates
   - Optimize batch sizes
   - Review retention settings

### Debug Mode

```typescript
const monitoring = initializeMonitoring({
  environment: 'development',
  sentry: { debug: true },
  // Other debug settings
});
```

## Migration Guide

To migrate from existing monitoring solutions:

1. **Audit current monitoring**
   - List existing metrics
   - Document alert rules
   - Identify critical dashboards

2. **Gradual migration**
   - Start with error tracking
   - Add performance monitoring
   - Migrate business metrics
   - Update dashboards

3. **Validation**
   - Compare metrics side-by-side
   - Validate alert accuracy
   - Test notification channels

## Contributing

To contribute to the monitoring system:

1. Add new metric types in `types.ts`
2. Implement tracking in appropriate modules
3. Add API endpoints if needed
4. Update documentation
5. Add tests for new functionality

## License

This monitoring system is part of the Dream 100 Keyword Engine project.