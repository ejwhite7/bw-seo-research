import { BusinessMetric, UserActivity, FeatureUsage, KeywordMetric, ExportMetric, IntegrationMetric } from './types';
import { MonitoringConfig } from './config';
import * as Sentry from '@sentry/nextjs';

export class BusinessMetrics {
  private config: MonitoringConfig;
  private metrics: BusinessMetric[] = [];
  private userActivities: UserActivity[] = [];
  private keywordMetrics: KeywordMetric[] = [];
  private exportMetrics: ExportMetric[] = [];
  private integrationMetrics: IntegrationMetric[] = [];
  private metricQueue: BusinessMetric[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.startPeriodicFlush();
  }

  private startPeriodicFlush(): void {
    if (this.config.businessMetrics.flushInterval > 0) {
      this.flushTimer = setInterval(
        () => this.flushMetrics(),
        this.config.businessMetrics.flushInterval
      );
    }
  }

  // User Activity Tracking
  trackUserAction(
    userId: string,
    sessionId: string,
    action: string,
    feature: string,
    metadata?: Record<string, any>,
    duration?: number
  ): void {
    if (!this.config.businessMetrics.enableUserTracking) return;

    const activity: UserActivity = {
      userId,
      sessionId,
      action,
      feature,
      timestamp: new Date(),
      metadata,
      duration
    };

    this.userActivities.push(activity);

    // Track as business metric
    this.recordMetric({
      type: 'user_action',
      name: `${feature}.${action}`,
      value: 1,
      userId,
      sessionId,
      metadata: {
        ...metadata,
        duration
      },
      timestamp: new Date()
    });

    // Send to Sentry
    Sentry.addBreadcrumb({
      message: `User action: ${action} in ${feature}`,
      level: 'info',
      category: 'user_activity',
      data: {
        userId,
        sessionId,
        action,
        feature,
        duration,
        ...metadata
      }
    });
  }

  // Feature Usage Tracking
  trackFeatureUsage(
    feature: string,
    userId?: string,
    sessionId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.businessMetrics.enableFeatureTracking) return;

