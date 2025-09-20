import { CacheService, CacheStats } from './cache';
import { CacheIntegrationManager } from './cache-integrations';
import { CACHE_HEALTH_THRESHOLDS } from '../config/cache';

/**
 * Cache monitoring and alerting system
 */

interface CacheAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  component: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

interface CacheMetric {
  name: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
  threshold?: {
    warning: number;
    critical: number;
  };
}

interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'critical';
  components: Record<string, {
    status: 'healthy' | 'degraded' | 'critical';
    message?: string;
    metrics: Record<string, number>;
  }>;
  alerts: CacheAlert[];
  recommendations: string[];
}

/**
 * Comprehensive cache monitoring service
 */
export class CacheMonitor {
  private alerts: Map<string, CacheAlert> = new Map();
  private metrics: CacheMetric[] = [];
  private maxMetricHistory = 1000;
  private monitoringInterval?: NodeJS.Timeout;
  private alertCallbacks: Array<(alert: CacheAlert) => void> = [];
  
  constructor(
    private cache: CacheService,
    private cacheManager: CacheIntegrationManager,
    private options: {
      interval?: number; // monitoring interval in ms
      metricsRetention?: number; // how many metrics to keep
      enableAlerting?: boolean;
    } = {}
  ) {
    this.maxMetricHistory = options.metricsRetention || 1000;
    
    if (options.enableAlerting !== false) {
      this.startMonitoring(options.interval || 60000); // Default 1 minute
    }
  }
  
