import { NextRequest, NextResponse } from 'next/server';
import { getMonitoring, initializeMonitoring } from '../../../../lib/monitoring/index';
import { AlertRule } from '@/lib/monitoring/types';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const severity = searchParams.get('severity') as 'critical' | 'warning' | 'info' | null;
    const active = searchParams.get('active') === 'true';
    const history = searchParams.get('history') === 'true';
    const timeRange = parseInt(searchParams.get('timeRange') || '86400000'); // Default 24 hours
    
    // Get or initialize monitoring system
    let monitoring = getMonitoring();
    if (!monitoring) {
      monitoring = initializeMonitoring();
    }
    
    if (history) {
      // Get alert history
      const alertHistory = monitoring.alertManager.getAlertHistory(100);
      const alertStats = monitoring.alertManager.getAlertStats(timeRange);
      
      return NextResponse.json({
        status: 'success',
        data: {
          history: alertHistory,
          stats: alertStats
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Get active alerts
    let alerts = monitoring.alertManager.getActiveAlerts();
    
    // Filter by severity if specified
    if (severity) {
      alerts = alerts.filter((alert: { severity?: string }) => alert.severity === severity);
    }
    
    // Get alert statistics
    const alertStats = monitoring.alertManager.getAlertStats(timeRange);
    
    return NextResponse.json({
      status: 'success',
      data: {
        alerts,
        stats: alertStats,
        summary: {
          total: alertStats.total,
          bySeverity: alertStats.bySeverity,
          byType: alertStats.byType,
          unresolvedCount: alertStats.unresolvedCount
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Alerts fetch error:', error);
    
    Sentry.captureException(error, {
      tags: { 
        endpoint: 'monitoring-alerts',
        component: 'monitoring'
      }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, alertId, alertRule } = body;
    
    // Get or initialize monitoring system
    let monitoring = getMonitoring();
    if (!monitoring) {
      monitoring = initializeMonitoring();
    }
    
    switch (action) {
      case 'create':
        if (!alertRule) {
          throw new Error('Alert rule is required for create action');
        }
        
        // Validate alert rule
        const requiredFields = ['name', 'metric', 'condition', 'threshold', 'severity'];
        for (const field of requiredFields) {
          if (!alertRule[field]) {
            throw new Error(`Missing required field: ${field}`);
          }
        }
        
        // Create the alert rule
        const newRule: AlertRule = {
          id: `alert-${Date.now()}`,
          name: alertRule.name,
          metric: alertRule.metric,
          condition: alertRule.condition,
          threshold: alertRule.threshold,
          severity: alertRule.severity,
          enabled: true,
          cooldown: alertRule.cooldown || 15,
          channels: alertRule.channels || [{ type: 'slack', config: {}, enabled: true }],
          description: alertRule.description
        };
        
        monitoring.alertManager.addRule(newRule);
        
        return NextResponse.json({
          status: 'success',
          message: 'Alert rule created successfully',
          data: newRule,
          timestamp: new Date().toISOString()
        });
        
      case 'update':
        if (!alertId || !alertRule) {
          throw new Error('Alert ID and rule are required for update action');
        }
        
        const updated = monitoring.alertManager.updateRule(alertId, alertRule);
        
        if (!updated) {
          throw new Error(`Alert rule with ID ${alertId} not found`);
        }
        
        return NextResponse.json({
          status: 'success',
          message: 'Alert rule updated successfully',
          timestamp: new Date().toISOString()
        });
        
      case 'delete':
        if (!alertId) {
          throw new Error('Alert ID is required for delete action');
        }
        
        const deleted = monitoring.alertManager.removeRule(alertId);
        
        if (!deleted) {
          throw new Error(`Alert rule with ID ${alertId} not found`);
        }
        
        return NextResponse.json({
          status: 'success',
          message: 'Alert rule deleted successfully',
          timestamp: new Date().toISOString()
        });
        
      case 'resolve':
        if (!alertId) {
          throw new Error('Alert ID is required for resolve action');
        }
        
        const resolved = monitoring.alertManager.resolveAlert(alertId, 'Manually resolved via API');
        
        if (!resolved) {
          throw new Error(`Alert with ID ${alertId} not found or already resolved`);
        }
        
        return NextResponse.json({
          status: 'success',
          message: 'Alert resolved successfully',
          timestamp: new Date().toISOString()
        });
        
      case 'test':
        if (!alertRule && !alertId) {
          throw new Error('Alert rule or ID is required for test action');
        }
        
        // Trigger a test alert
        const testAlertId = monitoring.alertManager.triggerAlert({
          type: 'test',
          severity: 'info',
          message: `Test alert triggered ${alertId ? `for rule ${alertId}` : ''}`,
          metadata: {
            test: true,
            triggeredBy: 'api',
            originalRule: alertId
          }
        });
        
        return NextResponse.json({
          status: 'success',
          message: 'Test alert triggered successfully',
          data: {
            testAlertId,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
  } catch (error) {
    console.error('Alert management error:', error);
    
    Sentry.captureException(error, {
      tags: { 
        endpoint: 'monitoring-alerts-post',
        component: 'monitoring'
      }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to manage alert',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 400 });
  }
}

// PUT endpoint for bulk operations
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, alertIds } = body;
    
    // Get or initialize monitoring system
    let monitoring = getMonitoring();
    if (!monitoring) {
      monitoring = initializeMonitoring();
    }
    
    switch (action) {
      case 'resolve-all':
        const activeAlerts = monitoring.alertManager.getActiveAlerts();
        let resolvedCount = 0;
        
        for (const alert of activeAlerts) {
          if (monitoring.alertManager.resolveAlert(alert.id, 'Bulk resolved via API')) {
            resolvedCount++;
          }
        }
        
        return NextResponse.json({
          status: 'success',
          message: `Resolved ${resolvedCount} alerts`,
          data: { resolvedCount },
          timestamp: new Date().toISOString()
        });
        
      case 'resolve-selected':
        if (!alertIds || !Array.isArray(alertIds)) {
          throw new Error('Alert IDs array is required for resolve-selected action');
        }
        
        let selectedResolvedCount = 0;
        
        for (const alertId of alertIds) {
          if (monitoring.alertManager.resolveAlert(alertId, 'Bulk resolved via API')) {
            selectedResolvedCount++;
          }
        }
        
        return NextResponse.json({
          status: 'success',
          message: `Resolved ${selectedResolvedCount} of ${alertIds.length} selected alerts`,
          data: { resolvedCount: selectedResolvedCount, totalSelected: alertIds.length },
          timestamp: new Date().toISOString()
        });
        
      default:
        throw new Error(`Unknown bulk action: ${action}`);
    }
    
  } catch (error) {
    console.error('Bulk alert management error:', error);
    
    Sentry.captureException(error, {
      tags: { 
        endpoint: 'monitoring-alerts-put',
        component: 'monitoring'
      }
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to perform bulk alert operation',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 400 });
  }
}

// OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}