    this.recordMetric({
      type: 'feature_usage',
      name: feature,
      value: 1,
      userId,
      sessionId,
      metadata,
      timestamp: new Date()
    });
  }

  // Conversion Tracking
  trackConversion(
    conversionType: string,
    value: number,
    userId?: string,
    sessionId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.businessMetrics.enableConversionTracking) return;

    this.recordMetric({
      type: 'conversion',
      name: conversionType,
      value,
      userId,
      sessionId,
      metadata,
      timestamp: new Date()
    });

    // Send important conversions to Sentry
    Sentry.withScope(scope => {
      scope.setTag('conversion', true);
      scope.setContext('conversion', {
        type: conversionType,
        value,
        userId,
        sessionId,
        ...metadata
      });
      
      Sentry.captureMessage(`Conversion: ${conversionType}`, 'info');
    });
  }

  // Cost Tracking
  trackCost(
    service: string,
    operation: string,
    cost: number,
    currency: string = 'USD',
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.businessMetrics.enableCostTracking) return;

    this.recordMetric({
      type: 'cost',
      name: `${service}.${operation}`,
      value: cost,
      userId,
      metadata: {
        service,
        operation,
        currency,
        ...metadata
      },
      timestamp: new Date()
    });
  }

  // Keyword Processing Metrics
  trackKeywordProcessing(
    stage: KeywordMetric['stage'],
    keywordCount: number,
    processingTime: number,
    successRate: number,
    runId: string,
    userId?: string,
    qualityScore?: number
  ): void {
    const metric: KeywordMetric = {
      stage,
      keywordCount,
      processingTime,
      successRate,
      qualityScore,
      runId,
      userId,
      timestamp: new Date()
    };

    this.keywordMetrics.push(metric);

    // Track as business metric
    this.recordMetric({
      type: 'feature_usage',
      name: `keyword_processing.${stage}`,
      value: keywordCount,
      userId,
      metadata: {
        processingTime,
        successRate,
        qualityScore,
        runId,
        throughput: keywordCount / (processingTime / 1000)
      },
      timestamp: new Date()
    });

    // Send to Sentry
    Sentry.addBreadcrumb({
      message: `Keyword processing: ${stage}`,
      level: 'info',
      category: 'keyword_processing',
      data: {
        stage,
        keywordCount,
        processingTime,
        successRate,
        qualityScore,
        runId,
        userId
      }
    });
  }

  // Export Tracking
  trackExport(
    format: ExportMetric['format'],
    size: number,
    recordCount: number,
    processingTime: number,
    userId?: string
  ): void {
    const metric: ExportMetric = {
      format,
      size,
      recordCount,
      processingTime,
      userId,
      timestamp: new Date()
    };

    this.exportMetrics.push(metric);

    // Track as business metric
    this.recordMetric({
      type: 'feature_usage',
      name: `export.${format}`,
      value: recordCount,
      userId,
      metadata: {
        size,
        processingTime,
        sizePerRecord: size / recordCount
      },
      timestamp: new Date()
    });
  }

  // Integration Metrics
  trackIntegration(
    provider: IntegrationMetric['provider'],
    operation: string,
    responseTime: number,
    success: boolean,
    cost?: number,
    rateLimited?: boolean
  ): void {
    const metric: IntegrationMetric = {
      provider,
      operation,
      responseTime,
      success,
      cost,
      rateLimited,
      timestamp: new Date()
    };

    this.integrationMetrics.push(metric);

    // Track as business metric
    this.recordMetric({
      type: cost ? 'cost' : 'feature_usage',
      name: `integration.${provider}.${operation}`,
      value: cost || 1,
      metadata: {
        responseTime,
        success,
        rateLimited,
        provider,
        operation
      },
      timestamp: new Date()
    });
  }

  // Generic metric recording
  private recordMetric(metric: BusinessMetric): void {
    this.metrics.push(metric);
    this.metricQueue.push(metric);

    // Auto-flush if queue is full
    if (this.metricQueue.length >= this.config.businessMetrics.batchSize) {
      this.flushMetrics();
    }
  }

  // Analytics and Reporting
  getUserActivitySummary(
    userId: string,
    timeWindow: number = 86400000 // 24 hours
  ): {
    totalActions: number;
    uniqueFeatures: number;
    avgSessionDuration: number;
    topFeatures: Array<{ feature: string; count: number }>;
    topActions: Array<{ action: string; count: number }>;
  } {
    const cutoff = new Date(Date.now() - timeWindow);
    const userActivities = this.userActivities.filter(
      activity => activity.userId === userId && activity.timestamp > cutoff
    );

    const featureCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    const sessionDurations: number[] = [];

    userActivities.forEach(activity => {
      featureCounts[activity.feature] = (featureCounts[activity.feature] || 0) + 1;
      actionCounts[activity.action] = (actionCounts[activity.action] || 0) + 1;
      
      if (activity.duration) {
        sessionDurations.push(activity.duration);
      }
    });

    const topFeatures = Object.entries(featureCounts)
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topActions = Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalActions: userActivities.length,
      uniqueFeatures: Object.keys(featureCounts).length,
      avgSessionDuration: sessionDurations.length > 0 
        ? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length 
        : 0,
      topFeatures,
      topActions
    };
  }

  getFeatureUsageStats(
    timeWindow: number = 86400000 // 24 hours
  ): FeatureUsage[] {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentActivities = this.userActivities.filter(activity => activity.timestamp > cutoff);

    const featureStats: Record<string, {
      users: Set<string>;
      sessions: Set<string>;
      actions: number;
      totalDuration: number;
      durationCount: number;
    }> = {};

    recentActivities.forEach(activity => {
      if (!featureStats[activity.feature]) {
        featureStats[activity.feature] = {
          users: new Set(),
          sessions: new Set(),
          actions: 0,
          totalDuration: 0,
          durationCount: 0
        };
      }

      const stats = featureStats[activity.feature];
      if (stats) {
        stats.users.add(activity.userId);
        stats.sessions.add(activity.sessionId);
        stats.actions++;
        
        if (activity.duration) {
          stats.totalDuration += activity.duration;
          stats.durationCount++;
        }
      }
    });

    return Object.entries(featureStats).map(([feature, stats]) => ({
      feature,
      users: stats.users.size,
      sessions: stats.sessions.size,
      actions: stats.actions,
      avgDuration: stats.durationCount > 0 ? stats.totalDuration / stats.durationCount : undefined,
      period: `${timeWindow / 3600000}h`,
      timestamp: new Date()
    }));
  }

  getKeywordProcessingStats(
    timeWindow: number = 86400000 // 24 hours
  ): Record<string, {
    totalRuns: number;
    totalKeywords: number;
    avgProcessingTime: number;
    avgSuccessRate: number;
    avgQualityScore: number;
    throughput: number;
  }> {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentMetrics = this.keywordMetrics.filter(metric => metric.timestamp > cutoff);

    const statsByStage: Record<string, {
      totalRuns: number;
      totalKeywords: number;
      avgProcessingTime: number;
      avgSuccessRate: number;
      avgQualityScore: number;
      throughput: number;
    }> = {};

    recentMetrics.forEach(metric => {
      if (!statsByStage[metric.stage]) {
        statsByStage[metric.stage] = {
          totalRuns: 0,
          totalKeywords: 0,
          avgProcessingTime: 0,
          avgSuccessRate: 0,
          avgQualityScore: 0,
          throughput: 0
        };
      }

      const stats = statsByStage[metric.stage];
      if (stats) {
        stats.totalRuns++;
        stats.totalKeywords += metric.keywordCount;
        stats.avgProcessingTime = ((stats.avgProcessingTime * (stats.totalRuns - 1)) + metric.processingTime) / stats.totalRuns;
        stats.avgSuccessRate = ((stats.avgSuccessRate * (stats.totalRuns - 1)) + metric.successRate) / stats.totalRuns;
        
        if (metric.qualityScore) {
          stats.avgQualityScore = ((stats.avgQualityScore * (stats.totalRuns - 1)) + metric.qualityScore) / stats.totalRuns;
        }
        
        stats.throughput = stats.totalKeywords / (stats.avgProcessingTime / 1000);
      }
    });

    return statsByStage;
  }

  getCostSummary(
    timeWindow: number = 86400000 // 24 hours
  ): Record<string, {
    totalCost: number;
    requestCount: number;
    avgCostPerRequest: number;
    currency: string;
  }> {
    const cutoff = new Date(Date.now() - timeWindow);
    const costMetrics = this.metrics.filter(
      metric => metric.type === 'cost' && metric.timestamp > cutoff
    );

    const costByService: Record<string, {
      totalCost: number;
      requestCount: number;
      avgCostPerRequest: number;
      currency: string;
    }> = {};

    costMetrics.forEach(metric => {
      const service = metric.metadata?.service || 'unknown';
      const currency = metric.metadata?.currency || 'USD';
      
      if (!costByService[service]) {
        costByService[service] = {
          totalCost: 0,
          requestCount: 0,
          avgCostPerRequest: 0,
          currency
        };
      }

      const stats = costByService[service];
      stats.totalCost += metric.value;
      stats.requestCount++;
      stats.avgCostPerRequest = stats.totalCost / stats.requestCount;
    });

    return costByService;
  }

  private flushMetrics(): void {
    if (this.metricQueue.length === 0) return;

    // Send metrics to analytics service (implementation depends on your analytics provider)
    // For now, we'll send summary to Sentry
    const metricsByType = this.groupMetricsByType(this.metricQueue);
    
    Object.entries(metricsByType).forEach(([type, metrics]) => {
      Sentry.withScope(scope => {
        scope.setTag('metricsFlush', true);
        scope.setTag('metricType', type);
        scope.setContext('metricsBatch', {
          type,
          count: metrics.length,
          totalValue: metrics.reduce((sum, m) => sum + m.value, 0),
          timeRange: {
            start: metrics[0]?.timestamp,
            end: metrics[metrics.length - 1]?.timestamp
          }
        });
        
        Sentry.captureMessage(`Metrics flush: ${type}`, 'info');
      });
    });

    // Clear the queue
    this.metricQueue = [];
  }

  private groupMetricsByType(metrics: BusinessMetric[]): Record<string, BusinessMetric[]> {
    return metrics.reduce((groups, metric) => {
      const key = metric.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(metric);
      return groups;
    }, {} as Record<string, BusinessMetric[]>);
  }

  private cleanup(): void {
    const cutoff = new Date(Date.now() - 86400000); // 24 hours
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    this.userActivities = this.userActivities.filter(a => a.timestamp > cutoff);
    this.keywordMetrics = this.keywordMetrics.filter(m => m.timestamp > cutoff);
    this.exportMetrics = this.exportMetrics.filter(m => m.timestamp > cutoff);
    this.integrationMetrics = this.integrationMetrics.filter(m => m.timestamp > cutoff);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushMetrics();
  }
}