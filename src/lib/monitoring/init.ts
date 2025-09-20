import { MonitoringConfig, defaultConfig, defaultAlertRules, defaultSLOTargets, validateConfig } from './config';
import { ErrorTracker } from './error-tracker';
import { PerformanceMonitor } from './performance-monitor';
import { BusinessMetrics } from './business-metrics';
import { AlertManager } from './alert-manager';
import { HealthMonitor } from './health-monitor';
import { SLOManager } from './slo-manager';
import { SystemObservability } from './observability';
import { CostTracker } from './cost-tracker';
import { UserActivityTracker } from './user-activity';
import { MonitoringDashboard } from './dashboard';
import * as Sentry from '@sentry/nextjs';

export interface MonitoringSystem {
  errorTracker: ErrorTracker;
  performanceMonitor: PerformanceMonitor;
  businessMetrics: BusinessMetrics;
  alertManager: AlertManager;
  healthMonitor: HealthMonitor;
  sloManager: SLOManager;
  observability: SystemObservability;
  costTracker: CostTracker;
  userActivityTracker: UserActivityTracker;
  dashboard: MonitoringDashboard;
  config: MonitoringConfig;
}

let monitoringInstance: MonitoringSystem | null = null;

export function initializeMonitoring(
  customConfig: Partial<MonitoringConfig> = {}
): MonitoringSystem {
  // Validate configuration
  const configErrors = validateConfig(customConfig);
  if (configErrors.length > 0) {
    throw new Error(`Invalid monitoring configuration: ${configErrors.join(', ')}`);
  }

  // Merge with defaults
  const config: MonitoringConfig = {
    ...defaultConfig,
    ...customConfig,
    // Deep merge nested objects
    sentry: { ...defaultConfig.sentry, ...customConfig.sentry },
    performance: { ...defaultConfig.performance, ...customConfig.performance },
    errorTracking: { ...defaultConfig.errorTracking, ...customConfig.errorTracking },
    businessMetrics: { ...defaultConfig.businessMetrics, ...customConfig.businessMetrics },
    healthMonitoring: { ...defaultConfig.healthMonitoring, ...customConfig.healthMonitoring },
    alerting: { ...defaultConfig.alerting, ...customConfig.alerting },
    retention: { ...defaultConfig.retention, ...customConfig.retention }
  };

  try {
    // Initialize core components
    const alertManager = new AlertManager(config, defaultAlertRules);
    const errorTracker = new ErrorTracker(config, alertManager);
    const performanceMonitor = new PerformanceMonitor(config, alertManager);
    const businessMetrics = new BusinessMetrics(config);
    const healthMonitor = new HealthMonitor(config, alertManager);
    const sloManager = new SLOManager(config, alertManager, defaultSLOTargets);
    const observability = new SystemObservability(config);
    const costTracker = new CostTracker(config, alertManager);
    const userActivityTracker = new UserActivityTracker(config);
    
    // Initialize dashboard
    const dashboard = new MonitoringDashboard(
      config,
      errorTracker,
      performanceMonitor,
      businessMetrics,
      alertManager,
      healthMonitor,
      sloManager,
      costTracker,
      userActivityTracker
    );

    const monitoring: MonitoringSystem = {
      errorTracker,
      performanceMonitor,
      businessMetrics,
      alertManager,
      healthMonitor,
      sloManager,
      observability,
      costTracker,
      userActivityTracker,
      dashboard,
      config
    };

    // Store global instance
    monitoringInstance = monitoring;

    // Set up global error handlers if enabled
    if (config.enabled) {
      setupGlobalErrorHandlers(monitoring);
    }

    // Initialize Sentry if configured
    if (config.sentry.dsn) {
      initializeSentry(config);
    }

    // Log successful initialization
    observability.log('info', 'Monitoring system initialized successfully', {
      environment: config.environment,
      enabled: config.enabled,
      components: [
        'errorTracker',
        'performanceMonitor',
        'businessMetrics',
        'alertManager',
        'healthMonitor',
        'sloManager',
        'observability',
        'costTracker',
        'userActivityTracker',
        'dashboard'
      ]
    });

    return monitoring;

  } catch (error) {
    console.error('Failed to initialize monitoring system:', error);
    
    // Fallback to minimal monitoring
    const fallbackMonitoring = createFallbackMonitoring(config);
    monitoringInstance = fallbackMonitoring;
    
    return fallbackMonitoring;
  }
}

