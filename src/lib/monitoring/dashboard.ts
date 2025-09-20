import { DashboardConfig, DashboardPanel, MetricData } from './types';
import { MonitoringConfig } from './config';
import { ErrorTracker } from './error-tracker';
import { PerformanceMonitor } from './performance-monitor';
import { BusinessMetrics } from './business-metrics';
import { AlertManager } from './alert-manager';
import { HealthMonitor } from './health-monitor';
import { SLOManager } from './slo-manager';
import { CostTracker } from './cost-tracker';
import { UserActivityTracker } from './user-activity';

export class MonitoringDashboard {
  private config: MonitoringConfig;
  private errorTracker: ErrorTracker;
  private performanceMonitor: PerformanceMonitor;
  private businessMetrics: BusinessMetrics;
  private alertManager: AlertManager;
  private healthMonitor: HealthMonitor;
  private sloManager: SLOManager;
  private costTracker: CostTracker;
  private userActivityTracker: UserActivityTracker;
  private dashboards: Map<string, DashboardConfig> = new Map();

  constructor(
    config: MonitoringConfig,
    errorTracker: ErrorTracker,
    performanceMonitor: PerformanceMonitor,
    businessMetrics: BusinessMetrics,
    alertManager: AlertManager,
    healthMonitor: HealthMonitor,
    sloManager: SLOManager,
    costTracker: CostTracker,
    userActivityTracker: UserActivityTracker
  ) {
    this.config = config;
    this.errorTracker = errorTracker;
    this.performanceMonitor = performanceMonitor;
    this.businessMetrics = businessMetrics;
    this.alertManager = alertManager;
    this.healthMonitor = healthMonitor;
    this.sloManager = sloManager;
    this.costTracker = costTracker;
    this.userActivityTracker = userActivityTracker;
    
    this.initializeDefaultDashboards();
  }

