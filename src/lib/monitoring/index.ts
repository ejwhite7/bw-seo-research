// Core monitoring exports
export { ErrorTracker } from './error-tracker';
export { PerformanceMonitor } from './performance-monitor';
export { BusinessMetrics } from './business-metrics';
export { MonitoringDashboard } from './dashboard';
export { AlertManager } from './alert-manager';
export { SystemObservability } from './observability';
export { HealthMonitor } from './health-monitor';
export { CostTracker } from './cost-tracker';
export { UserActivityTracker } from './user-activity';
export { SLOManager } from './slo-manager';

// Monitoring configuration
export type { MonitoringConfig } from './config';

// Types
export type {
  MetricData,
  AlertRule,
  DashboardConfig,
  HealthStatus,
  PerformanceMetric,
  BusinessMetric,
  SLOTarget,
  ObservabilityData
} from './types';

// Initialize monitoring
export {
  initializeMonitoring,
  getMonitoring,
  requireMonitoring,
  destroyMonitoring,
  trackError,
  trackPerformance,
  trackUserActivity,
  trackCost,
  startTrace,
  getSystemHealth
} from './init';

// Monitoring system interface
export type { MonitoringSystem } from './init';

// Configuration exports
export { defaultConfig, defaultAlertRules, defaultSLOTargets } from './config';

// Additional type exports
export type {
  AlertChannel,
  DashboardPanel,
  TraceData,
  LogEntry,
  ErrorEvent,
  CostMetric,
  BudgetAlert,
  UserActivity,
  FeatureUsage,
  KeywordMetric,
  ExportMetric,
  IntegrationMetric,
  APIMetric,
  ResourceMetric,
  QueueMetric
} from './types';

// Frontend utilities
export {
  trackWebVitals,
  trackAPICall,
  trackUserInteraction,
  trackClientError,
  trackPageLoad,
  trackFeatureUsage,
  trackConversion,
  startUserSession,
  endUserSession,
  getCurrentSessionId,
  createUserActivityTracker,
  createErrorBoundary,
  checkSystemHealth,
  fetchMonitoringData,
  initializeFrontendMonitoring,
  createComponentMonitor
} from './utils/frontend-helpers';

// React-specific utilities
export {
  useUserActivityTracking,
  withMonitoring,
  createReactErrorBoundary
} from './utils/react-helpers';