function setupGlobalErrorHandlers(monitoring: MonitoringSystem): void {
  // Browser environment
  if (typeof window !== 'undefined') {
    // Global error handler
    const originalErrorHandler = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      monitoring.errorTracker.captureError(error || new Error(String(message)), {
        source,
        lineno,
        colno,
        type: 'window.onerror'
      });
      
      // Call original handler if it exists
      if (originalErrorHandler) {
        return originalErrorHandler(message, source, lineno, colno, error);
      }
      return false;
    };

    // Unhandled promise rejection handler
    const originalRejectionHandler = window.onunhandledrejection;
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      monitoring.errorTracker.captureError(event.reason, {
        type: 'unhandledrejection',
        promise: event.promise
      });
      
      // Call original handler if it exists
      if (originalRejectionHandler) {
        return originalRejectionHandler.call(window, event);
      }
    };
    window.addEventListener('unhandledrejection', rejectionHandler);
  }
  
  // Node.js environment
  if (typeof process !== 'undefined') {
    process.on('uncaughtException', (error) => {
      monitoring.errorTracker.captureError(error, {
        type: 'uncaughtException',
        fatal: true
      });
      
      // Exit gracefully
      setTimeout(() => process.exit(1), 1000);
    });

    process.on('unhandledRejection', (reason, promise) => {
      monitoring.errorTracker.captureError(reason instanceof Error ? reason : new Error(String(reason)), {
        type: 'unhandledRejection',
        promise: promise.toString()
      });
    });
  }
}

function initializeSentry(config: MonitoringConfig): void {
  try {
    // Sentry is already initialized in the Sentry config files
    // We just need to set additional context
    Sentry.setContext('monitoring', {
      environment: config.environment,
      enabled: config.enabled,
      version: '1.0.0'
    });

    Sentry.setTag('monitoring_system', 'dream100_keyword_engine');
    
    console.log('Sentry monitoring initialized');
  } catch (error) {
    console.warn('Failed to initialize Sentry:', error);
  }
}

function createFallbackMonitoring(config: MonitoringConfig): MonitoringSystem {
  // Create minimal monitoring system that won't break the application
  const noopAlertManager = {
    config: {} as MonitoringConfig,
    rules: new Map(),
    activeAlerts: new Map(),
    alertStates: new Map(),
    channels: new Map(),
    rateState: new Map(),
    addRule: () => {},
    updateRule: () => false,
    removeRule: () => false,
    triggerAlert: () => '',
    resolveAlert: () => false,
    checkMetricAgainstRules: () => {},
    getActiveAlerts: () => [],
    getAlertHistory: () => [],
    getAlertStats: () => ({ total: 0, bySeverity: {}, byType: {}, avgResolutionTime: 0, unresolvedCount: 0 }),
    cleanup: () => {},
    checkCooldown: () => true,
    updateAlertState: () => {},
    sendAlert: () => Promise.resolve(),
    formatAlert: () => ({ title: '', message: '', fields: [] }),
    sendSlackAlert: () => Promise.resolve(),
    sendEmailAlert: () => Promise.resolve(),
    sendPagerDutyAlert: () => Promise.resolve()
  } as unknown as AlertManager;

  const noopErrorTracker = {
    config: {} as MonitoringConfig,
    alertManager: {} as AlertManager,
    errorQueue: [],
    errorCounts: new Map(),
    lastFlush: new Date(),
    captureError: () => 'fallback_error',
    captureException: () => 'fallback_error',
    captureMessage: () => 'fallback_error',
    setUserContext: () => {},
    setTagContext: () => {},
    addBreadcrumb: () => {},
    startTransaction: () => null,
    capturePerformanceIssue: () => {},
    getErrorStats: () => ({ total: 0, byService: {}, byseverity: {}, topErrors: [] }),
    initializeErrorCapture: () => {},
    sendToSentry: () => {},
    flushErrors: () => {},
    checkErrorRate: () => {},
    generateErrorId: () => 'fallback',
    generateFingerprint: () => 'fallback',
    filterSensitiveData: (e: any) => e,
    mapLevelToSeverity: () => 'medium' as const,
    mapSeverityToSentryLevel: () => 'error' as const
  } as unknown as ErrorTracker;

  // Create other minimal components...
  const fallbackComponents = {
    errorTracker: noopErrorTracker,
    performanceMonitor: {} as PerformanceMonitor,
    businessMetrics: {} as BusinessMetrics,
    alertManager: noopAlertManager,
    healthMonitor: {} as HealthMonitor,
    sloManager: {} as SLOManager,
    observability: {} as SystemObservability,
    costTracker: {} as CostTracker,
    userActivityTracker: {} as UserActivityTracker,
    dashboard: {} as MonitoringDashboard,
    config
  };

  console.warn('Using fallback monitoring system due to initialization error');
  return fallbackComponents;
}

