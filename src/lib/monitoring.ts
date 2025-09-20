/**
 * Comprehensive Performance Monitoring & Analytics System
 * Dream 100 Keyword Engine - Full-stack observability with Sentry, Vercel Analytics, and custom metrics
 */

import * as Sentry from '@sentry/nextjs';
import { CacheMonitor } from './cache-monitor';
import { integrations } from '@/integrations';
import { SentryReporter } from '@/utils/sentry';

// Performance metrics interfaces
export interface CoreWebVitals {
  LCP: number; // Largest Contentful Paint
  FID: number; // First Input Delay  
  CLS: number; // Cumulative Layout Shift
  TTFB: number; // Time to First Byte
  FCP: number; // First Contentful Paint
}

export interface ApiPerformanceMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  status: number;
  cached: boolean;
  cost?: number;
  provider?: string;
  timestamp: number;
}

export interface BusinessMetrics {
  // Dream 100 workflow metrics
  dream100Generated: number;
  universeExpanded: number;
  clustersCreated: number;
  roadmapGenerated: number;
  csvExported: number;
  
  // Quality metrics
  relevanceScore: number;
  duplicateRate: number;
  errorRate: number;
  
  // User engagement
  sessionDuration: number;
  bounceRate: number;
  conversionRate: number;
  
  // Cost metrics
  totalCost: number;
  costPerKeyword: number;
  budgetUtilization: number;
  
  timestamp: number;
}

export interface SystemHealthMetrics {
  cpu: number;
  memory: number;
  responseTime: number;
  uptime: number;
  errorRate: number;
  throughput: number;
  queueDepth: number;
  cacheHitRate: number;
  dbConnections: number;
  timestamp: number;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  cooldown: number; // minutes
  notifications: string[];
}

export interface MonitoringDashboard {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  refreshInterval: number;
  public: boolean;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'alert' | 'table';
  title: string;
  query: string;
  span: number; // grid columns
  config: Record<string, any>;
}