  /**
   * Start continuous monitoring
   */
  startMonitoring(interval: number): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkHealth();
      } catch (error) {
        console.error('Cache monitoring error:', (error as Error).message);
      }
    }, interval);
    
    console.log(`Cache monitoring started with ${interval}ms interval`);
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }
  
  /**
   * Collect comprehensive cache metrics
   */
  async collectMetrics(): Promise<void> {
    const timestamp = Date.now();
    const stats = this.cache.getStats();
    const health = await this.cache.healthCheck();
    
    // Core cache metrics
    this.addMetric({
      name: 'cache.hit_rate',
      value: stats.hitRate,
      timestamp,
      tags: { component: 'cache' },
      threshold: {
        warning: CACHE_HEALTH_THRESHOLDS.hitRate.warning,
        critical: CACHE_HEALTH_THRESHOLDS.hitRate.critical,
      },
    });
    
    this.addMetric({
      name: 'cache.error_rate',
      value: stats.hits + stats.misses > 0 ? 
        stats.errors / (stats.hits + stats.misses) : 0,
      timestamp,
      tags: { component: 'cache' },
      threshold: {
        warning: CACHE_HEALTH_THRESHOLDS.errorRate.warning,
        critical: CACHE_HEALTH_THRESHOLDS.errorRate.critical,
      },
    });
    
    this.addMetric({
      name: 'cache.memory_usage',
      value: health.stats.memory.used,
      timestamp,
      tags: { component: 'memory', unit: 'bytes' },
    });
    
    this.addMetric({
      name: 'cache.key_count',
      value: health.stats.memory.keys,
      timestamp,
      tags: { component: 'memory' },
    });
    
    this.addMetric({
      name: 'cache.avg_response_time',
      value: stats.operations.avgLatency,
      timestamp,
      tags: { component: 'performance', unit: 'ms' },
      threshold: {
        warning: CACHE_HEALTH_THRESHOLDS.responseTime.warning,
        critical: CACHE_HEALTH_THRESHOLDS.responseTime.critical,
      },
    });
    
    // Connection metrics
    this.addMetric({
      name: 'cache.connections_active',
      value: health.stats.connections.active,
      timestamp,
      tags: { component: 'connections' },
    });
    
    // Operation metrics
    this.addMetric({
      name: 'cache.operations.hits',
      value: stats.hits,
      timestamp,
      tags: { component: 'operations', type: 'hits' },
    });
    
    this.addMetric({
      name: 'cache.operations.misses',
      value: stats.misses,
      timestamp,
      tags: { component: 'operations', type: 'misses' },
    });
    
    this.addMetric({
      name: 'cache.operations.sets',
      value: stats.sets,
      timestamp,
      tags: { component: 'operations', type: 'sets' },
    });
    
    this.addMetric({
      name: 'cache.operations.deletes',
      value: stats.deletes,
      timestamp,
      tags: { component: 'operations', type: 'deletes' },
    });
    
    // Cleanup old metrics
    if (this.metrics.length > this.maxMetricHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricHistory);
    }
  }
  
  /**
   * Perform comprehensive health check
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const health = await this.cache.healthCheck();
    const stats = this.cache.getStats();
    const currentAlerts: CacheAlert[] = [];
    
    // Check hit rate
    const hitRateStatus = this.getHealthStatus(
      stats.hitRate,
      CACHE_HEALTH_THRESHOLDS.hitRate
    );
    
    if (hitRateStatus !== 'healthy') {
      const alert = this.createAlert(
        hitRateStatus === 'critical' ? 'critical' : 'warning',
        'cache.hit_rate',
        `Cache hit rate is ${hitRateStatus}: ${(stats.hitRate * 100).toFixed(1)}%`,
        { hitRate: stats.hitRate }
      );
      currentAlerts.push(alert);
    }
    
    // Check error rate
    const total = stats.hits + stats.misses;
    const errorRate = total > 0 ? stats.errors / total : 0;
    const errorRateStatus = this.getHealthStatus(
      errorRate,
      CACHE_HEALTH_THRESHOLDS.errorRate,
      true // inverted (higher is worse)
    );
    
    if (errorRateStatus !== 'healthy') {
      const alert = this.createAlert(
        errorRateStatus === 'critical' ? 'critical' : 'warning',
        'cache.error_rate',
        `Cache error rate is ${errorRateStatus}: ${(errorRate * 100).toFixed(1)}%`,
        { errorRate, errors: stats.errors, total }
      );
      currentAlerts.push(alert);
    }
    
    // Check response time
    const responseTimeStatus = this.getHealthStatus(
      stats.operations.avgLatency,
      CACHE_HEALTH_THRESHOLDS.responseTime,
      true // inverted
    );
    
    if (responseTimeStatus !== 'healthy') {
      const alert = this.createAlert(
        responseTimeStatus === 'critical' ? 'critical' : 'warning',
        'cache.response_time',
        `Cache response time is ${responseTimeStatus}: ${stats.operations.avgLatency.toFixed(1)}ms`,
        { avgLatency: stats.operations.avgLatency }
      );
      currentAlerts.push(alert);
    }
    
    // Check Redis connectivity
    if (!health.redis) {
      const alert = this.createAlert(
        'critical',
        'cache.connectivity',
        'Redis connection is down - falling back to in-memory cache',
        { redisHealthy: health.redis, fallbackActive: health.fallback }
      );
      currentAlerts.push(alert);
    }
    
    // Update alerts
    for (const alert of currentAlerts) {
      this.addAlert(alert);
    }
    
    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const criticalAlerts = currentAlerts.filter(a => a.type === 'critical');
    const warningAlerts = currentAlerts.filter(a => a.type === 'warning');
    
    if (criticalAlerts.length > 0) {
      overall = 'critical';
    } else if (warningAlerts.length > 0) {
      overall = 'degraded';
    }
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(stats, health, currentAlerts);
    
    return {
      overall,
      components: {
        redis: {
          status: health.redis ? 'healthy' : 'critical',
          message: health.redis ? 'Connected' : 'Disconnected',
          metrics: {
            connected: health.redis ? 1 : 0,
            connections: health.stats.connections.active,
          },
        },
        performance: {
          status: responseTimeStatus,
          metrics: {
            avgLatency: stats.operations.avgLatency,
            hitRate: stats.hitRate,
            errorRate,
          },
        },
        memory: {
          status: 'healthy', // Would need more sophisticated checking
          metrics: {
            used: health.stats.memory.used,
            keys: health.stats.memory.keys,
          },
        },
      },
      alerts: Array.from(this.alerts.values()).filter(a => !a.resolved),
      recommendations,
    };
  }
  
  /**
   * Add a metric to the history
   */
  private addMetric(metric: CacheMetric): void {
    this.metrics.push(metric);
    
    // Check thresholds and create alerts if needed
    if (metric.threshold) {
      if (metric.value <= metric.threshold.critical) {
        this.createAlert(
          'critical',
          metric.name,
          `${metric.name} is critically low: ${metric.value}`,
          { value: metric.value, threshold: metric.threshold }
        );
      } else if (metric.value <= metric.threshold.warning) {
        this.createAlert(
          'warning',
          metric.name,
          `${metric.name} is below warning threshold: ${metric.value}`,
          { value: metric.value, threshold: metric.threshold }
        );
      }
    }
  }
  
  /**
   * Create and add an alert
   */
  private createAlert(
    type: 'critical' | 'warning' | 'info',
    component: string,
    message: string,
    metadata?: Record<string, any>
  ): CacheAlert {
    const alert: CacheAlert = {
      id: `${component}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      component,
      message,
      timestamp: Date.now(),
      resolved: false,
      metadata,
    };
    
    return alert;
  }
  
  /**
   * Add alert to the system
   */
  private addAlert(alert: CacheAlert): void {
    this.alerts.set(alert.id, alert);
    
    // Notify alert callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('Alert callback error:', (error as Error).message);
      }
    }
  }
  
  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      return true;
    }
    return false;
  }
  
  /**
   * Get health status based on thresholds
   */
  private getHealthStatus(
    value: number,
    thresholds: { good: number; warning: number; critical: number },
    inverted = false
  ): 'healthy' | 'degraded' | 'critical' {
    if (inverted) {
      if (value >= thresholds.critical) return 'critical';
      if (value >= thresholds.warning) return 'degraded';
      return 'healthy';
    } else {
      if (value <= thresholds.critical) return 'critical';
      if (value <= thresholds.warning) return 'degraded';
      return 'healthy';
    }
  }
  
  /**
   * Generate health recommendations
   */
  private generateRecommendations(
    stats: CacheStats,
    health: any,
    alerts: CacheAlert[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Hit rate recommendations
    if (stats.hitRate < 0.5) {
      recommendations.push('Consider increasing TTL values to improve hit rate');
      recommendations.push('Review cache warming strategies for frequently accessed data');
    }
    
    // Error rate recommendations
    const total = stats.hits + stats.misses;
    const errorRate = total > 0 ? stats.errors / total : 0;
    if (errorRate > 0.05) {
      recommendations.push('High error rate detected - check Redis connectivity and configuration');
      recommendations.push('Consider implementing circuit breaker patterns');
    }
    
    // Performance recommendations
    if (stats.operations.avgLatency > 200) {
      recommendations.push('High response times - consider Redis optimization or clustering');
      recommendations.push('Review network latency between application and Redis');
    }
    
    // Memory recommendations
    if (health.stats.memory.keys > 100000) {
      recommendations.push('High key count - consider implementing key expiration policies');
      recommendations.push('Review cache key patterns for potential optimization');
    }
    
    // Connection recommendations
    if (!health.redis) {
      recommendations.push('Redis connection issues - check network connectivity and Redis server status');
      recommendations.push('Consider implementing Redis sentinel or cluster for high availability');
    }
    
    return recommendations;
  }
  
  /**
   * Register alert callback
   */
  onAlert(callback: (alert: CacheAlert) => void): void {
    this.alertCallbacks.push(callback);
  }
  
  /**
   * Get current metrics
   */
  getMetrics(options: {
    name?: string;
    component?: string;
    since?: number;
    limit?: number;
  } = {}): CacheMetric[] {
    let filtered = this.metrics;
    
    if (options.name) {
      filtered = filtered.filter(m => m.name === options.name);
    }
    
    if (options.component) {
      filtered = filtered.filter(m => m.tags.component === options.component);
    }
    
    if (options.since !== undefined) {
      filtered = filtered.filter(m => m.timestamp >= options.since!);
    }
    
    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }
    
    return filtered;
  }
  
  /**
   * Get current alerts
   */
  getAlerts(options: {
    type?: 'critical' | 'warning' | 'info';
    component?: string;
    resolved?: boolean;
    since?: number;
  } = {}): CacheAlert[] {
    let alerts = Array.from(this.alerts.values());
    
    if (options.type) {
      alerts = alerts.filter(a => a.type === options.type);
    }
    
    if (options.component) {
      alerts = alerts.filter(a => a.component === options.component);
    }
    
    if (options.resolved !== undefined) {
      alerts = alerts.filter(a => a.resolved === options.resolved);
    }
    
    if (options.since !== undefined) {
      alerts = alerts.filter(a => a.timestamp >= options.since!);
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Generate monitoring report
   */
  async generateReport(timeRange: number = 24 * 60 * 60 * 1000): Promise<{
    summary: {
      timeRange: number;
      totalMetrics: number;
      totalAlerts: number;
      criticalAlerts: number;
      warningAlerts: number;
      avgHitRate: number;
      avgResponseTime: number;
    };
    trends: {
      hitRate: number; // percentage change
      responseTime: number;
      errorRate: number;
    };
    topIssues: Array<{
      component: string;
      issue: string;
      occurrences: number;
    }>;
    recommendations: string[];
  }> {
    const since = Date.now() - timeRange;
    const metrics = this.getMetrics({ since });
    const alerts = this.getAlerts({ since });
    
    // Calculate averages
    const hitRateMetrics = metrics.filter(m => m.name === 'cache.hit_rate');
    const responseTimeMetrics = metrics.filter(m => m.name === 'cache.avg_response_time');
    
    const avgHitRate = hitRateMetrics.length > 0 ?
      hitRateMetrics.reduce((sum, m) => sum + m.value, 0) / hitRateMetrics.length : 0;
    
    const avgResponseTime = responseTimeMetrics.length > 0 ?
      responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) / responseTimeMetrics.length : 0;
    
    // Calculate trends (simplified)
    const trends = {
      hitRate: 0, // Would calculate actual trend
      responseTime: 0,
      errorRate: 0,
    };
    
    // Find top issues
    const issueGroups = new Map<string, number>();
    for (const alert of alerts) {
      const key = `${alert.component}:${alert.type}`;
      issueGroups.set(key, (issueGroups.get(key) || 0) + 1);
    }
    
    const topIssues = Array.from(issueGroups.entries())
      .map(([key, count]) => {
        const [component, type] = key.split(':');
        return {
          component,
          issue: type,
          occurrences: count,
        };
      })
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 5);
    
    const health = await this.cache.healthCheck();
    const recommendations = this.generateRecommendations(
      this.cache.getStats(),
      health,
      alerts
    );
    
    return {
      summary: {
        timeRange,
        totalMetrics: metrics.length,
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.type === 'critical').length,
        warningAlerts: alerts.filter(a => a.type === 'warning').length,
        avgHitRate,
        avgResponseTime,
      },
      trends,
      topIssues,
      recommendations,
    };
  }
  
  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.stopMonitoring();
    this.alerts.clear();
    this.metrics = [];
    this.alertCallbacks = [];
  }
}

/**
 * Cache monitoring utilities
 */
export class CacheMonitorUtils {
  /**
   * Format metrics for display
   */
  static formatMetric(metric: CacheMetric): string {
    const unit = metric.tags.unit || '';
    let formattedValue: string;
    
    if (metric.name.includes('rate')) {
      formattedValue = `${(metric.value * 100).toFixed(1)}%`;
    } else if (unit === 'bytes') {
      formattedValue = CacheMonitorUtils.formatBytes(metric.value);
    } else if (unit === 'ms') {
      formattedValue = `${metric.value.toFixed(1)}ms`;
    } else {
      formattedValue = metric.value.toString();
    }
    
    return `${metric.name}: ${formattedValue}`;
  }
  
  /**
   * Format bytes for human readability
   */
  static formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }
  
  /**
   * Calculate metric statistics
   */
  static calculateStats(
    metrics: CacheMetric[]
  ): {
    min: number;
    max: number;
    avg: number;
    median: number;
    p95: number;
    p99: number;
  } {
    if (metrics.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0 };
    }
    
    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      median: values[Math.floor(values.length / 2)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
    };
  }
}
