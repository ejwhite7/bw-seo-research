import { AlertRule, SLOTarget } from './types';

export interface MonitoringConfig {
  enabled: boolean;
  environment: string;
  
  // Sentry configuration
  sentry: {
    dsn?: string;
    tracesSampleRate: number;
    profilesSampleRate: number;
    replaysSessionSampleRate: number;
    replaysOnErrorSampleRate: number;
    debug: boolean;
  };
  
  // Performance monitoring
  performance: {
    enableWebVitals: boolean;
    enableResourceTiming: boolean;
    enableNavigationTiming: boolean;
    enableUserInteraction: boolean;
    slowThreshold: number; // ms
    verySlowThreshold: number; // ms
  };
  
  // Error tracking
  errorTracking: {
    enableAutomaticCapture: boolean;
    enableConsoleCapture: boolean;
    enablePromiseRejectionCapture: boolean;
    enableWindowErrorCapture: boolean;
    maxBreadcrumbs: number;
    filterSensitiveData: boolean;
  };
  
  // Business metrics
  businessMetrics: {
    enableUserTracking: boolean;
    enableFeatureTracking: boolean;
    enableConversionTracking: boolean;
    enableCostTracking: boolean;
    batchSize: number;
    flushInterval: number; // ms
  };
  
  // Health monitoring
  healthMonitoring: {
    enabled: boolean;
    checkInterval: number; // ms
    timeout: number; // ms
    services: {
      name: string;
      url?: string;
      healthCheck: () => Promise<boolean>;
    }[];
  };
  
  // Alerting
  alerting: {
    enabled: boolean;
    channels: {
      slack?: {
        webhookUrl: string;
        channel: string;
        username?: string;
      };
      email?: {
        smtpHost: string;
        smtpPort: number;
        username: string;
        password: string;
        from: string;
        to: string[];
      };
      pagerduty?: {
        integrationKey: string;
        severity: string;
      };
    };
  };
  
  // Data retention
  retention: {
    metrics: number; // days
    logs: number; // days
    traces: number; // days
    errors: number; // days
  };
}

// Default configuration
export const defaultConfig: MonitoringConfig = {
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV || 'development',
  
  sentry: {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    debug: process.env.NODE_ENV === 'development',
  },
  
  performance: {
    enableWebVitals: true,
    enableResourceTiming: true,
    enableNavigationTiming: true,
    enableUserInteraction: true,
    slowThreshold: 2000, // 2 seconds
    verySlowThreshold: 5000, // 5 seconds
  },
  
  errorTracking: {
    enableAutomaticCapture: true,
    enableConsoleCapture: process.env.NODE_ENV === 'development',
    enablePromiseRejectionCapture: true,
    enableWindowErrorCapture: true,
    maxBreadcrumbs: 100,
    filterSensitiveData: true,
  },
  
  businessMetrics: {
    enableUserTracking: true,
    enableFeatureTracking: true,
    enableConversionTracking: true,
    enableCostTracking: true,
    batchSize: 100,
    flushInterval: 10000, // 10 seconds
  },
  
  healthMonitoring: {
    enabled: true,
    checkInterval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    services: [
      {
        name: 'database',
        healthCheck: async () => {
          // Implement database health check
          return true;
        }
      },
      {
        name: 'redis',
        healthCheck: async () => {
          // Implement Redis health check
          return true;
        }
      }
    ]
  },
  
  alerting: {
    enabled: process.env.NODE_ENV === 'production',
    channels: {
      slack: process.env.SLACK_WEBHOOK_URL ? {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts',
        username: 'Dream100 Monitor'
      } : undefined,
      
      email: process.env.SMTP_HOST ? {
        smtpHost: process.env.SMTP_HOST,
        smtpPort: parseInt(process.env.SMTP_PORT || '587'),
        username: process.env.SMTP_USERNAME || '',
        password: process.env.SMTP_PASSWORD || '',
        from: process.env.ALERT_EMAIL_FROM || '',
        to: (process.env.ALERT_EMAIL_TO || '').split(',')
      } : undefined,
      
      pagerduty: process.env.PAGERDUTY_INTEGRATION_KEY ? {
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        severity: 'error'
      } : undefined
    }
  },
  
  retention: {
    metrics: 30, // 30 days
    logs: 7, // 7 days
    traces: 3, // 3 days
    errors: 90 // 90 days
  }
};