  private initializeDefaultDashboards(): void {
    // System Health Dashboard
    this.createDashboard({
      id: 'system-health',
      name: 'System Health Overview',
      description: 'Overall system health and performance metrics',
      refreshInterval: 30000, // 30 seconds
      timeRange: { from: '1h', to: 'now' },
      panels: [
        {
          id: 'overall-health',
          title: 'Overall Health Status',
          type: 'stat',
          metrics: ['system.health.overall'],
          position: { x: 0, y: 0, width: 6, height: 4 },
          options: {
            thresholds: [
              { value: 0, color: 'red', text: 'Unhealthy' },
              { value: 0.5, color: 'yellow', text: 'Degraded' },
              { value: 1, color: 'green', text: 'Healthy' }
            ]
          }
        },
        {
          id: 'response-time',
          title: 'API Response Time',
          type: 'line',
          metrics: ['api.response_time.avg', 'api.response_time.p95'],
          position: { x: 6, y: 0, width: 6, height: 4 },
          options: {
            yAxis: { unit: 'ms' },
            legend: { show: true }
          }
        },
        {
          id: 'error-rate',
          title: 'Error Rate',
          type: 'line',
          metrics: ['system.error_rate'],
          position: { x: 0, y: 4, width: 6, height: 4 },
          options: {
            yAxis: { unit: '%', max: 10 },
            thresholds: [{ value: 5, color: 'red' }]
          }
        },
        {
          id: 'throughput',
          title: 'Request Throughput',
          type: 'line',
          metrics: ['api.requests.per_minute'],
          position: { x: 6, y: 4, width: 6, height: 4 },
          options: {
            yAxis: { unit: 'req/min' }
          }
        }
      ]
    });

    // Business Metrics Dashboard
    this.createDashboard({
      id: 'business-metrics',
      name: 'Business Metrics',
      description: 'Key business metrics and user activity',
      refreshInterval: 60000, // 1 minute
      timeRange: { from: '24h', to: 'now' },
      panels: [
        {
          id: 'active-users',
          title: 'Active Users',
          type: 'stat',
          metrics: ['users.active.current'],
          position: { x: 0, y: 0, width: 3, height: 3 },
          options: {
            colorMode: 'background',
            graphMode: 'area'
          }
        },
        {
          id: 'keyword-processing',
          title: 'Keywords Processed',
          type: 'stat',
          metrics: ['keywords.processed.total'],
          position: { x: 3, y: 0, width: 3, height: 3 },
          options: {
            colorMode: 'background',
            unit: 'short'
          }
        },
        {
          id: 'feature-usage',
          title: 'Feature Usage',
          type: 'pie',
          metrics: ['features.usage.breakdown'],
          position: { x: 6, y: 0, width: 6, height: 6 },
          options: {
            legend: { show: true, position: 'right' }
          }
        },
        {
          id: 'conversion-rate',
          title: 'Conversion Rate',
          type: 'line',
          metrics: ['conversions.rate'],
          position: { x: 0, y: 3, width: 6, height: 3 },
          options: {
            yAxis: { unit: '%' }
          }
        }
      ]
    });

    // Cost Management Dashboard
    this.createDashboard({
      id: 'cost-management',
      name: 'Cost Management',
      description: 'API costs and budget tracking',
      refreshInterval: 300000, // 5 minutes
      timeRange: { from: '30d', to: 'now' },
      panels: [
        {
          id: 'total-cost',
          title: 'Total Monthly Cost',
          type: 'stat',
          metrics: ['costs.total.monthly'],
          position: { x: 0, y: 0, width: 4, height: 4 },
          options: {
            unit: 'currency',
            thresholds: [
              { value: 1500, color: 'yellow' },
              { value: 1800, color: 'red' }
            ]
          }
        },
        {
          id: 'budget-usage',
          title: 'Budget Usage',
          type: 'bar',
          metrics: ['budget.usage.by_service'],
          position: { x: 4, y: 0, width: 8, height: 4 },
          options: {
            yAxis: { unit: '%', max: 100 },
            thresholds: [
              { value: 75, color: 'yellow' },
              { value: 90, color: 'red' }
            ]
          }
        },
        {
          id: 'cost-breakdown',
          title: 'Cost Breakdown by Service',
          type: 'pie',
          metrics: ['costs.breakdown.by_service'],
          position: { x: 0, y: 4, width: 6, height: 4 },
          options: {
            legend: { show: true }
          }
        },
        {
          id: 'cost-trend',
          title: 'Daily Cost Trend',
          type: 'line',
          metrics: ['costs.daily.trend'],
          position: { x: 6, y: 4, width: 6, height: 4 },
          options: {
            yAxis: { unit: 'currency' }
          }
        }
      ]
    });

    // SLO Dashboard
    this.createDashboard({
      id: 'slo-tracking',
      name: 'SLO Tracking',
      description: 'Service Level Objectives and error budgets',
      refreshInterval: 60000,
      timeRange: { from: '7d', to: 'now' },
      panels: [
        {
          id: 'slo-summary',
          title: 'SLO Summary',
          type: 'table',
          metrics: ['slo.status.all'],
          position: { x: 0, y: 0, width: 12, height: 6 },
          options: {
            columns: [
              { field: 'service', title: 'Service' },
              { field: 'metric', title: 'Metric' },
              { field: 'target', title: 'Target' },
              { field: 'current', title: 'Current' },
              { field: 'errorBudget', title: 'Error Budget' },
              { field: 'status', title: 'Status' }
            ]
          }
        },
        {
          id: 'error-budget-burn',
          title: 'Error Budget Burn Rate',
          type: 'line',
          metrics: ['slo.error_budget.burn_rate'],
          position: { x: 0, y: 6, width: 12, height: 4 },
          options: {
            yAxis: { unit: '%/hour' },
            thresholds: [{ value: 10, color: 'red' }]
          }
        }
      ]
    });

    // Performance Dashboard
    this.createDashboard({
      id: 'performance',
      name: 'Performance Monitoring',
      description: 'Application and infrastructure performance',
      refreshInterval: 30000,
      timeRange: { from: '1h', to: 'now' },
      panels: [
        {
          id: 'web-vitals',
          title: 'Core Web Vitals',
          type: 'stat',
          metrics: ['performance.web_vitals.lcp', 'performance.web_vitals.fid', 'performance.web_vitals.cls'],
          position: { x: 0, y: 0, width: 12, height: 3 },
          options: {
            orientation: 'horizontal'
          }
        },
        {
          id: 'api-performance',
          title: 'API Performance by Endpoint',
          type: 'heatmap',
          metrics: ['api.performance.by_endpoint'],
          position: { x: 0, y: 3, width: 12, height: 5 },
          options: {
            xAxis: { title: 'Time' },
            yAxis: { title: 'Endpoint' },
            colorScale: { min: 0, max: 2000, unit: 'ms' }
          }
        }
      ]
    });
  }

