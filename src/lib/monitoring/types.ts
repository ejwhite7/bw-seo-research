// Core monitoring types
export interface MetricData {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
  unit?: string;
  description?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  cooldown?: number; // minutes
  channels: AlertChannel[];
  description?: string;
}

export interface AlertChannel {
  type: 'slack' | 'email' | 'pagerduty' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description?: string;
  panels: DashboardPanel[];
  refreshInterval?: number;
  timeRange?: {
    from: string;
    to: string;
  };
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'line' | 'bar' | 'pie' | 'stat' | 'table' | 'heatmap';
  metrics: string[];
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  options?: Record<string, any>;
}

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime?: number;
  errorRate?: number;
  details?: Record<string, any>;
  dependencies?: HealthStatus[];
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  metadata?: Record<string, any>;
  traceId?: string;
  spanId?: string;
}

export interface BusinessMetric {
  type: 'user_action' | 'feature_usage' | 'conversion' | 'revenue' | 'cost';
  name: string;
  value: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface SLOTarget {
  service: string;
  metric: string;
  target: number; // percentage (e.g., 99.9)
  window: string; // e.g., '30d', '7d', '1h'
  errorBudget: number;
  alertThreshold: number;
  description?: string;
}

export interface ObservabilityData {
  traces: TraceData[];
  logs: LogEntry[];
  metrics: MetricData[];
  errors: ErrorEvent[];
}

export interface TraceData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  duration: number;
  tags?: Record<string, string>;
  logs?: LogEntry[];
  status: 'ok' | 'error';
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, any>;
  error?: ErrorDetails;
}

export interface ErrorEvent {
  id: string;
  message: string;
  stack?: string;
  timestamp: Date;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user?: {
    id: string;
    email?: string;
  };
  context?: Record<string, any>;
  fingerprint?: string;
  resolved?: boolean;
  tags?: Record<string, string>;
}

export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: ErrorDetails;
}

// Cost tracking types
export interface CostMetric {
  service: string;
  operation: string;
  cost: number;
  currency: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BudgetAlert {
  service: string;
  currentSpend: number;
  budgetLimit: number;
  percentage: number;
  period: string;
  timestamp: Date;
}

// User activity types
export interface UserActivity {
  userId: string;
  sessionId: string;
  action: string;
  feature: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  duration?: number;
}

export interface FeatureUsage {
  feature: string;
  users: number;
  sessions: number;
  actions: number;
  avgDuration?: number;
  period: string;
  timestamp: Date;
}

// System resource types
export interface ResourceMetric {
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'database';
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  service: string;
  instance?: string;
}

// API performance types
export interface APIMetric {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
  userId?: string;
  traceId?: string;
  cached?: boolean;
}

// Queue metrics
export interface QueueMetric {
  queue: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  timestamp: Date;
}

// Custom metrics for Dream 100 Keyword Engine
export interface KeywordMetric {
  stage: 'dream100' | 'tier2' | 'tier3' | 'clustering' | 'scoring' | 'roadmap';
  keywordCount: number;
  processingTime: number;
  successRate: number;
  qualityScore?: number;
  runId: string;
  userId?: string;
  timestamp: Date;
}

export interface ExportMetric {
  format: 'csv' | 'xlsx' | 'json';
  size: number; // bytes
  recordCount: number;
  processingTime: number;
  userId?: string;
  timestamp: Date;
}

export interface IntegrationMetric {
  provider: 'ahrefs' | 'anthropic' | 'supabase';
  operation: string;
  responseTime: number;
  success: boolean;
  cost?: number;
  rateLimited?: boolean;
  timestamp: Date;
}