// Default alert rules
export const defaultAlertRules: AlertRule[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    metric: 'error_rate',
    condition: 'gt',
    threshold: 0.1, // 10%
    severity: 'critical',
    enabled: true,
    cooldown: 15,
    channels: [{ type: 'slack', config: {}, enabled: true }],
    description: 'Error rate exceeds 10%'
  },
  {
    id: 'slow-response-time',
    name: 'Slow Response Time',
    metric: 'avg_response_time',
    condition: 'gt',
    threshold: 5000, // 5 seconds
    severity: 'warning',
    enabled: true,
    cooldown: 10,
    channels: [{ type: 'slack', config: {}, enabled: true }],
    description: 'Average response time exceeds 5 seconds'
  },
  {
    id: 'high-api-cost',
    name: 'High API Cost',
    metric: 'api_cost_per_hour',
    condition: 'gt',
    threshold: 10, // $10/hour
    severity: 'warning',
    enabled: true,
    cooldown: 60,
    channels: [{ type: 'email', config: {}, enabled: true }],
    description: 'API costs exceed $10/hour'
  },
  {
    id: 'budget-exceeded',
    name: 'Budget Exceeded',
    metric: 'budget_percentage',
    condition: 'gt',
    threshold: 90, // 90%
    severity: 'critical',
    enabled: true,
    cooldown: 30,
    channels: [
      { type: 'slack', config: {}, enabled: true },
      { type: 'email', config: {}, enabled: true }
    ],
    description: 'Budget usage exceeds 90%'
  },
  {
    id: 'low-data-quality',
    name: 'Low Data Quality',
    metric: 'data_quality_score',
    condition: 'lt',
    threshold: 0.85, // 85%
    severity: 'warning',
    enabled: true,
    cooldown: 30,
    channels: [{ type: 'slack', config: {}, enabled: true }],
    description: 'Data quality score below 85%'
  },
  {
    id: 'queue-backup',
    name: 'Queue Backup',
    metric: 'queue_depth',
    condition: 'gt',
    threshold: 1000,
    severity: 'warning',
    enabled: true,
    cooldown: 15,
    channels: [{ type: 'slack', config: {}, enabled: true }],
    description: 'Queue depth exceeds 1000 items'
  }
];

// Default SLO targets
export const defaultSLOTargets: SLOTarget[] = [
  {
    service: 'api',
    metric: 'availability',
    target: 99.9, // 99.9%
    window: '30d',
    errorBudget: 0.1,
    alertThreshold: 0.05,
    description: 'API availability target'
  },
  {
    service: 'api',
    metric: 'latency_p95',
    target: 95, // 95% of requests under threshold
    window: '7d',
    errorBudget: 5,
    alertThreshold: 2,
    description: 'API latency p95 target (under 2 seconds)'
  },
  {
    service: 'keyword-processing',
    metric: 'success_rate',
    target: 99.5, // 99.5%
    window: '24h',
    errorBudget: 0.5,
    alertThreshold: 0.25,
    description: 'Keyword processing success rate'
  },
  {
    service: 'data-quality',
    metric: 'relevance_score',
    target: 90, // 90%
    window: '7d',
    errorBudget: 10,
    alertThreshold: 5,
    description: 'Keyword relevance quality target'
  }
];

// Configuration validation
export function validateConfig(config: Partial<MonitoringConfig>): string[] {
  const errors: string[] = [];
  
  if (config.sentry?.tracesSampleRate && 
      (config.sentry.tracesSampleRate < 0 || config.sentry.tracesSampleRate > 1)) {
    errors.push('Sentry traces sample rate must be between 0 and 1');
  }
  
  if (config.performance?.slowThreshold && config.performance.slowThreshold < 0) {
    errors.push('Slow threshold must be positive');
  }
  
  if (config.businessMetrics?.batchSize && config.businessMetrics.batchSize < 1) {
    errors.push('Batch size must be at least 1');
  }
  
  if (config.retention?.metrics && config.retention.metrics < 1) {
    errors.push('Metrics retention must be at least 1 day');
  }
  
  return errors;
}