// Global monitoring access
export function getMonitoring(): MonitoringSystem | null {
  return monitoringInstance;
}

export function requireMonitoring(): MonitoringSystem {
  if (!monitoringInstance) {
    throw new Error('Monitoring system not initialized. Call initializeMonitoring() first.');
  }
  return monitoringInstance;
}

// Cleanup function
export function destroyMonitoring(): void {
  if (monitoringInstance) {
    try {
      // Cleanup all components
      monitoringInstance.performanceMonitor.destroy?.();
      monitoringInstance.businessMetrics.destroy?.();
      monitoringInstance.healthMonitor.destroy?.();
      monitoringInstance.sloManager.destroy?.();
      monitoringInstance.costTracker.destroy?.();
      monitoringInstance.userActivityTracker.destroy?.();
      
      monitoringInstance = null;
      console.log('Monitoring system destroyed');
    } catch (error) {
      console.error('Error destroying monitoring system:', error);
    }
  }
}

// Convenience functions for common operations
export function trackError(error: Error | string, context?: Record<string, any>): void {
  const monitoring = getMonitoring();
  if (monitoring) {
    monitoring.errorTracker.captureError(error, context);
  }
}

export function trackPerformance(operation: string, duration: number, metadata?: Record<string, any>): void {
  const monitoring = getMonitoring();
  if (monitoring) {
    monitoring.performanceMonitor.recordMetric({
      operation,
      duration,
      timestamp: new Date(),
      success: true,
      metadata
    });
  }
}

export function trackUserActivity(
  userId: string,
  sessionId: string,
  action: string,
  feature: string,
  metadata?: Record<string, any>
): void {
  const monitoring = getMonitoring();
  if (monitoring) {
    monitoring.userActivityTracker.trackActivity(userId, sessionId, action, feature, metadata);
  }
}

export function trackCost(
  service: string,
  operation: string,
  cost: number,
  currency: string = 'USD',
  metadata?: Record<string, any>
): void {
  const monitoring = getMonitoring();
  if (monitoring) {
    monitoring.costTracker.recordCost(service, operation, cost, currency, metadata);
  }
}

export function startTrace(operationName: string, tags?: Record<string, string>): {
  traceId: string;
  span: any;
  finish: (status?: 'ok' | 'error', error?: Error) => void;
} {
  const monitoring = getMonitoring();
  if (monitoring) {
    const { traceId, span } = monitoring.observability.startTrace(operationName, tags);
    return {
      traceId,
      span,
      finish: (status = 'ok', error) => {
        monitoring.observability.finishSpan(traceId, traceId, status, error);
      }
    };
  }
  
  // Fallback
  return {
    traceId: 'fallback',
    span: null,
    finish: () => {}
  };
}

// Health check function
export function getSystemHealth(): {
  healthy: boolean;
  services: Record<string, any>;
  alerts: any[];
  uptime: number;
} {
  const monitoring = getMonitoring();
  if (!monitoring) {
    return {
      healthy: false,
      services: {},
      alerts: [],
      uptime: 0
    };
  }

  const health = monitoring.healthMonitor.getHealthStatus();
  const alerts = monitoring.alertManager.getActiveAlerts();
  const summary = monitoring.healthMonitor.getHealthSummary();

  return {
    healthy: health.overall === 'healthy',
    services: health.services,
    alerts,
    uptime: summary.uptime
  };
}