  createDashboard(config: DashboardConfig): void {
    this.dashboards.set(config.id, config);
  }

  getDashboard(id: string): DashboardConfig | null {
    return this.dashboards.get(id) || null;
  }

  listDashboards(): DashboardConfig[] {
    return Array.from(this.dashboards.values());
  }

  async getDashboardData(dashboardId: string, timeRange?: { from: string; to: string }): Promise<{
    dashboard: DashboardConfig;
    data: Record<string, any>;
  } | null> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;

    const data: Record<string, any> = {};

    // Collect data for each panel
    for (const panel of dashboard.panels) {
      data[panel.id] = await this.getPanelData(panel, timeRange);
    }

    return { dashboard, data };
  }

  private async getPanelData(panel: DashboardPanel, timeRange?: { from: string; to: string }): Promise<any> {
    const metricData: Record<string, any> = {};

    for (const metric of panel.metrics) {
      metricData[metric] = await this.getMetricData(metric, timeRange);
    }

    return {
      type: panel.type,
      title: panel.title,
      data: metricData,
      options: panel.options
    };
  }

  private async getMetricData(metric: string, timeRange?: { from: string; to: string }): Promise<any> {
    const [category, ...parts] = metric.split('.');
    
    switch (category) {
      case 'system':
        return this.getSystemMetrics(parts.join('.'));
      
      case 'api':
        return this.getAPIMetrics(parts.join('.'));
      
      case 'users':
        return this.getUserMetrics(parts.join('.'));
      
      case 'keywords':
        return this.getKeywordMetrics(parts.join('.'));
      
      case 'features':
        return this.getFeatureMetrics(parts.join('.'));
      
      case 'conversions':
        return this.getConversionMetrics(parts.join('.'));
      
      case 'costs':
        return this.getCostMetrics(parts.join('.'));
      
      case 'budget':
        return this.getBudgetMetrics(parts.join('.'));
      
      case 'slo':
        return this.getSLOMetrics(parts.join('.'));
      
      case 'performance':
        return this.getPerformanceMetrics(parts.join('.'));
      
      default:
        return { error: `Unknown metric category: ${category}` };
    }
  }

  private getSystemMetrics(metric: string): any {
    switch (metric) {
      case 'health.overall':
        const health = this.healthMonitor.getHealthStatus();
        return { value: health.overall === 'healthy' ? 1 : health.overall === 'degraded' ? 0.5 : 0 };
      
      case 'error_rate':
        const errorStats = this.errorTracker.getErrorStats();
        return { value: (errorStats.total / 1000) * 100 }; // Approximate error rate
      
      default:
        return { error: `Unknown system metric: ${metric}` };
    }
  }

  private getAPIMetrics(metric: string): any {
    const performanceStats = this.performanceMonitor.getPerformanceStats();
    
    switch (metric) {
      case 'response_time.avg':
        return { value: performanceStats.avgResponseTime };
      
      case 'response_time.p95':
        return { value: performanceStats.p95ResponseTime };
      
      case 'requests.per_minute':
        return { value: performanceStats.totalRequests };
      
      case 'performance.by_endpoint':
        return this.performanceMonitor.getAPIStats();
      
      default:
        return { error: `Unknown API metric: ${metric}` };
    }
  }

  private getUserMetrics(metric: string): any {
    const activitySummary = this.userActivityTracker.getActivitySummary();
    
    switch (metric) {
      case 'active.current':
        return { value: activitySummary.activeUsers };
      
      case 'sessions.total':
        return { value: activitySummary.totalSessions };
      
      default:
        return { error: `Unknown user metric: ${metric}` };
    }
  }

  private getKeywordMetrics(metric: string): any {
    const keywordStats = this.businessMetrics.getKeywordProcessingStats();
    
    switch (metric) {
      case 'processed.total':
        const totalKeywords = Object.values(keywordStats)
          .reduce((sum, stats) => sum + stats.totalKeywords, 0);
        return { value: totalKeywords };
      
      default:
        return { error: `Unknown keyword metric: ${metric}` };
    }
  }

  private getFeatureMetrics(metric: string): any {
    const featureUsage = this.userActivityTracker.getFeatureUsageStats();
    
    switch (metric) {
      case 'usage.breakdown':
        return featureUsage.map(feature => ({
          name: feature.feature,
          value: feature.actions
        }));
      
      default:
        return { error: `Unknown feature metric: ${metric}` };
    }
  }

  private getConversionMetrics(metric: string): any {
    // This would typically come from business metrics
    switch (metric) {
      case 'rate':
        return { value: 12.5 }; // Mock conversion rate
      
      default:
        return { error: `Unknown conversion metric: ${metric}` };
    }
  }

  private getCostMetrics(metric: string): any {
    const costSummary = this.costTracker.getCostSummary();
    const costBreakdown = this.costTracker.getCostBreakdown();
    
    switch (metric) {
      case 'total.monthly':
        const totalMonthlyCost = costSummary.reduce((sum, summary) => 
          summary.service !== 'total' ? sum + summary.monthly.cost : sum, 0
        );
        return { value: totalMonthlyCost };
      
      case 'breakdown.by_service':
        return Object.entries(costBreakdown.byService).map(([service, cost]) => ({
          name: service,
          value: cost
        }));
      
      case 'daily.trend':
        // Mock daily trend data
        return Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - (29 - i) * 86400000),
          value: Math.random() * 50 + 20
        }));
      
      default:
        return { error: `Unknown cost metric: ${metric}` };
    }
  }

  private getBudgetMetrics(metric: string): any {
    const costSummary = this.costTracker.getCostSummary();
    
    switch (metric) {
      case 'usage.by_service':
        return costSummary
          .filter(summary => summary.service !== 'total')
          .map(summary => ({
            service: summary.service,
            percentage: summary.monthly.percentage
          }));
      
      default:
        return { error: `Unknown budget metric: ${metric}` };
    }
  }

  private getSLOMetrics(metric: string): any {
    const sloStatus = this.sloManager.getSLOStatus();
    
    switch (metric) {
      case 'status.all':
        return sloStatus.map(status => ({
          service: status.target.service,
          metric: status.target.metric,
          target: status.target.target,
          current: status.currentValue,
          errorBudget: status.errorBudgetRemaining,
          status: status.status
        }));
      
      case 'error_budget.burn_rate':
        return sloStatus.map(status => ({
          service: status.target.service,
          burnRate: status.burnRate,
          timestamp: status.lastUpdated
        }));
      
      default:
        return { error: `Unknown SLO metric: ${metric}` };
    }
  }

  private getPerformanceMetrics(metric: string): any {
    const performanceStats = this.performanceMonitor.getPerformanceStats();
    
    switch (metric) {
      case 'web_vitals.lcp':
        return { value: 1200, status: 'good' }; // Mock LCP
      
      case 'web_vitals.fid':
        return { value: 45, status: 'good' }; // Mock FID
      
      case 'web_vitals.cls':
        return { value: 0.05, status: 'good' }; // Mock CLS
      
      default:
        return { error: `Unknown performance metric: ${metric}` };
    }
  }

  // Real-time dashboard updates
  subscribeToUpdates(dashboardId: string, callback: (data: any) => void): () => void {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }

    const interval = setInterval(async () => {
      const data = await this.getDashboardData(dashboardId);
      if (data) {
        callback(data);
      }
    }, dashboard.refreshInterval || 30000);

    // Return unsubscribe function
    return () => clearInterval(interval);
  }

  // Export dashboard configuration
  exportDashboard(dashboardId: string): DashboardConfig | null {
    return this.dashboards.get(dashboardId) || null;
  }

  // Import dashboard configuration
  importDashboard(config: DashboardConfig): void {
    this.dashboards.set(config.id, config);
  }
}