/**
 * Central Performance Monitoring Service
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, any[]> = new Map();
  private alerts: Map<string, AlertRule> = new Map();
  private isInitialized = false;
  private metricsRetention = 24 * 60 * 60 * 1000; // 24 hours in memory
  private collectInterval?: NodeJS.Timeout;
  private cacheMonitor?: CacheMonitor;
  
  private constructor() {}
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  /**
   * Initialize monitoring with configuration
   */
  async initialize(config: {
    enableCacheMonitoring?: boolean;
    enableRealTimeMetrics?: boolean;
    metricsRetention?: number;
    collectInterval?: number;
  } = {}): Promise<void> {
    if (this.isInitialized) {
      console.log('Performance monitoring already initialized');
      return;
    }
    
    try {
      console.log('🚀 Initializing comprehensive performance monitoring...');
      
      // Set configuration
      this.metricsRetention = config.metricsRetention || this.metricsRetention;
      
      // Initialize cache monitoring
      if (config.enableCacheMonitoring !== false) {
        try {
          const cacheService = (integrations as any).getCache?.();
          const cacheManager = (integrations as any).getCacheManager?.();
          
          if (cacheService && cacheManager) {
            this.cacheMonitor = new CacheMonitor(cacheService, cacheManager, {
              interval: 30000, // 30 seconds
              enableAlerting: true
            });
            console.log('✓ Cache monitoring initialized');
          }
        } catch (error) {
          console.warn('Cache monitoring initialization failed:', (error as Error).message);
        }
      }
      
      // Start metrics collection
      if (config.enableRealTimeMetrics !== false) {
        this.startMetricsCollection(config.collectInterval || 60000);
      }
      
      // Initialize default alert rules
      this.initializeDefaultAlerts();
      
      // Set up global error handlers
      this.setupGlobalErrorHandling();
      
      // Initialize Vercel Analytics integration
      this.initializeVercelAnalytics();
      
      // Set up Sentry performance monitoring
      this.enhanceSentryMonitoring();
      
      this.isInitialized = true;
      
      Sentry.addBreadcrumb({
        message: 'Performance monitoring initialized',
        level: 'info',
        category: 'monitoring',
        data: {
          cacheMonitoring: !!this.cacheMonitor,
          realTimeMetrics: config.enableRealTimeMetrics !== false,
          metricsRetention: this.metricsRetention
        }
      });
      
      console.log('✅ Performance monitoring initialization complete');
      
    } catch (error) {
      console.error('❌ Failed to initialize performance monitoring:', error);
      Sentry.captureException(error, {
        tags: { component: 'monitoring-init' }
      });
      throw error;
    }
  }
  
  /**
   * Track Core Web Vitals
   */
  trackWebVitals(vitals: CoreWebVitals, path: string): void {
    const timestamp = Date.now();
    
    // Store metrics
    this.addMetric('web-vitals', {
      ...vitals,
      path,
      timestamp
    });
    
    // Send to Sentry
    if (typeof Sentry.setMeasurement === 'function') {
      Sentry.setMeasurement('LCP', vitals.LCP, 'millisecond');
      Sentry.setMeasurement('FID', vitals.FID, 'millisecond');
      Sentry.setMeasurement('CLS', vitals.CLS, 'none');
      Sentry.setMeasurement('TTFB', vitals.TTFB, 'millisecond');
      Sentry.setMeasurement('FCP', vitals.FCP, 'millisecond');
    }
    
    // Alert on poor performance
    if (vitals.LCP > 2500) {
      this.triggerAlert('web-vitals-lcp', 'warning', `Poor LCP: ${vitals.LCP}ms on ${path}`);
    }
    if (vitals.FID > 100) {
      this.triggerAlert('web-vitals-fid', 'warning', `Poor FID: ${vitals.FID}ms on ${path}`);
    }
    if (vitals.CLS > 0.1) {
      this.triggerAlert('web-vitals-cls', 'warning', `Poor CLS: ${vitals.CLS} on ${path}`);
    }
    
    console.log(`📊 Web Vitals tracked for ${path}:`, vitals);
  }
  
  /**
   * Track API performance
   */
  trackApiPerformance(metrics: ApiPerformanceMetrics): void {
    const timestamp = Date.now();
    
    // Store metrics
    this.addMetric('api-performance', {
      ...metrics,
      timestamp
    });
    
    // Send to Sentry
    if (typeof Sentry.setMeasurement === 'function') {
      Sentry.setMeasurement(`api_${metrics.endpoint}_response_time`, metrics.responseTime, 'millisecond');
    }
    SentryReporter.captureApiUsage({
      provider: metrics.provider || 'internal',
      endpoint: metrics.endpoint,
      method: metrics.method,
      status: metrics.status,
      responseTime: metrics.responseTime,
      cost: metrics.cost || 0,
      cached: metrics.cached,
      timestamp,
      userId: undefined,
      runId: undefined
    });
    
    // Alert on issues
    if (metrics.responseTime > 5000) {
      this.triggerAlert('api-slow', 'warning', 
        `Slow API response: ${metrics.endpoint} took ${metrics.responseTime}ms`);
    }
    if (metrics.status >= 500) {
      this.triggerAlert('api-error', 'critical', 
        `API error: ${metrics.endpoint} returned ${metrics.status}`);
    }
    
    // Cost alerts
    if (metrics.cost && metrics.cost > 0.50) {
      this.triggerAlert('api-cost', 'warning', 
        `High cost API call: ${metrics.endpoint} cost $${metrics.cost}`);
    }
  }
  
  /**
   * Track business metrics
   */
  trackBusinessMetrics(metrics: BusinessMetrics): void {
    this.addMetric('business-metrics', metrics);
    
    // Send key business metrics to Sentry
    if (typeof Sentry.setMeasurement === 'function') {
      Sentry.setMeasurement('keywords_processed', metrics.dream100Generated + metrics.universeExpanded, 'none');
      Sentry.setMeasurement('clusters_created', metrics.clustersCreated, 'none');
      Sentry.setMeasurement('total_cost', metrics.totalCost, 'none');
      Sentry.setMeasurement('cost_per_keyword', metrics.costPerKeyword, 'none');
      Sentry.setMeasurement('relevance_score', metrics.relevanceScore, 'none');
      Sentry.setMeasurement('error_rate', metrics.errorRate, 'none');
    }
    
    // Business metric alerts
    if (metrics.errorRate > 0.1) {
      this.triggerAlert('business-error-rate', 'warning', 
        `High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
    }
    if (metrics.relevanceScore < 0.8) {
      this.triggerAlert('business-relevance', 'warning', 
        `Low relevance score: ${(metrics.relevanceScore * 100).toFixed(1)}%`);
    }
    if (metrics.budgetUtilization > 0.9) {
      this.triggerAlert('business-budget', 'critical', 
        `High budget utilization: ${(metrics.budgetUtilization * 100).toFixed(1)}%`);
    }
  }
  
  /**
   * Track system health
   */
  async trackSystemHealth(): Promise<SystemHealthMetrics> {
    const timestamp = Date.now();
    const startTime = Date.now();
    
    // Get basic system metrics (simplified for browser environment)
    const healthCheck = await this.performHealthCheck();
    
    const metrics: SystemHealthMetrics = {
      cpu: 0, // Would need server-side implementation
      memory: (performance as any).memory?.usedJSHeapSize || 0,
      responseTime: healthCheck.responseTime,
      uptime: Date.now() - (process.uptime?.() * 1000 || 0),
      errorRate: healthCheck.errorRate,
      throughput: healthCheck.throughput,
      queueDepth: healthCheck.queueDepth,
      cacheHitRate: healthCheck.cacheHitRate,
      dbConnections: healthCheck.dbConnections,
      timestamp
    };
    
    this.addMetric('system-health', metrics);
    
    // Send to Sentry
    if (typeof Sentry.setMeasurement === 'function') {
      Sentry.setMeasurement('system_response_time', metrics.responseTime, 'millisecond');
      Sentry.setMeasurement('system_error_rate', metrics.errorRate, 'none');
      Sentry.setMeasurement('cache_hit_rate', metrics.cacheHitRate, 'none');
      Sentry.setMeasurement('queue_depth', metrics.queueDepth, 'none');
    }
    
    // System alerts
    if (metrics.responseTime > 1000) {
      this.triggerAlert('system-response-time', 'warning', 
        `High system response time: ${metrics.responseTime}ms`);
    }
    if (metrics.errorRate > 0.05) {
      this.triggerAlert('system-error-rate', 'critical', 
        `High system error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
    }
    
    return metrics;
  }
  
  /**
   * Track keyword processing workflow
   */
  trackWorkflowMetrics(stage: string, data: {
    keywordCount: number;
    processingTime: number;
    successRate: number;
    cost: number;
    quality: number;
    runId: string;
    userId?: string;
  }): void {
    const timestamp = Date.now();
    
    this.addMetric('workflow-metrics', {
      stage,
      ...data,
      timestamp
    });
    
    // Use existing Sentry reporter
    SentryReporter.captureKeywordProcessing({
      stage,
      keywordCount: data.keywordCount,
      processingTime: data.processingTime,
      success: data.successRate > 0.9,
      runId: data.runId,
      userId: data.userId
    });
    
    // Additional workflow-specific metrics
    if (typeof Sentry.setMeasurement === 'function') {
      Sentry.setMeasurement(`${stage}_success_rate`, data.successRate, 'none');
      Sentry.setMeasurement(`${stage}_quality_score`, data.quality, 'none');
      Sentry.setMeasurement(`${stage}_cost`, data.cost, 'none');
    }
    
    // Workflow alerts
    if (data.successRate < 0.9) {
      this.triggerAlert(`workflow-${stage}`, 'warning', 
        `Low success rate in ${stage}: ${(data.successRate * 100).toFixed(1)}%`);
    }
    if (data.quality < 0.8) {
      this.triggerAlert(`quality-${stage}`, 'warning', 
        `Low quality score in ${stage}: ${(data.quality * 100).toFixed(1)}%`);
    }
    
    console.log(`📈 Workflow metrics tracked for ${stage}:`, data);
  }
  
  /**
   * Get real-time dashboard data
   */
  async getDashboardData(timeRange: number = 60 * 60 * 1000): Promise<{
    webVitals: CoreWebVitals;
    apiMetrics: {
      averageResponseTime: number;
      errorRate: number;
      throughput: number;
      totalCost: number;
    };
    businessMetrics: {
      keywordsProcessed: number;
      clustersCreated: number;
      averageQuality: number;
      conversionRate: number;
    };
    systemHealth: {
      uptime: number;
      responseTime: number;
      cacheHitRate: number;
      errorCount: number;
    };
    alerts: Array<{
      id: string;
      severity: string;
      message: string;
      timestamp: number;
    }>;
  }> {
    const since = Date.now() - timeRange;
    
    // Web vitals summary
    const webVitalsData = this.getMetrics('web-vitals', since);
    const latestWebVitals = webVitalsData[webVitalsData.length - 1] || {
      LCP: 0, FID: 0, CLS: 0, TTFB: 0, FCP: 0
    };
    
    // API metrics summary
    const apiData = this.getMetrics('api-performance', since);
    const apiMetrics = {
      averageResponseTime: this.calculateAverage(apiData, 'responseTime'),
      errorRate: apiData.filter(m => m.status >= 400).length / Math.max(apiData.length, 1),
      throughput: apiData.length / (timeRange / 1000 / 60), // requests per minute
      totalCost: apiData.reduce((sum, m) => sum + (m.cost || 0), 0)
    };
    
    // Business metrics summary
    const businessData = this.getMetrics('business-metrics', since);
    const latestBusiness = businessData[businessData.length - 1] || {};
    const businessMetrics = {
      keywordsProcessed: latestBusiness.dream100Generated + latestBusiness.universeExpanded || 0,
      clustersCreated: latestBusiness.clustersCreated || 0,
      averageQuality: latestBusiness.relevanceScore || 0,
      conversionRate: latestBusiness.conversionRate || 0
    };
    
    // System health summary
    const systemData = this.getMetrics('system-health', since);
    const latestSystem = systemData[systemData.length - 1] || {};
    const systemHealth = {
      uptime: latestSystem.uptime || 0,
      responseTime: latestSystem.responseTime || 0,
      cacheHitRate: latestSystem.cacheHitRate || 0,
      errorCount: systemData.filter(m => m.errorRate > 0).length
    };
    
    // Recent alerts
    const alerts = Array.from(this.alerts.values())
      .filter(alert => alert.enabled)
      .slice(-10)
      .map(alert => ({
        id: alert.id,
        severity: alert.severity,
        message: alert.name,
        timestamp: Date.now() // Simplified
      }));
    
    return {
      webVitals: latestWebVitals,
      apiMetrics,
      businessMetrics,
      systemHealth,
      alerts
    };
  }
  
  /**
   * Generate performance report
   */
  async generatePerformanceReport(timeRange: number = 24 * 60 * 60 * 1000): Promise<{
    summary: {
      timeRange: number;
      totalRequests: number;
      averageResponseTime: number;
      errorRate: number;
      totalCost: number;
      keywordsProcessed: number;
    };
    performance: {
      webVitals: {
        averageLCP: number;
        averageFID: number;
        averageCLS: number;
      };
      apiLatencies: Record<string, number>;
      slowestEndpoints: Array<{
        endpoint: string;
        averageTime: number;
        calls: number;
      }>;
    };
    business: {
      workflowCompletions: number;
      averageProcessingTime: number;
      qualityScore: number;
      costEfficiency: number;
    };
    recommendations: string[];
  }> {
    const since = Date.now() - timeRange;
    
    // Collect all metrics
    const apiData = this.getMetrics('api-performance', since);
    const webVitalsData = this.getMetrics('web-vitals', since);
    const businessData = this.getMetrics('business-metrics', since);
    const workflowData = this.getMetrics('workflow-metrics', since);
    
    // Summary calculations
    const totalRequests = apiData.length;
    const averageResponseTime = this.calculateAverage(apiData, 'responseTime');
    const errorRate = apiData.filter(m => m.status >= 400).length / Math.max(totalRequests, 1);
    const totalCost = apiData.reduce((sum, m) => sum + (m.cost || 0), 0);
    const keywordsProcessed = businessData.reduce((sum, m) => 
      sum + (m.dream100Generated || 0) + (m.universeExpanded || 0), 0);
    
    // Performance analysis
    const averageLCP = this.calculateAverage(webVitalsData, 'LCP');
    const averageFID = this.calculateAverage(webVitalsData, 'FID');
    const averageCLS = this.calculateAverage(webVitalsData, 'CLS');
    
    // API latency by endpoint
    const apiLatencies: Record<string, number> = {};
    const endpointGroups = this.groupBy(apiData, 'endpoint');
    Object.entries(endpointGroups).forEach(([endpoint, requests]) => {
      apiLatencies[endpoint] = this.calculateAverage(requests, 'responseTime');
    });
    
    // Slowest endpoints
    const slowestEndpoints = Object.entries(apiLatencies)
      .map(([endpoint, averageTime]) => ({
        endpoint,
        averageTime,
        calls: endpointGroups[endpoint]?.length ?? 0
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 5);
    
    // Business metrics
    const workflowCompletions = businessData.filter(m => m.roadmapGenerated > 0).length;
    const averageProcessingTime = this.calculateAverage(workflowData, 'processingTime');
    const qualityScore = this.calculateAverage(businessData, 'relevanceScore');
    const costEfficiency = keywordsProcessed > 0 ? totalCost / keywordsProcessed : 0;
    
    // Generate recommendations
    const recommendations = this.generateRecommendations({
      averageResponseTime,
      errorRate,
      averageLCP,
      averageFID,
      averageCLS,
      qualityScore,
      costEfficiency
    });
    
    return {
      summary: {
        timeRange,
        totalRequests,
        averageResponseTime,
        errorRate,
        totalCost,
        keywordsProcessed
      },
      performance: {
        webVitals: {
          averageLCP,
          averageFID,
          averageCLS
        },
        apiLatencies,
        slowestEndpoints
      },
      business: {
        workflowCompletions,
        averageProcessingTime,
        qualityScore,
        costEfficiency
      },
      recommendations
    };
  }
  
  /**
   * Private helper methods
   */
  private addMetric(type: string, data: any): void {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, []);
    }
    
    const typeMetrics = this.metrics.get(type)!;
    typeMetrics.push(data);
    
    // Clean old metrics
    const cutoff = Date.now() - this.metricsRetention;
    const filtered = typeMetrics.filter(m => m.timestamp > cutoff);
    this.metrics.set(type, filtered);
  }
  
  private getMetrics(type: string, since?: number): any[] {
    const metrics = this.metrics.get(type) || [];
    if (since) {
      return metrics.filter(m => m.timestamp >= since);
    }
    return metrics;
  }
  
  private calculateAverage(data: any[], field: string): number {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + (item[field] || 0), 0);
    return sum / data.length;
  }
  
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }
  
  private async performHealthCheck(): Promise<{
    responseTime: number;
    errorRate: number;
    throughput: number;
    queueDepth: number;
    cacheHitRate: number;
    dbConnections: number;
  }> {
    const start = Date.now();
    
    try {
      // Try to get health from integrations
      const health = await integrations.getHealthStatus(false);
      const responseTime = Date.now() - start;
      
      // Get cache metrics if available
      let cacheHitRate = 0;
      if (this.cacheMonitor) {
        const cacheHealth = await this.cacheMonitor.checkHealth();
        cacheHitRate = cacheHealth.components.performance?.metrics?.hitRate || 0;
      }
      
      return {
        responseTime,
        errorRate: health.overallStatus === 'healthy' ? 0 : 0.1,
        throughput: 100, // Simplified
        queueDepth: 0, // Would need queue integration
        cacheHitRate,
        dbConnections: 1 // Simplified
      };
    } catch (error) {
      return {
        responseTime: Date.now() - start,
        errorRate: 1,
        throughput: 0,
        queueDepth: 0,
        cacheHitRate: 0,
        dbConnections: 0
      };
    }
  }
  
  private triggerAlert(id: string, severity: 'critical' | 'warning' | 'info', message: string): void {
    console.log(`🚨 Alert [${severity.toUpperCase()}]: ${message}`);
    
    // Send to Sentry
    Sentry.captureMessage(message, severity === 'critical' ? 'error' : 'warning');
    
    // Would implement actual alerting (Slack, email, etc.)
    // For now, just log and track in Sentry
  }
  
  private initializeDefaultAlerts(): void {
    const defaultAlerts: AlertRule[] = [
      {
        id: 'api-response-time',
        name: 'High API Response Time',
        condition: 'avg(api_response_time) > 5000',
        threshold: 5000,
        severity: 'warning',
        enabled: true,
        cooldown: 10,
        notifications: ['sentry', 'console']
      },
      {
        id: 'error-rate',
        name: 'High Error Rate',
        condition: 'error_rate > 0.1',
        threshold: 0.1,
        severity: 'critical',
        enabled: true,
        cooldown: 5,
        notifications: ['sentry', 'console']
      },
      {
        id: 'cost-threshold',
        name: 'High API Cost',
        condition: 'api_cost > 1.0',
        threshold: 1.0,
        severity: 'warning',
        enabled: true,
        cooldown: 15,
        notifications: ['sentry', 'console']
      }
    ];
    
    defaultAlerts.forEach(alert => {
      this.alerts.set(alert.id, alert);
    });
  }
  
  private setupGlobalErrorHandling(): void {
    // Browser error handling
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.trackApiPerformance({
          endpoint: 'global-error',
          method: 'ERROR',
          responseTime: 0,
          status: 500,
          cached: false,
          timestamp: Date.now()
        });
      });
      
      window.addEventListener('unhandledrejection', (event) => {
        this.trackApiPerformance({
          endpoint: 'unhandled-promise',
          method: 'ERROR',
          responseTime: 0,
          status: 500,
          cached: false,
          timestamp: Date.now()
        });
      });
    }
  }
  
  private initializeVercelAnalytics(): void {
    // Integrate with Vercel Analytics if available
    if (typeof window !== 'undefined' && (window as any).va) {
      console.log('✓ Vercel Analytics integration detected');
      
      // Track custom events
      (window as any).va('track', 'monitoring-initialized', {
        timestamp: Date.now(),
        version: process.env.npm_package_version || '1.0.0'
      });
    }
  }
  
  private enhanceSentryMonitoring(): void {
    // Add custom Sentry configurations
    Sentry.setTag('monitoring-service', 'active');
    Sentry.setTag('monitoring-version', '1.0.0');
    
    Sentry.setContext('monitoring-config', {
      cacheMonitoring: !!this.cacheMonitor,
      metricsRetention: this.metricsRetention,
      alertRules: this.alerts.size
    });
  }
  
  private startMetricsCollection(interval: number): void {
    this.collectInterval = setInterval(async () => {
      try {
        await this.trackSystemHealth();
        
        // Cleanup old metrics periodically
        this.cleanupOldMetrics();
        
      } catch (error) {
        console.error('Metrics collection error:', error);
      }
    }, interval);
    
    console.log(`📊 Started metrics collection with ${interval}ms interval`);
  }
  
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.metricsRetention;
    
    this.metrics.forEach((metrics, type) => {
      const filtered = metrics.filter(m => m.timestamp > cutoff);
      this.metrics.set(type, filtered);
    });
  }
  
  private generateRecommendations(data: {
    averageResponseTime: number;
    errorRate: number;
    averageLCP: number;
    averageFID: number;
    averageCLS: number;
    qualityScore: number;
    costEfficiency: number;
  }): string[] {
    const recommendations: string[] = [];
    
    // Performance recommendations
    if (data.averageResponseTime > 2000) {
      recommendations.push('API response times are high - consider caching optimization and database indexing');
    }
    if (data.averageLCP > 2500) {
      recommendations.push('Large Contentful Paint is slow - optimize images and reduce bundle size');
    }
    if (data.averageFID > 100) {
      recommendations.push('First Input Delay is high - reduce JavaScript execution time');
    }
    if (data.averageCLS > 0.1) {
      recommendations.push('Cumulative Layout Shift is high - add size attributes to images and avoid dynamic content');
    }
    
    // Error and quality recommendations
    if (data.errorRate > 0.05) {
      recommendations.push('Error rate is elevated - review error logs and implement better error handling');
    }
    if (data.qualityScore < 0.8) {
      recommendations.push('Data quality is below target - review keyword relevance and classification accuracy');
    }
    
    // Cost recommendations
    if (data.costEfficiency > 0.02) {
      recommendations.push('API costs per keyword are high - implement more aggressive caching and optimize API usage');
    }
    
    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('System performance is good - continue monitoring and maintaining current optimization levels');
    }
    
    return recommendations;
  }
  
  /**
   * Shutdown monitoring
   */
  shutdown(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
    }
    if (this.cacheMonitor) {
      this.cacheMonitor.shutdown();
    }
    
    this.metrics.clear();
    this.alerts.clear();
    this.isInitialized = false;
    
    console.log('🛑 Performance monitoring shut down');
  }
}

