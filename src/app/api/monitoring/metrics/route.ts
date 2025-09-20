import { NextRequest, NextResponse } from 'next/server';
import { getMonitoring, initializeMonitoring } from '../../../../lib/monitoring/index';
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data, userId, sessionId } = body;
    
    // Get or initialize monitoring system
    let monitoring = getMonitoring();
    if (!monitoring) {
      monitoring = initializeMonitoring();
    }
    
    // Route different metric types
    switch (type) {
      case 'web-vitals':
        // Track Core Web Vitals
        if (data.lcp) {
          monitoring.performanceMonitor.recordMetric({
            operation: 'web_vitals_lcp',
            duration: data.lcp,
            timestamp: new Date(),
            success: true,
            metadata: { path: data.path, element: data.element }
          });
        }
        if (data.fid) {
          monitoring.performanceMonitor.recordMetric({
            operation: 'web_vitals_fid',
            duration: data.fid,
            timestamp: new Date(),
            success: true,
            metadata: { path: data.path, eventType: data.eventType }
          });
        }
        if (data.cls) {
          monitoring.performanceMonitor.recordMetric({
            operation: 'web_vitals_cls',
            duration: data.cls,
            timestamp: new Date(),
            success: true,
            metadata: { path: data.path, score: data.cls }
          });
        }
        break;
        
      case 'api-performance':
        monitoring.performanceMonitor.recordAPIMetric({
          endpoint: data.endpoint,
          method: data.method,
          statusCode: data.statusCode,
          responseTime: data.responseTime,
          timestamp: new Date(),
          userId,
          cached: data.cached
        });
        break;
        
      case 'user-activity':
        if (userId && sessionId) {
          monitoring.userActivityTracker.trackActivity(
            userId,
            sessionId,
            data.action,
            data.feature,
            data.metadata,
            data.duration
          );
        }
        break;
        
      case 'keyword-processing':
        monitoring.businessMetrics.trackKeywordProcessing(
          data.stage,
          data.keywordCount,
          data.processingTime,
          data.successRate,
          data.runId,
          userId,
          data.qualityScore
        );
        break;
        
      case 'cost-tracking':
        monitoring.costTracker.recordCost(
          data.service,
          data.operation,
          data.cost,
          data.currency,
          data.metadata
        );
        break;
        
      case 'error':
        monitoring.errorTracker.captureError(
          data.error,
          data.context,
          userId ? { id: userId } : undefined
        );
        break;
        
      case 'slo-metric':
        monitoring.sloManager.recordMetric(
          data.service,
          data.metric,
          data.value,
          new Date()
        );
        break;
        
      default:
        throw new Error(`Unknown metric type: ${type}`);
    }
    
    return NextResponse.json({
      status: 'success',
      message: 'Metrics tracked successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Metrics tracking error:', error);
    
    Sentry.captureException(error, {
      tags: { 
        endpoint: 'monitoring-metrics',
        component: 'monitoring'
      },
      extra: { 
        request: request.url,
        body: await request.json().catch(() => null)
      }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to track metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timeRange = parseInt(searchParams.get('timeRange') || '3600000'); // Default 1 hour
    const metricType = searchParams.get('type');
    const service = searchParams.get('service');
    
    // Get monitoring system
    let monitoring = getMonitoring();
    if (!monitoring) {
      monitoring = initializeMonitoring();
    }
    
    let data: any = {};
    
    switch (metricType) {
      case 'performance':
        data.performance = monitoring.performanceMonitor.getPerformanceStats(timeRange);
        data.apiStats = monitoring.performanceMonitor.getAPIStats(timeRange);
        break;
        
      case 'errors':
        data.errors = monitoring.errorTracker.getErrorStats(timeRange);
        break;
        
      case 'user-activity':
        data.activity = monitoring.userActivityTracker.getActivitySummary(timeRange);
        data.featureUsage = monitoring.userActivityTracker.getFeatureUsageStats(timeRange);
        break;
        
      case 'business':
        data.keywordProcessing = monitoring.businessMetrics.getKeywordProcessingStats(timeRange);
        break;
        
      case 'costs':
        data.costs = monitoring.costTracker.getCostBreakdown(timeRange);
        data.topOperations = monitoring.costTracker.getTopCostOperations(10, timeRange);
        break;
        
      case 'health':
        data.health = monitoring.healthMonitor.getHealthStatus();
        data.summary = monitoring.healthMonitor.getHealthSummary(timeRange);
        break;
        
      case 'slo':
        data.slos = monitoring.sloManager.getSLOStatus(service || undefined);
        data.summary = monitoring.sloManager.getSLOSummary();
        break;
        
      case 'alerts':
        data.active = monitoring.alertManager.getActiveAlerts();
        data.history = monitoring.alertManager.getAlertHistory(50);
        data.stats = monitoring.alertManager.getAlertStats(timeRange);
        break;
        
      default:
        // Return comprehensive metrics summary
        data = {
          performance: monitoring.performanceMonitor.getPerformanceStats(timeRange),
          errors: monitoring.errorTracker.getErrorStats(timeRange),
          health: monitoring.healthMonitor.getHealthStatus(),
          costs: monitoring.costTracker.getCostBreakdown(timeRange),
          slos: monitoring.sloManager.getSLOSummary(),
          alerts: monitoring.alertManager.getAlertStats(timeRange)
        };
    }
    
    return NextResponse.json({
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
      timeRange,
      metricType
    });
    
  } catch (error) {
    console.error('Performance report error:', error);
    
    Sentry.captureException(error, {
      tags: { 
        endpoint: 'monitoring-metrics-get',
        component: 'monitoring'
      }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to retrieve metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}