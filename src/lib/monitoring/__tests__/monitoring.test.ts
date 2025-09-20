import { initializeMonitoring, destroyMonitoring } from '../init';
import { MonitoringConfig } from '../config';

describe('Monitoring System', () => {
  afterEach(() => {
    destroyMonitoring();
  });

  it('should initialize monitoring with default config', () => {
    const monitoring = initializeMonitoring();
    
    expect(monitoring).toBeDefined();
    expect(monitoring.errorTracker).toBeDefined();
    expect(monitoring.performanceMonitor).toBeDefined();
    expect(monitoring.businessMetrics).toBeDefined();
    expect(monitoring.alertManager).toBeDefined();
    expect(monitoring.healthMonitor).toBeDefined();
    expect(monitoring.sloManager).toBeDefined();
    expect(monitoring.observability).toBeDefined();
    expect(monitoring.costTracker).toBeDefined();
    expect(monitoring.userActivityTracker).toBeDefined();
    expect(monitoring.dashboard).toBeDefined();
  });

  it('should initialize monitoring with custom config', () => {
    const customConfig: Partial<MonitoringConfig> = {
      enabled: true,
      environment: 'test',
      sentry: {
        dsn: 'test-dsn',
        tracesSampleRate: 1.0,
        profilesSampleRate: 1.0,
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 0.0,
        debug: true
      }
    };

    const monitoring = initializeMonitoring(customConfig);
    
    expect(monitoring.config.environment).toBe('test');
    expect(monitoring.config.enabled).toBe(true);
    expect(monitoring.config.sentry.dsn).toBe('test-dsn');
  });

  it('should track errors', () => {
    const monitoring = initializeMonitoring();
    
    const errorId = monitoring.errorTracker.captureError(
      new Error('Test error'),
      { context: 'test' },
      { id: 'test-user' }
    );
    
    expect(errorId).toBeDefined();
    expect(errorId).toMatch(/^err_/);
    
    const errorStats = monitoring.errorTracker.getErrorStats();
    expect(errorStats.total).toBeGreaterThan(0);
  });

  it('should track performance metrics', () => {
    const monitoring = initializeMonitoring();
    
    monitoring.performanceMonitor.recordMetric({
      operation: 'test_operation',
      duration: 1000,
      timestamp: new Date(),
      success: true,
      metadata: { test: true }
    });
    
    const performanceStats = monitoring.performanceMonitor.getPerformanceStats();
    expect(performanceStats.totalRequests).toBeGreaterThan(0);
  });

  it('should track business metrics', () => {
    const monitoring = initializeMonitoring();
    
    monitoring.businessMetrics.trackKeywordProcessing(
      'dream100',
      100,
      5000,
      0.95,
      'test-run',
      'test-user',
      0.87
    );
    
    const keywordStats = monitoring.businessMetrics.getKeywordProcessingStats();
    expect(keywordStats.dream100).toBeDefined();
    expect(keywordStats.dream100?.totalKeywords).toBe(100);
  });

  it('should track costs', () => {
    const monitoring = initializeMonitoring();
    
    monitoring.costTracker.recordCost(
      'test-service',
      'test-operation',
      1.50,
      'USD',
      { test: true }
    );
    
    const costBreakdown = monitoring.costTracker.getCostBreakdown();
    expect(costBreakdown.byService['test-service']).toBe(1.50);
  });

  it('should manage alerts', () => {
    const monitoring = initializeMonitoring();
    
    const alertId = monitoring.alertManager.triggerAlert({
      type: 'test',
      severity: 'warning',
      message: 'Test alert',
      metadata: { test: true }
    });
    
    expect(alertId).toBeDefined();
    
    const activeAlerts = monitoring.alertManager.getActiveAlerts();
    expect(activeAlerts.length).toBeGreaterThan(0);
    expect(activeAlerts[0]?.message).toBe('Test alert');
    
    const resolved = monitoring.alertManager.resolveAlert(alertId, 'Test resolved');
    expect(resolved).toBe(true);
    
    const activeAlertsAfter = monitoring.alertManager.getActiveAlerts();
    expect(activeAlertsAfter.length).toBe(0);
  });

  it('should track user activity', () => {
    const monitoring = initializeMonitoring();
    
    const sessionId = monitoring.userActivityTracker.startSession(
      'test-user',
      undefined,
      { source: 'test' }
    );
    
    monitoring.userActivityTracker.trackActivity(
      'test-user',
      sessionId,
      'test_action',
      'test_feature',
      { test: true }
    );
    
    const activitySummary = monitoring.userActivityTracker.getActivitySummary();
    expect(activitySummary.totalUsers).toBeGreaterThan(0);
    expect(activitySummary.totalActions).toBeGreaterThan(0);
    
    monitoring.userActivityTracker.endSession(sessionId);
  });

  it('should manage SLOs', () => {
    const monitoring = initializeMonitoring();
    
    monitoring.sloManager.addTarget({
      service: 'test-service',
      metric: 'availability',
      target: 99.9,
      window: '24h',
      errorBudget: 0.1,
      alertThreshold: 0.05,
      description: 'Test SLO'
    });
    
    monitoring.sloManager.recordMetric('test-service', 'availability', 1);
    
    const sloStatus = monitoring.sloManager.getSLOStatus('test-service');
    expect(sloStatus.length).toBeGreaterThan(0);
    expect(sloStatus[0]?.target.service).toBe('test-service');
  });

  it('should provide health status', () => {
    const monitoring = initializeMonitoring();
    
    const healthStatus = monitoring.healthMonitor.getHealthStatus();
    expect(healthStatus.overall).toBeDefined();
    expect(healthStatus.services).toBeDefined();
  });

  it('should track observability data', () => {
    const monitoring = initializeMonitoring();
    
    const { traceId } = monitoring.observability.startTrace('test_operation');
    
    monitoring.observability.log(
      'info',
      'Test log message',
      { test: true },
      traceId
    );
    
    monitoring.observability.finishSpan(traceId, traceId);
    
    const traceData = monitoring.observability.getTrace(traceId);
    expect(traceData.trace).toBeDefined();
    expect(traceData.logs.length).toBeGreaterThan(0);
  });

  it('should provide dashboard data', async () => {
    const monitoring = initializeMonitoring();
    
    const dashboardData = await monitoring.dashboard.getDashboardData('system-health');
    expect(dashboardData).toBeDefined();
    expect(dashboardData?.dashboard).toBeDefined();
    expect(dashboardData?.data).toBeDefined();
  });

  it('should handle configuration validation', () => {
    expect(() => {
      initializeMonitoring({
        sentry: {
          dsn: 'invalid-dsn',
          tracesSampleRate: 2.0, // Invalid: should be between 0 and 1
          profilesSampleRate: 1.0,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,
          debug: false
        }
      });
    }).toThrow();
  });
});

// Integration test for API endpoints
describe('Monitoring API Integration', () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    // Mock fetch for API calls
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      redirected: false,
      type: 'basic' as ResponseType,
      url: '',
      clone: jest.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: jest.fn(),
      blob: jest.fn(),
      formData: jest.fn(),
      text: jest.fn(),
      json: jest.fn().mockResolvedValue({ status: 'success' }),
      bytes: jest.fn()
    } as Response);
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
    destroyMonitoring();
  });
  
  it('should send metrics to API endpoint', async () => {
    // This would test the frontend helpers
    // For now, just verify the monitoring system can be initialized
    const monitoring = initializeMonitoring();
    expect(monitoring).toBeDefined();
  });
});