/**
 * Performance monitoring utilities
 */
export class MonitoringUtils {
  /**
   * Create a performance timing wrapper for functions
   */
  static withTiming<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    name: string,
    monitor: PerformanceMonitor
  ): T {
    return (async (...args: any[]) => {
      const start = Date.now();
      
      try {
        const result = await fn(...args);
        const duration = Date.now() - start;
        
        monitor.trackApiPerformance({
          endpoint: name,
          method: 'FUNCTION',
          responseTime: duration,
          status: 200,
          cached: false,
          timestamp: start
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        
        monitor.trackApiPerformance({
          endpoint: name,
          method: 'FUNCTION',
          responseTime: duration,
          status: 500,
          cached: false,
          timestamp: start
        });
        
        throw error;
      }
    }) as T;
  }
  
  /**
   * Measure function execution time
   */
  static async measureTime<T>(
    fn: () => Promise<T>,
    label: string
  ): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    
    console.log(`⏱️ ${label}: ${duration}ms`);
    return { result, duration };
  }
  
  /**
   * Create a request/response timing middleware for APIs
   */
  static createTimingMiddleware(monitor: PerformanceMonitor) {
    return (req: any, res: any, next: any) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        
        monitor.trackApiPerformance({
          endpoint: req.path || req.url,
          method: req.method,
          responseTime: duration,
          status: res.statusCode,
          cached: false,
          timestamp: start
        });
      });
      
      next();
    };
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Auto-initialize in production
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  performanceMonitor.initialize({
    enableCacheMonitoring: true,
    enableRealTimeMetrics: true,
    collectInterval: 60000, // 1 minute
    metricsRetention: 24 * 60 * 60 * 1000 // 24 hours
  }).catch(error => {
    console.error('Failed to auto-initialize performance monitoring:', error);
  });
}